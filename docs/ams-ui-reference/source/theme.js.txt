/* Run in <head> before CSS so a saved preference is applied before first paint. */
(function(root){
  const key='ams_theme',allowed=['system','light','dark'];
  const media=typeof root.matchMedia==='function'?root.matchMedia('(prefers-color-scheme: dark)'):null;
  let preference='system';
  try{const saved=root.localStorage.getItem(key);if(allowed.includes(saved))preference=saved}catch{}
  function apply(){
    const theme=preference==='system'?(media?.matches?'dark':'light'):preference;
    document.documentElement.dataset.theme=theme;
    document.documentElement.dataset.themePreference=preference;
    document.documentElement.style.colorScheme=theme;
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content',theme==='dark'?'#1b1c1e':'#f3f5f8');
    document.querySelectorAll('select[data-theme-preference]').forEach(el=>{el.value=preference});
    root.dispatchEvent(new CustomEvent('ams:theme',{detail:{preference,theme}}));
  }
  function set(value){
    if(!allowed.includes(value))return;
    preference=value;try{root.localStorage.setItem(key,value)}catch{}
    apply();
  }
  if(media?.addEventListener)media.addEventListener('change',()=>{if(preference==='system')apply()});
  else media?.addListener?.(()=>{if(preference==='system')apply()});
  root.addEventListener('storage',event=>{if(event.key===key||event.key===null){preference=allowed.includes(event.newValue)?event.newValue:'system';apply()}});
  document.addEventListener('change',event=>{if(event.target.matches('select[data-theme-preference]'))set(event.target.value)});
  root.AMSTheme={set,get:()=>preference,resolved:()=>document.documentElement.dataset.theme};apply();
})(globalThis);
