import {getAuthStub,invokeAuth,pfsAvailable,pfsSearch} from './letsfg-free.mjs';
export {LetsfgAuthStore} from './letsfg-free.mjs';
// La Dolce Vita: private flight-search adapter for Cloudflare Workers.
// Credentials are Cloudflare secrets (NEVER browser JavaScript or GitHub).
const DEFAULT_ORIGIN='https://aishwaryaapsangi.github.io';
const API_LETSFG='https://letsfg.co/developers/api/v1/flights/search';
const API_DUFFEL='https://api.duffel.com/air/offer_requests';
const json=(body,status=200,origin=DEFAULT_ORIGIN)=>new Response(JSON.stringify(body),{status,headers:{'content-type':'application/json; charset=utf-8','access-control-allow-origin':origin,'access-control-allow-methods':'GET, POST, OPTIONS','access-control-allow-headers':'Content-Type','vary':'Origin','cache-control':'no-store'}});
const httpsUrl=s=>{try{const u=new URL(s);return u.protocol==='https:'?u.toString():null}catch{return null}};
const money=n=>Number.isFinite(Number(n))&&Number(n)>0?Number(n):null;
const stops=n=>Number.isInteger(Number(n))&&Number(n)>=0?Number(n):null;
const validDate=s=>{if(!/^\d{4}-\d{2}-\d{2}$/.test(s||''))return false;let t=Date.parse(s+'T12:00:00Z');return Number.isFinite(t)&&new Date(t).toISOString().slice(0,10)===s};
export function validateSearch(b){
 if(!b||typeof b!=='object')throw new Error('Request body required');
 const origin=String(b.origin||'BOS').toUpperCase(),destination=String(b.destination||'FCO').toUpperCase();
 if(!/^[A-Z]{3}$/.test(origin)||!/^[A-Z]{3}$/.test(destination)||origin===destination)throw new Error('Enter two different 3-letter airport or city codes');
 const departure=String(b.departure||''),returnDate=String(b.returnDate||'');
 if(!validDate(departure)||!validDate(returnDate))throw new Error('Departure and return must be real YYYY-MM-DD dates');
 const difference=(Date.parse(returnDate+'T12:00:00Z')-Date.parse(departure+'T12:00:00Z'))/86400000;
 if(difference<1||difference>90)throw new Error('Choose a return 1–90 days after departure');
 if(Date.parse(departure+'T12:00:00Z')<Date.parse(new Date().toISOString().slice(0,10)+'T12:00:00Z'))throw new Error('Departure must be in the future');
 const adults=Number(b.adults||4),maxStops=Number(b.maxStops??2),cabin=String(b.cabin||'M'),provider=String(b.provider||'all');
 if(!Number.isInteger(adults)||adults<1||adults>9)throw new Error('Choose 1–9 adults');
 if(!Number.isInteger(maxStops)||maxStops<0||maxStops>4)throw new Error('Maximum stops must be 0–4');
 if(!['M','W','C','F'].includes(cabin))throw new Error('Invalid cabin class');
 if(!['all','letsfg','duffel'].includes(provider))throw new Error('Unknown flight provider');
 return {origin,destination,departure,returnDate,adults,maxStops,cabin,provider};
}
export function normalizeLetsFG(payload,req){
 return (Array.isArray(payload?.offers)?payload.offers:[]).map(o=>{
  const per=money(o.price);if(!per||o.currency!=='USD')return null;
  const legs=[...(o.outbound?.segments||[]),...(o.inbound?.segments||[])];
  const airlineNames=[...new Set([...(Array.isArray(o.airlines)?o.airlines:[]),o.owner_airline,...legs.map(x=>x.airline)].filter(Boolean).map(String))];
  const outStops=stops(o.outbound?.stopovers),backStops=stops(o.inbound?.stopovers);
  const secs=Number(o.outbound?.total_duration_seconds||0)+Number(o.inbound?.total_duration_seconds||0);
  return {id:'letsfg-'+String(o.id??Math.random()).slice(0,100),provider:'LetsFG',airline:airlineNames[0]||'Carrier not specified',airlines:airlineNames,carrier:String(o.owner_airline_code||o.airline_code||''),pricePerPerson:per,totalPrice:Math.round(per*req.adults*100)/100,currency:'USD',passengers:req.adults,stopsOutbound:outStops,stopsReturn:backStops,durationMinutes:secs>0?Math.round(secs/60):null,bookingUrl:httpsUrl(o.booking_url),source:String(o.source||'LetsFG multi-seller search'),selfTransfer:o.self_transfer||null,splitTicket:o.split_ticket===true||o.split_ticket==='true',expiresAt:o.offer_expires_at||null,isTest:false};
 }).filter(Boolean);
}
export function normalizeDuffel(payload,req){
 const arr=Array.isArray(payload?.data?.offers)?payload.data.offers:[];
 return arr.map(o=>{
  const total=money(o.total_amount),owner=o.owner||{};if(!total||o.total_currency!=='USD')return null;
  const legs=(o.slices||[]).map(s=>s.segments||[]);
  const operating=[...new Set(legs.flat().map(s=>s.operating_carrier?.name||s.marketing_carrier?.name).filter(Boolean))];
  const outStops=legs[0]?.length?legs[0].length-1:null,backStops=legs[1]?.length?legs[1].length-1:null;
  const mins=legs.flat().reduce((t,s)=>{const m=typeof s.duration==='string'?s.duration.match(/PT(?:(\d+)H)?(?:(\d+)M)?/):null;return t+(m?Number(m[1]||0)*60+Number(m[2]||0):0)},0);
  return {id:'duffel-'+String(o.id||''),provider:'Duffel',airline:operating.join(' + ')||owner.name||'Operating airline not supplied',airlines:operating.length?operating:[owner.name].filter(Boolean),carrier:String(owner.iata_code||''),pricePerPerson:Math.round(total/req.adults*100)/100,totalPrice:total,currency:'USD',passengers:req.adults,stopsOutbound:outStops,stopsReturn:backStops,durationMinutes:mins||null,bookingUrl:null,source:'Duffel airline offer request',selfTransfer:null,splitTicket:false,expiresAt:o.expires_at||null,isTest:o.live_mode!==true};
 }).filter(Boolean);
}
async function letsfgSearch(req,env){
 const b={origin:req.origin,destination:req.destination,date_from:req.departure,return_from:req.returnDate,adults:req.adults,cabin_class:req.cabin,max_stopovers:req.maxStops,currency:'USD',limit:50,sort:'price'};
 const c=new AbortController(),timer=setTimeout(()=>c.abort(),85000);
 try{const res=await fetch(API_LETSFG,{method:'POST',headers:{'Content-Type':'application/json','X-API-Key':env.LETSFG_API_KEY},body:JSON.stringify(b),signal:c.signal});if(!res.ok)throw new Error(res.status===401?'LetsFG key rejected':res.status===402?'LetsFG account needs payment/access activation':res.status===429?'LetsFG rate limit reached':'LetsFG search error ('+res.status+')');return normalizeLetsFG(await res.json(),req);}finally{clearTimeout(timer)}
}
async function duffelSearch(req,env){
 const b={data:{slices:[{origin:req.origin,destination:req.destination,departure_date:req.departure},{origin:req.destination,destination:req.origin,departure_date:req.returnDate}],passengers:Array.from({length:req.adults},()=>({type:'adult'})),cabin_class:({M:'economy',W:'premium_economy',C:'business',F:'first'})[req.cabin]}};
 const c=new AbortController(),timer=setTimeout(()=>c.abort(),45000);
 try{const res=await fetch(API_DUFFEL,{method:'POST',headers:{'Content-Type':'application/json','Duffel-Version':'v2','Authorization':'Bearer '+env.DUFFEL_ACCESS_TOKEN},body:JSON.stringify(b),signal:c.signal});if(!res.ok)throw new Error(res.status===401?'Duffel key rejected':res.status===429?'Duffel rate limit reached':'Duffel search error ('+res.status+')');return normalizeDuffel(await res.json(),req)}finally{clearTimeout(timer)}
}
export async function serveSearch(request,env,context={}){
 const allow=env.ALLOWED_ORIGIN||DEFAULT_ORIGIN;
 const incoming=request.headers.get('Origin');
 const url=new URL(request.url);
 const sameOrigin=incoming===url.origin;
 // Safe HTML page and OAuth callback are top-level browser navigations.
 // A browser/link preview may attach its own Origin; it isn't an API caller.
 // CSRF-sensitive POST setup and search requests keep strict origin validation.
 const navigationalGet=request.method==='GET'&&
  (url.pathname==='/api/connect'||url.pathname==='/api/auth/callback');
 const allowedOrigin=!incoming||incoming===allow||incoming==='http://localhost:4200'||sameOrigin;
 if(!navigationalGet&&!allowedOrigin)
  return json({error:'Origin not allowed. Open the LetsFG setup link directly in a new browser tab (not the Cloudflare or chat preview).'},403,allow);
 const origin=sameOrigin?url.origin:incoming==='http://localhost:4200'?incoming:allow;
 if(request.method==='OPTIONS')return new Response(null,{status:204,headers:{'access-control-allow-origin':origin,'access-control-allow-methods':'GET, POST, OPTIONS','access-control-allow-headers':'Content-Type','vary':'Origin'}});
 // Public browser never sees an OAuth bearer token, refresh token, or admin secret.
 const auth=getAuthStub(env),admin=env.ADMIN_SETUP_TOKEN&&request.headers.get('Authorization')==='Bearer '+env.ADMIN_SETUP_TOKEN;
 // Simplest owner-only LetsFG setup: server-rendered form; no JavaScript, cookies, token-in-URL or external assets.
 // A private ADMIN_SETUP_TOKEN is POSTed to this Worker over HTTPS and is never stored in the browser.
 const connectHeaders={'content-type':'text/html; charset=utf-8','cache-control':'no-store','referrer-policy':'no-referrer',
  'x-content-type-options':'nosniff','content-security-policy':"default-src 'none'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'; style-src 'unsafe-inline'"};
 if(url.pathname==='/api/connect'&&request.method==='GET'){
  const page='<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Connect free LetsFG</title><style>body{font:16px system-ui;margin:0 auto;padding:8vh 22px;max-width:540px;line-height:1.55;background:#fff9f5;color:#26212b}main{border:1px solid #eadadf;background:white;padding:28px;border-radius:18px}input,button{box-sizing:border-box;width:100%;padding:13px;font:inherit;border-radius:10px}input{border:1px solid #aaa}button{border:0;background:#b63873;color:white;margin-top:14px;cursor:pointer}small{color:#655966}code{font-size:90%}</style></head><body><main><h1>✈ Connect free LetsFG</h1><p>This private setup connects your personal LetsFG account to the La Dolce Vita flight API. No card is needed just for free flight searches.</p><form method="POST" action="/api/connect"><label for="ownerToken"><b>Cloudflare ADMIN_SETUP_TOKEN</b></label><p><input id="ownerToken" name="ownerToken" type="password" autocomplete="off" required minlength="32" placeholder="Your private owner setup token"></p><button type="submit">Connect my LetsFG account</button></form><p><small>Keep this token private. It is sent only to your own HTTPS Cloudflare Worker and is not saved in browser storage. After approving LetsFG, close the confirmation page.</small></p></main></body></html>';
  return new Response(page,{status:200,headers:connectHeaders});
 }
 if(url.pathname==='/api/connect'&&request.method==='POST'){
  try{
   const raw=await request.text();
   if(raw.length>1200)return new Response('Request too large',{status:413,headers:{'cache-control':'no-store'}});
   const input=new URLSearchParams(raw);
   const token=input.get('ownerToken');
   if(!env.ADMIN_SETUP_TOKEN||!token||token!==env.ADMIN_SETUP_TOKEN||!auth)return new Response('Incorrect owner setup token or missing Cloudflare configuration. Return to /api/connect and retry.',{status:401,headers:{'content-type':'text/plain; charset=utf-8','cache-control':'no-store'}});
   if(url.protocol!=='https:')return new Response('Use the deployed HTTPS Cloudflare URL for setup.',{status:400});
   const response=await invokeAuth(auth,'/begin',{callbackUrl:new URL('/api/auth/callback',url).toString()});
   const destination=new URL(response.authorizationUrl);
   if(destination.origin!=='https://letsfg.co'||destination.pathname!=='/connect')throw Error('LetsFG returned an unexpected authorization URL');
   return new Response(null,{status:303,headers:{'location':destination.toString(),'cache-control':'no-store','referrer-policy':'no-referrer'}});
  }catch(e){return new Response('Connection could not start: '+String(e.message||e).slice(0,160),{status:502,headers:{'content-type':'text/plain; charset=utf-8','cache-control':'no-store'}})}
 }
 if(url.pathname==='/api/auth/start'&&request.method==='POST'){
  if(!admin||!auth)return json({error:'Owner-only setup. Configure Cloudflare ADMIN_SETUP_TOKEN and the Durable Object.'},401,origin);
  try{
   const cb=new URL('/api/auth/callback',request.url);
   if(cb.protocol!=='https:')return json({error:'OAuth setup requires a deployed HTTPS Worker.'},400,origin);
   return json(await invokeAuth(auth,'/begin',{callbackUrl:cb.toString()}),200,origin);
  }catch(e){return json({error:e.message},502,origin)}
 }
 if(url.pathname==='/api/auth/callback'&&request.method==='GET'){
  if(!auth)return new Response('OAuth storage unavailable',{status:503});
  try{
   if(!url.searchParams.get('code')||!url.searchParams.get('state'))throw Error('Missing OAuth code or state.');
   await invokeAuth(auth,'/callback',{code:url.searchParams.get('code'),state:url.searchParams.get('state')});
   return new Response('<!doctype html><html><meta charset="utf-8"><title>LetsFG connected</title><body><h2>✈ LetsFG connected</h2><p>Your free flight-search connection is saved privately. You can close this page.</p></body></html>',{headers:{'content-type':'text/html; charset=utf-8','cache-control':'no-store','referrer-policy':'no-referrer','content-security-policy':"default-src 'none'; style-src 'unsafe-inline'"}});
  }catch(e){return new Response('LetsFG connection failed. Please restart authorization from the owner setup. ('+String(e.message).slice(0,140)+')',{status:400,headers:{'content-type':'text/plain','cache-control':'no-store'}})}
 }
 if(url.pathname==='/api/auth/disconnect'&&request.method==='POST'){
  if(!admin||!auth)return json({error:'Owner only'},401,origin);
  try{return json(await invokeAuth(auth,'/disconnect'),200,origin)}catch(e){return json({error:e.message},502,origin)}
 }
 if(url.pathname==='/api/health'&&request.method==='GET'){
  const freeReady=await pfsAvailable(env),freeEnabled=freeReady&&env.PUBLIC_SEARCH_ENABLED==='true';
  const paidEnabled=env.ENABLE_PAID_LETSFG==='true'&&!!env.LETSFG_API_KEY;
  const providers={letsfg:freeEnabled||paidEnabled,duffel:!!env.DUFFEL_ACCESS_TOKEN};
  return json({ready:providers.letsfg||providers.duffel,providers,freeAccountConnected:freeReady,freeSearchEnabled:freeEnabled,
   message:freeReady&&!freeEnabled?'Free LetsFG authorized but PUBLIC_SEARCH_ENABLED is false. Enable searches after configuring quota/security.':providers.letsfg||providers.duffel?'Ready for live search.':'Connect free LetsFG via the owner-only OAuth route; no paid API account is needed.'},200,origin);
 }
 if(url.pathname!=='/api/search')return json({error:'Not found'},404,origin);
 if(request.method!=='POST')return json({error:'POST only'},405,origin);
 let input;try{const raw=await request.text();if(raw.length>3000)return json({error:'Request too large'},413,origin);input=validateSearch(JSON.parse(raw));}catch(e){return json({error:e.message||'Invalid request'},400,origin)}
 const providers=[];
 const freeConnected=await pfsAvailable(env);
 if(['all','letsfg'].includes(input.provider)&&freeConnected&&env.PUBLIC_SEARCH_ENABLED==='true')providers.push({name:'LetsFG Free',fn:async()=>{const data=await pfsSearch(input,env,{ip:request.headers.get('CF-Connecting-IP')||'unknown'});return data.offers}});
 else if(['all','letsfg'].includes(input.provider)&&env.ENABLE_PAID_LETSFG==='true'&&env.LETSFG_API_KEY)providers.push({name:'LetsFG Developer (paid)',fn:()=>letsfgSearch(input,env)});
 if(['all','duffel'].includes(input.provider)&&env.DUFFEL_ACCESS_TOKEN)providers.push({name:'Duffel',fn:()=>duffelSearch(input,env)});
 if(!providers.length)return json({error:freeConnected?'Free LetsFG is authorized but search is disabled. Set PUBLIC_SEARCH_ENABLED=true after reviewing rate limits.':'Free LetsFG is not connected. Authorize it through the owner OAuth flow or configure an optional alternative provider.',code:'NOT_CONFIGURED',offers:[]},503,origin);
 const cache=typeof caches!=='undefined'?caches.default:null;
 const key=new Request('https://my-rome-cache.invalid/'+encodeURIComponent(JSON.stringify(input)));
 if(cache){try{const old=await cache.match(key);if(old){const body=await old.json();return json({...body,fromCache:true},200,origin)}}catch(_){}}
 const settled=await Promise.allSettled(providers.map(x=>x.fn()));const errors=[],offers=[];
 for(let i=0;i<settled.length;i++){const x=settled[i];if(x.status==='fulfilled')offers.push(...x.value);else errors.push({provider:providers[i].name,error:x.reason?.message||'Unknown provider error',status:x.reason?.status||502})}
 offers.sort((a,b)=>(a.isTest===b.isTest?0:a.isTest?1:-1)||a.totalPrice-b.totalPrice);
 const result={query:input,checkedAt:new Date().toISOString(),fromCache:false,offers:offers.slice(0,100),errors,providersQueried:providers.map(x=>x.name),source:'Live supplier search (not airline-direct checkout)',note:'Prices and seat availability may change. Duffel test-mode offers are marked as test data and must not be treated as real.'};
 if(cache&&offers.length&&!errors.length){try{await cache.put(key,new Response(JSON.stringify(result),{headers:{'Cache-Control':'public,max-age=120','Content-Type':'application/json'}}))}catch(_){}}
 return json(result,errors.length&&!offers.length?(errors.some(e=>e.status===429)?429:502):200,origin);
}
export default {fetch:serveSearch};
