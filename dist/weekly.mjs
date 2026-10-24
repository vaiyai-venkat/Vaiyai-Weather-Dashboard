import {finite,mean,circularMean,dateAdd} from './analytics.mjs';
import {enrichInterval} from './comparison.mjs';
const FIELDS={temp_avg:'temp',temp_max:'temp_max',temp_min:'temp_min',dew_avg:'dew',rain_total:'rain_total',rain_rate_max:'rain_rate',humidity_avg:'humidity',humidity_max:'humidity_max',humidity_min:'humidity_min',wind_avg:'wind',wind_max:'wind_max',gust_max:'gust',wind_dir:'wind_dir',solar_max:'solar',uv_max:'uv',pressure_mid:'pressure_mid',pressure_max:'pressure_max',pressure_min:'pressure_min'};
export const DAY_COLORS=['var(--cyan)','var(--blue)','var(--orange)','var(--purple)','var(--pink)','var(--gold)','var(--day-green)'];
const formatters=new Map();
export function stationClock(stamp,timeZone='Asia/Kolkata'){
 const value=new Date(stamp);if(!stamp||Number.isNaN(value.getTime()))return null;
 if(!formatters.has(timeZone))formatters.set(timeZone,new Intl.DateTimeFormat('en-GB',{timeZone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'}));
 const p=Object.fromEntries(formatters.get(timeZone).formatToParts(value).filter(x=>x.type!=='literal').map(x=>[x.type,x.value]));
 return {date:`${p.year}-${p.month}-${p.day}`,time:`${p.hour}:${p.minute}:${p.second}`,minute:+p.hour*60+(+p.minute)+(+p.second)/60};
}
export function weeklyDates(anchor){return Array.from({length:7},(_,i)=>dateAdd(anchor,i-6));}
export function weeklyVariable(variable){return {...variable,field:FIELDS[variable.key],label:variable.label.replace('daily range midpoint','interval range midpoint').replace('daily total','day-to-time accumulation').replace('daily mean','interval mean').replace('daily high','interval high').replace('daily low','interval low').replace('daily peak','interval peak')};}
export function prepareWeeklyDay(date,raw,timeZone){
 const byTime=new Map();for(const row of (Array.isArray(raw)?raw:[])){const clock=stationClock(row.time,timeZone);if(clock?.date===date)byTime.set(row.time,{...enrichInterval(row),...clock,utc:row.time});}
 return {date,points:[...byTime.values()].sort((a,b)=>a.minute-b.minute)};
}
export function valueFor(point,variable){const value=point?.[FIELDS[variable.key]];return finite(value)?value:null;}
export function weeklySummary(day,variable){
 const values=day.points.map(p=>valueFor(p,variable)).filter(finite),count=values.length;
 if(!count)return {count:0,value:null,kind:'No readings'};
 if(variable.key==='rain_total')return {count,value:values.at(-1),kind:'Latest accumulation'};
 if(variable.circular)return {count,value:circularMean(values),kind:'Circular mean'};
 if(/_max$/.test(variable.key))return {count,value:Math.max(...values),kind:'Peak'};
 if(/_min$/.test(variable.key))return {count,value:Math.min(...values),kind:'Low'};
 return {count,value:mean(values),kind:variable.key==='pressure_mid'?'Mean midpoint':'Interval mean'};
}
export function weeklyPath(points,variable,x,y,maxGap=30){
 let d='',active=false,last=null;
 for(const point of points){const value=valueFor(point,variable);if(!finite(value)){active=false;last=null;continue;}if(last&&(point.minute-last.minute>maxGap||variable.circular&&Math.abs(last.value-value)>180))active=false;d+=(active?'L':'M')+x(point.minute)+','+y(value);active=true;last={minute:point.minute,value};}
 return d;
}
export function nearestWeeklyPoint(day,minute,tolerance=15){let nearest=null,distance=Infinity;for(const point of day.points){const d=Math.abs(point.minute-minute);if(d<distance){distance=d;nearest=point;}}return distance<=tolerance?nearest:null;}
export function weeklyCSV(days,variables){
 const quote=v=>'"'+String(v??'').replaceAll('"','""')+'"';
 const header=['station_date','station_time','observation_UTC',...variables.map(v=>v.label+' ('+v.unit+')')];
 return [header.map(quote).join(','),...days.flatMap(day=>day.points.map(point=>[day.date,point.time,point.utc,...variables.map(v=>valueFor(point,v)??'')].map(quote).join(',')))].join('\r\n');
}
