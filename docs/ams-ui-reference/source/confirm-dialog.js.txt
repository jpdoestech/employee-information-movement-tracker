/* In-app confirmations keep the current editor intact while awaiting a choice. */
(function(root){
  const queue=[];let active=false;
  function presentNext(){
    if(active||!queue.length)return;
    active=true;
    const {message,options,resolve}=queue.shift(),previousFocus=document.activeElement;
    const deleting=options.destructive??/^Delete\b/i.test(message),title=options.title||(deleting?'Delete record?':'Confirm changes');
    const layer=document.createElement('div');layer.className='confirm-layer';
    const dialog=document.createElement('section');dialog.className='confirm-dialog';
    dialog.setAttribute('role','alertdialog');dialog.setAttribute('aria-modal','true');
    dialog.setAttribute('aria-labelledby','confirmation-title');dialog.setAttribute('aria-describedby','confirmation-message');
    const eyebrow=document.createElement('span');eyebrow.className='confirm-eyebrow';eyebrow.textContent='AMS · Confirmation';
    const heading=document.createElement('h3');heading.id='confirmation-title';heading.textContent=title;
    const description=document.createElement('p');description.id='confirmation-message';description.textContent=message;
    const actions=document.createElement('div');actions.className='confirm-actions';
    const cancel=document.createElement('button');cancel.type='button';cancel.className='btn';cancel.textContent='Cancel';
    const accept=document.createElement('button');accept.type='button';accept.className='btn '+(deleting?'danger':'p');accept.textContent=options.confirmText||(deleting?'Delete':'Confirm');
    const header=document.createElement('header');header.className='confirm-header';header.append(eyebrow,heading);
    const body=document.createElement('div');body.className='confirm-body';body.append(description);
    actions.append(cancel,accept);root.AMSUI?.enhance(actions);dialog.append(header,body,actions);layer.append(dialog);document.body.append(layer);
    const background=['app','ov','menu'].map(id=>document.getElementById(id)).filter(Boolean).map(el=>({el,inert:el.inert}));
    background.forEach(({el})=>{el.inert=true});
    function finish(accepted){
      document.removeEventListener('keydown',handleKey,true);layer.remove();
      background.forEach(({el,inert})=>{el.inert=inert});
      if(previousFocus?.isConnected)previousFocus.focus();
      active=false;resolve(accepted);queueMicrotask(presentNext);
    }
    function handleKey(event){
      if(event.key==='Escape'){event.preventDefault();event.stopImmediatePropagation();finish(false)}
      else if(event.key==='Tab'){
        event.preventDefault();event.stopImmediatePropagation();
        (document.activeElement===cancel?accept:cancel).focus();
      }else if(!layer.contains(event.target)){event.preventDefault();event.stopImmediatePropagation()}
    }
    cancel.addEventListener('click',()=>finish(false));accept.addEventListener('click',()=>finish(true));
    layer.addEventListener('click',event=>{if(event.target===layer)finish(false)});
    document.addEventListener('keydown',handleKey,true);cancel.focus();
  }
  root.confirmAction=(message,options={})=>new Promise(resolve=>{queue.push({message:String(message),options,resolve});presentNext()});
})(globalThis);
