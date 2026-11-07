const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),tls=require('node:tls'),assert=require('node:assert/strict');
const c=JSON.parse(fs.readFileSync(path.resolve(__dirname,'../../pebble-content-preview/.local-pebble-tunnel.json'),'utf8'));
const host='blobcadhyoudubcnbdml.supabase.co';
function tunnel(target,token){return new Promise((resolve,reject)=>{
 const r=http.request({host:c.host,port:c.port,method:'CONNECT',path:target,headers:{'Proxy-Authorization':'Bearer '+token}});
 r.setTimeout(20000,()=>r.destroy(Error('Tunnel timeout')));r.on('error',reject);r.on('connect',(response,socket)=>resolve({code:response.statusCode,socket}));r.end();
});}
(async()=>{
 let r=await tunnel(host+':443','invalid');assert.equal(r.code,407);r.socket.destroy();
 r=await tunnel('example.com:443',c.token);assert.equal(r.code,403);r.socket.destroy();
 r=await tunnel(host+':443',c.token);assert.equal(r.code,200);
 await new Promise((resolve,reject)=>{
  const s=tls.connect({socket:r.socket,servername:host,rejectUnauthorized:true});let data='';
  s.setTimeout(20000,()=>s.destroy(Error('TLS timeout')));s.on('error',reject);
  s.on('secureConnect',()=>{assert.equal(s.authorized,true);s.write('GET /functions/v1/device-api/state HTTP/1.1\r\nHost: '+host+'\r\nConnection: close\r\n\r\n');});
  s.on('data',b=>{data+=b.toString();if(data.length>20000)s.destroy(Error('Unexpected response size'));});
  s.on('end',()=>{try{assert.match(data,/^HTTP\/1\.[01] 401/);resolve();}catch(e){reject(e);}});
 });
 console.log('PASS: missing proxy token rejected, wrong target rejected, end-to-end TLS verified, unauthenticated device API rejected');
})().catch(e=>{console.error(e.message);process.exitCode=1;});
