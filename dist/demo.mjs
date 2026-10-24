// Explicitly illustrative. Never used as an automatic fallback for failed live data.
export function demoData(){
 let seed=20261024;const rand=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
 const today=new Date().toLocaleDateString('en-CA',{timeZone:'Asia/Kolkata'}), rows=[];
 for(let date='2024-01-01';date<=today;){
  const day=new Date(date+'T12:00:00Z'), season=Math.sin((day.getUTCMonth()-1)*Math.PI/6), humid=68+rand()*14;
  const low=22.5+season*2+rand()*3,high=low+5+rand()*6,wind=2+rand()*8;
  const rain=rand()<(day.getUTCMonth()>8?0.45:0.17)?Math.round(rand()**2*68*10)/10:0;
  rows.push({date,temp_min:+low.toFixed(1),temp_max:+high.toFixed(1),temp_avg:+((high+low)/2).toFixed(1),humidity_min:Math.round(humid-25),humidity_max:Math.round(humid+12),humidity_avg:Math.round(humid),rain_total:rain,rain_rate_max:rain?+(rain*.7).toFixed(1):0,wind_min:0,wind_avg:+wind.toFixed(1),wind_max:+(wind+rand()*12).toFixed(1),gust_min:0,gust_avg:+(wind+2).toFixed(1),gust_max:+(wind+8+rand()*17).toFixed(1),wind_dir:Math.round((35+rand()*150)%360),solar_max:Math.round(450+rand()*600),uv_max:+(5+rand()*7).toFixed(1),pressure_min:1004+rand()*3,pressure_max:1010+rand()*3,dew_min:20,dew_max:26,dew_avg:24});
  day.setUTCDate(day.getUTCDate()+1);date=day.toISOString().slice(0,10);
 }
 const now=new Date(),intraday=[];
 const localHour=+new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Kolkata',hour:'numeric',hourCycle:'h23'}).format(now);
 for(let h=0;h<=localHour;h++){
  const t=27+5*Math.sin((h-7)*Math.PI/12),sun=Math.max(0,Math.sin((h-6)*Math.PI/12));
  intraday.push({time:new Date(today+'T'+String(h).padStart(2,'0')+':00:00+05:30').toISOString(),date:today,temp:+t.toFixed(1),temp_min:t-.3,temp_max:t+.3,humidity:Math.round(87-(t-25)*3),wind:5+rand()*6,gust:10+rand()*9,wind_dir:60+rand()*60,solar:Math.round(920*sun),uv:+(10*sun).toFixed(1),rain_total:h>4?8.4:0,rain_rate:h===4?6:0,pressure_min:1007+Math.sin(h*Math.PI/6)*1.5,pressure_max:1008+Math.sin(h*Math.PI/6)*1.5});
 }
 const current={...intraday.at(-1),time:now.toISOString(),dew:24.2,pressure:(intraday.at(-1).pressure_min+intraday.at(-1).pressure_max)/2,rain_total:8.4};
 // Keep the partial demonstration day consistent with its intraday observations.
 const last=rows.at(-1);last.rain_total=current.rain_total;
 const extrema=(key,f)=>f(...intraday.map(p=>p[key])), avg=key=>intraday.reduce((s,p)=>s+p[key],0)/intraday.length;
 Object.assign(last,{temp_min:extrema('temp_min',Math.min),temp_max:extrema('temp_max',Math.max),temp_avg:avg('temp'),humidity_min:extrema('humidity',Math.min),humidity_max:extrema('humidity',Math.max),humidity_avg:avg('humidity'),wind_min:extrema('wind',Math.min),wind_max:extrema('wind',Math.max),wind_avg:avg('wind'),gust_min:extrema('gust',Math.min),gust_max:extrema('gust',Math.max),gust_avg:avg('gust'),solar_max:extrema('solar',Math.max),uv_max:extrema('uv',Math.max),rain_rate_max:extrema('rain_rate',Math.max),pressure_min:extrema('pressure_min',Math.min),pressure_max:extrema('pressure_max',Math.max)});
 return {manifest:{schema_version:1,mode:'demo',station:{id:'IPAPAN3',name:'Vaiyaicheri',local_name:'திருவையை',location:'Papanasam, Tamil Nadu, India',latitude:10.86,longitude:79.19,timezone:'Asia/Kolkata',installation_date:'2024-01-01'},current,intraday,first_date:rows[0].date,last_date:today,updated_at:now.toISOString(),history_days:rows.length,rain_day_threshold_mm:.2,status:{state:'demo'},backfill:{remaining_days:0}},rows};
}
