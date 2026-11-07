// Executes migrations 013-015 in an isolated embedded PostgreSQL.
// Supabase's auth.uid is simulated; no production credentials or network calls.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL,fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import rules from '../pebble-state.js';
import {makeHandler} from '../supabase/functions/device-api/handler.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const modulePath=process.env.PGLITE_MODULE || path.resolve(root,'../local-db-validation/node_modules/@electric-sql/pglite/dist/index.js');
const {PGlite}=await import(pathToFileURL(modulePath));
const db=new PGlite();
const homeA='11111111-1111-4111-8111-111111111111',homeB='22222222-2222-4222-8222-222222222222';
const userA='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',userB='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const secret='c'.repeat(64),hash=createHash('sha256').update(secret).digest('hex');
async function role(name,user,fn){
  await db.exec(`set role ${name}`);
  await db.query("select set_config('request.jwt.claim.sub',$1,false)",[user||'']);
  try{return await fn();}finally{await db.exec('reset role');}
}
const query=async(sql,args=[]) => (await db.query(sql,args)).rows;
const rpc=async(name,args)=> (await query(`select public.${name}(${args.map((_,i)=>'$'+(i+1)).join(',')}) as value`,args))[0].value;
try{
  await db.exec(`
    create role anon; create role authenticated; create role service_role bypassrls;
    create schema auth;
    create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
    grant usage on schema auth to authenticated,anon;
    grant execute on function auth.uid() to authenticated,anon;
    create table households(id uuid primary key);
    create table household_members(household_id uuid references households(id),user_id uuid,primary key(household_id,user_id));
    create table devices(id uuid primary key default gen_random_uuid(),household_id uuid references households(id),name text,secret_hash text not null);
    grant select on devices to service_role;
    insert into households values('${homeA}'),('${homeB}');
    insert into household_members values('${homeA}','${userA}'),('${homeB}','${userB}');
  `);
  for(const file of ['013_pebble_sessions.sql','014_pebble_phone.sql','015_pebble_phone_action.sql'])await db.exec(fs.readFileSync(path.join(root,'migrations',file),'utf8'));
  await role('anon',null,async()=>{
    await assert.rejects(rpc('pebble_register',[homeA,'knob','a'.repeat(64)]),/permission denied/);
    await assert.rejects(query('select * from pebble_sessions'),/permission denied/);
  });
  let device;
  await role('authenticated',userA,async()=>{
    await assert.rejects(rpc('pebble_register',[homeB,'knob','a'.repeat(64)]),/not authorized/);
    device=await rpc('pebble_register',[homeA,'knob',hash]);
    await assert.rejects(query('select * from pebble_sessions'),/permission denied/);
  });
  await role('authenticated',userB,async()=>{
    await assert.rejects(rpc('pebble_read',[device]),/not authorized/);
    await assert.rejects(rpc('pebble_start',[device,'recipe',JSON.stringify([{text:'x',seconds:30}])]),/not authorized/);
  });
  await role('authenticated',userA,async()=>{
    await assert.rejects(rpc('pebble_start',[device,'recipe',JSON.stringify([{text:'x',seconds:-1}])]),/invalid duration/);
    let s=await rpc('pebble_start',[device,'recipe',JSON.stringify([{text:'翻炒',seconds:30},{text:'出锅',seconds:0}])]);
    assert.equal(s.step_index,0);assert.equal(s.remaining_ms,30000);
    await assert.rejects(rpc('pebble_action',[device,s.id,null,'toggle_timer',null]),/stale revision/);
    s=await rpc('pebble_action',[device,s.id,0,'toggle_timer',null]);
    assert.equal(typeof s.timer_ends_at,'number');
    await assert.rejects(rpc('pebble_action',[device,s.id,0,'toggle_timer',null]),/stale revision/);
    s=await rpc('pebble_action',[device,s.id,1,'toggle_timer',null]);
    assert.equal(s.timer_ends_at,null);assert.ok(s.remaining_ms>0 && s.remaining_ms<=30000);
    s=await rpc('pebble_action',[device,s.id,2,'set_step',1]);
    assert.equal(s.step_index,1);assert.equal(s.remaining_ms,0);
    await assert.rejects(rpc('pebble_action',[device,s.id,3,'set_step',2]),/invalid step/);
    s=await rpc('pebble_action',[device,s.id,3,'exit',null]);assert.equal(s.status,'exited');
    await assert.rejects(rpc('pebble_action',[device,s.id,4,'toggle_timer',null]),/session ended/);
    const next=await rpc('pebble_start',[device,'next',JSON.stringify([{text:'x',seconds:10}])]);
    assert.notEqual(next.id,s.id);
    await assert.rejects(rpc('pebble_action',[device,s.id,0,'exit',null]),/stale revision/);
    assert.equal((await rpc('pebble_read',[device])).id,next.id);
  });
  await role('service_role',null,async()=>{
    assert.equal((await query('select * from pebble_sessions')).length,1);
    // PostgREST PATCH equivalent: the second request cannot consume the same revision.
    const a=await query('update pebble_sessions set revision=revision+1 where device_id=$1 and revision=0 returning id',[device]);
    const b=await query('update pebble_sessions set revision=revision+1 where device_id=$1 and revision=0 returning id',[device]);
    assert.equal(a.length,1);assert.equal(b.length,0);
  });
  let phoneState=await role('authenticated',userA,()=>rpc('pebble_start',[device,'integration',JSON.stringify([{text:'打散鸡蛋',seconds:30},{text:'倒入锅中',seconds:15}])]));
  const handler=makeHandler({rules,store:{
    device:id=>role('service_role',null,async()=>(await query('select id,household_id,secret_hash from devices where id=$1',[id]))[0]),
    session:(id,home)=>role('service_role',null,async()=>(await query('select id,state,revision from pebble_sessions where device_id=$1 and household_id=$2',[id,home]))[0]),
    save:(id,dev,home,revision,state)=>role('service_role',null,async()=>(await query('update pebble_sessions set state=$1,revision=$2 where id=$3 and device_id=$4 and household_id=$5 and revision=$6 returning id',[JSON.stringify(state),state.revision,id,dev,home,revision]))[0])
  }});
  const request=(endpoint,body,credential=secret)=>new Request('https://local.test/device-api/'+endpoint+'?device_id='+device,{method:body?'POST':'GET',headers:{'x-device-secret':credential},body:body?JSON.stringify(body):undefined});
  assert.equal((await handler(request('state',undefined,'d'.repeat(64)))).status,401);
  const fetched=await (await handler(request('state'))).json();assert.equal(fetched.state.id,phoneState.id);
  let response=await handler(request('action',{session_id:phoneState.id,revision:0,action:'set_step',step_index:1}));
  assert.equal(response.status,200);
  phoneState=await role('authenticated',userA,()=>rpc('pebble_read',[device]));
  assert.equal(phoneState.step_index,1);assert.equal(phoneState.remaining_ms,15000);
  response=await handler(request('action',{session_id:phoneState.id,revision:0,action:'toggle_timer'}));assert.equal(response.status,409);
  response=await handler(request('action',{session_id:phoneState.id,revision:1,action:'exit'}));assert.equal(response.status,200);
  phoneState=await role('authenticated',userA,()=>rpc('pebble_read',[device]));assert.equal(phoneState.status,'exited');
  console.log('PASS: real PostgreSQL execution of migrations 013-015, role grants, household isolation, timer actions, stale revisions, replacement sessions and conditional update');
  console.log('PASS: phone SQL RPC -> device API handler -> authenticated device action -> phone SQL read-back, using the real embedded database');
  console.log('LIMIT: embedded engine uses one connection; true multi-connection contention and Supabase JWT/PostgREST integration remain untested.');
}finally{await db.close();}
