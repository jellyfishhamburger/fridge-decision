const assert=require('node:assert/strict');
global.crypto=require('node:crypto').webcrypto;
require('../pebble-phone.js');
(async()=>{
  await assert.rejects(PEBBLE_PHONE.read('device'),/登录/);
  const calls=[];
  global.AUTH={signedIn:()=>true,rpc:async(name,args)=>{calls.push({name,args});return 'device';}};
  const registration=await PEBBLE_PHONE.register('home');
  assert.match(registration.device_secret,/^[a-f0-9]{64}$/);
  assert.equal(calls[0].args.p_secret_hash,require('node:crypto').createHash('sha256').update(registration.device_secret).digest('hex'));
  assert.ok(!JSON.stringify(calls).includes(registration.device_secret));
  await PEBBLE_PHONE.start('device','recipe',[{text:'test',seconds:10}]);
  await PEBBLE_PHONE.read('device');
  assert.deepEqual(calls.map(c=>c.name),['pebble_register','pebble_start','pebble_read']);
  console.log('PASS: login gate, random device credential, hashed registration, phone session RPC routing');
})().catch(e=>{console.error(e);process.exitCode=1;});
