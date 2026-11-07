const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict'),path=require('node:path');
const fields=new Map(),calls=[];
function element(id){if(!fields.has(id))fields.set(id,{value:'',hidden:false,disabled:false,textContent:'',files:[],append(){}});return fields.get(id);}
const user='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const context={document:{getElementById:element,createElement:()=>({})},console,URL,AbortSignal,TextEncoder,atob:s=>Buffer.from(s,'base64').toString(),setInterval(){},setTimeout(){return 1;},clearTimeout(){},
 FD_DATA:{recipes:[{id:'test',name:'测试',steps:['打散鸡蛋，翻炒15秒']}]},
 PEBBLE_STEPS:require('../pebble-steps.js'),PEBBLE_PHONE:{read:async()=>null},
 fetch:async(url,options)=>{calls.push({url,options});return {ok:true,json:async()=>({access_token:'test-session-token',user:{id:user}})};}
};
context.window=context;vm.createContext(context);vm.runInContext(fs.readFileSync(path.join(__dirname,'../pebble-test.js'),'utf8'),context);
(async()=>{
 assert.equal(element('start').disabled,true);
 element('key').value='sb_secret_forbidden';await element('sign-in').onclick();assert.equal(calls.length,0);
 element('key').value='sb_publishable_test';element('email').value='test@example.invalid';element('password').value='test-only-password';
 await element('sign-in').onclick();assert.equal(element('password').value,'');assert.equal(calls[0].options.headers.Authorization,undefined);
 assert.equal(new URL(calls[0].url).hostname,'blobcadhyoudubcnbdml.supabase.co');
 const config={project_url:'https://blobcadhyoudubcnbdml.supabase.co',device_id:'11111111-1111-4111-8111-111111111111',household_id:'22222222-2222-4222-8222-222222222222'};
 element('config').files=[{size:200,text:async()=>JSON.stringify(config)}];await element('config').onchange();assert.equal(element('start').disabled,false);
 assert.ok(element('membership-sql').value.includes(user));assert.ok(!element('membership-sql').value.includes('test-session-token'));
 element('sign-out').onclick();assert.equal(element('start').disabled,true);assert.equal(context.AUTH.signedIn(),false);assert.equal(element('key').value,'');
 console.log('PASS: test console login gate, service-key rejection, fixed HTTPS auth destination, password clearing, public configuration, membership SQL and in-memory logout');
})().catch(e=>{console.error(e);process.exitCode=1;});
