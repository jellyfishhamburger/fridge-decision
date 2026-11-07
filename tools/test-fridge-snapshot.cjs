const assert=require('node:assert/strict');const {snapshot}=require('../fridge-snapshot.js');
const rows=[{household_id:'a',name:'鸡蛋',qty:2,secret:'hidden'},{household_id:'b',name:'other',qty:1},{household_id:'a',name:'deleted',qty:1,deleted_at:'now'},{household_id:'a',name:'empty',qty:0}];
const result=snapshot(rows,{id:'a'},new Date('2026-11-07T08:00:00Z'));
assert.equal(result.items.length,1);assert.equal(result.items[0].name,'鸡蛋');assert.equal(result.items[0].secret,undefined);assert.equal(result.items[0].household_id,undefined);
assert.throws(()=>snapshot(rows,null,new Date()));assert.throws(()=>snapshot(null,{id:'a'},new Date()));
console.log('PASS: snapshot household filter, deletion/quantity filter, field allow-list and failure handling');
