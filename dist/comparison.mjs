import {finite,mean,sum,circularMean,dateAdd} from './analytics.mjs';
export function pressureMidpoint(row){return finite(row.pressure_min)&&finite(row.pressure_max)?(row.pressure_min+row.pressure_max)/2:null;}
export function enrichDaily(row){return {...row,pressure_mid:pressureMidpoint(row)};}
export function enrichInterval(row){const high=finite(row.pressure_max)?row.pressure_max:finite(row.pressure)?row.pressure:null;return {...row,pressure_max:high,pressure_mid:pressureMidpoint({...row,pressure_max:high})};}
export const VARIABLES=[
 {key:'temp_avg',label:'Temperature · daily mean',unit:'°C',group:'Temperature'},
 {key:'temp_max',label:'Temperature · daily high',unit:'°C',group:'Temperature'},
 {key:'temp_min',label:'Temperature · daily low',unit:'°C',group:'Temperature'},
 {key:'dew_avg',label:'Dew point · daily mean',unit:'°C',group:'Temperature'},
 {key:'rain_total',label:'Rainfall · daily total',unit:'mm',group:'Precipitation',zero:true,total:true},
 {key:'rain_rate_max',label:'Rain rate · daily peak',unit:'mm/h',group:'Precipitation',zero:true},
 {key:'humidity_avg',label:'Humidity · daily mean',unit:'%',group:'Humidity',bounds:[0,100]},
 {key:'humidity_max',label:'Humidity · daily high',unit:'%',group:'Humidity',bounds:[0,100]},
 {key:'humidity_min',label:'Humidity · daily low',unit:'%',group:'Humidity',bounds:[0,100]},
 {key:'wind_avg',label:'Wind speed · daily mean',unit:'km/h',group:'Wind',zero:true},
 {key:'wind_max',label:'Wind speed · daily high',unit:'km/h',group:'Wind',zero:true},
 {key:'gust_max',label:'Wind gust · daily peak',unit:'km/h',group:'Wind',zero:true},
 {key:'wind_dir',label:'Wind direction · daily mean',unit:'° from north',group:'Wind',bounds:[0,360],circular:true},
 {key:'solar_max',label:'Solar radiation · daily peak',unit:'W/m²',group:'Sunshine',zero:true},
 {key:'uv_max',label:'UV · daily peak',unit:'index',group:'Sunshine',zero:true},
 {key:'pressure_mid',label:'Pressure · daily range midpoint',unit:'hPa',group:'Pressure'},
 {key:'pressure_max',label:'Pressure · daily high',unit:'hPa',group:'Pressure'},
 {key:'pressure_min',label:'Pressure · daily low',unit:'hPa',group:'Pressure'}
];
export function periodWindow(frequency,anchor){
 if(!/^\d{4}-\d{2}-\d{2}$/.test(anchor)||Number.isNaN(Date.parse(anchor+'T12:00:00Z')))throw new Error('Choose a valid comparison date.');
 if(frequency==='week')return {start:dateAdd(anchor,-6),end:anchor};
 if(frequency==='month'){const year=+anchor.slice(0,4),month=+anchor.slice(5,7),last=new Date(Date.UTC(year,month,0,12)).toISOString().slice(0,10);return {start:anchor.slice(0,7)+'-01',end:last};}
 if(frequency==='year')return {start:anchor.slice(0,4)+'-01-01',end:anchor.slice(0,4)+'-12-31'};
 throw new Error('Unknown comparison frequency.');
}
export function previousAnchor(frequency,anchor){
 if(frequency==='week')return dateAdd(anchor,-7);
 if(frequency==='month'){const d=new Date(anchor+'T12:00:00Z');d.setUTCMonth(d.getUTCMonth(),0);return d.toISOString().slice(0,10);}
 const year=+anchor.slice(0,4)-1,month=+anchor.slice(5,7),day=Math.min(+anchor.slice(8),new Date(Date.UTC(year,month,0,12)).getUTCDate());
 return `${year}-${String(month).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
}
export function comparisonSlots(frequency){
 if(frequency==='week')return Array.from({length:7},(_,i)=>({key:i,label:'Day '+(i+1)}));
 if(frequency==='month')return Array.from({length:31},(_,i)=>({key:String(i+1).padStart(2,'0'),label:String(i+1)}));
 if(frequency==='year'){const result=[];for(let date='2000-01-01';date<='2000-12-31';date=dateAdd(date,1))result.push({key:date.slice(5),label:new Date(date+'T12:00:00Z').toLocaleDateString('en-GB',{day:'numeric',month:'short',timeZone:'UTC'})});return result;}
 throw new Error('Unknown comparison frequency.');
}
export function alignPeriod(rows,frequency,anchor,slots=comparisonSlots(frequency)){
 const window=periodWindow(frequency,anchor),byDate=new Map(rows.map(r=>[r.date,enrichDaily(r)]));
 return slots.map((slot,i)=>{
  const day=frequency==='week'?dateAdd(window.start,i):frequency==='month'?window.start.slice(0,8)+slot.key:anchor.slice(0,4)+'-'+slot.key;
  const valid=day>=window.start&&day<=window.end&&!Number.isNaN(Date.parse(day+'T12:00:00Z'))&&new Date(day+'T12:00:00Z').toISOString().slice(0,10)===day;
  return {slot:slot.key,label:slot.label,date:valid?day:null,valid,row:valid?byDate.get(day)||null:null};
 });
}
export function axisDomain(values,variable){
 if(variable.bounds)return variable.bounds;
 const v=values.filter(finite);if(!v.length)return [0,1];
 const lo=Math.min(...v),hi=Math.max(...v),padding=Math.max((hi-lo)*.13,hi===lo?Math.max(Math.abs(hi)*.01,.5):.1);
 return [variable.zero?0:lo-padding,Math.max(variable.zero?1:lo+1e-6,hi+padding)];
}
export function seriesSummary(points,variable){const values=points.map(p=>p.row?.[variable.key]).filter(finite);return {count:values.length,value:!values.length?null:variable.total?sum(values):variable.circular?circularMean(values):mean(values),kind:variable.total?'Total':variable.circular?'Circular mean':'Mean'};}
