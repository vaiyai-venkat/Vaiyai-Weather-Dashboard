// Local illustrations and synthesized ambience. These are not observed cloud images.
export const RAIN_LIMITS = Object.freeze({moderate: 2.5, extreme: 50}); // mm/hour; visual bands only
const number = n => typeof n === 'number' && Number.isFinite(n);
export const SCENES = Object.freeze({
  sunny: {label:'Sunny sky', sound:'Soft breeze & birds', top:'#143d60', bottom:'#e9ad62'},
  night: {label:'Night sky', sound:'Quiet night & crickets', top:'#09132f', bottom:'#354b78'},
  cloudy: {label:'Cloudy sky', sound:'Gentle wind', top:'#24364d', bottom:'#8296a2'},
  light: {label:'Light rain', sound:'Very light rain', top:'#1c344c', bottom:'#607d8c'},
  heavy: {label:'Moderate to heavy rain', sound:'Steady rainfall', top:'#152337', bottom:'#435c71'},
  extreme: {label:'Very heavy to extreme rain', sound:'Intense rain & illustrative distant thunder', top:'#101c30', bottom:'#354558'},
  unknown: {label:'Waiting for observations', sound:'Sound paused', top:'#172b3e', bottom:'#37485d'}
});

// Approximate solar elevation from observation time and station coordinates.
export function solarElevation(time, latitude, longitude) {
  const d = new Date(time);
  if (!Number.isFinite(d.getTime()) || !number(latitude) || !number(longitude)) return null;
  const rad = Math.PI / 180;
  const day = (d - Date.UTC(d.getUTCFullYear(), 0, 0)) / 86400000;
  const hour = d.getUTCHours() + d.getUTCMinutes()/60 + d.getUTCSeconds()/3600;
  const g = 2*Math.PI/365 * (day-1 + (hour-12)/24);
  const eq = 229.18*(.000075+.001868*Math.cos(g)-.032077*Math.sin(g)-.014615*Math.cos(2*g)-.040849*Math.sin(2*g));
  const dec = .006918-.399912*Math.cos(g)+.070257*Math.sin(g)-.006758*Math.cos(2*g)+.000907*Math.sin(2*g)-.002697*Math.cos(3*g)+.00148*Math.sin(3*g);
  const angle = (((hour*60+eq+4*longitude)%1440+1440)%1440/4-180)*rad;
  const sine = Math.sin(latitude*rad)*Math.sin(dec)+Math.cos(latitude*rad)*Math.cos(dec)*Math.cos(angle);
  return Math.asin(Math.max(-1,Math.min(1,sine)))/rad;
}

export function classifyWeather(c, station={}, now=Date.now(), demo=false) {
  if (!c || !Number.isFinite(Date.parse(c.time))) return {key:'unknown', fresh:false, detail:'No valid observation time. Scene and sound are paused.'};
  const age=(now-Date.parse(c.time))/60000, fresh=demo || (age>=-5 && age<=15);
  const rate=number(c.rain_rate) && c.rain_rate>=0 ? c.rain_rate : null;
  const elevation=solarElevation(c.time,station.latitude,station.longitude);
  let key, detail;
  if (rate!==null && rate>0) {
    key=rate<RAIN_LIMITS.moderate?'light':rate<RAIN_LIMITS.extreme?'heavy':'extreme';
    detail=`Reported rain rate ${rate.toLocaleString('en-IN',{maximumFractionDigits:2})} mm/h · illustrative rain scene`;
  } else if (elevation===null) {
    key='unknown'; detail='Station coordinates unavailable; cannot estimate day or night.';
  } else if (elevation<0) {
    key='night'; detail='Night at observation time · cloud cover unavailable';
  } else if (elevation>=10 && number(c.solar) && c.solar>=0) {
    const reference=1000*Math.sin(elevation*Math.PI/180);
    key=c.solar/reference<.35?'cloudy':'sunny';
    detail='Sky estimated from solar radiation & sun position · no cloud-cover sensor';
  } else {
    key='sunny'; detail='Daylight at observation time · sky cover unavailable';
  }
  if (rate===null) detail+=' · rain rate unavailable';
  if (!fresh) detail='Last observation · '+detail+' · stale: sound paused';
  if (demo) detail='SAMPLE DATA · '+detail;
  return {key, fresh, detail};
}

export function sceneSVG(key, id='scene') {
  const s=SCENES[key] || SCENES.unknown;
  const rain=['light','heavy','extreme'].includes(key), night=key==='night';
  const clouds=['cloudy','light','heavy','extreme','unknown'].includes(key);
  const stars=night?Array.from({length:22},(_,i)=>`<circle class="wx-star" cx="${18+i*41%460}" cy="${14+i*29%100}" r="${i%3===0?1.6:1}" style="animation-delay:-${i%5}s" fill="#dcecff"/>`).join(''):'';
  const rays=Array.from({length:12},(_,i)=>`<path d="M0 -38v-10" transform="rotate(${i*30})"/>`).join('');
  const sun=!clouds&&!night?`<g transform="translate(350 72)"><circle r="60" fill="#ffe3a0" opacity=".1"/><g class="wx-rays" stroke="#ffd47a" stroke-width="2.5" stroke-linecap="round">${rays}</g><circle r="29" fill="#ffd17a"/></g>`:'';
  const moon=night?`<path d="M363 29a30 30 0 1 0 27 44 31 31 0 0 1-27-44" fill="#e2ebd0"/><circle cx="352" cy="55" r="48" fill="#e1e9ff" opacity=".035"/>`:'';
  const cloud=(x,y,scale,opacity)=>`<g transform="translate(${x} ${y}) scale(${scale})" opacity="${opacity}"><path class="wx-cloud" d="M-95 20h180a27 27 0 0 0-8-53 37 37 0 0 0-65-16 48 48 0 0 0-84 21 25 25 0 0 0-23 48Z" fill="${rain?'#a6bac9':'#d7e1e3'}"/></g>`;
  const cloudArt=clouds?cloud(130,76,1.15,.35)+cloud(340,84,1.05,.7)+cloud(215,108,1.1,.9):!night?cloud(85,105,.55,.42):'';
  const count=key==='light'?17:key==='heavy'?40:key==='extreme'?65:0;
  const drops=Array.from({length:count},(_,i)=>`<path class="wx-drop" d="M${i*73%520-20} ${i*37%140-30}l-7 ${key==='light'?13:22}" style="animation-delay:-${(i%17)/10}s;animation-duration:${key==='light'?1.4:key==='heavy'?.8:.55}s"/>`).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 480 220" role="img" aria-label="${s.label} illustration" preserveAspectRatio="xMidYMid slice"><defs><linearGradient id="${id}-sky" x2="0" y2="1"><stop stop-color="${s.top}"/><stop offset="1" stop-color="${s.bottom}"/></linearGradient><linearGradient id="${id}-land" x2="0" y2="1"><stop stop-color="#174b4a"/><stop offset="1" stop-color="#091f2e"/></linearGradient></defs><rect width="480" height="220" fill="url(#${id}-sky)"/>${stars}${sun}${moon}${cloudArt}<g fill="none" stroke="#b9ddf5" stroke-width="1.5" stroke-linecap="round" opacity=".65">${drops}</g><path d="M0 174Q72 157 140 173T285 168T480 174V220H0Z" fill="#3c6570" opacity=".6"/><path d="M0 194Q105 172 245 191T480 185V220H0Z" fill="url(#${id}-land)"/><g fill="none" stroke="#6daba0" stroke-width="1" opacity=".22"><path d="M0 205q240-25 480-3M25 220l85-36M165 220l45-32M315 220l-15-28M440 220l-55-32"/></g><g transform="translate(44 169)" fill="#102d35"><path d="M0 27Q3 2 6-25H9Q5 1 5 27Z"/><path d="M7-23Q-22-43-28-24Q-10-33 7-23M7-23Q-10-53 7-47Q2-35 7-23M7-23Q33-49 40-28Q21-37 7-23M7-23Q37-22 31-5Q22-21 7-23"/></g></svg>`;
}

export class Ambience {
  constructor(){this.context=null;this.master=null;this.nodes=[];this.voices=new Set();this.timer=null;this.thunderTimer=null;this.key=null;this.enabled=false;this.volume=.22;}
  async enable(){
    const Audio=globalThis.AudioContext||globalThis.webkitAudioContext;
    if(!Audio)throw Error('This browser does not support ambient audio.');
    if(!this.context){this.context=new Audio();this.master=this.context.createGain();this.master.gain.value=0;this.master.connect(this.context.destination);}
    await this.context.resume();
    if(this.context.state!=='running')throw Error('Audio paused by the browser. Tap Sound again.');
    this.enabled=true;
  }
  stop(){
    clearInterval(this.timer);clearTimeout(this.thunderTimer);this.timer=null;this.thunderTimer=null;
    for(const voice of this.voices){try{voice.source.stop();}catch{}for(const n of voice.nodes){try{n.disconnect();}catch{}}}this.voices.clear();
    for(const n of this.nodes){try{n.stop();}catch{}try{n.disconnect();}catch{}}this.nodes=[];this.key=null;
  }
  trackVoice(source,nodes){
    const voice={source,nodes};this.voices.add(voice);
    source.onended=()=>{for(const n of nodes)n.disconnect();this.voices.delete(voice);};
  }
  scheduleThunder(delay){
    this.thunderTimer=setTimeout(()=>{
      this.thunderTimer=null;
      if(!this.enabled||document.hidden||this.key!=='extreme')return;
      this.thunder();this.scheduleThunder(25000+Math.random()*20000);
    },delay);
  }
  thunder(){
    // Decorative ambience only: the station does not measure thunder or lightning.
    const ctx=this.context,t=ctx.currentTime,duration=6;
    const buffer=ctx.createBuffer(1,ctx.sampleRate*duration,ctx.sampleRate),data=buffer.getChannelData(0);
    let brown=0;for(let i=0;i<data.length;i++){brown=(brown+(Math.random()*2-1)*.08)/1.02;data[i]=brown*1.2;}
    const source=ctx.createBufferSource();source.buffer=buffer;
    const filter=ctx.createBiquadFilter();filter.type='lowpass';filter.frequency.setValueAtTime(240,t);filter.frequency.exponentialRampToValueAtTime(65,t+duration);filter.Q.value=.7;
    const gain=ctx.createGain();gain.gain.setValueAtTime(.0001,t);gain.gain.exponentialRampToValueAtTime(.55,t+.45);gain.gain.exponentialRampToValueAtTime(.3,t+1.3);gain.gain.exponentialRampToValueAtTime(.12,t+3);gain.gain.exponentialRampToValueAtTime(.0001,t+duration);
    source.connect(filter);filter.connect(gain);gain.connect(this.master);this.trackVoice(source,[source,filter,gain]);source.start(t);source.stop(t+duration+.02);
  }
  gain(value){if(this.master)this.master.gain.setTargetAtTime(value,this.context.currentTime,.2);}
  play(key,allowed){
    if(!this.enabled||!allowed||document.hidden||key==='unknown'){this.gain(0);this.stop();return;}
    this.gain(this.volume);
    if(this.key===key)return;
    this.stop();this.key=key;
    const ctx=this.context, rain=['light','heavy','extreme'].includes(key);
    const buffer=ctx.createBuffer(1,ctx.sampleRate*4,ctx.sampleRate), data=buffer.getChannelData(0);
    let brown=0;for(let i=0;i<data.length;i++){brown=(brown+Math.random()*.04-.02)/1.02;data[i]=rain?(Math.random()*2-1)*.42:brown*2;}
    const source=ctx.createBufferSource();source.buffer=buffer;source.loop=true;
    const filter=ctx.createBiquadFilter();filter.type=rain?'lowpass':'bandpass';filter.frequency.value=({sunny:320,night:180,cloudy:460,light:1100,heavy:3600,extreme:5200})[key];filter.Q.value=.45;
    const bed=ctx.createGain();bed.gain.value=({sunny:.28,night:.13,cloudy:.55,light:.16,heavy:.7,extreme:.85})[key];
    source.connect(filter);filter.connect(bed);bed.connect(this.master);source.start();this.nodes.push(source,filter,bed);
    if(key==='extreme')this.scheduleThunder(3000+Math.random()*4000);
    if(key==='sunny'||key==='night'){
      const chirp=()=>{if(!this.enabled||document.hidden||this.key!==key)return;const t=ctx.currentTime;
        for(let j=0;j<(key==='night'?3:2);j++){const osc=ctx.createOscillator(),g=ctx.createGain(),start=t+j*.17,duration=key==='night'?.06:.12;osc.type='sine';osc.frequency.setValueAtTime(key==='night'?4200:1800+Math.random()*900,start);osc.frequency.exponentialRampToValueAtTime(key==='night'?4400:3400,start+duration);g.gain.setValueAtTime(.0001,start);g.gain.exponentialRampToValueAtTime(.035,start+.015);g.gain.exponentialRampToValueAtTime(.0001,start+duration);osc.connect(g);g.connect(this.master);this.trackVoice(osc,[osc,g]);osc.start(start);osc.stop(start+duration+.02);}}
      chirp();this.timer=setInterval(chirp,key==='night'?2100:4400);
    }
  }
}

export function setupAtmosphere(){
  const visual=document.querySelector('#weather-visual'), background=document.querySelector('#weather-background');
  const label=document.querySelector('#weather-scene-label'), detail=document.querySelector('#weather-scene-detail');
  const soundButton=document.querySelector('#weather-sound'), volume=document.querySelector('#weather-volume'), motionButton=document.querySelector('#weather-motion');
  if(!visual||!background||!soundButton)return {update(){}};
  const audio=new Ambience(), reduced=matchMedia('(prefers-reduced-motion: reduce)');
  let current={key:'unknown',fresh:false,detail:'Waiting for station observations.'},lastKey=null;
  let latest=null, latestStation={}, sample=false;
  const read=(key)=>{try{return localStorage.getItem(key);}catch{return null;}};
  const save=(key,value)=>{try{localStorage.setItem(key,value);}catch{}};
  let paused=reduced.matches||read('weather-motion')==='paused';
  const savedVolume=Number(read('weather-volume'));if(read('weather-volume')!==null && Number.isFinite(savedVolume))audio.volume=Math.max(0,Math.min(.6,savedVolume));volume.value=Math.round(audio.volume*100);
  function sync(){
    document.body.classList.toggle('weather-motion-paused',paused||!current.fresh||document.hidden);
    motionButton.textContent=paused?'▶ Animation':'Ⅱ Animation';motionButton.setAttribute('aria-pressed',String(!paused));motionButton.setAttribute('aria-label',paused?'Play weather animation':'Pause weather animation');
    soundButton.textContent=audio.enabled?'♫ Sound on':'♫ Sound off';soundButton.setAttribute('aria-pressed',String(audio.enabled));
    volume.disabled=!audio.enabled;audio.play(current.key,current.fresh);
    document.querySelector('#weather-audio-status').textContent=audio.enabled?(current.fresh?SCENES[current.key].sound:'Sound paused · observation unavailable or stale'):'Optional ambient sound · tap to listen';
    volume.setAttribute('aria-valuetext',Math.round(audio.volume*100)+' percent');
  }
  soundButton.addEventListener('click',async()=>{
    try{if(audio.enabled){audio.enabled=false;audio.gain(0);audio.stop();}else await audio.enable();sync();}
    catch(e){audio.enabled=false;sync();document.querySelector('#weather-audio-status').textContent=e.message;}
  });
  volume.addEventListener('input',()=>{audio.volume=Number(volume.value)/100;save('weather-volume',String(audio.volume));sync();});
  motionButton.addEventListener('click',()=>{paused=!paused;save('weather-motion',paused?'paused':'playing');sync();});
  reduced.addEventListener('change',e=>{if(e.matches)paused=true;sync();});
  document.addEventListener('visibilitychange',()=>update(latest,latestStation,sample));
  addEventListener('pagehide',()=>{audio.enabled=false;audio.gain(0);audio.stop();});
  function update(observation,station,demo=false){
    latest=observation;latestStation=station;sample=demo;
    current=classifyWeather(observation,station,Date.now(),demo);
    if(current.key!==lastKey){visual.innerHTML=sceneSVG(current.key,'card');background.innerHTML=sceneSVG(current.key,'backdrop');lastKey=current.key;}
    document.body.dataset.weather=current.key;
    label.textContent=SCENES[current.key].label;detail.textContent=current.detail;sync();
  }
  // Recheck age even if archive polling fails or no new observation arrives.
  setInterval(()=>{if(!document.hidden)update(latest,latestStation,sample);},30000);
  update(null,{});return {update};
}
