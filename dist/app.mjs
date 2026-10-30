import {setupAtmosphere} from './atmosphere.mjs?v=20261025-cloudy-birds-only-v14';
import {finite,mean,sum,extreme,circularMean,compass,dateAdd,rangeFor,fillDays,rainSum,roseBins} from './analytics.mjs';
import {demoData,demoIntradayForDay} from './demo.mjs?v=20261024-five-minute-weekly';
import {enrichDaily,enrichInterval} from './comparison.mjs';
import {setupComparison} from './compare-ui.mjs?v=20261031-all-plot-labels-v3';
import {setupPageViews} from './pages.mjs';
const $=s=>document.querySelector(s),text=(s,v)=>{$(s).textContent=v;};
const atmosphere=setupAtmosphere();
let manifest=null,rows=[],selected=[],chartRows=[],range={},demo=false,loadVersion=0,intervalCache=new Map(),intervalLoading=new Set(),comparisonUI=null,pageUI=null,refreshing=false,lastPageCheck=null;
const intervalRequests=new Map();
const NS='http://www.w3.org/2000/svg';
function svg(tag,attrs={},content){const n=document.createElementNS(NS,tag);for(const [k,v]of Object.entries(attrs))n.setAttribute(k,String(v));if(content!=null)n.textContent=content;return n;}
function append(parent,tag,attrs,content){const n=svg(tag,attrs,content);parent.append(n);return n;}
const fmt=(n,d=1)=>finite(n)?n.toLocaleString('en-IN',{maximumFractionDigits:d,minimumFractionDigits:d}):'—';
const dateLabel=(d,year=true)=>d?new Date(d+'T12:00:00Z').toLocaleDateString('en-GB',{day:'2-digit',month:'short',...(year?{year:'numeric'}:{}),timeZone:'UTC'}):'—';
const stationToday=()=>new Date().toLocaleDateString('en-CA',{timeZone:manifest?.station?.timezone||'Asia/Kolkata'});
function clear(el){el.replaceChildren();}
function el(tag,cls,value){const n=document.createElement(tag);if(cls)n.className=cls;if(value!=null)n.textContent=value;return n;}
function currentText(id,value,unit='',digits=1){const n=$(id);clear(n);n.append(document.createTextNode(fmt(value,digits)));if(unit)n.append(el('small','',unit));}
async function json(url){const r=await fetch(url+(url.includes('?')?'&':'?')+'_='+Date.now(),{cache:'no-store'});if(!r.ok)throw Error(`Could not load ${url} (HTTP ${r.status}).`);return r.json();}
function notify(message,link='Connection guide',href='#setup'){
 const n=$('#notice');clear(n);n.hidden=!message;if(!message)return;n.append(el('span','',message));const a=el('a','',href==='#setup'?'View station ↗':link);a.href=href==='#setup'?'https://www.wunderground.com/dashboard/pws/IPAPAN3':href;n.append(a);
}
async function load(useDemo=false){
 const version=++loadVersion;$('#error').hidden=true;
 try{
  let m,r;
  if(useDemo){({manifest:m,rows:r}=demoData());}
  else{m=await json('data/manifest.json');const chunks=await Promise.all((m.months||[]).map(month=>json(`data/history/${month}.json`)));r=chunks.flat().filter(d=>/^\d{4}-\d{2}-\d{2}$/.test(d.date));}
  if(version!==loadVersion)return;
  manifest=m;intervalCache.clear();intervalLoading.clear();intervalRequests.clear();lastPageCheck=new Date();rows=[...new Map(r.map(d=>[d.date,enrichDaily(d)])).values()].sort((a,b)=>a.date.localeCompare(b.date));demo=useDemo;
  const params=new URLSearchParams(location.search);if(demo)params.set('demo','1');else params.delete('demo');history.replaceState(null,'',location.pathname+(params.size?'?'+params:'')+location.hash);
  text('#station-name',m.station.name);text('#location',`${m.station.location} · ${m.station.latitude}°N, ${m.station.longitude}°E`);
  const today=stationToday();['#anchor','#start','#end'].forEach(id=>{$(id).max=today;});
  $('#anchor').value=today;$('#start').value=dateAdd(today,-6);$('#end').value=today;
  comparisonUI?.reset();renderCurrent();render();
  if(demo)notify('DEMO PREVIEW · All readings and the installation date below are illustrative, not live IPAPAN3 observations.','Connect real data');
  else if(m.status?.state==='error')notify('Collection issue · '+m.status.message+' Previously collected readings are retained.','Check setup');
  else if(m.mode==='unconfigured')notify('Station archive not connected yet. Add your API key to start collecting real IPAPAN3 observations.','Set up station');
  else if(!r.length)notify('No daily observations returned for the checked dates. The station may be offline or the requested archive may be unavailable.','Check setup');
  else if((m.backfill?.remaining_days||0)>0)notify(`History is filling in · ${m.backfill.remaining_days.toLocaleString()} dates still to check. The selected period may be incomplete.`,'View setup');
  else notify('');
 }catch(error){if(version!==loadVersion)return;$('#error').hidden=false;text('#error',error.message+' Refresh the page or check the published data files.');text('#connection','Data unavailable');}
}
function localStamp(value){return value?new Date(value).toLocaleString('en-GB',{timeZone:manifest?.station?.timezone||'Asia/Kolkata',day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit',second:'2-digit'})+' IST':'unavailable';}
function updateRefreshStatus(){
 text('#collection-status',demo?'Sample data · no live collection':'Collected '+localStamp(manifest.collection_finished_at||manifest.updated_at)+(manifest.refresh_target_minutes?' · '+manifest.refresh_target_minutes+'-min target':''));
 text('#refresh-status',demo?'Illustrative preview · live refresh disabled':'Page checked '+localStamp(lastPageCheck?.toISOString())+' · checks every 60s');
 $('#refresh-now').disabled=demo||refreshing;
}
async function loadIntervalDay(day){
 if(demo)return demoIntradayForDay(day,stationToday(),rows.find(r=>r.date===day));
 const current=(manifest.intraday||[]).filter(p=>p.date===day);if(current.length)return current;
 if(intervalCache.has(day))return intervalCache.get(day);
 if(!(manifest.intraday_dates||[]).includes(day))return [];
 if(intervalRequests.has(day))return intervalRequests.get(day);
 const request=json(`data/intraday/${day}.json`).then(points=>{intervalCache.set(day,points);return points;}).finally(()=>intervalRequests.delete(day));intervalRequests.set(day,request);return request;
}
async function refreshArchive(force=false){
 if(demo||!manifest||refreshing)return;
 refreshing=true;$('#refresh-now').disabled=true;text('#refresh-status','Checking published observations…');
 try{
  const m=await json('data/manifest.json');
  const changed=force||m.last_attempt_at!==manifest.last_attempt_at||m.current?.time!==manifest.current?.time||m.updated_at!==manifest.updated_at;
  if(changed){const data=(await Promise.all((m.months||[]).map(month=>json(`data/history/${month}.json`)))).flat();manifest=m;rows=data.map(enrichDaily).sort((a,b)=>a.date.localeCompare(b.date));intervalCache.clear();intervalRequests.clear();render();}
  lastPageCheck=new Date();renderCurrent();
  if(m.status?.state==='error')notify('Collection issue · '+m.status.message);else if(m.status?.state==='ok')notify(m.backfill?.remaining_days?`History is filling in · ${m.backfill.remaining_days} dates still to check.`:'');
 }catch{notify('Could not refresh the archive. Displaying the last loaded observations.');text('#refresh-status','Refresh failed · last loaded observations retained');}
 finally{refreshing=false;$('#refresh-now').disabled=false;}
}
function renderCurrent(){
 atmosphere.update(manifest.current,manifest.station,demo);
 const m=manifest,c=m.current,age=c?.time?(Date.now()-new Date(c.time))/60000:Infinity;
 const fresh=age>=-5&&age<=15;
 text('#connection',demo?'Illustrative data':m.status?.state==='error'?'Collection issue':c?(fresh?'Station reporting':'Observation stale'):m.status?.state==='unconfigured'?'API key not configured':m.status?.state==='no_data'?'No station data returned':'Awaiting observations');
 $('#connection').style.color=demo?'var(--gold)':fresh?'var(--cyan)':'var(--orange)';
 text('#updated',c?.time?new Date(c.time).toLocaleString('en-GB',{timeZone:m.station.timezone,day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'})+' IST · '+(demo?'sample':Math.max(0,Math.floor(age))+' min ago'):'All dates and times in IST');
 text('#current-label',demo?'ILLUSTRATIVE CURRENT CONDITIONS':fresh?'LATEST OBSERVATION':'LAST AVAILABLE OBSERVATION');
 text('#current-temp',fmt(c?.temp));
 text('#condition-text',c?(!fresh&&!demo?'Station observation is older than 15 minutes':finite(c.temp)&&finite(c.humidity)?`${c.temp>=30?'Warm':c.temp>=24?'Mild':'Cool'}${c.humidity>=75?' & humid':' local conditions'}`:'Latest available station readings'):'Connect your station to see current conditions');
 text('#current-dew',fmt(c?.dew)+' °C');text('#current-pressure',fmt(c?.pressure)+' hPa');
 currentText('#current-humidity',c?.humidity,'%',0);currentText('#current-rain',c?.rain_total,'mm');
 text('#current-rate','Rate '+fmt(c?.rain_rate)+' mm/h');
 currentText('#current-solar',c?.solar,'W/m²',0);currentText('#current-uv',c?.uv,'');
 currentText('#current-wind',c?.wind,'km/h');text('#current-gust','Gust '+fmt(c?.gust)+' km/h');
 updateRefreshStatus();
 text('#current-direction',compass(c?.wind_dir));$('#needle').style.transform=`rotate(${finite(c?.wind_dir)?c.wind_dir:0}deg)`;$('#needle').style.opacity=finite(c?.wind_dir)?1:.15;
}
function render(){
 if(!manifest)return;
 const period=$('#period').value,anchor=$('#anchor').value||stationToday();
 $('#anchor-group').hidden=period==='custom';$('#custom-group').hidden=period!=='custom';
 range=rangeFor(period,anchor,manifest.station.installation_date,manifest.first_date,$('#start').value,$('#end').value);
 $('#next').disabled=anchor>=stationToday()||period==='installation';$('#previous').disabled=period==='installation';
 $('#error').hidden=true;
 if(range.start>range.end){$('#error').hidden=false;text('#error','Choose a start date on or before the end date.');return;}
 const count=Math.round((new Date(range.end+'T12:00:00Z')-new Date(range.start+'T12:00:00Z'))/86400000)+1;
 if(count>36525){$('#error').hidden=false;text('#error','Please choose a range shorter than 100 years.');return;}
 selected=rows.filter(r=>r.date>=range.start&&r.date<=range.end);
 const missing=count-selected.length;
 text('#range-label',dateLabel(range.start)+' — '+dateLabel(range.end));
 text('#range-detail',period==='installation'&&!manifest.station.installation_date?'Installation date not set · available archive shown':`${count.toLocaleString()} calendar ${count===1?'day':'days'}${range.end===stationToday()?' · today is partial':''}`);
 text('#coverage',`${selected.length.toLocaleString()} / ${count.toLocaleString()} days recorded${missing?' · gaps excluded':''}`);
 $('#download').disabled=!selected.length;
 summary();records();rose();archive(count);
 const oneDay=range.start===range.end;
 let intervals=(manifest.intraday||[]).filter(p=>p.date===range.start);
 if(oneDay&&!intervals.length&&intervalCache.has(range.start))intervals=intervalCache.get(range.start);
 if(oneDay&&!demo&&!intervals.length&&(manifest.intraday_dates||[]).includes(range.start)&&!intervalLoading.has(range.start)&&!intervalCache.has(range.start)){
  const day=range.start;intervalLoading.add(day);json(`data/intraday/${day}.json`).then(points=>{intervalCache.set(day,points);if(range.start===day&&range.end===day)render();}).catch(()=>{intervalCache.set(day,[]);}).finally(()=>intervalLoading.delete(day));
 }
 chartRows=oneDay?intervals.map(enrichInterval):fillDays(selected,range.start,range.end);
 text('#chart-note',oneDay?'Reporting intervals · hover, tap or use arrow keys':'Daily observations · hover, tap or use arrow keys');
 document.querySelector('[data-chart=temperature]').closest('article').querySelector('.chart-sub>span').textContent=oneDay?'Reporting interval high, mean & low':'Daily high, average & low';
 document.querySelector('[data-chart=solar]').closest('article').querySelector('.chart-sub>span').textContent=oneDay?'Peak of each reporting interval':'Daily peak irradiance';
 document.querySelector('[data-chart=uv]').closest('article').querySelector('.chart-sub>span').textContent=oneDay?'Peak of each reporting interval':'Daily peak UV';
 document.querySelector('[data-chart=humidity]').closest('article').querySelector('.chart-sub>span').textContent=oneDay?'Reporting interval average':'Daily range & average';
 document.querySelector('[data-chart=wind]').closest('article').querySelector('.chart-sub>span').textContent=oneDay?'Interval mean speed & peak gust':'Daily mean speed & peak gust';
 text('#rain-caption',$('#rain-mode').value==='rate'?(oneDay?'Reporting interval rain rate · mm/h':'Daily peak reported rate · mm/h'):oneDay?'Day-to-time accumulation · mm':$('#rain-mode').value==='daily'?'Daily rainfall · mm':'Cumulative recorded rainfall · mm');
 $('#rain-mode').disabled=false;
 text('#rain-total',fmt(rainSum(selected))+' mm total');
 text('#pressure-caption',oneDay?'Reporting interval high & low · dashed range midpoint':'Reported daily high & low · dashed range midpoint');
 for(const type of ['temperature','rain','humidity','wind','solar','uv','pressure'])drawChart(type,chartRows,oneDay);
 comparisonUI?.render();
}
function summary(){
 clear($('#summary'));
 const rain=rainSum(selected),avgTemp=mean(selected.map(r=>r.temp_avg)),avgHum=mean(selected.map(r=>r.humidity_avg)),wind=mean(selected.map(r=>r.wind_avg)),gust=extreme(selected,'gust_max','max'),solar=extreme(selected,'solar_max','max'),uv=extreme(selected,'uv_max','max');
 const specs=[
 ['Rainfall',rain,'mm','blue','☂',selected.some(r=>finite(r.rain_total))?`${selected.filter(r=>finite(r.rain_total)&&r.rain_total>=(manifest.rain_day_threshold_mm??.2)).length} rain days`:'No rain records',`≥ ${manifest.rain_day_threshold_mm??.2} mm`,'rain-chart'],
 ['Temperature',avgTemp,'°C','orange','↗','High '+fmt(extreme(selected,'temp_max','max')?.value)+'°','Low '+fmt(extreme(selected,'temp_min','min')?.value)+'°','temperature-chart'],
 ['Humidity',avgHum,'%','purple','◉','High '+fmt(extreme(selected,'humidity_max','max')?.value,0)+'%','Low '+fmt(extreme(selected,'humidity_min','min')?.value,0)+'%','humidity-chart'],
 ['Mean wind',wind,'km/h','cyan','≋','Peak gust',fmt(gust?.value)+' km/h','wind-chart'],
 ['Peak solar',solar?.value,'W/m²','gold','☀','Record date',dateLabel(solar?.date,false),'solar-chart'],
 ['Peak UV',uv?.value,'index','pink','◌','Record date',dateLabel(uv?.date,false),'uv-chart'],
 ['Pressure midpoint',mean(selected.map(r=>r.pressure_mid)),'hPa','pressure-color','◎','High '+fmt(extreme(selected,'pressure_max','max')?.value),'Low '+fmt(extreme(selected,'pressure_min','min')?.value),'pressure-chart']];
 for(const [label,value,unit,color,icon,foot1,foot2,target]of specs){
  const card=el('button','summary-card');card.type='button';card.title=label==='Pressure midpoint'?'Mean of available daily pressure range midpoints (high + low) ÷ 2. View pressure chart.':'View '+label+' chart';
  const head=el('div','summary-label');head.append(el('span','',label),el('span',color,icon));
  const v=el('div','value '+color,fmt(value,label==='Peak solar'?0:1));v.append(el('small','',unit));
  const foot=el('div','summary-foot');foot.append(el('span','',foot1),el('span','',foot2));card.append(head,v,foot);card.onclick=()=>pageUI.navigate(target);$('#summary').append(card);
 }
}
function records(){
 clear($('#records-body'));
 const specs=[['Temperature','temp_max','temp_min','temp_avg','°C',1],['Humidity','humidity_max','humidity_min','humidity_avg','%',0],['Daily precipitation','rain_total','rain_total',null,'mm',1],['Peak rain rate','rain_rate_max','rain_rate_max',null,'mm/h',1],['Wind speed','wind_max','wind_min','wind_avg','km/h',1],['Wind gust','gust_max','gust_min','gust_avg','km/h',1],['Solar radiation','solar_max','solar_max',null,'W/m²',0],['UV index','uv_max','uv_max',null,'index',1],['Dew point','dew_max','dew_min','dew_avg','°C',1],['Pressure','pressure_max','pressure_min','pressure_mid','hPa',1]];
 for(const [label,hi,lo,avg,unit,digits]of specs){
  const high=extreme(selected,hi,'max'),low=extreme(selected,lo,'min'),tr=el('tr');
  const name=el('td','',label);if(['Solar radiation','UV index','Peak rain rate'].includes(label))name.append(el('small','','Highest / lowest daily peak'));
  if(label==='Pressure')name.append(el('small','','Mean column shows daily range midpoints'));
  tr.append(name,el('td','',high?`${fmt(high.value,digits)} ${unit}`:'—'));
  for(const [value,type]of [[high,'date'],[low,'value'],[low,'date']]){
   const td=el('td','',type==='date'?dateLabel(value?.date):value?`${fmt(value.value,digits)} ${unit}`:'—');if(type==='date'&&value?.ties>1)td.append(el('small','',`+ ${value.ties-1} tied ${value.ties===2?'day':'days'}`));tr.append(td);
  }
  const final=label==='Daily precipitation'?rainSum(selected):avg?mean(selected.map(r=>r[avg])):null;
  tr.append(el('td','',finite(final)?`${fmt(final,digits)} ${unit}${label==='Daily precipitation'?' total':''}`:'—'));$('#records-body').append(tr);
 }
}
function archive(count){
 text('#archive-count',rows.length.toLocaleString());text('#first-date',dateLabel(manifest.first_date));text('#last-date',dateLabel(manifest.last_date));
 $('#coverage-fill').style.width=(selected.length/count*100)+'%';
 text('#coverage-description',selected.length?`${fmt(selected.length/count*100,0)}% of selected dates have an observation. ${manifest.backfill?.remaining_days?manifest.backfill.remaining_days+' historical dates are still pending.':'Sensor availability may vary by day.'}`:'No observations in this range. Choose another period or connect your station.');
}
function rose(){
 const {bins,calm,unknown,total}=roseBins(selected),dirs=selected.filter(r=>finite(r.wind_avg)&&r.wind_avg>0).map(r=>r.wind_dir),dir=circularMean(dirs);
 text('#prevailing',compass(dir));text('#rose-note',`${finite(dir)?fmt(dir,0)+'° · ':''}${total} directional days · ${calm} calm · ${unknown} unavailable`);
 const container=$('#windrose');clear(container);const root=svg('svg',{viewBox:'0 0 250 250',role:'img','aria-label':`Wind rose: ${total} daily mean directions; mean ${compass(dir)}.`});container.append(root);
 for(const r of [24,48,72,96])append(root,'circle',{cx:125,cy:125,r,fill:'none',stroke:'var(--line)','stroke-dasharray':'2 4'});
 const peak=Math.max(...bins,1);
 bins.forEach((n,i)=>{const angle=i*22.5-90,half=8,r=10+Math.sqrt(n/peak)*82,point=(a,rad)=>[125+Math.cos(a*Math.PI/180)*rad,125+Math.sin(a*Math.PI/180)*rad];const p1=point(angle-half,9),p2=point(angle-half,r),p3=point(angle+half,r),p4=point(angle+half,9);const p=append(root,'path',{d:`M${p1} L${p2} A${r},${r} 0 0 1 ${p3} L${p4}Z`,fill:'var(--cyan)',opacity:n?.7:.05});append(p,'title',{},`${compass(i*22.5)}: ${n} days (${total?fmt(n/total*100,0):0}%)`);});
 ['N','NE','E','SE','S','SW','W','NW'].forEach((name,i)=>{const angle=(i*45-90)*Math.PI/180;append(root,'text',{x:125+Math.cos(angle)*113,y:129+Math.sin(angle)*113,'text-anchor':'middle'},name);});
 if(!total)append(root,'text',{x:125,y:129,'text-anchor':'middle'},'No direction data');
}
function linePath(data,key,x,y){let d='',up=false;data.forEach((r,i)=>{if(!finite(r[key])){up=false;return;}d+=(up?'L':'M')+x(i)+','+y(r[key]);up=true;});return d;}
function areaPath(data,low,high,x,y){let out='',segment=[];const flush=()=>{if(segment.length){out+='M'+segment.map(i=>`${x(i)},${y(data[i][high])}`).join('L')+'L'+segment.reverse().map(i=>`${x(i)},${y(data[i][low])}`).join('L')+'Z';segment=[];}};data.forEach((r,i)=>{if(finite(r[low])&&finite(r[high]))segment.push(i);else flush();});flush();return out;}
function drawChart(type,data,oneDay){
 const container=document.querySelector(`[data-chart=${type}]`);clear(container);
 const map=oneDay?{temperature:['temp_max','temp_min','temp'],humidity:['humidity'],wind:['wind','gust'],solar:['solar'],uv:['uv'],rain:['rain_total'],pressure:['pressure_max','pressure_min','pressure_mid']}:{temperature:['temp_max','temp_min','temp_avg'],humidity:['humidity_avg','humidity_min','humidity_max'],wind:['wind_avg','gust_max'],solar:['solar_max'],uv:['uv_max'],rain:['rain_total'],pressure:['pressure_max','pressure_min','pressure_mid']};
 let series=data.map(r=>({...r})),keys=type==='rain'&&$('#rain-mode').value==='rate'?[oneDay?'rain_rate':'rain_rate_max']:map[type],cumulative=type==='rain'&&!oneDay&&$('#rain-mode').value==='cumulative';
 if(cumulative){let total=0;series=series.map(r=>{if(!finite(r.rain_total))return {...r,rain_total:null};total+=r.rain_total;return {...r,rain_total:total};});}
 const values=series.flatMap(r=>keys.map(k=>r[k])).filter(finite);
 if(!values.length){const n=el('div','empty',oneDay?'No interval readings for this date':'No sensor readings in this period');n.append(el('small','',oneDay?'Daily records below may still be available.':'Missing values are kept blank.'));container.append(n);return;}
 const W=Math.max(320,Math.round(container.clientWidth)),allDailyDates=!oneDay&&data.length>1&&data.length<=7;
 const stackedDates=allDailyDates&&W<500;
 const H=280,L=66,R=18,T=20,B=stackedDates?58:38,pw=W-L-R,ph=H-T-B;
 let min=Math.min(...values),max=Math.max(...values);
 if(type==='humidity'){min=0;max=100;}else if(['rain','solar','uv','wind'].includes(type)){min=0;max=Math.max(max*1.15,1);}else{min=Math.floor(min-2);max=Math.ceil(max+2);}
 if(max===min)max=min+1;
 const x=i=>L+(data.length>1?i/(data.length-1)*pw:pw/2),y=v=>T+ph-(v-min)/(max-min)*ph;
 const root=svg('svg',{viewBox:`0 0 ${W} ${H}`,role:'img','aria-label':`${type} chart, ${dateLabel(range.start)} to ${dateLabel(range.end)}. Use arrow keys on chart to explore.`});container.append(root);
 for(let i=0;i<=4;i++){const v=min+(max-min)*i/4,yy=y(v);append(root,'line',{x1:L,y1:yy,x2:W-R,y2:yy,stroke:'var(--grid)','stroke-dasharray':'3 5','stroke-width':.7});append(root,'text',{x:L-9,y:yy+3,'text-anchor':'end'},fmt(v,max>50?0:1));}
 const tickFractions=W<420?[0,.5,1]:[0,.25,.5,.75,1];
 const ticks=allDailyDates?data.map((_,i)=>i):[...new Set(tickFractions.map(f=>Math.round((data.length-1)*f)))];
 for(const i of ticks){
  if(!data[i])continue;
  const day=oneDay?null:new Date(data[i].date+'T12:00:00Z');
  const label=oneDay?new Date(data[i].time).toLocaleTimeString('en-GB',{timeZone:manifest.station.timezone,hour:'2-digit',minute:'2-digit'}):day.toLocaleDateString('en-GB',{timeZone:'UTC',day:'numeric',month:'short'});
  // Keep the first date clear of the vertical axis and its value labels.
  const labelX=x(i)+(i===0?8:stackedDates&&i===1?3:0);
  const node=append(root,'text',{x:labelX,y:H-(stackedDates?28:10),'text-anchor':allDailyDates?'middle':i===0?'start':i===data.length-1?'end':'middle',class:'chart-date-tick',...(!oneDay?{'data-date':data[i].date}:{})},stackedDates?null:label);
  if(stackedDates){
   append(node,'tspan',{x:labelX},day.toLocaleDateString('en-GB',{timeZone:'UTC',day:'numeric'}));
   append(node,'tspan',{x:labelX,dy:16},day.toLocaleDateString('en-GB',{timeZone:'UTC',month:'short'}));
  }
 }
 const color={temperature:'var(--orange)',rain:'var(--blue)',humidity:'var(--purple)',wind:'var(--cyan)',solar:'var(--gold)',uv:'var(--pink)',pressure:'var(--pressure)'}[type];
 const defs=append(root,'defs');const grad=append(defs,'linearGradient',{id:`gradient-${type}`,x1:'0',y1:'0',x2:'0',y2:'1'});append(grad,'stop',{offset:0,'stop-color':color,'stop-opacity':.22});append(grad,'stop',{offset:1,'stop-color':color,'stop-opacity':0});
 if(['temperature','pressure'].includes(type)||(type==='humidity'&&!oneDay)){const low=type==='temperature'?'temp_min':type==='pressure'?'pressure_min':'humidity_min',high=type==='temperature'?'temp_max':type==='pressure'?'pressure_max':'humidity_max';append(root,'path',{d:areaPath(series,low,high,x,y),fill:color,opacity:.1});}
 if(['solar','uv','humidity','wind'].includes(type)||(type==='rain'&&(cumulative||oneDay))){const base=series.map(r=>({...r,baseline:min}));append(root,'path',{d:areaPath(base,'baseline',keys[0],x,y),fill:`url(#gradient-${type})`});}
 if(type==='rain'&&!cumulative&&!oneDay){const bar=Math.min(32,pw/Math.max(data.length,1)*.56);series.forEach((r,i)=>{if(!finite(r[keys[0]]))return;const height=Math.max(r[keys[0]]>0?1:0,y(0)-y(r[keys[0]]));if(height)append(root,'rect',{x:x(i)-bar/2,y:y(r[keys[0]]),width:bar,height,rx:Math.min(3,bar/2),fill:color,opacity:.8});});}
 else keys.forEach((key,i)=>{const col=['temperature','pressure'].includes(type)?(i===1?(type==='pressure'?'var(--blue)':'var(--pink)'):color):type==='wind'&&i===1?'var(--muted)':color;append(root,'path',{d:linePath(series,key,x,y),fill:'none',stroke:col,'stroke-width':i===2?2:2.6,'stroke-linecap':'round','stroke-linejoin':'round',...(type==='wind'&&i===1||['temperature','pressure'].includes(type)&&i===2?{'stroke-dasharray':'4 4'}:{})});if(data.length<50)series.forEach((r,j)=>{if(finite(r[key]))append(root,'circle',{cx:x(j),cy:y(r[key]),r:data.length===1?3.6:2.6,fill:col});});});
 const hoverLine=append(root,'line',{x1:L,y1:T,x2:L,y2:H-B,stroke:'var(--muted)','stroke-dasharray':'3 3',visibility:'hidden'});
 const units={temperature:'°C',rain:$('#rain-mode').value==='rate'?'mm/h':'mm',humidity:'%',wind:'km/h',solar:'W/m²',uv:'index',pressure:'hPa'};
 const labels={pressure_max:'High',pressure_min:'Low',pressure_mid:'Range midpoint',temp_max:'High',temp_min:'Low',temp_avg:'Mean',temp:'Mean',humidity_avg:'Mean',humidity_min:'Low',humidity_max:'High',humidity:'Mean',wind_avg:'Speed',wind:'Speed',gust_max:'Gust',gust:'Gust',solar_max:'Peak',solar:'Interval peak',uv_max:'Peak',uv:'Interval peak',rain_rate:'Reported rate',rain_rate_max:'Daily peak rate',rain_total:cumulative?'Accumulated':oneDay?'Accumulation':'Rainfall'};
 let focusIndex=0;
 const display=(index,px,py)=>{focusIndex=Math.max(0,Math.min(data.length-1,index));const r=series[focusIndex];if(!r)return;hoverLine.setAttribute('x1',x(focusIndex));hoverLine.setAttribute('x2',x(focusIndex));hoverLine.setAttribute('visibility','visible');const stamp=oneDay?new Date(r.time).toLocaleString('en-GB',{timeZone:manifest.station.timezone,day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'})+' IST':dateLabel(r.date);let message=stamp+'\n'+keys.map(k=>`${labels[k]}  ${fmt(r[k],type==='solar'?0:1)} ${units[type]}`).join('\n');if(type==='wind'&&finite(r.wind_dir))message+='\nFrom '+compass(r.wind_dir)+' · '+fmt(r.wind_dir,0)+'°';const tip=$('#tooltip');tip.textContent=message;tip.hidden=false;tip.style.left=Math.min(px+13,innerWidth-tip.offsetWidth-12)+'px';tip.style.top=Math.max(8,Math.min(py-15,innerHeight-tip.offsetHeight-12))+'px';overlay.setAttribute('aria-valuenow',focusIndex+1);overlay.setAttribute('aria-valuetext',message.replaceAll('\n',', '));};
 const hide=()=>{$('#tooltip').hidden=true;hoverLine.setAttribute('visibility','hidden');};
 const overlay=append(root,'rect',{x:L-10,y:0,width:pw+20,height:H,fill:'transparent',tabindex:0,role:'slider','aria-label':`${type} observations`,'aria-valuemin':1,'aria-valuemax':data.length,'aria-valuenow':1});
 overlay.addEventListener('pointermove',e=>{const rect=root.getBoundingClientRect(),scaled=(e.clientX-rect.left)/rect.width*W;display(Math.round((scaled-L)/pw*(data.length-1)),e.clientX,e.clientY);});overlay.addEventListener('pointerleave',hide);overlay.addEventListener('blur',hide);overlay.addEventListener('focus',()=>{const r=root.getBoundingClientRect();display(0,r.left+50,r.top+70);});overlay.addEventListener('keydown',e=>{if(['ArrowLeft','ArrowRight','Home','End'].includes(e.key)){e.preventDefault();const i=e.key==='Home'?0:e.key==='End'?data.length-1:focusIndex+(e.key==='ArrowRight'?1:-1);const r=root.getBoundingClientRect();display(i,r.left+r.width/2,r.top+70);}else if(e.key==='Escape')hide();});
}
$('#period').addEventListener('change',render);for(const id of ['#anchor','#start','#end','#rain-mode'])$(id).addEventListener('change',render);
function movePeriod(step){let d=$('#anchor').value||stationToday(),period=$('#period').value;if(period==='today')d=dateAdd(d,step);else if(period==='week')d=dateAdd(d,7*step);else if(period==='month'){const p=new Date(d+'T12:00:00Z');p.setUTCMonth(p.getUTCMonth()+step+1,0);d=p.toISOString().slice(0,10);}else if(period==='year')d=(+d.slice(0,4)+step)+'-12-31';$('#anchor').value=d>stationToday()?stationToday():d;render();}
$('#previous').onclick=()=>movePeriod(-1);$('#next').onclick=()=>movePeriod(1);
$('#demo-button')?.addEventListener('click',()=>load(true));$('#live-button')?.addEventListener('click',()=>load(false));
$('#download').onclick=()=>{const fields=['date','temp_min','temp_max','temp_avg','humidity_min','humidity_max','humidity_avg','rain_total','rain_rate_max','wind_min','wind_max','wind_avg','gust_min','gust_max','gust_avg','wind_dir','solar_max','uv_max','dew_min','dew_max','dew_avg','pressure_min','pressure_max','pressure_mid'];const headers=['date_IST','temperature_min_C','temperature_max_C','temperature_mean_C','humidity_min_percent','humidity_max_percent','humidity_mean_percent','rain_total_mm','rain_rate_peak_mmh','wind_min_kmh','wind_max_kmh','wind_mean_kmh','gust_min_kmh','gust_max_kmh','gust_mean_kmh','wind_from_degrees','solar_peak_W_m2','UV_peak','dew_min_C','dew_max_C','dew_mean_C','pressure_min_hPa','pressure_max_hPa','pressure_range_midpoint_hPa'];const content=[headers.join(','),...selected.map(r=>fields.map(k=>r[k]??'').join(','))].join('\r\n');const url=URL.createObjectURL(new Blob(['\uFEFF'+content],{type:'text/csv;charset=utf-8;'}));const a=document.createElement('a');a.href=url;a.download=`${demo?'DEMO_':''}IPAPAN3_${range.start}_${range.end}.csv`;a.click();setTimeout(()=>URL.revokeObjectURL(url),2000);};
try{if(localStorage.getItem('ipapan3-theme')==='light')document.body.classList.add('light');}catch{}
$('#theme').onclick=()=>{document.body.classList.toggle('light');try{localStorage.setItem('ipapan3-theme',document.body.classList.contains('light')?'light':'dark');}catch{}};
comparisonUI=setupComparison({getRows:()=>rows,getToday:stationToday,getDemo:()=>demo,getTimeZone:()=>manifest?.station?.timezone||'Asia/Kolkata',getIntraday:loadIntervalDay});
pageUI=setupPageViews({onChange:()=>{if(manifest)render();},getStationTitle:()=>`${manifest?.station?.name||'Vaiyaicheri'} Weather — IPAPAN3`});
await load(new URLSearchParams(location.search).get('demo')==='1');
pageUI.refresh();
let chartResizeTimer;
addEventListener('resize',()=>{clearTimeout(chartResizeTimer);chartResizeTimer=setTimeout(()=>{if(manifest)render();},160);});
// Poll only our published files. API credentials remain in GitHub Actions.
setInterval(()=>{if(!document.hidden)refreshArchive();},60000);
document.addEventListener('visibilitychange',()=>{if(!document.hidden)refreshArchive();});
addEventListener('focus',()=>refreshArchive());
$('#refresh-now').onclick=()=>refreshArchive(true);
