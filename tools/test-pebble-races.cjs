const assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),path=require('node:path');
const deferred=()=>{let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve};};
const settle=async()=>{for(let i=0;i<12;i++)await Promise.resolve();};
const sample=(id='session',index=0,revision=0)=>({id,recipe_id:'recipe',revision,status:'cooking',step_index:index,steps:[0,1,2,3].map(i=>({text:'step '+i,seconds:30,source_index:0}))});
function load(overrides={}){
 const calls=[],events=[],timers=new Map();let timer=0;
 const phone={start:async()=>sample(),read:async()=>sample(),action:async(device,s,type,step)=>{
   calls.push({session:s.id,type,step,revision:s.revision});
   return {...s,revision:s.revision+1,step_index:type==='set_step'?step:s.step_index,status:type==='exit'?'exited':'cooking'};
 },...overrides};
 const w={PEBBLE_STEPS:require('../pebble-steps.js'),location:{search:'?pebble=11111111-1111-4111-8111-111111111111'},dispatchEvent:e=>events.push(e),PEBBLE_PHONE:phone};
 vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../pebble-bridge.js'),'utf8'),{
   window:w,URLSearchParams,CustomEvent:class{constructor(type,{detail}){Object.assign(this,{type,detail});}},
   setTimeout:fn=>{timers.set(++timer,fn);return timer;},clearTimeout:id=>timers.delete(id)
 });
 return {api:w.PEBBLE_BRIDGE,calls,events,async tick(){const [id,fn]=timers.entries().next().value;timers.delete(id);return fn();}};
}
(async()=>{
 const t=load();await t.api.open('recipe',['a']);
 await Promise.all([t.api.move(1),t.api.move(1)]);
 assert.deepEqual(t.calls.map(c=>c.step),[1,2]);assert.deepEqual(t.calls.map(c=>c.revision),[0,1]);
 const display=t.events.filter(e=>e.type==='pebble-state').at(-1).detail;
 assert.equal(display.step_index,0);assert.equal(display.pebble_index,2);t.api.stop();
 let starts=0;const early=load({start:async()=>{starts++;return sample();}});
 const skipped=early.api.open('recipe',['a']);early.api.close();await skipped;assert.equal(starts,0);
 const slow=deferred(),order=[];
 const switched=load({start:async(device,recipe)=>{order.push('start '+recipe);return recipe==='old'?slow.promise:sample('new');},action:async(device,s,type)=>{order.push(type+' '+s.id);return {...s,status:'exited'};}});
 const old=switched.api.open('old',['a']);await settle();
 const fresh=switched.api.open('new',['b']);await settle();assert.deepEqual(order,['start old']);
 slow.resolve(sample('old'));await Promise.all([old,fresh]);
 assert.deepEqual(order,['start old','exit old','start new']);
 assert.ok(switched.events.filter(e=>e.type==='pebble-state').every(e=>e.detail.id==='new'));switched.api.stop();
 const read=deferred(),polling=load({read:()=>read.promise});
 await polling.api.open('recipe',['a']);const poll=polling.tick();
 await polling.api.move(1);read.resolve(sample());await poll;
 assert.equal(polling.events.filter(e=>e.type==='pebble-state').at(-1).detail.pebble_index,1);polling.api.stop();
 const exit=deferred(),closing=load({action:()=>exit.promise});
 await closing.api.open('recipe',['a']);const closed=closing.api.close();await settle();
 const reopened=closing.api.open('new',['b']);exit.resolve({...sample(),status:'exited'});await Promise.all([closed,reopened]);
 assert.equal(closing.events.filter(e=>e.type==='pebble-state').at(-1).detail.status,'cooking');closing.api.stop();
 console.log('PASS: rapid moves, atomic/source mapping, cancelled starts, serialized recipe replacement, stale reads and late close isolation');
})().catch(e=>{console.error(e);process.exitCode=1;});
