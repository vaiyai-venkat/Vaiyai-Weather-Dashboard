import {finite} from './analytics.mjs';
import {axisDomain} from './comparison.mjs';
import {DAY_COLORS,weeklyDates,weeklyVariable,prepareWeeklyDay,valueFor,weeklySummary,weeklyPath,nearestWeeklyPoint,weeklyCSV} from './weekly.mjs';
const $=s=>document.querySelector(s),NS='http://www.w3.org/2000/svg';
const dom=(tag,cls,text)=>{const n=document.createElement(tag);if(cls)n.className=cls;if(text!=null)n.textContent=text;return n;};
const svg=(tag,attrs={},text)=>{const n=document.createElementNS(NS,tag);for(const[k,v]of Object.entries(attrs))n.setAttribute(k,String(v));if(text!=null)n.textContent=text;return n;};
const add=(root,tag,attrs,text)=>{const n=svg(tag,attrs,text);root.append(n);return n;};
const fmt=v=>finite(v)?v.toLocaleString('en-IN',{maximumFractionDigits:1}):'—';
const label=date=>new Date(date+'T12:00:00Z').toLocaleDateString('en-GB',{weekday:'short',day:'numeric',month:'short',timeZone:'UTC'});
export function setupWeeklyComparison({getIntraday,getTimeZone,getDemo}){
 let generation=0,state=null;
 function cancel(){generation++;state=null;}
 async function render(anchor,originalVariables){
  const current=++generation,dates=weeklyDates(anchor),variables=originalVariables.map(weeklyVariable),container=$('#compare-chart');
  $('#compare-a-range').textContent=label(dates[0])+' – '+label(dates[6]);
  $('#compare-alignment').textContent='Seven daily curves on one 00:00–24:00 station-time axis. Each colour is one date; today stops at the latest archived observation.';
  $('#compare-method').textContent='Reporting-interval readings are used, not daily summaries. Gaps longer than 30 minutes remain breaks. Rainfall accumulation is read once per interval and is not summed across intervals.'+(variables.some(v=>v.key==='pressure_mid')?' Pressure midpoint = (interval high + low) ÷ 2.':'');
  $('#compare-left-label').textContent='LEFT · '+variables[0].label+' · '+variables[0].unit;
  $('#compare-right-label').textContent=variables[1]?'RIGHT · '+variables[1].label+' · '+variables[1].unit:'';
  $('#compare-legend').replaceChildren();$('#compare-summary').replaceChildren();container.replaceChildren(dom('div','empty','Loading seven days of interval observations…'));$('#compare-download').disabled=true;
  const results=await Promise.allSettled(dates.map(date=>getIntraday(date)));
  if(current!==generation)return;
  const days=dates.map((date,i)=>prepareWeeklyDay(date,results[i].status==='fulfilled'?results[i].value:[],getTimeZone()));
  state={days,variables};const available=days.filter(day=>day.points.some(point=>variables.some(v=>finite(valueFor(point,v))))).length;
  const legend=$('#compare-legend');
  for(const [i,day]of days.entries()){const item=dom('span','compare-key'),line=dom('i');line.style.borderColor=DAY_COLORS[i];item.append(line,document.createTextNode(label(day.date)+(day.points.length?'':' · no intervals')));legend.append(item);}
  const styles=dom('span','compare-key weekly-variable-key');styles.textContent='Solid: '+variables[0].label+(variables[1]?' · Dashed: '+variables[1].label:'');legend.append(styles);
  for(const [i,day]of days.entries()){
   const card=dom('div','compare-stat weekly-day-stat');card.style.borderColor=DAY_COLORS[i];card.append(dom('span','weekly-date',label(day.date)));
   for(const v of variables){const summary=weeklySummary(day,v);const value=dom('strong','',fmt(summary.value)+' '+v.unit);value.style.color=DAY_COLORS[i];card.append(dom('span','',v.label),value,dom('small','',summary.kind+' · '+summary.count+' interval readings'));}
   $('#compare-summary').append(card);
  }
  if(results.some(r=>r.status==='rejected')){$('#compare-error').hidden=false;$('#compare-error').textContent='Some interval files could not be loaded. Available days are shown; retry the page refresh.';}
  $('#compare-alignment').textContent+=` ${available} of 7 dates have readings for the chosen measurements.`;
  $('#compare-download').disabled=!available;draw(days,variables);
 }
 function download(){if(!state)return;const content=weeklyCSV(state.days,state.variables),url=URL.createObjectURL(new Blob(['\uFEFF'+content],{type:'text/csv;charset=utf-8;'})),a=document.createElement('a');a.href=url;a.download=`${getDemo()?'DEMO_':''}IPAPAN3_weekly_clock_${state.days[0].date}_${state.days.at(-1).date}.csv`;a.click();setTimeout(()=>URL.revokeObjectURL(url),2000);}
 function draw(days,variables){
  const container=$('#compare-chart');container.replaceChildren();const all=days.flatMap(day=>day.points.flatMap(p=>variables.map(v=>valueFor(p,v)))).filter(finite);
  if(!all.length){const empty=dom('div','empty','No reporting-interval readings for this week');empty.append(dom('small','','Choose dates with archived interval observations.'));container.append(empty);return;}
  const W=Math.max(720,Math.round(container.clientWidth)),H=innerWidth<=760?340:380,L=76,R=variables.length>1?84:28,T=24,B=44,pw=W-L-R,ph=H-T-B;
  let domains=variables.map(v=>axisDomain(days.flatMap(day=>day.points.map(p=>valueFor(p,v))),v));
  if(variables.length===2&&variables[0].unit===variables[1].unit){const domain=axisDomain(days.flatMap(day=>day.points.flatMap(p=>variables.map(v=>valueFor(p,v)))),variables[0]);domains=[domain,domain];}
  const x=minute=>L+minute/1440*pw,y=(value,vi)=>T+ph-(value-domains[vi][0])/(domains[vi][1]-domains[vi][0])*ph;
  const root=svg('svg',{viewBox:`0 0 ${W} ${H}`,role:'img','aria-label':'Weekly comparison of seven daily curves from midnight 00:00 to midnight 24:00. Use arrow keys to inspect station time.'});container.append(root);
  for(let tick=0;tick<=4;tick++){const yy=T+ph-tick/4*ph;add(root,'line',{x1:L,x2:W-R,y1:yy,y2:yy,stroke:'var(--grid)','stroke-dasharray':'3 5'});for(const [vi,domain]of domains.entries())add(root,'text',{x:vi?W-R+10:L-10,y:yy+4,'text-anchor':vi?'start':'end'},fmt(domain[0]+tick/4*(domain[1]-domain[0])));}
  for(const hour of [0,4,8,12,16,20,24])add(root,'text',{x:x(hour*60)+(hour===0?8:0),y:H-11,'text-anchor':hour===0?'start':hour===24?'end':'middle',class:'weekly-time-tick'},String(hour).padStart(2,'0')+':00');
  for(const [di,day]of days.entries())for(const [vi,v]of variables.entries()){
   add(root,'path',{d:weeklyPath(day.points,v,x,value=>y(value,vi)),fill:'none',stroke:DAY_COLORS[di],'stroke-width':vi?2.2:2.7,'stroke-dasharray':vi?'6 4':'none','stroke-linejoin':'round'});
   day.points.forEach((p,i)=>{const value=valueFor(p,v),before=day.points[i-1],after=day.points[i+1];if(finite(value)&&(!before||!finite(valueFor(before,v))||p.minute-before.minute>30)&&(!after||!finite(valueFor(after,v))||after.minute-p.minute>30))add(root,'circle',{cx:x(p.minute),cy:y(value,vi),r:3,fill:DAY_COLORS[di]});});
  }
  const line=add(root,'line',{x1:L,x2:L,y1:T,y2:H-B,stroke:'var(--muted)','stroke-dasharray':'3 3',visibility:'hidden'});
  const overlay=add(root,'rect',{x:L,y:T,width:pw,height:ph,fill:'transparent',tabindex:0,role:'slider','aria-label':'Weekly station clock time','aria-valuemin':0,'aria-valuemax':1440,'aria-valuenow':0});let minute=0;
  const show=(value,px,py)=>{minute=Math.max(0,Math.min(1440,Math.round(value/5)*5));line.setAttribute('x1',x(minute));line.setAttribute('x2',x(minute));line.setAttribute('visibility','visible');const time=String(Math.floor(minute/60)).padStart(2,'0')+':'+String(minute%60).padStart(2,'0'),parts=[time+' · station time'];
   for(const day of days){const point=nearestWeeklyPoint(day,minute);parts.push(label(day.date)+(point?' · '+point.time.slice(0,5):' · no nearby interval'));if(point)parts.push(variables.map(v=>fmt(valueFor(point,v))+' '+v.unit).join(' / '));}
   const tip=$('#tooltip');tip.textContent=parts.join('\n');tip.hidden=false;tip.style.maxWidth='360px';tip.style.left=Math.max(8,Math.min(px+12,innerWidth-tip.offsetWidth-10))+'px';tip.style.top=Math.max(8,Math.min(py+10,innerHeight-tip.offsetHeight-10))+'px';overlay.setAttribute('aria-valuenow',minute);overlay.setAttribute('aria-valuetext',parts.join(', '));};
  const hide=()=>{$('#tooltip').hidden=true;line.setAttribute('visibility','hidden');};overlay.addEventListener('pointermove',e=>{const rect=root.getBoundingClientRect();show((((e.clientX-rect.left)/rect.width*W)-L)/pw*1440,e.clientX,e.clientY);});overlay.addEventListener('pointerleave',hide);overlay.addEventListener('blur',hide);overlay.addEventListener('focus',()=>{const r=root.getBoundingClientRect();show(0,r.left+80,r.top+40);});overlay.addEventListener('keydown',e=>{if(['ArrowLeft','ArrowRight','Home','End'].includes(e.key)){e.preventDefault();const r=root.getBoundingClientRect();show(e.key==='Home'?0:e.key==='End'?1440:minute+(e.key==='ArrowRight'?5:-5),r.left+r.width/2,r.top+40);}if(e.key==='Escape')hide();});
 }
 return {render,cancel,download};
}
