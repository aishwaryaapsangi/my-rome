// Free LetsFG PFS transport + one-owner OAuth token vault.
// This module exposes NO booking or payment endpoint.
const REGISTER='https://letsfg.co/developers/api/oauth/register';
const TOKEN='https://letsfg.co/developers/api/oauth/token';
const SEARCH='https://letsfg.co/api/search';
const RESULTS='https://letsfg.co/api/results/';
const OAUTH_CONNECT='https://letsfg.co/connect';

const result=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{'content-type':'application/json','cache-control':'no-store'}});
const rand=(n=32)=>base64url(crypto.getRandomValues(new Uint8Array(n)));
const base64url=bytes=>btoa(String.fromCharCode(...bytes)).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/g,'');
const sha256=async text=>base64url(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(text))));
const form=entries=>new URLSearchParams(entries);
const now=()=>Date.now();
const positive=n=>Number.isFinite(Number(n))&&Number(n)>0?Number(n):null;
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function checkedJson(res,msg){
 if(!res.ok)throw Error(msg+' ('+res.status+')');
 const v=await res.json();
 if(!v||typeof v!=='object')throw Error(msg+': invalid response');
 return v;
}
/** Serializes rotating refresh-token writes in a SQLite-backed Durable Object. */
export class LetsfgAuthStore {
 constructor(ctx,env){this.ctx=ctx;this.env=env;this.refreshPromise=null;}
 async fetch(req){
  const path=new URL(req.url).pathname;
  try {
   if(path==='/status') {
    const t=await this.ctx.storage.get('tokens');
    return result({ready:!!(t?.access_token||t?.refresh_token),hasRefresh:!!t?.refresh_token});
   }
   if(path==='/begin'&&req.method==='POST')return result(await this.begin(await req.json()));
   if(path==='/callback'&&req.method==='POST')return result(await this.finish(await req.json()));
   if(path==='/access'&&req.method==='POST')return result({accessToken:await this.access()});
   if(path==='/quota'&&req.method==='POST')return result(await this.quota(await req.json()));
   if(path==='/disconnect'&&req.method==='POST') {
    await this.ctx.storage.delete('tokens');await this.ctx.storage.delete('pending');
    return result({disconnected:true});
   }
   return result({error:'Not found'},404);
  }catch(e){return result({error:String(e.message||'Auth service unavailable').slice(0,240)},e.status||502)}
 }
 async begin(data){
  const redirectUri=String(data.callbackUrl||'');
  const u=new URL(redirectUri);
  if(u.protocol!=='https:'||u.pathname!=='/api/auth/callback')throw Error('OAuth callback must use HTTPS and /api/auth/callback');
  const verifier=rand(48),state=rand(24),challenge=await sha256(verifier);
  const reg=await checkedJson(await fetch(REGISTER,{
   method:'POST',headers:{'content-type':'application/json'},
   body:JSON.stringify({client_name:'La Dolce Vita personal flight search',redirect_uris:[redirectUri],grant_types:['authorization_code','refresh_token'],response_types:['code'],token_endpoint_auth_method:'none'})
  }),'LetsFG OAuth client registration failed');
  const clientId=String(reg.client_id||'');
  if(!/^[A-Za-z0-9_-]{8,200}$/.test(clientId))throw Error('LetsFG returned invalid client identifier');
  await this.ctx.storage.put('pending',{clientId,redirectUri,verifier,state,created:now()});
  const url=new URL(OAUTH_CONNECT);
  url.search=new URLSearchParams({response_type:'code',client_id:clientId,redirect_uri:redirectUri,code_challenge:challenge,code_challenge_method:'S256',state}).toString();
  return {authorizationUrl:url.toString(),expiresInSeconds:300};
 }
 async finish(data){
  const p=await this.ctx.storage.get('pending');
  if(!p||!data.code||!data.state||String(data.state)!==p.state||now()-p.created>300000)throw Error('OAuth state expired or invalid. Start authorization again.');
  await this.ctx.storage.delete('pending'); // authorization code and PKCE are one-use
  const res=await checkedJson(await fetch(TOKEN,{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},body:form({grant_type:'authorization_code',code:String(data.code),client_id:p.clientId,redirect_uri:p.redirectUri,code_verifier:p.verifier})}),'LetsFG token exchange failed');
  if(!res.access_token||!res.refresh_token)throw Error('LetsFG OAuth did not return both access and refresh tokens');
  await this.ctx.storage.put('tokens',{clientId:p.clientId,access_token:res.access_token,refresh_token:res.refresh_token,expiresAt:now()+Number(res.expires_in||3600)*1000});
  return {connected:true};
 }
 async access(){
  const t=await this.ctx.storage.get('tokens');
  if(!t)throw Object.assign(Error('Connect the free LetsFG account first.'),{status:503});
  if(t.access_token&&t.expiresAt>now()+60000)return t.access_token;
  // A refresh token is SINGLE USE. Never run two refresh requests for the same grant.
  if(!this.refreshPromise)this.refreshPromise=this.refresh(t).finally(()=>{this.refreshPromise=null});
  return this.refreshPromise;
 }
 async refresh(old){
  if(!old.refresh_token||!old.clientId)throw Object.assign(Error('LetsFG OAuth needs reconnection.'),{status:401});
  const raw=await fetch(TOKEN,{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},body:form({grant_type:'refresh_token',refresh_token:old.refresh_token,client_id:old.clientId})});
  if(!raw.ok){
   if(raw.status===400||raw.status===401){await this.ctx.storage.delete('tokens');throw Object.assign(Error('LetsFG authorization expired; reconnect.'),{status:401})}
   throw Error('LetsFG token refresh unavailable ('+raw.status+')');
  }
  const body=await raw.json();
  if(!body.access_token||!body.refresh_token)throw Error('LetsFG did not return a rotated refresh token');
  const updated={clientId:old.clientId,access_token:body.access_token,refresh_token:body.refresh_token,expiresAt:now()+Number(body.expires_in||3600)*1000};
  await this.ctx.storage.put('tokens',updated); // persist rotation BEFORE exposing access token
  return updated.access_token;
 }
 async quota(data){
  const day=new Date().toISOString().slice(0,10);
  const ip=String(data.ip||'unknown').slice(0,70);
  const fp=await sha256(ip+':'+String(this.env.QUOTA_SALT||'internal'));
  const key='quota-'+day,cur=await this.ctx.storage.get(key)||{count:0,ips:{}};
  const max=Math.min(80,Math.max(1,Number(this.env.MAX_DAILY_SEARCHES||40)));
  const limitPerIp=Math.min(20,Math.max(1,Number(this.env.MAX_IP_DAILY_SEARCHES||6)));
  if(cur.count>=max||Number(cur.ips[fp]||0)>=limitPerIp)return {allowed:false,remaining:0};
  cur.count++;cur.ips[fp]=Number(cur.ips[fp]||0)+1;
  await this.ctx.storage.put(key,cur);
  return {allowed:true,remaining:max-cur.count};
 }
}
export function getAuthStub(env){
 if(!env.LETSFG_AUTH)return null;
 return env.LETSFG_AUTH.get(env.LETSFG_AUTH.idFromName('owner'));
}
export async function invokeAuth(stub,path,payload){
 const res=await stub.fetch(new Request('https://internal.letsfg'+path,{method:path==='/status'?'GET':'POST',headers:{'content-type':'application/json'},...(path==='/status'?{}:{body:JSON.stringify(payload||{})})}));
 const body=await res.json();
 if(!res.ok)throw Object.assign(Error(body.error||'LetsFG authorization failed'),{status:res.status});
 return body;
}
export async function pfsAvailable(env){
 const stub=getAuthStub(env);
 if(!stub)return false;
 try{return (await invokeAuth(stub,'/status')).ready===true}catch{return false}
}
async function pfsTransport(url,token,options={}){
 const res=await fetch(url,{...options,headers:{...options.headers,Authorization:'Bearer '+token}});
 if(res.status===401)throw Object.assign(Error('LetsFG session expired. Reconnect your free account.'),{status:401});
 if(res.status===429)throw Object.assign(Error('LetsFG free search limit reached. Try later.'),{status:429});
 if(!res.ok)throw Error('LetsFG free search failed ('+res.status+')');
 return res.json();
}
export function normalizePfs(payload,req){
 const raw=Array.isArray(payload?.offers)?payload.offers:Array.isArray(payload?.data?.offers)?payload.data.offers:[];
 return raw.map(o=>{
  const price=positive(o.price),currency=String(o.currency||'');
  if(!price||currency!=='USD')return null;
  const named=[...(Array.isArray(o.airlines)?o.airlines:[]),o.owner_airline,...(o.outbound?.segments||[]).map(x=>x.airline),...(o.inbound?.segments||[]).map(x=>x.airline)].filter(Boolean).map(String);
  const airlines=[...new Set(named)];
  const seconds=Number(o.outbound?.total_duration_seconds||0)+Number(o.inbound?.total_duration_seconds||0);
  const n=Number(req.adults||1);
  const url=typeof o.booking_url==='string'&&/^https:\/\//i.test(o.booking_url)?o.booking_url:null;
  return {id:'pfs-'+String(o.id||''),provider:'LetsFG',airline:airlines[0]||'Airline not specified',airlines,carrier:String(o.airline_code||o.owner_airline_code||''),
   pricePerPerson:price,totalPrice:Math.round(price*n*100)/100,currency:'USD',passengers:n,
   stopsOutbound:Number.isInteger(Number(o.outbound?.stopovers))?Number(o.outbound.stopovers):null,
   stopsReturn:Number.isInteger(Number(o.inbound?.stopovers))?Number(o.inbound.stopovers):null,
   durationMinutes:seconds>0?Math.round(seconds/60):null,
   bookingUrl:url,source:String(o.source||'LetsFG free agent search'),selfTransfer:o.self_transfer||null,
   splitTicket:o.split_ticket===true||o.split_ticket==='true',expiresAt:o.offer_expires_at||null,isTest:false};
 }).filter(Boolean);
}
export async function pfsSearch(req,env,options={}){
 const stub=getAuthStub(env);if(!stub)throw Object.assign(Error('Free LetsFG OAuth not configured.'),{status:503});
 if(env.PUBLIC_SEARCH_ENABLED!=='true')throw Object.assign(Error('Public search disabled until owner activates it.'),{status:503});
 const quota=await invokeAuth(stub,'/quota',{ip:options.ip||'unknown'});
 if(!quota.allowed)throw Object.assign(Error('Daily search limit reached for this browser or deployment.'),{status:429});
 const {accessToken}=await invokeAuth(stub,'/access');
 const body={origin:req.origin,destination:req.destination,date_from:req.departure,return_from:req.returnDate,
  adults:req.adults,cabin:req.cabin,max_stops:req.maxStops,currency:'USD',limit:50,sort:'price'};
 const start=await pfsTransport(SEARCH,accessToken,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});
 const id=String(start.search_id||'');
 if(!/^[A-Za-z0-9_-]{3,160}$/.test(id))throw Error('LetsFG did not return a valid search ID');
 let latest={offers:[],status:'searching'},polls=0;
 const deadline=Date.now()+75000;
 do{
  latest=await pfsTransport(RESULTS+encodeURIComponent(id),accessToken);
  if(!['searching','pending','running'].includes(latest.status)&&!latest.split_ticket_pending&&!latest.gf_enrich_pending)break;
  if(Date.now()+2000>=deadline)break;
  polls++;await (options.sleep||wait)(2000);
 }while(polls<36);
 return {offers:normalizePfs(latest,req),partial:['searching','pending','running'].includes(latest.status)||Boolean(latest.split_ticket_pending||latest.gf_enrich_pending),searchId:id};
}
