const assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
function load(search){
 const calls=[],events=[];let resolve;
 const w={PEBBLE_STEPS:require('../pebble-steps.js'),location:{search},dispatchEvent:e=>events.push(e),PEBBLE_PHONE:{start:()=>new Promise(r=>resolve=r),action:async(...a)=>{calls.push(a);return {...a[1],status:'exited'};}}};
 vm.runInNewContext(fs.readFileSync(require('node:path').join(__dirname,'../pebble-bridge.js'),'utf8'),{window:w,URLSearchParams,CustomEvent:class{constructor(type,{detail}){Object.assign(this,{type,detail});}},setTimeout,clearTimeout});
 return {api:w.PEBBLE_BRIDGE,calls,events,resolve:v=>resolve(v)};
}
(async()=>{
 const off=load('');assert.equal(off.api.enabled,false);await off.api.open('x',['a']);
 const t=load('?pebble=11111111-1111-4111-8111-111111111111');
 assert.equal(t.api.duration('中火翻炒15秒'),15);
 assert.equal(t.api.duration('Simmer 2 minutes'),120);
 assert.equal(t.api.duration('炒2～3分钟'),0);
 assert.equal(t.api.duration('先炒15秒，再煮2分钟'),0);
 assert.equal(t.api.duration('加热'),0);
 const opening=t.api.open('recipe',['a']); for(let i=0;i<8;i++)await Promise.resolve(); t.api.close();
 t.resolve({id:'session',revision:0,status:'cooking'});await opening;
 assert.equal(t.calls[0][2],'exit');assert.equal(t.events.length,0);
 console.log('PASS: opt-in, explicit duration parsing, ambiguous durations rejected, late start closed without UI mutation');
})().catch(e=>{console.error(e);process.exitCode=1;});
