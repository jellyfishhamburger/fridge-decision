const fs=require('fs'),vm=require('vm'),assert=require('assert');const p=require('path').resolve(__dirname,'..')+'/';
const mem=new Map();let user='A',rows=[],local=[],block=null;
const c={crypto:require("crypto").webcrypto,window:null,localStorage:{getItem:k=>mem.get(k)||null,setItem:(k,v)=>mem.set(k,v)},document:{readyState:'loading',addEventListener(){}},setTimeout(){},clearTimeout(){},setInterval(){},AUTH:{configured:()=>true,signedIn:()=>true,session:()=>({user_id:user}),items:async()=>rows,rpc:async()=>{if(block)await block;}},FD:{items:()=>local},addEventListener(){}};c.window=c;vm.createContext(c);vm.runInContext(fs.readFileSync(p+'cloud.js','utf8'),c);
(async()=>{
local=Array.from({length:40},(_,i)=>({id:'i'+i,cat:'egg',qty:1}));c.CLOUD.queue(local);assert.equal(c.CLOUD.outbox().length,40);
user='B';assert.equal(c.CLOUD.outbox().length,0);user='A';assert.equal(c.CLOUD.outbox().length,40);
c.CLOUD.resetQueue([{id:'x',cat:'egg',qty:3},{id:'y',cat:'milk',qty:1}]);local=[{id:'x',cat:'egg',qty:2}];c.CLOUD.queue(local);rows=[{id:'x',cat:'egg',qty:3},{id:'y',cat:'milk',qty:1}];let merged=await c.CLOUD.pull();assert.equal(merged.length,1);assert.equal(merged[0].qty,2);
c.CLOUD.resetQueue([]);local=[{id:'first',cat:'egg',qty:1}];c.CLOUD.queue(local);let release;block=new Promise(r=>release=r);const flushing=c.CLOUD.flush();await Promise.resolve();local.push({id:'second',cat:'egg',qty:1});c.CLOUD.queue(local);release();block=null;await flushing;assert.equal(c.CLOUD.outbox().length,0);assert(c.CLOUD.snap().second);
c.CLOUD.resetQueue([]);local=[{id:'stale',cat:'egg',qty:1}];c.CLOUD.queue(local);
let release2;block=new Promise(r=>release2=r);const stale=c.CLOUD.flush();await Promise.resolve();
c.CLOUD.resetQueue([]);local=[{id:'replacement',cat:'milk',qty:1}];c.CLOUD.queue(local);release2();block=null;await stale;assert(c.CLOUD.snap().replacement);assert(!c.CLOUD.snap().stale);
c.CLOUD.resetQueue([]);local=[{id:'accountA',cat:'egg',qty:1}];c.CLOUD.queue(local);
let release3;block=new Promise(r=>release3=r);const accountFlight=c.CLOUD.flush();await Promise.resolve();user='B';release3();block=null;await accountFlight;assert.equal(c.CLOUD.outbox().length,0);user='A';assert.equal(c.CLOUD.outbox().length,1);
console.log('PASS: queue replacement and account switch during requests; 40 queued changes retained; account queues isolated; pending edits/deletes preserved; additions during flush retained.');
})().catch(e=>{console.error(e);process.exitCode=1});

