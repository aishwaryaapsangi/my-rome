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
 if(incoming&&incoming!==allow&&incoming!=='http://localhost:4200')return json({error:'Origin not allowed'},403,allow);
 const origin=incoming=== 'http://localhost:4200'?incoming:allow;
 const url=new URL(request.url);
 if(request.method==='OPTIONS')return new Response(null,{status:204,headers:{'access-control-allow-origin':origin,'access-control-allow-methods':'GET, POST, OPTIONS','access-control-allow-headers':'Content-Type','vary':'Origin'}});
 if(url.pathname==='/api/health'&&request.method==='GET')return json({ready:!!(env.LETSFG_API_KEY||env.DUFFEL_ACCESS_TOKEN),providers:{letsfg:!!env.LETSFG_API_KEY,duffel:!!env.DUFFEL_ACCESS_TOKEN},message:!env.LETSFG_API_KEY&&!env.DUFFEL_ACCESS_TOKEN?'Add a provider secret to this Worker to enable real searches.':'Providers configured. Only fresh offers from the chosen dates are displayed.'},200,origin);
 if(url.pathname!=='/api/search')return json({error:'Not found'},404,origin);
 if(request.method!=='POST')return json({error:'POST only'},405,origin);
 let input;try{const raw=await request.text();if(raw.length>3000)return json({error:'Request too large'},413,origin);input=validateSearch(JSON.parse(raw));}catch(e){return json({error:e.message||'Invalid request'},400,origin)}
 const providers=[];
 if(['all','letsfg'].includes(input.provider)&&env.LETSFG_API_KEY)providers.push({name:'LetsFG',fn:()=>letsfgSearch(input,env)});
 if(['all','duffel'].includes(input.provider)&&env.DUFFEL_ACCESS_TOKEN)providers.push({name:'Duffel',fn:()=>duffelSearch(input,env)});
 if(!providers.length)return json({error:'No authorized provider configured. Connect LetsFG or Duffel in Worker secrets, then retry.',code:'NOT_CONFIGURED',offers:[]},503,origin);
 const cache=typeof caches!=='undefined'?caches.default:null;
 const key=new Request('https://my-rome-cache.invalid/'+encodeURIComponent(JSON.stringify(input)));
 if(cache){try{const old=await cache.match(key);if(old){const body=await old.json();return json({...body,fromCache:true},200,origin)}}catch(_){}}
 const settled=await Promise.allSettled(providers.map(x=>x.fn()));const errors=[],offers=[];
 for(let i=0;i<settled.length;i++){const x=settled[i];if(x.status==='fulfilled')offers.push(...x.value);else errors.push({provider:providers[i].name,error:x.reason?.message||'Unknown provider error'})}
 offers.sort((a,b)=>(a.isTest===b.isTest?0:a.isTest?1:-1)||a.totalPrice-b.totalPrice);
 const result={query:input,checkedAt:new Date().toISOString(),fromCache:false,offers:offers.slice(0,100),errors,providersQueried:providers.map(x=>x.name),source:'Live supplier search (not airline-direct checkout)',note:'Prices and seat availability may change. Duffel test-mode offers are marked as test data and must not be treated as real.'};
 if(cache&&offers.length&&!errors.length){try{await cache.put(key,new Response(JSON.stringify(result),{headers:{'Cache-Control':'public,max-age=120','Content-Type':'application/json'}}))}catch(_){}}
 return json(result,errors.length&&!offers.length?502:200,origin);
}
export default {fetch:serveSearch};
