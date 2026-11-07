import assert from 'node:assert/strict';
import rules from '../pebble-state.js';
import {makeHandler} from '../supabase/functions/device-api/handler.mjs';
import {createHash} from 'node:crypto';
const id='11111111-1111-4111-8111-111111111111', secret='a'.repeat(64);
let row={id:'22222222-2222-4222-8222-222222222222',revision:0,state:rules.create('session',{id:'recipe',steps:[{text:'test',seconds:30}]})};
let reads=0;
const handler=makeHandler({rules,store:{
  async device(){return {household_id:'home',secret_hash:createHash('sha256').update(secret).digest('hex')};},
  async session(device,home){assert.equal(device,id);assert.equal(home,'home');reads++;return structuredClone(row);},
  async save(session,device,home,revision,state){assert.equal(home,'home');if(row.revision!==revision)return null;row={...row,state,revision:state.revision};return row;}
}});
const req=(method,path,body,token=secret)=>new Request(`https://example.test/device-api/${path}?device_id=${id}`,{method,headers:{'x-device-secret':token},body:body===undefined?undefined:JSON.stringify(body)});
assert.equal((await handler(req('GET','state',undefined,'b'.repeat(64)))).status,401);
assert.equal(reads,0);
assert.equal((await handler(req('GET','state'))).status,200);
const command={session_id:'session',revision:0,action:'toggle_timer'};
const responses=await Promise.all([handler(req('POST','action',command)),handler(req('POST','action',command))]);
assert.deepEqual(responses.map(r=>r.status).sort(),[200,409]);
assert.equal(row.revision,1);
assert.equal((await handler(req('POST','action',{session_id:'other',revision:1,action:'exit'}))).status,400);
assert.equal((await handler(req('POST','action',{session_id:'session',revision:1,action:'complete_meal'}))).status,400);
assert.equal((await handler(req('POST','state',{}))).status,405);
assert.equal((await handler(req('GET','missing'))).status,404);
// Streaming bodies must be rejected before buffering more than the limit.
let cancelled=false;
const large=new ReadableStream({start(c){c.enqueue(new Uint8Array(2049));},cancel(){cancelled=true;}});
const largeRequest=new Request(`https://example.test/device-api/action?device_id=${id}`,{method:'POST',headers:{'x-device-secret':secret},body:large,duplex:'half'});
assert.equal((await handler(largeRequest)).status,413);assert.equal(cancelled,true);assert.equal(row.revision,1);
const badUtf8=new Request(`https://example.test/device-api/action?device_id=${id}`,{method:'POST',headers:{'x-device-secret':secret},body:new Uint8Array([255])});
assert.equal((await handler(badUtf8)).status,400);assert.equal(row.revision,1);
assert.equal((await handler(req('POST','action','x'.repeat(3000)))).status,413);
const valid=new TextEncoder().encode(JSON.stringify({session_id:'session',revision:1,action:'set_step',step_index:0,note:'菠菜'}));
const split=valid.findIndex(n=>n>=128)+1;
const chunked=new ReadableStream({start(c){c.enqueue(valid.slice(0,split));c.enqueue(valid.slice(split));c.close();}});
const chunkedRequest=new Request(`https://example.test/device-api/action?device_id=${id}`,{method:'POST',headers:{'x-device-secret':secret},body:chunked,duplex:'half'});
assert.equal((await handler(chunkedRequest)).status,200);assert.equal(row.revision,2);
console.log('PASS: secret authentication, household filter, atomic duplicate rejection, session isolation, inventory action rejection and routes');
console.log('PASS: bounded streaming body, oversized cancellation, invalid UTF-8 rejection and multibyte chunk decoding');
