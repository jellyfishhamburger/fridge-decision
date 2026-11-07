// Local-only test provisioning. Never print the generated device credential.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'..'),out=path.resolve(root,'../pebble-content-preview');
const endpoint='https://blobcadhyoudubcnbdml.supabase.co/functions/v1/device-api';
const privateFile=path.join(out,'.local-pebble-device.json');
fs.mkdirSync(out,{recursive:true});
let device;
if(fs.existsSync(privateFile))device=JSON.parse(fs.readFileSync(privateFile,'utf8'));
else{
 device={household:crypto.randomUUID(),id:crypto.randomUUID(),session:crypto.randomUUID(),secret:crypto.randomBytes(32).toString('hex'),endpoint};
 fs.writeFileSync(privateFile,JSON.stringify(device,null,2),{flag:'wx'});
}
if(device.endpoint!==endpoint)throw Error('Test endpoint mismatch');
fs.writeFileSync(path.join(out,'pebble-phone-config.json'),JSON.stringify({project_url:new URL(endpoint).origin,device_id:device.id,household_id:device.household},null,2));
const recipe=JSON.parse(fs.readFileSync(path.join(out,'recipes.json'),'utf8')).recipes[0];
const state=require('../pebble-state.js').create(device.session,{id:recipe.id,steps:recipe.steps});
const hash=crypto.createHash('sha256').update(device.secret).digest('hex');
const literal=s=>"'"+s.replaceAll("'","''")+"'";
const sql=`-- fridge-pebble-test ONLY. Independent test family/device, no inventory access.
BEGIN;
DO $$ BEGIN
 IF to_regclass('public.items') IS NOT NULL OR to_regclass('public.pebble_sessions') IS NULL THEN
  RAISE EXCEPTION 'Refusing provisioning: wrong project or test schema missing';
 END IF;
END $$;
INSERT INTO public.households(id,name) VALUES('${device.household}','Cooking Pebble isolated test') ON CONFLICT(id) DO NOTHING;
INSERT INTO public.devices(id,household_id,name,secret_hash) VALUES('${device.id}','${device.household}','Cooking Pebble MD50E test','${hash}') ON CONFLICT(id) DO NOTHING;
INSERT INTO public.pebble_sessions(id,device_id,household_id,state,revision) VALUES('${device.session}','${device.id}','${device.household}',${literal(JSON.stringify(state))}::jsonb,0) ON CONFLICT(device_id) DO NOTHING;
COMMIT;
SELECT name FROM public.devices WHERE id='${device.id}';
`;
fs.writeFileSync(path.join(out,'register-test-device.sql'),sql);
const config=path.join(root,'firmware/CookingPebble/pebble_sync_config.h');
if(!fs.existsSync(config))fs.writeFileSync(config,'#pragma once\n#define PEBBLE_API_URL '+JSON.stringify(endpoint)+'\n#define PEBBLE_DEVICE_ID '+JSON.stringify(device.id)+'\n#define PEBBLE_DEVICE_SECRET '+JSON.stringify(device.secret)+'\n#define PEBBLE_ROOT_CA ""\n');
console.log('Prepared register-test-device.sql and ignored local device configuration; no credential printed.');
