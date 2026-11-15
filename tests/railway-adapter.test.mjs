import test from 'node:test';
import assert from 'node:assert/strict';
import {createFlightServer} from '../api-worker/src/http-server.mjs';
function open(env={}) {
 const server=createFlightServer(env);
 return new Promise((resolve,reject)=>{
   server.once('error',reject);
   server.listen(0,'127.0.0.1',()=>resolve({
     url:'http://127.0.0.1:'+server.address().port,
     close:()=>new Promise(done=>server.close(done))
   }));
 });
}
const origin='https://aishwaryaapsangi.github.io';
test('Node handler checks provider configuration without disclosing a secret',async()=>{
 const app=await open({LETSFG_API_KEY:'super-private-example',ENABLE_PAID_LETSFG:'true',ALLOWED_ORIGIN:origin});
 try{
  const r=await fetch(app.url+'/api/health',{headers:{Origin:origin}});
  assert.equal(r.status,200);
  assert.equal(r.headers.get('access-control-allow-origin'),origin);
  const content=await r.text();
  assert.equal(JSON.parse(content).ready,true);
  assert.ok(!content.includes('super-private-example'));
 }finally{await app.close()}
});
test('No provider secret yields 503, never fabricated flight offers',async()=>{
 const app=await open({ALLOWED_ORIGIN:origin});
 try{
  const data={origin:'BOS',destination:'FCO',departure:'2027-07-19',returnDate:'2027-07-26',adults:4,provider:'all'};
  const r=await fetch(app.url+'/api/search',{method:'POST',headers:{Origin:origin,'content-type':'application/json'},body:JSON.stringify(data)});
  assert.equal(r.status,503);
  const body=await r.json();
  assert.deepEqual(body.offers,[]);
  assert.equal(body.code,'NOT_CONFIGURED');
 }finally{await app.close()}
});
test('Reject other origins and oversized bodies',async()=>{
 const app=await open({ALLOWED_ORIGIN:origin});
 try{
  let r=await fetch(app.url+'/api/health',{headers:{Origin:'https://unknown.example'}});
  assert.equal(r.status,403);
  r=await fetch(app.url+'/api/search',{method:'POST',headers:{Origin:origin,'content-type':'application/json'},body:'A'.repeat(4000)});
  assert.equal(r.status,413);
 }finally{await app.close()}
});
test('CORS preflight returns empty 204',async()=>{
 const app=await open({ALLOWED_ORIGIN:origin});
 try{
  const r=await fetch(app.url+'/api/search',{method:'OPTIONS',headers:{Origin:origin,'access-control-request-method':'POST'}});
  assert.equal(r.status,204);
  assert.equal(await r.text(),'');
 }finally{await app.close()}
});
