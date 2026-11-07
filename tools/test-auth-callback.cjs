const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict'),path=require('node:path');
const script=fs.readFileSync(path.join(__dirname,'../auth.js'),'utf8');
function run(pathname,hash){let redirected=null;const c={window:null,location:{pathname,hash,replace:v=>redirected=v},localStorage:{getItem:()=>null,setItem(){},removeItem(){}},history:{replaceState(){}}};c.window=c;vm.createContext(c);vm.runInContext(script,c);return redirected;}
assert.equal(run('/fridge-decision/settings.html','#access_token=test&refresh_token=test'),'account.html#access_token=test&refresh_token=test');
assert.equal(run('/fridge-decision/','#error_description=expired'),'account.html#error_description=expired');
assert.equal(run('/fridge-decision/account.html','#access_token=test'),null);
assert.equal(run('/fridge-decision/index.html','#fridge'),null);
assert.equal(run('/fridge-decision/settings.html',''),null);
console.log('PASS: email callback recovery from settings/root, errors preserved, no account redirect loop, ordinary navigation unchanged');
