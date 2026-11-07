import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {makeHandler} from '../supabase/functions/device-api/handler.mjs';
const id='11111111-1111-4111-8111-111111111111',secret='a'.repeat(64);
let inventoryReads=0;
const homes={homeA:[{id:'egg',name:'鸡蛋',qty:2,unit:'个',life:7,added_at:'2026-11-07',days_left:7,secret_note:'hidden'}],homeB:[{id:'milk',name:'other home'}]};
const store={
 async device(device){return device===id?{household_id:'homeA',secret_hash:createHash('sha256').update(secret).digest('hex')}:null;},
 async inventory(home){inventoryReads++;assert.equal(home,'homeA');return homes[home];},
 async session(){throw Error('Inventory must not depend on cooking sessions');},
 async save(){throw Error('Read-only endpoint must never write');}
};
const handler=makeHandler({store,rules:{}});
const request=(method='GET',token=secret,query='')=>new Request(`https://example.test/device-api/inventory?device_id=${id}${query}`,{method,headers:{'x-device-secret':token}});
assert.equal((await handler(request('GET','b'.repeat(64)))).status,401);assert.equal(inventoryReads,0);
assert.equal((await handler(request('POST'))).status,405);assert.equal(inventoryReads,0);
const response=await handler(request('GET',secret,'&household_id=homeB'));
assert.equal(response.status,200);assert.equal(response.headers.get('cache-control'),'no-store');
const body=await response.json();assert.equal(body.schema_version,1);assert.equal(body.items[0].name,'鸡蛋');
assert.equal(body.items[0].secret_note,undefined);assert.equal(body.items.length,1);
homes.homeA=[];assert.deepEqual((await (await handler(request())).json()).items,[]);
store.inventory=async()=>{throw Error('DB failure');};assert.equal((await handler(request())).status,503);
console.log('PASS inventory: authentication, method, household isolation, field allow-list, empty inventory, failure closed, no cooking session or writes');
