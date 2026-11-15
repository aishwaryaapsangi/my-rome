/* La Dolce Vita — real flight search UI. Only consumes authorized server responses. No API secrets here. */
(()=>{'use strict';
const $=id=>document.getElementById(id);
const clean=s=>String(s??'').replace(/[&<>"']/g,x=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[x]));
const dollars=n=>Number.isFinite(Number(n))?'$'+Number(n).toLocaleString('en-US',{maximumFractionDigits:2,minimumFractionDigits:0}):'—';
const state={apiBase:'',ready:false,queryKey:'',offers:[],checkedAt:'',errors:[],serial:0,timer:null};
const depart=()=>$('departure').value,returnDate=()=>$('returnDate').value,travelers=()=>Math.max(1,Math.min(9,Number($('travelers').value)||4));
const days=()=>Math.round((Date.parse(returnDate()+'T12:00:00Z')-Date.parse(depart()+'T12:00:00Z'))/86400000)+1;
function query(){return {origin:$('flightOrigin').value.toUpperCase().trim(),destination:$('flightDestination').value.toUpperCase().trim(),departure:depart(),returnDate:returnDate(),adults:travelers(),cabin:$('flightCabin').value,maxStops:Number($('flightStops').value),provider:$('flightProvider').value}}
const key=()=>JSON.stringify(query());
function status(message,tone='error'){$('liveState').textContent=message;$('liveState').dataset.status=tone;$('apiStatus').textContent=message}
function isValid(q){if(!/^[A-Z]{3}$/.test(q.origin)||!/^[A-Z]{3}$/.test(q.destination)||q.origin===q.destination)return 'Please use two different three-letter IATA airport codes.';if(!Number.isFinite(days())||days()<4||days()>28)return 'Select a trip of 4–28 calendar days, with a return after departure.';return ''}
function matches(o,code){if(code==='all')return true;const combined=[o.carrier,o.airline,...(o.airlines||[])].join(' ');const patterns={DL:/\bDL\b|Delta/i,AZ:/\bAZ\b|ITA Airways/i,TP:/\bTP\b|TAP/i,EI:/\bEI\b|Aer Lingus/i};return Boolean(patterns[code]?.test(combined))}
function current(){return state.queryKey===key()?state.offers.filter(x=>Number(x.totalPrice)>0&&!x.isTest):[]}
function render(){
 const cur=current(),code=$('liveAirline').value,sort=$('liveSort').value;
 const items=cur.filter(o=>matches(o,code));
 items.sort((a,b)=>sort==='airline'?String(a.airline||'').localeCompare(String(b.airline||'')):sort==='duration'?(a.durationMinutes??99999)-(b.durationMinutes??99999):sort==='stops'?((a.stopsOutbound??9)+(a.stopsReturn??9))-((b.stopsOutbound??9)+(b.stopsReturn??9))||a.totalPrice-b.totalPrice:a.totalPrice-b.totalPrice);
 $('liveHeading').textContent=depart()+' → '+returnDate()+' · '+travelers()+' travelers';
 $('liveOfferCount').textContent=items.length+' verified live offers';
 $('liveMeta').textContent=state.checkedAt&&state.queryKey===key()?'Provider checked '+new Date(state.checkedAt).toLocaleString('en-US')+' · fares can change at checkout':'Only matching-date supplier offers count. Published prices in the section below are not used as live fares.';
 const out=$('liveResultCards');
 if(!items.length){
  out.innerHTML='<div class="callout warn">'+(state.offers.length&&state.offers.every(x=>x.isTest)?'Only sandbox/test fares were returned. These are not bookable prices.':state.ready?'No real matches for this date pair / airline filter yet. Try all airlines or more stops.':'No live airline prices available until the secure flight API is connected.')+'</div>';return;
 }
 out.innerHTML=items.slice(0,35).map((o,i)=>{
  const seller=String(o.bookingUrl||'');const link=/^https:\/\//i.test(seller)?'<a class="btn" target="_blank" rel="noopener" href="'+clean(seller)+'">Review exact seller offer ↗</a>':'<a class="btn alt" target="_blank" rel="noopener" href="https://www.google.com/travel/flights?hl=en">Recheck flight availability ↗</a>';
  const warning=o.selfTransfer==='unprotected'||o.splitTicket?'<div class="warning">⚠ Unprotected self-transfer / separate tickets. Missed connections may not be covered.</div>':'';
  return '<article class="live-offer"><span class="tag">'+(i===0?'🏆 Cheapest · ':'')+clean(o.provider||'Flight supplier')+'</span><span class="tag">'+clean(o.source||'Source not provided')+'</span><h3>'+clean(o.airline||'Operating airline unknown')+'</h3><div class="fare">'+dollars(o.totalPrice)+' <small>family total</small></div><b>'+dollars(o.pricePerPerson)+' / traveler</b><div class="detail">Operating airlines: '+clean((o.airlines||[]).join(' · ')||o.airline)+'<br>Outbound stops: '+(o.stopsOutbound??'?')+' · Return stops: '+(o.stopsReturn??'?')+(o.durationMinutes?'<br>Total flying: '+Math.floor(o.durationMinutes/60)+'h '+o.durationMinutes%60+'m':'')+'</div>'+warning+(o.expiresAt?'<div class="miniNote">Offer expires: '+clean(o.expiresAt)+'</div>':'')+'<div class="actions">'+link+'</div></article>';
 }).join('');
}
async function init(){
 try{
  const r=await fetch(new URL('runtime-config.json',document.baseURI).toString(),{cache:'no-store'});
  if(!r.ok)throw Error('Runtime config not found');
  const cfg=await r.json(),base=String(cfg.apiBaseUrl||'').trim().replace(/\/+$/,'');
  if(!/^https:\/\//.test(base)){status('Live API not configured. The date, trip length and budgets work now; connect your private flight-search Worker to retrieve actual airline offers.');return}
  state.apiBase=base;
  const reply=await fetch(base+'/api/health',{cache:'no-store'}),health=await reply.json();
  state.ready=reply.ok&&health.ready===true;
  status(state.ready?'🟢 Flight API connected: '+Object.keys(health.providers||{}).filter(k=>health.providers[k]).join(' + ')+'. Pick dates to search fresh offers.':'Flight API reached, but no provider has been authorized. Set LETSFG_API_KEY or DUFFEL_ACCESS_TOKEN in Worker secrets.',state.ready?'ready':'error');
 }catch(e){status('Live provider unavailable. The browser cannot keep an API key. '+e.message,'error')}
 render();
}
async function search(){
 const serial=++state.serial,q=query(),invalid=isValid(q);
 if(invalid){status(invalid);return}
 if(!state.ready){status('No live provider connected. Configure the Cloudflare Worker and a licensed LetsFG/Duffel credential. No sample prices are presented as live.');return}
 status('Searching live flights for '+q.departure+' → '+q.returnDate+', '+q.adults+' travelers…','loading');
 const ctrl=new AbortController(),timer=setTimeout(()=>ctrl.abort(),95000);
 try{
  const r=await fetch(state.apiBase+'/api/search',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(q),cache:'no-store',signal:ctrl.signal});
  const b=await r.json();
  if(serial!==state.serial)return;
  if(!r.ok)throw Error(b.error||'Supplier error: '+r.status);
  if(b.query?.departure!==q.departure||b.query?.returnDate!==q.returnDate||b.query?.adults!==q.adults)throw Error('The provider returned mismatched dates; discarding its results.');
  state.queryKey=JSON.stringify(q);state.offers=Array.isArray(b.offers)?b.offers:[];state.checkedAt=b.checkedAt||new Date().toISOString();state.errors=b.errors||[];
  const real=state.offers.filter(o=>!o.isTest);
  status('Received '+real.length+' real provider offer(s)'+(b.fromCache?' from a short-lived cache':'')+'. '+(b.errors?.length?b.errors.map(e=>e.provider+': '+e.error).join('; '):'Rates can change before checkout.'),real.length||!b.errors?.length?'ready':'error');
  render();
 }catch(e){if(serial!==state.serial)return;status('Live search failed: '+(e.name==='AbortError'?'Timed out; retry in a moment':e.message)+' · No prices invented.','error');render()}
 finally{clearTimeout(timer)}
}
function invalidate(){
 state.serial++;state.queryKey='';state.offers=[];state.checkedAt='';render();
 if(state.timer)clearTimeout(state.timer);
 if(state.ready&&$('autoFlightSearch').checked&&!isValid(query()))state.timer=setTimeout(search,1100);
}
function setup(){
 const needed=['departure','returnDate','travelers','liveSearchNow','liveState','liveResultCards'];
 if(needed.some(x=>!$(x)))return;
 $('liveSearchNow').onclick=search;
 ['liveSort','liveAirline'].forEach(id=>$(id).onchange=render);
 ['flightOrigin','flightDestination','flightProvider','flightStops','flightCabin','departure','returnDate','travelers'].forEach(id=>$(id).addEventListener('change',invalidate));
 $('travelers').addEventListener('input',invalidate);
 document.querySelectorAll('.quicktrip').forEach(b=>b.addEventListener('click',invalidate));
 window.MyRomeLive={search,render,best:()=>current().sort((a,b)=>a.totalPrice-b.totalPrice)[0]||null,status:()=>({ready:state.ready,checkedAt:state.checkedAt,results:current().length})};
 init();
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',setup,{once:true});else setup();
})();
