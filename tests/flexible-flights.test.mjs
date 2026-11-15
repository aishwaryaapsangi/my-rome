import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {JSDOM,VirtualConsole} from 'jsdom';
const html=readFileSync('public/studio.html','utf8'),script=readFileSync('public/live-flight-ui.js','utf8');
const tick=()=>new Promise(resolve=>setTimeout(resolve,20));
function create(mock){
 const errors=[],c=new VirtualConsole();c.on('jsdomError',e=>errors.push(String(e)));
 const dom=new JSDOM(html,{url:'https://aishwaryaapsangi.github.io/my-rome/studio.html',runScripts:'dangerously',pretendToBeVisual:true,virtualConsole:c,beforeParse(win){win.HTMLElement.prototype.scrollIntoView=function(){};win.alert=m=>errors.push('alert: '+m);win.confirm=()=>true;win.fetch=mock||(async()=>({ok:true,json:async()=>({apiBaseUrl:''})}))}});
 dom.window.eval(script);
 return {win:dom.window,d:dom.window.document,errors,close:()=>dom.window.close()};
}
test('8-day default, six-day and ten-day itinerary adapt',async()=>{
 const t=create();await tick();let d=t.d;
 d.querySelector('[data-tab="itinerary"]').click();
 assert.equal(d.querySelectorAll('#daynav button').length,8);
 d.querySelector('.quicktrip[data-length="6"]').click();
 assert.equal(d.getElementById('returnDate').value,'2027-07-24');
 assert.equal(d.querySelectorAll('#daynav button').length,6);
 assert.match(d.getElementById('statDuration').textContent,/6 days/);
 d.querySelector('.quicktrip[data-length="10"]').click();
 assert.equal(d.getElementById('returnDate').value,'2027-07-28');
 assert.equal(d.querySelectorAll('#daynav button').length,10);
 d.querySelector('[data-tab="budget"]').click();
 assert.equal(d.querySelectorAll('#dailyTable tbody tr').length,10);
 assert.deepEqual(t.errors,[]);t.close();
});
test('changing return date adjusts day count without changing outbound',async()=>{
 const t=create();await tick();const d=t.d;
 d.getElementById('returnDate').value='2027-07-25';
 d.getElementById('returnDate').dispatchEvent(new t.win.Event('change',{bubbles:true}));
 d.querySelector('[data-tab="itinerary"]').click();
 assert.equal(d.querySelectorAll('#daynav button').length,7);
 assert.equal(d.getElementById('departure').value,'2027-07-19');
 assert.deepEqual(t.errors,[]);t.close();
});
test('unconfigured worker never produces synthetic live fares',async()=>{
 const t=create();await tick();t.d.querySelector('[data-tab="compare"]').click();
 assert.match(t.d.getElementById('liveState').textContent,/API|configured|connected/i);
 assert.match(t.d.getElementById('liveOfferCount').textContent,/0 verified live offers/);
 assert.equal(t.d.querySelectorAll('.market-item').length,4);
 assert.deepEqual(t.errors,[]);t.close();
});
test('live provider compares airlines for exactly chosen dates and party size',async()=>{
 const calls=[];
 const fetchMock=async(url,opts={})=>{
  const link=String(url);calls.push({url:link,body:opts.body});
  if(link.includes('runtime-config'))return {ok:true,json:async()=>({apiBaseUrl:'https://mock.worker.example'})};
  if(link.endsWith('/api/health'))return {ok:true,json:async()=>({ready:true,providers:{letsfg:true,duffel:false}})};
  const q=JSON.parse(opts.body);
  return {ok:true,json:async()=>({checkedAt:'2026-11-14T20:00:00.000Z',query:q,offers:[
    {provider:'LetsFG',source:'Example supplier',airline:'Delta Air Lines',airlines:['Delta Air Lines'],carrier:'DL',pricePerPerson:899,totalPrice:899*q.adults,currency:'USD',stopsOutbound:0,stopsReturn:0,isTest:false},
    {provider:'LetsFG',source:'Example supplier',airline:'TAP Air Portugal',airlines:['TAP Air Portugal'],carrier:'TP',pricePerPerson:720,totalPrice:720*q.adults,currency:'USD',stopsOutbound:1,stopsReturn:1,isTest:false},
    {provider:'Duffel',source:'Test inventory',airline:'ITA Airways',carrier:'AZ',pricePerPerson:100,totalPrice:100*q.adults,isTest:true}
  ],errors:[]})};
 };
 const t=create(fetchMock);await tick();const d=t.d;
 d.querySelector('[data-tab="compare"]').click();
 d.getElementById('returnDate').value='2027-07-24';d.getElementById('returnDate').dispatchEvent(new t.win.Event('change',{bubbles:true}));
 await tick();
 await t.win.MyRomeLive.search();
 assert.equal(d.querySelectorAll('.live-offer').length,2);
 assert.match(d.querySelector('.live-offer').textContent,/TAP Air Portugal/);
 assert.match(d.querySelector('.live-offer').textContent,/\$2,880/);
 const post=calls.filter(x=>x.body).at(-1);assert.equal(JSON.parse(post.body).departure,'2027-07-19');assert.equal(JSON.parse(post.body).returnDate,'2027-07-24');assert.equal(JSON.parse(post.body).adults,4);
 d.getElementById('liveAirline').value='DL';d.getElementById('liveAirline').dispatchEvent(new t.win.Event('change'));
 assert.equal(d.querySelectorAll('.live-offer').length,1);
 assert.match(d.querySelector('.live-offer').textContent,/Delta/);
 assert.deepEqual(t.errors,[]);t.close();
});
test('all real booking links leave app securely, without keys',async()=>{
 const t=create();await tick();const d=t.d;
 d.querySelector('[data-tab="compare"]').click();
 for(const a of d.querySelectorAll('#liveSearchPanel a'))assert.equal(a.target,'_blank');
 assert.doesNotMatch(html+script,/LETSFG_API_KEY\s*=\s*['"][A-Za-z0-9_-]{10,}/);
 assert.deepEqual(t.errors,[]);t.close();
});
