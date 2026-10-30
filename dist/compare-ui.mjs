import {setupWeeklyComparison} from './weekly-ui.mjs?v=20261031-all-plot-labels-v3';
import {weeklyVariable} from './weekly.mjs';
import {finite} from './analytics.mjs';
import {VARIABLES,comparisonSlots,alignPeriod,periodWindow,previousAnchor,axisDomain,seriesSummary} from './comparison.mjs';
const NS='http://www.w3.org/2000/svg', $=s=>document.querySelector(s);
const element=(tag,attrs={},text)=>{const n=document.createElementNS(NS,tag);for(const[k,v]of Object.entries(attrs))n.setAttribute(k,String(v));if(text!=null)n.textContent=text;return n;};
const add=(root,tag,attrs,text)=>{const n=element(tag,attrs,text);root.append(n);return n;};
const dom=(tag,cls,text)=>{const n=document.createElement(tag);if(cls)n.className=cls;if(text!=null)n.textContent=text;return n;};
const format=v=>finite(v)?v.toLocaleString('en-IN',{maximumFractionDigits:1}):'—';
const dateText=d=>d?new Date(d+'T12:00:00Z').toLocaleDateString('en-GB',{day:'2-digit',month:'short',year:'numeric',timeZone:'UTC'}):'Not in calendar';
const windowText=w=>dateText(w.start)+' – '+dateText(w.end);
export function setupComparison({getRows,getToday,getDemo,getIntraday,getTimeZone}){
 let state=null,usePrevious=true;
 const weekly=setupWeeklyComparison({getIntraday,getTimeZone,getDemo});
 for(const selector of ['#compare-variable-a','#compare-variable-b']){
  const select=$(selector);if(selector.endsWith('-b'))select.append(new Option('None · one variable','none'));
  for(const group of [...new Set(VARIABLES.map(v=>v.group))]){const g=document.createElement('optgroup');g.label=group;for(const v of VARIABLES.filter(v=>v.group===group))g.append(new Option(v.label,v.key));select.append(g);}
 }
 $('#compare-variable-a').value='temp_avg';$('#compare-variable-b').value='none';
 const controls=['#compare-frequency','#compare-variable-a','#compare-variable-b','#compare-mode','#compare-a','#compare-b'];
 for(const id of controls)$(id).addEventListener('change',()=>{if(id==='#compare-b')usePrevious=false;if(usePrevious&&['#compare-frequency','#compare-a'].includes(id)&&$('#compare-a').value)$('#compare-b').value=previousAnchor($('#compare-frequency').value,$('#compare-a').value);if($('#compare-variable-b').value===$('#compare-variable-a').value)$('#compare-variable-b').value='none';render();});
 $('#compare-swap').onclick=()=>{usePrevious=false;const a=$('#compare-a').value;$('#compare-a').value=$('#compare-b').value;$('#compare-b').value=a;render();};
 $('#compare-previous').onclick=()=>{usePrevious=true;if($('#compare-frequency').value==='week')$('#compare-a').value=previousAnchor('week',$('#compare-a').value);else $('#compare-b').value=previousAnchor($('#compare-frequency').value,$('#compare-a').value);render();};
 $('#compare-download').onclick=()=>{
  if($('#compare-frequency').value==='week'){weekly.download();return;}
  if(!state)return;
  const {slots,periods,variables}=state,header=['aligned_day'];
  for(const period of periods){header.push('period_'+period.id+'_date');for(const variable of variables)header.push(`${variable.key}_${variable.unit.replaceAll(',','')}_period_${period.id}`);}
  const lines=[header.join(',')];for(let i=0;i<slots.length;i++){const row=[slots[i].key];for(const period of periods){row.push(period.points[i].date||'');for(const v of variables)row.push(period.points[i].row?.[v.key]??'');}lines.push(row.join(','));}
  const url=URL.createObjectURL(new Blob(['\uFEFF'+lines.join('\r\n')],{type:'text/csv;charset=utf-8;'})),a=document.createElement('a');a.href=url;a.download=`${getDemo()?'DEMO_':''}IPAPAN3_comparison_${$('#compare-frequency').value}_${$('#compare-a').value}.csv`;a.click();setTimeout(()=>URL.revokeObjectURL(url),2000);
 };
 function reset(){usePrevious=true;const today=getToday();$('#compare-a').value=today;$('#compare-b').value=previousAnchor($('#compare-frequency').value,today);$('#compare-a').max=today;$('#compare-b').max=today;render();}
 function render(){
  weekly.cancel();if($('#comparison').hidden)return;
  if(!$('#compare-a').value){$('#compare-error').textContent='Choose a date for period A.';$('#compare-error').hidden=false;$('#compare-chart').replaceChildren();$('#compare-summary').replaceChildren();$('#compare-legend').replaceChildren();state=null;$('#compare-download').disabled=true;return;}
  const frequency=$('#compare-frequency').value,two=$('#compare-mode').value==='two',variables=[$('#compare-variable-a').value,$('#compare-variable-b').value].filter((v,i,a)=>v!=='none'&&a.indexOf(v)===i).map(k=>VARIABLES.find(v=>v.key===k));
  const clockWeek=frequency==='week';
  $('#compare-mode-group').hidden=clockWeek;$('#compare-b-group').hidden=clockWeek||!two;$('#compare-swap').hidden=clockWeek||!two;$('#compare-previous').hidden=!clockWeek&&!two;
  $('#compare-previous').textContent=clockWeek?'Previous week':'Use previous period';
  $('#compare-a-label').textContent=clockWeek?'Week ending · choose a date':'Period A · choose a date';
  $('#compare-badge').textContent=clockWeek?'7 DAYS · 24 HOURS':'A ━   B ┄';
  for(const id of ['#compare-variable-a','#compare-variable-b'])for(const variable of VARIABLES){const option=[...$(id).options].find(o=>o.value===variable.key);if(option)option.textContent=clockWeek?weeklyVariable(variable).label:variable.label;}
  const error=$('#compare-error');error.hidden=true;
  try{
   if(clockWeek){state=null;weekly.render($('#compare-a').value,variables).catch(e=>{if($('#compare-frequency').value==='week'&&!$('#comparison').hidden){error.hidden=false;error.textContent=e.message;}});return;}
   const slots=comparisonSlots(frequency),periods=[{id:'A',anchor:$('#compare-a').value},...(two?[{id:'B',anchor:$('#compare-b').value}]:[])].map(p=>({...p,window:periodWindow(frequency,p.anchor),points:alignPeriod(getRows(),frequency,p.anchor,slots)}));
   state={slots,periods,variables,frequency};
   $('#compare-a-range').textContent=windowText(periods[0].window);$('#compare-b-range').textContent=two?windowText(periods[1].window):'';
   $('#compare-alignment').textContent=(frequency==='week'?'Seven-day periods ending on the chosen dates, aligned by day 1–7.':frequency==='month'?'Calendar months aligned by day of month. Shorter months end with empty slots.':'Calendar years aligned by month and day. February 29 stays empty in non-leap years.')+' Future dates and missing observations remain gaps.';
   $('#compare-method').textContent=(variables.some(v=>v.key==='pressure_mid')?'Pressure midpoint = (reported daily high + low) ÷ 2; it is not a reported daily mean. ':'')+(variables.some(v=>v.circular)?'Direction uses degrees from north and circular means; lines break at north. ':'')+'Each axis keeps its own labeled units. Daily values are shown; these dates are independent of the overview filter.';
   const legend=$('#compare-legend'),summary=$('#compare-summary');legend.replaceChildren();summary.replaceChildren();
   const colors=['var(--cyan)','var(--gold)'];let count=0;
   for(const [vi,v]of variables.entries())for(const p of periods){
    const legendItem=dom('span','compare-key');const line=dom('i',p.id==='B'?'dashed':'');line.style.borderColor=colors[vi];legendItem.append(line,document.createTextNode(`${p.id} · ${v.label} (${v.unit})`));legend.append(legendItem);
    const result=seriesSummary(p.points,v);count+=result.count;const card=dom('div','compare-stat'),label=dom('span','',`${p.id} · ${v.label}`),value=dom('strong','',`${format(result.value)} ${v.unit}`);value.style.color=colors[vi];card.append(label,value,dom('small','',`${result.kind} · ${result.count} / ${p.points.filter(x=>x.valid).length} days with readings`));summary.append(card);
   }
   $('#compare-download').disabled=!count;
   $('#compare-left-label').textContent='LEFT · '+variables[0].label+' · '+variables[0].unit;
   $('#compare-right-label').textContent=variables[1]?'RIGHT · '+variables[1].label+' · '+variables[1].unit:'';
   draw(state,colors,count);
  }catch(e){error.textContent=e.message;error.hidden=false;$('#compare-chart').replaceChildren();$('#compare-summary').replaceChildren();$('#compare-legend').replaceChildren();state=null;$('#compare-download').disabled=true;}
 }
 function draw({slots,periods,variables},colors,count){
  const container=$('#compare-chart');container.replaceChildren();$('#tooltip').hidden=true;
  if(!count){const empty=dom('div','empty','No observations for these variables and dates');empty.append(dom('small','','Choose dates within your available archive.'));container.append(empty);return;}
  const W=Math.max(720,Math.round(container.clientWidth)),H=innerWidth<=760?340:380,L=76,R=variables.length>1?84:28,T=24,B=42,pw=W-L-R,ph=H-T-B,root=element('svg',{viewBox:`0 0 ${W} ${H}`,role:'img','aria-label':`Custom ${state.frequency} comparison. ${variables.map(v=>v.label).join(' and ')}. Arrow keys explore aligned days.`});container.append(root);
  let domains=variables.map(v=>axisDomain(periods.flatMap(p=>p.points.map(point=>point.row?.[v.key])),v));
  if(variables.length===2&&variables[0].unit===variables[1].unit){const shared=axisDomain(periods.flatMap(p=>p.points.flatMap(point=>variables.map(v=>point.row?.[v.key]))),variables[0]);domains=[shared,shared];}
  const x=i=>L+i/(slots.length-1)*pw,y=(v,vi)=>T+ph-(v-domains[vi][0])/(domains[vi][1]-domains[vi][0])*ph;
  for(let i=0;i<=4;i++){const yy=T+ph-i/4*ph;add(root,'line',{x1:L,x2:W-R,y1:yy,y2:yy,stroke:'var(--grid)','stroke-dasharray':'3 5'});for(const [vi,domain]of domains.entries())add(root,'text',{x:vi?W-R+9:L-9,y:yy+3,'text-anchor':vi?'start':'end',fill:colors[vi]},format(domain[0]+(domain[1]-domain[0])*i/4));}
  const ticks=state.frequency==='week'?[0,1,2,3,4,5,6]:state.frequency==='month'?[0,4,9,14,19,24,30]:[0,60,121,182,244,305,365];
  for(const i of ticks)add(root,'text',{x:x(i)+(i===0?8:0),y:H-10,'text-anchor':i===0?'start':i===slots.length-1?'end':'middle',class:'comparison-date-tick'},slots[i].label);
  for(const [vi,v]of variables.entries())for(const p of periods){let d='',active=false,last=null;for(let i=0;i<p.points.length;i++){const value=p.points[i].row?.[v.key];if(!finite(value)){active=false;last=null;continue;}if(v.circular&&last!==null&&Math.abs(last-value)>180)active=false;d+=(active?'L':'M')+x(i)+','+y(value,vi);active=true;last=value;}add(root,'path',{d,fill:'none',stroke:colors[vi],'stroke-width':p.id==='A'?2.8:2.4,'stroke-dasharray':p.id==='B'?'6 4':'none','stroke-linejoin':'round'});
   // A singleton must remain visible even when missing days split a series.
   p.points.forEach((point,i)=>{const value=point.row?.[v.key];if(finite(value)&&(slots.length<50||!finite(p.points[i-1]?.row?.[v.key])&&!finite(p.points[i+1]?.row?.[v.key])))add(root,'circle',{cx:x(i),cy:y(value,vi),r:slots.length<50?3.4:3,fill:p.id==='B'?'var(--panel)':colors[vi],stroke:colors[vi],'stroke-width':1.5});});
  }
  const line=add(root,'line',{x1:L,x2:L,y1:T,y2:H-B,stroke:'var(--muted)','stroke-dasharray':'3 3',visibility:'hidden'});
  let index=0;const overlay=add(root,'rect',{x:L,y:T,width:pw,height:ph,fill:'transparent',tabindex:0,role:'slider','aria-label':'Comparison aligned day','aria-valuemin':1,'aria-valuemax':slots.length,'aria-valuenow':1});
  const show=(i,px,py)=>{index=Math.max(0,Math.min(slots.length-1,i));line.setAttribute('x1',x(index));line.setAttribute('x2',x(index));line.setAttribute('visibility','visible');const text=[slots[index].label];for(const p of periods){const point=p.points[index];text.push(`${p.id} · ${dateText(point.date)}`);for(const v of variables)text.push(`${v.label}: ${format(point.row?.[v.key])} ${v.unit}`);}const tip=$('#tooltip');tip.textContent=text.join('\n');tip.hidden=false;tip.style.maxWidth='340px';tip.style.left=Math.max(8,Math.min(px+12,innerWidth-tip.offsetWidth-10))+'px';tip.style.top=Math.max(8,Math.min(py+10,innerHeight-tip.offsetHeight-10))+'px';overlay.setAttribute('aria-valuenow',index+1);overlay.setAttribute('aria-valuetext',text.join(', '));};
  const hide=()=>{$('#tooltip').hidden=true;line.setAttribute('visibility','hidden');};
  overlay.addEventListener('pointermove',e=>{const r=root.getBoundingClientRect(),scaled=(e.clientX-r.left)/r.width*W;show(Math.round((scaled-L)/pw*(slots.length-1)),e.clientX,e.clientY);});overlay.addEventListener('pointerleave',hide);overlay.addEventListener('blur',hide);overlay.addEventListener('focus',()=>{const r=root.getBoundingClientRect();show(0,r.left+70,r.top+40);});overlay.addEventListener('keydown',e=>{if(['ArrowLeft','ArrowRight','Home','End'].includes(e.key)){e.preventDefault();const r=root.getBoundingClientRect();show(e.key==='Home'?0:e.key==='End'?slots.length-1:index+(e.key==='ArrowRight'?1:-1),r.left+r.width/2,r.top+40);}if(e.key==='Escape')hide();});
 }
 return {render,reset};
}
