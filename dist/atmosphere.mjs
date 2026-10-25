// Local illustrations and synthesized ambience. These are not observed cloud images.
export const RAIN_LIMITS = Object.freeze({moderate: 2.5, extreme: 50}); // mm/hour; visual bands only
export const GUST_WHOOSH_THRESHOLD = 20; // km/h, latest observation gust only
const number = n => typeof n === 'number' && Number.isFinite(n);
export const SCENES = Object.freeze({
  sunny: {label:'Sunny sky', sound:'Soft breeze & birds', top:'#143d60', bottom:'#e9ad62'},
  night: {label:'Night sky', sound:'Quiet night & crickets', top:'#09132f', bottom:'#354b78'},
  cloudy: {label:'Cloudy sky', sound:'Occasional distant bird calls', top:'#24364d', bottom:'#8296a2'},
  light: {label:'Light rain · stratiform drizzle', sound:'Very light rain', top:'#1c344c', bottom:'#607d8c'},
  heavy: {label:'Moderate to heavy rain', sound:'Steady rainfall', top:'#152337', bottom:'#435c71'},
  extreme: {label:'Very heavy to extreme rain', sound:'Intense rain & synchronized illustrative thunder', top:'#101c30', bottom:'#354558'},
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
  const meteors=night?Array.from({length:3},(_,i)=>`<g transform="translate(${70+i*90} ${18+i*9})"><g class="wx-meteor" style="animation-delay:${18+i*1.3}s"><path d="M0 0l-45-21" stroke="url(#${id}-meteor)" stroke-width="1.6" stroke-linecap="round"/><circle r="1.2" fill="#f0f7ff"/></g></g>`).join(''):'';
  const rays=Array.from({length:12},(_,i)=>`<path d="M0 -38v-10" transform="rotate(${i*30})"/>`).join('');
  const sun=!clouds&&!night?`<g transform="translate(350 72)"><circle class="wx-sun-glow" r="68" fill="url(#${id}-sun-halo)"/><g class="wx-rays" stroke="#ffce55" stroke-width="2.5" stroke-linecap="round">${rays}</g><circle r="29" fill="url(#${id}-sun-gold)"/><circle r="29" fill="none" stroke="#ffe79a" stroke-width="1" opacity=".65"/></g>`:'';
  const moon=night?`<path d="M363 29a30 30 0 1 0 27 44 31 31 0 0 1-27-44" fill="#e2ebd0"/><circle cx="352" cy="55" r="48" fill="#e1e9ff" opacity=".035"/>`:'';
  const cloud=(x,y,scale,opacity,layer='')=>`<g transform="translate(${x} ${y}) scale(${scale})" opacity="${opacity}"><path class="wx-cloud ${layer}" d="M-95 20h180a27 27 0 0 0-8-53 37 37 0 0 0-65-16 48 48 0 0 0-84 21 25 25 0 0 0-23 48Z" fill="${rain?'#a6bac9':'#d7e1e3'}"/></g>`;
  const stratus=`<g class="wx-stratus"><path class="wx-cloud wx-stratus-far" d="M-70 48Q40 32 135 44T310 40T550 44V76Q420 88 318 78T115 81T-70 76Z" fill="#b0c0ca" opacity=".44"/><path class="wx-cloud wx-stratus-mid" d="M-70 66Q30 54 135 65T330 60T550 65V91Q435 103 320 94T110 96T-70 91Z" fill="#c0cdd3" opacity=".72"/><path class="wx-cloud wx-stratus-near" d="M-70 84Q40 75 145 83T335 81T550 84V104Q440 111 330 104T120 107T-70 104Z" fill="#bacbd3" opacity=".9"/></g>`;
  const cloudArt=key==='light'?stratus:key==='cloudy'?cloud(105,60,.95,.32,'wx-cloud-far')+cloud(355,82,1.15,.57,'wx-cloud-mid')+cloud(210,111,1.2,.8,'wx-cloud-near'):clouds?cloud(130,76,1.15,.35,'wx-cloud-far')+cloud(340,84,1.05,.7,'wx-cloud-mid')+cloud(215,108,1.1,.9,'wx-cloud-near'):!night?cloud(85,105,.55,.42):'';
  const cloudySky=key==='cloudy'?'<ellipse class="wx-cloud-glow" cx="320" cy="110" rx="160" ry="85" fill="#f9e1a6" opacity=".06"/>':'';
  const fieldShadow=key==='cloudy'?`<g clip-path="url(#${id}-fields)"><path class="wx-field-shadow" d="M-140 171h130l75 55H-65Z" fill="#041b26" opacity=".25"/><path class="wx-field-shadow wx-shadow-second" d="M-140 171h90l75 55H-65Z" fill="#041b26" opacity=".2"/></g>`:'';
  const count=key==='light'?54:key==='heavy'?40:key==='extreme'?65:0;
  const drops=Array.from({length:count},(_,i)=>key==='light'?`<path class="wx-drop wx-drizzle" d="M${i*73%500-10} ${108+i*17%62}l-.8 ${3+i%3}" style="animation-delay:-${(i%23)/8}s;animation-duration:${2.2+i%5*.17}s"/>`:`<path class="wx-drop" d="M${i*73%520-20} ${i*37%140-30}l-7 22" style="animation-delay:-${(i%17)/10}s;animation-duration:${key==='heavy'?.8:.55}s"/>`).join('');
  const lightning=key==='extreme'?`<g class="wx-lightning" aria-hidden="true"><ellipse class="wx-lightning-glow" cx="270" cy="90" rx="100" ry="55" fill="#c9dcff" opacity=".14"/><path class="wx-bolt" d="M282 91l-18 30 13-3-27 45 9-32-13 3 17-43M266 119l23 13-9 15" fill="none" stroke="#dbeaff" stroke-width="2.4" stroke-linejoin="round" stroke-linecap="round"/></g>`:'';
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 480 220" role="img" aria-label="${s.label} illustration" preserveAspectRatio="xMidYMid slice"><defs><radialGradient id="${id}-sun-gold" cx=".38" cy=".32" r=".8"><stop stop-color="#fff3b0"/><stop offset=".45" stop-color="#ffcf47"/><stop offset="1" stop-color="#efa519"/></radialGradient><radialGradient id="${id}-sun-halo"><stop stop-color="#ffd655" stop-opacity=".55"/><stop offset=".5" stop-color="#ffc243" stop-opacity=".28"/><stop offset="1" stop-color="#ffbd3b" stop-opacity="0"/></radialGradient><linearGradient id="${id}-meteor"><stop stop-color="#f0f7ff"/><stop offset="1" stop-color="#b5d7ff" stop-opacity="0"/></linearGradient><clipPath id="${id}-drizzle"><rect y="106" width="480" height="71"/></clipPath><linearGradient id="${id}-sky" x2="0" y2="1"><stop stop-color="${s.top}"/><stop offset="1" stop-color="${s.bottom}"/></linearGradient><linearGradient id="${id}-land" x2="0" y2="1"><stop stop-color="#174b4a"/><stop offset="1" stop-color="#091f2e"/></linearGradient><clipPath id="${id}-fields"><path d="M0 174Q72 157 140 173T285 168T480 174V220H0Z"/></clipPath></defs><rect width="480" height="220" fill="url(#${id}-sky)"/>${stars}${sun}${moon}${meteors}${cloudySky}${cloudArt}${lightning}<g fill="none" stroke="#b9ddf5" stroke-width="${key==='light'?.8:1.5}" stroke-linecap="round" opacity="${key==='light'?.5:.65}" ${key==='light'?`clip-path="url(#${id}-drizzle)"`:''}>${drops}</g><path d="M0 174Q72 157 140 173T285 168T480 174V220H0Z" fill="#3c6570" opacity=".6"/><path d="M0 194Q105 172 245 191T480 185V220H0Z" fill="url(#${id}-land)"/><g fill="none" stroke="#6daba0" stroke-width="1" opacity=".22"><path d="M0 205q240-25 480-3M25 220l85-36M165 220l45-32M315 220l-15-28M440 220l-55-32"/></g>${fieldShadow}<g transform="translate(44 169)" fill="#102d35"><path d="M0 27Q3 2 6-25H9Q5 1 5 27Z"/><path d="M7-23Q-22-43-28-24Q-10-33 7-23M7-23Q-10-53 7-47Q2-35 7-23M7-23Q33-49 40-28Q21-37 7-23M7-23Q37-22 31-5Q22-21 7-23"/></g></svg>`;
}

export class Ambience {
  constructor(){this.context=null;this.master=null;this.nodes=[];this.windNodes=[];this.voices=new Set();this.timer=null;this.cloudBirdTimer=null;this.key=null;this.enabled=false;this.volume=.60;}
  async enable(automatic=false){
    const Audio=globalThis.AudioContext||globalThis.webkitAudioContext;
    if(!Audio)throw Error('This browser does not support ambient audio.');
    if(!this.context){this.context=new Audio();this.master=this.context.createGain();this.master.gain.value=0;this.master.connect(this.context.destination);}
    const resumed=this.context.resume();
    // Browsers can leave automatic resume pending until a user gesture.
    if(automatic){resumed.catch(()=>{});if(this.context.state!=='running')return false;}
    else await resumed;
    if(this.context.state!=='running')throw Error('Audio paused by the browser. Tap Sound again.');
    this.enabled=true;return true;
  }
  stop(){
    clearInterval(this.timer);this.timer=null;
    clearTimeout(this.cloudBirdTimer);this.cloudBirdTimer=null;
    this.stopWind();
    for(const voice of this.voices){try{voice.source.stop();}catch{}for(const n of voice.nodes){try{n.disconnect();}catch{}}}this.voices.clear();
    for(const n of this.nodes){try{n.stop();}catch{}try{n.disconnect();}catch{}}this.nodes=[];this.key=null;
  }
  stopWind(){for(const n of this.windNodes){try{n.stop();}catch{}try{n.disconnect();}catch{}}this.windNodes=[];}
  setGust(gust){
    if(!number(gust)||gust<=GUST_WHOOSH_THRESHOLD){this.stopWind();return;}
    const strength=Math.min(1,(gust-GUST_WHOOSH_THRESHOLD)/60),base=.12+strength*.16,depth=.10+strength*.12;
    if(this.windNodes.length){this.windNodes[2].gain.setTargetAtTime(base,this.context.currentTime,.6);this.windNodes[4].gain.setTargetAtTime(depth,this.context.currentTime,.6);return;}
    const ctx=this.context,buffer=ctx.createBuffer(1,ctx.sampleRate*4,ctx.sampleRate),data=buffer.getChannelData(0);
    let last=0;for(let i=0;i<data.length;i++){last=(last+(Math.random()*2-1)*.06)/1.02;data[i]=last*3;}
    const source=ctx.createBufferSource();source.buffer=buffer;source.loop=true;
    const filter=ctx.createBiquadFilter();filter.type='bandpass';filter.frequency.value=430;filter.Q.value=.5;
    const gain=ctx.createGain();gain.gain.value=base;
    const lfo=ctx.createOscillator();lfo.type='sine';lfo.frequency.value=.14;
    const modulation=ctx.createGain();modulation.gain.value=depth;
    source.connect(filter);filter.connect(gain);gain.connect(this.master);lfo.connect(modulation);modulation.connect(gain.gain);
    source.start();lfo.start();this.windNodes=[source,filter,gain,lfo,modulation];
  }
  trackVoice(source,nodes,kind=null){
    const voice={source,nodes,kind};this.voices.add(voice);
    source.onended=()=>{for(const n of nodes)n.disconnect();this.voices.delete(voice);};
  }
  scheduleCloudBird(delay){
    this.cloudBirdTimer=setTimeout(()=>{
      this.cloudBirdTimer=null;
      if(!this.enabled||document.hidden||this.key!=='cloudy')return;
      this.cloudBird();this.scheduleCloudBird(9000+Math.random()*10000);
    },delay);
  }
  cloudBird(){
    // Original synthesized distant bird phrase, not a station microphone feed.
    const ctx=this.context,t=ctx.currentTime,base=1650+Math.random()*600;
    const notes=2+Math.floor(Math.random()*2);
    for(let j=0;j<notes;j++){
      const osc=ctx.createOscillator(),gain=ctx.createGain(),start=t+j*.24,duration=.17+Math.random()*.08;
      const pitch=base*(j%2===0?1:1.15);osc.type='sine';osc.frequency.setValueAtTime(pitch,start);osc.frequency.exponentialRampToValueAtTime(pitch*1.42,start+.06);osc.frequency.exponentialRampToValueAtTime(pitch*1.08,start+duration);
      gain.gain.setValueAtTime(.0001,start);gain.gain.exponentialRampToValueAtTime(.014,start+.025);gain.gain.exponentialRampToValueAtTime(.0001,start+duration);
      osc.connect(gain);gain.connect(this.master);this.trackVoice(osc,[osc,gain]);osc.start(start);osc.stop(start+duration+.03);
    }
  }
  stopThunder(){
    for(const voice of [...this.voices])if(voice.kind==='thunder'){
      try{voice.source.stop();}catch{}
      for(const n of voice.nodes){try{n.disconnect();}catch{}}
      this.voices.delete(voice);
    }
  }
  thunder(){
    // Decorative ambience only: the station does not measure thunder or lightning.
    const ctx=this.context,t=ctx.currentTime,duration=6;
    const buffer=ctx.createBuffer(1,ctx.sampleRate*duration,ctx.sampleRate),data=buffer.getChannelData(0);
    let brown=0;for(let i=0;i<data.length;i++){brown=(brown+(Math.random()*2-1)*.08)/1.02;data[i]=brown*1.2;}
    const source=ctx.createBufferSource();source.buffer=buffer;
    const filter=ctx.createBiquadFilter();filter.type='lowpass';filter.frequency.setValueAtTime(240,t);filter.frequency.exponentialRampToValueAtTime(65,t+duration);filter.Q.value=.7;
    const gain=ctx.createGain();gain.gain.setValueAtTime(.0001,t);gain.gain.exponentialRampToValueAtTime(.55,t+.45);gain.gain.exponentialRampToValueAtTime(.3,t+1.3);gain.gain.exponentialRampToValueAtTime(.12,t+3);gain.gain.exponentialRampToValueAtTime(.0001,t+duration);
    source.connect(filter);filter.connect(gain);gain.connect(this.master);this.trackVoice(source,[source,filter,gain],'thunder');source.start(t);source.stop(t+duration+.02);
  }
  gain(value){if(this.master)this.master.gain.setTargetAtTime(value,this.context.currentTime,.2);}
  play(key,allowed,gust=0){
    if(!this.enabled||!allowed||document.hidden||key==='unknown'){this.gain(0);this.stop();return;}
    this.gain(this.volume);
    if(this.key===key){this.setGust(gust);return;}
    this.stop();this.key=key;
    if(key==='cloudy'){
      // No continuous noise bed: foliage synthesis sounded like unobserved wind.
      this.scheduleCloudBird(1200+Math.random()*1400);
      this.setGust(gust);return;
    }
    const ctx=this.context, rain=['light','heavy','extreme'].includes(key);
    const buffer=ctx.createBuffer(1,ctx.sampleRate*4,ctx.sampleRate), data=buffer.getChannelData(0);
    let brown=0;for(let i=0;i<data.length;i++){brown=(brown+Math.random()*.04-.02)/1.02;data[i]=rain?(Math.random()*2-1)*.42:brown*2;}
    const source=ctx.createBufferSource();source.buffer=buffer;source.loop=true;
    const filter=ctx.createBiquadFilter();filter.type=rain?'lowpass':'bandpass';filter.frequency.value=({sunny:320,night:180,light:1100,heavy:3600,extreme:5200})[key];filter.Q.value=.45;
    const bed=ctx.createGain();bed.gain.value=({sunny:.28,night:.13,light:.16,heavy:.7,extreme:.85})[key];
    source.connect(filter);bed.connect(this.master);this.nodes.push(source,filter,bed);
    filter.connect(bed);
    source.start();
    this.setGust(gust);
    if(key==='sunny'||key==='night'){
      const chirp=()=>{if(!this.enabled||document.hidden||this.key!==key)return;const t=ctx.currentTime;
        for(let j=0;j<(key==='night'?3:2);j++){const osc=ctx.createOscillator(),g=ctx.createGain(),start=t+j*.17,duration=key==='night'?.06:.12;osc.type='sine';osc.frequency.setValueAtTime(key==='night'?4200:1800+Math.random()*900,start);osc.frequency.exponentialRampToValueAtTime(key==='night'?4400:3400,start+duration);g.gain.setValueAtTime(.0001,start);g.gain.exponentialRampToValueAtTime(.035,start+.015);g.gain.exponentialRampToValueAtTime(.0001,start+duration);osc.connect(g);g.connect(this.master);this.trackVoice(osc,[osc,g]);osc.start(start);osc.stop(start+duration+.02);}}
      chirp();this.timer=setInterval(chirp,key==='night'?2100:4400);
    }
  }
}

// One shared storm clock drives both illustrations and the delayed rumble.
// Localized, single fades avoid full-screen flashes or rapid strobing.
export class StormEffects {
  constructor({flash,thunder,clear}){this.flash=flash;this.thunder=thunder;this.clear=clear;this.active=false;this.strikeTimer=null;this.rumbleTimer=null;this.fadeTimer=null;}
  update(allowed){
    if(!allowed){this.stop();return;}
    if(this.active)return;
    this.active=true;this.schedule(2000+Math.random()*2000);
  }
  schedule(delay){
    this.strikeTimer=setTimeout(()=>{
      this.strikeTimer=null;if(!this.active)return;
      this.flash();
      this.fadeTimer=setTimeout(()=>{this.fadeTimer=null;this.clear();},700);
      this.rumbleTimer=setTimeout(()=>{this.rumbleTimer=null;if(this.active)this.thunder();},800+Math.random()*700);
      this.schedule(8000+Math.random()*6000);
    },delay);
  }
  stop(){
    this.active=false;
    clearTimeout(this.strikeTimer);clearTimeout(this.rumbleTimer);clearTimeout(this.fadeTimer);
    this.strikeTimer=null;this.rumbleTimer=null;this.fadeTimer=null;this.clear();
  }
}

export function setupAtmosphere(){
  const visual=document.querySelector('#weather-visual'), background=document.querySelector('#weather-background');
  const label=document.querySelector('#weather-scene-label'), detail=document.querySelector('#weather-scene-detail');
  const soundButton=document.querySelector('#weather-sound'), volume=document.querySelector('#weather-volume'), motionButton=document.querySelector('#weather-motion'),startButton=document.querySelector('#weather-start');
  if(!visual||!background||!soundButton)return {update(){}};
  const audio=new Ambience(), reduced=matchMedia('(prefers-reduced-motion: reduce)');
  let current={key:'unknown',fresh:false,detail:'Waiting for station observations.'},lastKey=null;
  let latest=null,latestStation={},sample=false,autoplayAttempted=false,audioWanted=true,needsStart=false,requestVersion=0;
  const read=(key)=>{try{return localStorage.getItem(key);}catch{return null;}};
  const save=(key,value)=>{try{localStorage.setItem(key,value);}catch{}};
  // Start animation on each visit; always respect the device motion preference.
  let paused=reduced.matches;
  const savedVolume=Number(read('weather-volume-v13'));if(read('weather-volume-v13')!==null && Number.isFinite(savedVolume))audio.volume=Math.max(0,Math.min(1,savedVolume));volume.value=Math.round(audio.volume*100);
  const storm=new StormEffects({
    flash:()=>{const offset=Math.round(Math.random()*160-80);for(const root of [visual,background]){const bolt=root.querySelector('.wx-lightning');if(bolt){bolt.setAttribute('transform',`translate(${offset} 0)`);bolt.classList.add('wx-strike');}}},
    clear:()=>{for(const root of [visual,background])root.querySelector('.wx-lightning')?.classList.remove('wx-strike');},
    thunder:()=>{if(audio.enabled&&audio.context?.state==='running'&&current.fresh&&!paused&&!reduced.matches&&!document.hidden&&current.key==='extreme')audio.thunder();}
  });
  function sync(){
    const running=audio.enabled&&audio.context?.state==='running',gust=number(latest?.gust)?latest.gust:0;
    document.body.classList.toggle('weather-motion-paused',paused||!current.fresh||document.hidden);
    motionButton.textContent=paused?'▶ Animation':'Ⅱ Animation';motionButton.setAttribute('aria-pressed',String(!paused));motionButton.setAttribute('aria-label',paused?'Play weather animation':'Pause weather animation');
    soundButton.textContent=running?'♫ Sound on':'♫ Sound off';soundButton.setAttribute('aria-pressed',String(running));
    volume.disabled=!running;audio.play(current.key,current.fresh,gust);
    const stormAllowed=current.key==='extreme'&&current.fresh&&!paused&&!reduced.matches&&!document.hidden;
    storm.update(stormAllowed);if(!stormAllowed)audio.stopThunder();
    if(startButton)startButton.hidden=!(needsStart&&current.fresh);
    const windy=current.fresh&&gust>GUST_WHOOSH_THRESHOLD;
    let status=running?(current.fresh?SCENES[current.key].sound+(windy?' · gust whooshes ('+gust.toLocaleString('en-IN',{maximumFractionDigits:1})+' km/h)':''):'Sound paused · observation unavailable or stale'):needsStart?'Browser requires a tap to start sound & animation':current.fresh?'Sound muted · tap Sound to enable':'Waiting for a fresh observation · sound paused';
    if(document.hidden&&running)status='Sound paused while this tab is hidden';
    document.querySelector('#weather-audio-status').textContent=status;
    volume.setAttribute('aria-valuetext',Math.round(audio.volume*100)+' percent');
  }
  async function startExperience(automatic=false){
    const version=++requestVersion;audioWanted=true;
    if(!automatic)paused=reduced.matches;
    try{
      const enabled=await audio.enable(automatic);
      if(version!==requestVersion||!audioWanted){audio.enabled=false;sync();return;}
      needsStart=!enabled;
      audio.context.onstatechange=()=>{
        audio.enabled=audioWanted&&audio.context.state==='running';
        if(audio.enabled)needsStart=false;
        else if(audioWanted&&current.fresh)needsStart=true;
        sync();
      };
      sync();
    }catch(e){audio.enabled=false;needsStart=true;sync();document.querySelector('#weather-audio-status').textContent=e.message;}
  }
  soundButton.addEventListener('click',()=>{
    if(audio.enabled&&audio.context?.state==='running'){++requestVersion;audioWanted=false;needsStart=false;audio.enabled=false;audio.gain(0);audio.stop();sync();}
    else startExperience(false);
  });
  startButton?.addEventListener('click',()=>startExperience(false));
  // One natural click/tap can unlock audio if the arrival attempt was blocked.
  document.addEventListener('click',event=>{
    if(!event.isTrusted||event.target.closest('.atmosphere-controls'))return;
    if(needsStart&&audioWanted&&current.fresh)startExperience(false);
  });
  volume.addEventListener('input',()=>{audio.volume=Number(volume.value)/100;save('weather-volume-v13',String(audio.volume));sync();});
  motionButton.addEventListener('click',()=>{paused=!paused;sync();});
  reduced.addEventListener('change',e=>{if(e.matches)paused=true;sync();});
  document.addEventListener('visibilitychange',()=>update(latest,latestStation,sample));
  addEventListener('pagehide',()=>{storm.stop();++requestVersion;audioWanted=false;audio.enabled=false;audio.gain(0);audio.stop();});
  addEventListener('pageshow',event=>{if(event.persisted){audioWanted=true;autoplayAttempted=false;update(latest,latestStation,sample);}});
  function update(observation,station,demo=false){
    latest=observation;latestStation=station;sample=demo;
    current=classifyWeather(observation,station,Date.now(),demo);
    if(current.key!==lastKey){visual.innerHTML=sceneSVG(current.key,'card');background.innerHTML=sceneSVG(current.key,'backdrop');lastKey=current.key;}
    document.body.dataset.weather=current.key;
    label.textContent=SCENES[current.key].label;detail.textContent=current.detail;sync();
    if(!autoplayAttempted&&audioWanted&&current.fresh&&current.key!=='unknown'){
      autoplayAttempted=true;startExperience(true);
    }
  }
  // Recheck age even if archive polling fails or no new observation arrives.
  setInterval(()=>{if(!document.hidden)update(latest,latestStation,sample);},30000);
  update(null,{});return {update};
}
