const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict'),path=require('node:path');
const root=path.resolve(__dirname,'..');
function load(saved,session){
 const mem=new Map();if(saved!==undefined)mem.set('fd.sb.v1',saved);if(session)mem.set('fd.auth.v1',JSON.stringify(session));
 const c={window:null,URL,localStorage:{getItem:k=>mem.get(k)||null,setItem:(k,v)=>mem.set(k,v),removeItem:k=>mem.delete(k)},fetch:()=>{throw Error('Unexpected network call');}};
 c.window=c;vm.createContext(c);for(const f of ['sync.js','auth.js'])vm.runInContext(fs.readFileSync(path.join(root,f),'utf8'),c);return c;
}
for(const saved of [undefined,'{}','null','[]','invalid','{"url":"","key":""}']){
 const c=load(saved,{access_token:'existing-session',user_id:'user'});
 assert.equal(c.SYNC.enabled(),true);assert.equal(c.AUTH.configured(),true);assert.equal(c.AUTH.signedIn(),true);
 assert.match(c.SYNC.cfg().url,/^https:\/\/.+\.supabase\.co$/);assert(c.SYNC.cfg().key);
}
let c=load(JSON.stringify({url:'https://other.supabase.co/rest/v1/',key:' custom '}));
assert.equal(c.SYNC.cfg().url,'https://other.supabase.co');assert.equal(c.SYNC.cfg().key,'custom');assert.equal(c.AUTH.configured(),true);
c=load(JSON.stringify({url:'https://other.supabase.co',key:''}));assert.equal(c.SYNC.enabled(),false);assert.equal(c.AUTH.configured(),false);assert.equal(c.SYNC.cfg().key,'');
console.log('PASS: default config shared by auth/sync, existing login preserved, malformed storage recovery, normalized overrides, no cross-project key fallback');
