export const PAGE_NAMES={overview:'Overview',trends:'Weather Trends',comparison:'Compare',records:'Records'};
const CHART_IDS=['temperature-chart','rain-chart','humidity-chart','wind-chart','solar-chart','uv-chart','pressure-chart'];
export function resolvePage(hash=''){
 let target;try{target=decodeURIComponent(hash.replace(/^#/,''));}catch{target='';}
 if(Object.hasOwn(PAGE_NAMES,target))return {id:target,target:null};
 if(CHART_IDS.includes(target))return {id:'trends',target};
 if(target==='setup')return {id:'overview',target:'setup'};
 return {id:'overview',target:null};
}
export function setupPageViews({onChange,getStationTitle}){
 const links=[...document.querySelectorAll('nav a')],views=[...document.querySelectorAll('[data-view]')],main=document.querySelector('main'),controls=document.querySelector('#history-controls');
 let page='overview',frame=0,appliedHash=null;
 function updateHeaderHeight(){document.documentElement.style.setProperty('--header-height',document.querySelector('.topbar').getBoundingClientRect().height+'px');}
 updateHeaderHeight();new ResizeObserver(updateHeaderHeight).observe(document.querySelector('.topbar'));
 function apply({render=true,scroll=true}={}){
  const route=resolvePage(location.hash);page=route.id;appliedHash=location.hash;
  for(const view of views)view.hidden=view.dataset.view!==page;
  const slot=document.querySelector(`[data-filter-slot="${page==='comparison'?'overview':page}"]`);if(slot&&controls.parentElement!==slot)slot.append(controls);
  for(const link of links){const active=link.hash==='#'+page;link.classList.toggle('active',active);if(active)link.setAttribute('aria-current','page');else link.removeAttribute('aria-current');}
  document.querySelector('#page-context').textContent=PAGE_NAMES[page];
  document.title=`${PAGE_NAMES[page]} · ${getStationTitle()}`;
  document.querySelector('#tooltip').hidden=true;
  if(render)onChange(page);
  if(scroll){cancelAnimationFrame(frame);frame=requestAnimationFrame(()=>{if(route.target){const target=document.getElementById(route.target);if(target){if(target.tagName==='DETAILS')target.open=true;target.scrollIntoView({behavior:'instant',block:'start'});}}else window.scrollTo({top:0,behavior:'instant'});main.focus({preventScroll:true});});}
 }
 function navigate(id){const hash=id.startsWith('#')?id:'#'+id;if(location.hash!==hash)location.hash=hash;apply();}
 document.addEventListener('click',event=>{const anchor=event.target.closest?.('a[href^="#"]');if(!anchor||event.defaultPrevented||event.button!==0||event.metaKey||event.ctrlKey||event.shiftKey||event.altKey)return;event.preventDefault();if(anchor.classList.contains('skip')){main.focus({preventScroll:false});return;}navigate(anchor.getAttribute('href'));});
 addEventListener('hashchange',()=>{if(location.hash!==appliedHash)apply();});
 apply({render:false,scroll:false});
 return {navigate,refresh:()=>apply({render:false}),get current(){return page;}};
}
