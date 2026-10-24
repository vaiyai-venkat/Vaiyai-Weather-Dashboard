export const finite = x => typeof x === 'number' && Number.isFinite(x);
export const sum = a => a.filter(finite).reduce((x,y)=>x+y,0);
export const mean = a => { const v=a.filter(finite); return v.length ? sum(v)/v.length : null; };
export function extreme(rows,key,type) {
  const v=rows.filter(r=>finite(r[key]));
  if(!v.length) return null;
  const n=(type==='min'?Math.min:Math.max)(...v.map(r=>r[key]));
  const ties=v.filter(r=>r[key]===n);
  return {value:n,date:ties[0].date,ties:ties.length};
}
export function circularMean(values) {
  const v=values.filter(finite); if(!v.length) return null;
  const x=sum(v.map(d=>Math.cos(d*Math.PI/180))), y=sum(v.map(d=>Math.sin(d*Math.PI/180)));
  return Math.hypot(x,y)/v.length < 1e-8 ? null : (Math.atan2(y,x)*180/Math.PI+360)%360;
}
export function compass(v) {return finite(v)?['N','NNE','NE','ENE','E','ESE','SE','SSE','S','SSW','SW','WSW','W','WNW','NW','NNW'][Math.round(v/22.5)%16]:'—';}
export function dateAdd(day,n) {const d=new Date(day+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+n);return d.toISOString().slice(0,10);}
export function rangeFor(period,anchor,installation,first,customStart,customEnd) {
 let start=anchor,end=anchor;
 if(period==='week')start=dateAdd(anchor,-6);
 if(period==='month')start=anchor.slice(0,7)+'-01';
 if(period==='year')start=anchor.slice(0,4)+'-01-01';
 if(period==='installation')start=installation||first||anchor;
 if(period==='custom'){start=customStart||anchor;end=customEnd||anchor;}
 return {start,end};
}
export function fillDays(rows,start,end) {
 const by=new Map(rows.map(r=>[r.date,r]));const result=[];
 for(let d=start;d<=end;d=dateAdd(d,1))result.push(by.get(d)||{date:d,missing:true});
 return result;
}
export function rainSum(rows) {const v=rows.map(r=>r.rain_total).filter(finite);return v.length?sum(v):null;}
export function roseBins(rows) {
 const bins=Array(16).fill(0);let calm=0,unknown=0;
 for(const r of rows){if(finite(r.wind_avg)&&r.wind_avg===0){calm++;continue;}if(!finite(r.wind_avg)||!finite(r.wind_dir)){unknown++;continue;}bins[Math.round(r.wind_dir/22.5)%16]++;}
 return {bins,calm,unknown,total:sum(bins)};
}
