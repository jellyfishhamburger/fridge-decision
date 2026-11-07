/* Opt-in: index.html?pebble=<device UUID>. No secret is needed by the phone. */
(function(g){
  'use strict';
  let generation=0, timer=null, state=null, pending=Promise.resolve();
  const id=new URLSearchParams(g.location.search).get('pebble');
  const enabled=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id||'');
  const emit=(type,detail)=>{
    if(type==='pebble-state' && detail.steps?.[detail.step_index]){
      const step=detail.steps[detail.step_index];
      detail={...detail,pebble_index:detail.step_index,pebble_count:detail.steps.length,pebble_text:step.text,step_index:step.source_index??detail.step_index};
    }
    g.dispatchEvent(new CustomEvent(type,{detail}));
  };
  function fail(e){emit('pebble-error',{message:e.message||'同步失败'});}
  function stop(){generation++;clearTimeout(timer);timer=null;state=null;}
  async function open(recipe,steps){
    stop(); if(!enabled)return;
    const token=generation;
    try{
      const prepared=g.PEBBLE_STEPS.prepare(steps);
      if(prepared.length>100)throw Error('拆分超过100步，请先精简这道菜谱');
      pending=pending.catch(()=>{}).then(async()=>{
        if(token!==generation)return;
        const value=await g.PEBBLE_PHONE.start(id,recipe,prepared);
        if(token!==generation){await g.PEBBLE_PHONE.action(id,value,'exit');return;}
        state=value; emit('pebble-state',value); poll(token);
      });
      await pending;
    }catch(e){if(token===generation)fail(e);}
  }
  // Only explicit unambiguous durations; no invented cooking time.
  function duration(text){
    return g.PEBBLE_STEPS.duration(text);
  }
  async function poll(token){
    timer=setTimeout(async()=>{
      try{
        const value=await g.PEBBLE_PHONE.read(id);
        if(token!==generation)return;
        if(!value || value.id!==state?.id){stop();return;}
        if(value.revision>=state.revision){state=value;emit('pebble-state',value);}
        if(value.status!=='cooking'){stop();return;}
      }catch(e){if(token===generation)fail(e);}
      if(token===generation)poll(token);
    },2000);
  }
  function action(type,step){
    if(!enabled || !state)return Promise.resolve();
    const token=generation;
    pending=pending.catch(()=>{}).then(async()=>{
      if(token!==generation || !state)return;
      try{
        const target=typeof step==='function'?step(state):step;
        if(type==='set_step' && target===state.step_index)return;
        const value=await g.PEBBLE_PHONE.action(id,state,type,target);
        if(token!==generation)return;
        state=value;emit('pebble-state',value);
        if(value.status!=='cooking')stop();
      }catch(e){if(token===generation)fail(e);}
    });
    return pending;
  }
  function move(delta){
    if(!state)return;
    return action('set_step',s=>Math.max(0,Math.min(s.steps.length-1,s.step_index+delta)));
  }
  function close(){
    if(!state){stop();return;}
    if(state.status!=='cooking'){stop();return;}
    const token=generation;
    return action('exit').finally(()=>{if(token===generation)stop();});
  }
  g.PEBBLE_BRIDGE={enabled,open,action,move,close,stop,duration};
})(window);
