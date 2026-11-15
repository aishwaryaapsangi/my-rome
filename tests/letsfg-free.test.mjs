import test from 'node:test';
import assert from 'node:assert/strict';
import {LetsfgAuthStore,invokeAuth,pfsAvailable,pfsSearch} from '../api-worker/src/letsfg-free.mjs';
import {serveSearch} from '../api-worker/src/index.mjs';

function vault(env={}){
 const store=new Map();
 const ctx={storage:{get:async k=>store.get(k),put:async(k,v)=>store.set(k,structuredClone(v)),delete:async k=>store.delete(k)}};
 const actor=new LetsfgAuthStore(ctx,env);
 const stub={fetch: req=>actor.fetch(req)};
 const binding={idFromName:x=>x,get:x=>stub};
 return {actor,store,env:{...env,LETSFG_AUTH:binding},stub};
}
function internal(path,data){return new Request('https://internal.letsfg'+path,{method:path==='/status'?'GET':'POST',...(path==='/status'?{}:{headers:{'content-type':'application/json'},body:JSON.stringify(data||{})})})}
const req={origin:'BOS',destination:'FCO',departure:'2027-07-19',returnDate:'2027-07-25',adults:4,cabin:'M',maxStops:1,provider:'letsfg'};
test('free OAuth flow registers a public PKCE client and stores tokens only in the vault',async()=>{
 const v=vault();
 const original=globalThis.fetch, requests=[];
 try{
  globalThis.fetch=async(u,options={})=>{
   requests.push({url:String(u),options});
   if(String(u).endsWith('/oauth/register'))return Response.json({client_id:'test_client_123456'});
   if(String(u).endsWith('/oauth/token'))return Response.json({access_token:'access-first',refresh_token:'refresh-first',expires_in:3600});
   throw Error('Unexpected '+u);
  };
  const started=await invokeAuth(v.stub,'/begin',{callbackUrl:'https://example.workers.dev/api/auth/callback'});
  assert.match(started.authorizationUrl,/^https:\/\/letsfg\.co\/connect\?/);
  const u=new URL(started.authorizationUrl);
  assert.equal(u.searchParams.get('code_challenge_method'),'S256');
  assert.equal(u.searchParams.get('response_type'),'code');
  assert.ok(!started.authorizationUrl.includes('refresh-first'));
  const pending=v.store.get('pending');
  assert.ok(pending?.verifier);
  await assert.rejects(invokeAuth(v.stub,'/callback',{code:'x',state:'bad-state'}),/state/i);
  await invokeAuth(v.stub,'/callback',{code:'example-code',state:pending.state});
  assert.equal((await invokeAuth(v.stub,'/status')).ready,true);
  assert.equal((await invokeAuth(v.stub,'/access')).accessToken,'access-first');
  assert.ok(!JSON.stringify(await invokeAuth(v.stub,'/status')).includes('refresh-first'));
  assert.equal(requests.filter(x=>x.url.endsWith('/oauth/token')).length,1);
 }finally{globalThis.fetch=original}
});
test('refresh rotates atomically and concurrently requested tokens never reuse an old refresh token',async()=>{
 const v=vault();const original=globalThis.fetch;
 v.store.set('tokens',{clientId:'test_client_123456',access_token:'expired',refresh_token:'rotate-old',expiresAt:0});
 let calls=0;
 try{
  globalThis.fetch=async(u,options)=>{
   calls++;const form=new URLSearchParams(options.body);
   assert.equal(form.get('refresh_token'),'rotate-old');
   return Response.json({access_token:'access-new',refresh_token:'rotate-new',expires_in:3600});
  };
  const results=await Promise.all([invokeAuth(v.stub,'/access'),invokeAuth(v.stub,'/access')]);
  assert.equal(results[0].accessToken,'access-new');assert.equal(results[1].accessToken,'access-new');
  assert.equal(calls,1);
  assert.equal(v.store.get('tokens').refresh_token,'rotate-new');
 }finally{globalThis.fetch=original}
});
test('quota rate limits by daily total and per caller; no client tokens leak',async()=>{
 const v=vault({MAX_DAILY_SEARCHES:'3',MAX_IP_DAILY_SEARCHES:'2',QUOTA_SALT:'unit-test'});
 assert.equal((await invokeAuth(v.stub,'/quota',{ip:'127.0.0.1'})).allowed,true);
 assert.equal((await invokeAuth(v.stub,'/quota',{ip:'127.0.0.1'})).allowed,true);
 assert.equal((await invokeAuth(v.stub,'/quota',{ip:'127.0.0.1'})).allowed,false);
 assert.equal((await invokeAuth(v.stub,'/quota',{ip:'127.0.0.2'})).allowed,true);
 assert.equal((await invokeAuth(v.stub,'/quota',{ip:'127.0.0.3'})).allowed,false);
 const data=[...v.store.values()].map(v=>JSON.stringify(v)).join('\n');
 assert.ok(!data.includes('127.0.0.1'));
});
test('free PFS posts exact dates once and polls until late split-ticket results settle',async()=>{
 const v=vault({PUBLIC_SEARCH_ENABLED:'true',QUOTA_SALT:'unit-test'});
 v.store.set('tokens',{clientId:'test_client_123456',access_token:'free-personal-token',refresh_token:'refresh',expiresAt:Date.now()+600000});
 const original=globalThis.fetch;let startBody,polls=0;
 try {
  globalThis.fetch=async(url,opts={})=>{
   if(url==='https://letsfg.co/api/search'){
    startBody=JSON.parse(opts.body);assert.equal(opts.headers.Authorization,'Bearer free-personal-token');
    return Response.json({search_id:'ws_some-search'});
   }
   if(String(url).startsWith('https://letsfg.co/api/results/')){
    polls++;
    const base={status:polls<2?'searching':'completed',split_ticket_pending:polls===2,offers:[{id:'offer1',price:729,currency:'USD',owner_airline:'TAP Air Portugal',self_transfer:'unprotected'}]};
    if(polls===3)base.offers.push({id:'offer2',price:688,currency:'USD',airlines:['Delta'],split_ticket:'true'});
    return Response.json(base);
   }
   throw Error('unexpected '+url);
  };
  const r=await pfsSearch(req,v.env,{ip:'127.0.0.1',sleep:async()=>{}});
  assert.equal(startBody.origin,'BOS');assert.equal(startBody.destination,'FCO');
  assert.equal(startBody.date_from,'2027-07-19');assert.equal(startBody.return_from,'2027-07-25');
  assert.equal(startBody.adults,4);assert.equal(startBody.currency,'USD');
  assert.equal(polls,3);assert.equal(r.partial,false);assert.equal(r.offers.length,2);
  assert.equal(r.offers[1].totalPrice,2752);assert.equal(r.offers[1].splitTicket,true);
 }finally{globalThis.fetch=original}
});
test('free PFS refuses disabled search and owner OAuth routes refuse anonymous setup',async()=>{
 const v=vault({PUBLIC_SEARCH_ENABLED:'false'});
 await assert.rejects(pfsSearch(req,v.env),/disabled/i);
 const adminRequest=new Request('https://example.workers.dev/api/auth/start',{method:'POST'});
 const res=await serveSearch(adminRequest,v.env);
 assert.equal(res.status,401);
 assert.equal((await res.json()).error.includes('Owner-only'),true);
});
test('paid LetsFG developer key alone never silently activates billable API',async()=>{
 const data={...req,provider:'letsfg'};
 const request=new Request('https://example.workers.dev/api/search',{method:'POST',headers:{origin:'https://aishwaryaapsangi.github.io'},body:JSON.stringify(data)});
 const r=await serveSearch(request,{LETSFG_API_KEY:'paid-but-not-opted-in'});
 assert.equal(r.status,503);assert.equal((await r.json()).code,'NOT_CONFIGURED');
});

test('owner connection page is no-JS, private form and redirects only to LetsFG with valid secret',async()=>{
 const secret='owner-super-secret-this-is-only-for-a-unit-test-1234';
 const v=vault({ADMIN_SETUP_TOKEN:secret});
 const page=await serveSearch(new Request('https://my-rome-flight-api.aishwaryaapsangi25.workers.dev/api/connect'),v.env);
 assert.equal(page.status,200);
 const html=await page.text();
 assert.match(html,/Connect free LetsFG/);
 assert.match(html,/type="password"/);
 assert.equal(html.includes(secret),false);
 assert.equal(page.headers.get('referrer-policy'),'no-referrer');
 const bad=await serveSearch(new Request('https://my-rome-flight-api.aishwaryaapsangi25.workers.dev/api/connect',{method:'POST',headers:{Origin:'https://my-rome-flight-api.aishwaryaapsangi25.workers.dev','content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams({ownerToken:'incorrect-value'})}),v.env);
 assert.equal(bad.status,401);
 assert.equal(v.store.has('pending'),false);
 const orig=globalThis.fetch;
 try{
  globalThis.fetch=async url=>String(url).endsWith('/oauth/register')?Response.json({client_id:'test_client_123456'}):(()=>{throw Error('Unexpected OAuth request')})();
  const good=await serveSearch(new Request('https://my-rome-flight-api.aishwaryaapsangi25.workers.dev/api/connect',{method:'POST',headers:{Origin:'https://my-rome-flight-api.aishwaryaapsangi25.workers.dev','content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams({ownerToken:secret})}),v.env);
  assert.equal(good.status,303);
  const target=new URL(good.headers.get('location'));
  assert.equal(target.origin,'https://letsfg.co');
  assert.equal(target.pathname,'/connect');
  assert.equal(v.store.has('pending'),true);
  assert.ok(!good.headers.get('location').includes(secret));
 }finally{globalThis.fetch=orig}
});

test('top-level LetsFG connection GET works even when link preview supplies a foreign Origin',async()=>{
 const env={ALLOWED_ORIGIN:'https://aishwaryaapsangi.github.io'};
 const base='https://my-rome-flight-api.aishwaryaapsangi25.workers.dev';
 const page=await serveSearch(new Request(base+'/api/connect',{method:'GET',headers:{Origin:'https://chatgpt.com'}}),env);
 assert.equal(page.status,200);
 assert.equal(page.headers.get('content-type'),'text/html; charset=utf-8');
 assert.match(await page.text(),/Connect free LetsFG/);
 const unsafe=await serveSearch(new Request(base+'/api/connect',{method:'POST',headers:{Origin:'https://chatgpt.com','content-type':'application/x-www-form-urlencoded'},body:'ownerToken=not-important'}),env);
 assert.equal(unsafe.status,403);
 assert.match((await unsafe.json()).error,/new browser tab/i);
 const flight=await serveSearch(new Request(base+'/api/search',{method:'POST',headers:{Origin:'https://chatgpt.com','content-type':'application/json'},body:JSON.stringify(req)}),env);
 assert.equal(flight.status,403);
 const site=await serveSearch(new Request(base+'/api/health',{method:'GET',headers:{Origin:'https://aishwaryaapsangi.github.io'}}),env);
 assert.equal(site.status,200);
});
