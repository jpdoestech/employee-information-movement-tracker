/* Saved desktop sidebar width, restored before first paint; mobile uses a drawer. */
(function(root){
  const key='ams_sidebar';let collapsed=false;
  try{collapsed=root.localStorage.getItem(key)==='collapsed'}catch{}
  function apply(){document.documentElement.dataset.sidebar=collapsed?'collapsed':'expanded';root.dispatchEvent(new CustomEvent('ams:layout'))}
  function set(value){collapsed=Boolean(value);try{root.localStorage.setItem(key,collapsed?'collapsed':'expanded')}catch{}apply()}
  root.addEventListener('storage',event=>{if(event.key===key||event.key===null){collapsed=event.newValue==='collapsed';apply()}});
  root.AMSLayout={isCollapsed:()=>collapsed,set,toggle:()=>set(!collapsed)};apply();
})(globalThis);
