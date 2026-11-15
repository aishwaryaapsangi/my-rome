import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { JSDOM, VirtualConsole } from 'jsdom';

const html=readFileSync('public/studio.html','utf8');
function boot(){
  const errors=[];
  const consoleCapture=new VirtualConsole();
  consoleCapture.on('jsdomError',e=>errors.push(String(e)));
  const dom=new JSDOM(html,{
    url:'https://example.org/my-rome/',
    runScripts:'dangerously',
    pretendToBeVisual:true,
    virtualConsole:consoleCapture,
    beforeParse(window){
      window.HTMLElement.prototype.scrollIntoView=function(){};
      window.confirm=()=>true;
      window.alert=(m)=>errors.push('alert: '+m);
    }
  });
  return {document:dom.window.document,window:dom.window,errors,close:()=>dom.window.close()};
}
test('full HTML and standalone mirror both contain source comparison',()=>{
  assert.equal(readFileSync('index.html','utf8'),html);
  assert.match(html,/publishedFares/);
  assert.match(html,/\$887 published\*/);
  assert.match(html,/\$781 published\*/);
  assert.match(html,/No exact-date Delta\/ITA airline checkout fares recorded/);
});
test('comparing airlines stays in app and populates four example cards',()=>{
  const {document:d,errors,close}=boot();
  d.querySelector('[data-tab="compare"]').click();
  assert.ok(d.getElementById('compare').classList.contains('active'));
  assert.equal(d.querySelectorAll('.market-item').length,4);
  assert.match(d.getElementById('deltaFare').textContent,/\$887 published/);
  assert.match(d.getElementById('itaFare').textContent,/\$781 published/);
  assert.match(d.getElementById('marketCards').textContent,/TAP Air Portugal/);
  assert.match(d.getElementById('marketCards').textContent,/Aer Lingus/);
  assert.match(d.getElementById('marketSummary').textContent,/not a like-for-like comparison/);
  assert.deepEqual(errors,[]);
  close();
});
test('heatmap compare click navigates within app, retains selected departure',()=>{
  const {document:d,errors,close}=boot();
  d.querySelector('[data-tab="heatmap"]').click();
  assert.equal(d.querySelectorAll('#heatGrid button.calday').length,31);
  d.querySelectorAll('#heatGrid button.calday')[19].click(); // July 20
  d.getElementById('goCompare').click();
  assert.ok(d.getElementById('compare').classList.contains('active'));
  assert.equal(d.getElementById('departure').value,'2027-07-20');
  assert.equal(d.querySelectorAll('#marketCards .market-item').length,4);
  assert.deepEqual(errors,[]);
  close();
});
test('actual recorded airline quote overrides published example in selected 10-day slot',()=>{
  const {document:d,errors,close}=boot();
  d.querySelector('[data-tab="compare"]').click();
  d.getElementById('quoteAir').value='DL';
  d.getElementById('quoteFare').value='995';
  d.getElementById('quoteSeats').value='4';
  d.getElementById('saveQuote').click();
  assert.match(d.getElementById('deltaFare').textContent,/\$995/);
  assert.match(d.getElementById('itaFare').textContent,/\$781 published/);
  assert.deepEqual(errors,[]);
  close();
});
test('flight links remain external and no secret stored in HTML',()=>{
  const {document:d,errors,close}=boot();
  d.querySelector('[data-tab="compare"]').click();
  for(const a of d.querySelectorAll('.market-item a')){
    assert.equal(a.target,'_blank');
    assert.match(a.rel,/noopener/);
    assert.match(a.href,/^https:\/\//);
  }
  assert.doesNotMatch(html,/DUFFEL_ACCESS_TOKEN\s*=\s*['"][^\s'"]+/);
  assert.deepEqual(errors,[]);
  close();
});
