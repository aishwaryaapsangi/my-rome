import test from 'node:test';
import assert from 'node:assert/strict';
import {serveSearch,validateSearch,normalizeLetsFG,normalizeDuffel} from '../api-worker/src/index.mjs';
const request=(data,method='POST')=>new Request('https://worker.example/api/search',{method,headers:{Origin:'https://aishwaryaapsangi.github.io','content-type':'application/json'},body:JSON.stringify(data)});
const query={origin:'BOS',destination:'FCO',departure:'2027-07-19',returnDate:'2027-07-24',adults:4,cabin:'M',maxStops:1,provider:'all'};
test('validates exact dates and number of travelers',()=>{
 const input=validateSearch(query);assert.equal(input.returnDate,'2027-07-24');
 assert.throws(()=>validateSearch({...query,returnDate:'2027-07-18'}),/return/i);
 assert.throws(()=>validateSearch({...query,adults:10}),/adult/i);
 assert.throws(()=>validateSearch({...query,departure:'2027-02-30'}),/real/i);
});
test('LetsFG price is per traveler and total scales with actual group',()=>{
 const offers=normalizeLetsFG({offers:[{id:'123',price:731.5,currency:'USD',owner_airline:'Delta Air Lines',outbound:{stopovers:1,total_duration_seconds:36000},inbound:{stopovers:0,total_duration_seconds:32000},self_transfer:'unprotected'}]},query);
 assert.equal(offers[0].pricePerPerson,731.5);assert.equal(offers[0].totalPrice,2926);assert.equal(offers[0].stopsOutbound,1);assert.equal(offers[0].selfTransfer,'unprotected');
});
test('Duffel quotes are totals across passengers and test offers flagged',()=>{
 const offers=normalizeDuffel({data:{offers:[{id:'off',total_amount:'2800',total_currency:'USD',live_mode:false,owner:{name:'Airline One'},slices:[{segments:[{operating_carrier:{name:'Airline One'}}]},{segments:[{operating_carrier:{name:'Airline One'}}]}]}]}},query);
 assert.equal(offers[0].pricePerPerson,700);assert.equal(offers[0].totalPrice,2800);assert.equal(offers[0].isTest,true);
});
test('returns helpful 503 when no credentials and valid 204 preflight',async()=>{
 const res=await serveSearch(request(query),{});assert.equal(res.status,503);assert.equal((await res.json()).code,'NOT_CONFIGURED');
 const pre=new Request('https://worker.example/api/search',{method:'OPTIONS',headers:{Origin:'https://aishwaryaapsangi.github.io'}});
 assert.equal((await serveSearch(pre,{})).status,204);
});
test('live LetsFG endpoint passes exact return date, adults and produces normalized offers',async()=>{
 const original=globalThis.fetch;let sent;
 try{
  globalThis.fetch=async(url,opts)=>{sent=JSON.parse(opts.body);return new Response(JSON.stringify({offers:[{id:'sample',price:750,currency:'USD',owner_airline:'TAP Air Portugal'}]}),{status:200,headers:{'content-type':'application/json'}})};
  const r=await serveSearch(request({...query,provider:'letsfg'}),{LETSFG_API_KEY:'test-secret-do-not-commit',ENABLE_PAID_LETSFG:'true'});
  const body=await r.json();assert.equal(r.status,200);assert.equal(sent.date_from,query.departure);assert.equal(sent.return_from,query.returnDate);assert.equal(sent.adults,4);assert.equal(body.offers[0].totalPrice,3000);assert.equal(body.offers[0].isTest,false);
 }finally{globalThis.fetch=original}
});
