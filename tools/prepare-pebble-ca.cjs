// Retrieve the verified TLS chain through the existing local proxy.
// Only public certificates are printed/saved; the local device secret is not logged.
const http=require('node:http'),tls=require('node:tls'),fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..'),out=path.resolve(root,'../pebble-content-preview');
const d=JSON.parse(fs.readFileSync(path.join(out,'.local-pebble-device.json'),'utf8'));
const host=new URL(d.endpoint).hostname;
if(host!=='blobcadhyoudubcnbdml.supabase.co')throw Error('Unexpected test hostname');
const request=http.request({host:'127.0.0.1',port:10808,method:'CONNECT',path:host+':443'});
request.setTimeout(20000,()=>request.destroy(Error('Proxy timeout')));
request.on('connect',(response,socket)=>{
 if(response.statusCode!==200){socket.destroy();throw Error('Proxy connection failed');}
 const connection=tls.connect({socket,servername:host,rejectUnauthorized:true});
 connection.setTimeout(20000,()=>connection.destroy(Error('TLS timeout')));
 connection.on('secureConnect',()=>{
  if(!connection.authorized)throw Error('TLS verification failed');
  let certificate=connection.getPeerCertificate(true);const seen=new Set();
  while(certificate.issuerCertificate && !seen.has(certificate.fingerprint256)){
   seen.add(certificate.fingerprint256);
   if(certificate.issuerCertificate.fingerprint256===certificate.fingerprint256)break;
   certificate=certificate.issuerCertificate;
  }
  if(!certificate.raw)throw Error('Certificate chain not available');
  const {X509Certificate}=require('node:crypto');
  const last=new X509Certificate(certificate.raw);
  const pem=tls.rootCertificates.find(c=>{
   const candidate=new X509Certificate(c);
   return candidate.fingerprint256===last.fingerprint256 ||
    (candidate.subject===last.subject && candidate.publicKey.export({type:'spki',format:'der'}).equals(last.publicKey.export({type:'spki',format:'der'}))) ||
    (last.issuer===candidate.subject && last.verify(candidate.publicKey));
  });
  if(!pem){console.log(JSON.stringify({subject:last.subject,issuer:last.issuer,roots:tls.rootCertificates.length,chainLength:seen.size}));throw Error('No matching root in Node trusted collection');}
  fs.writeFileSync(path.join(out,'device-api-root.pem'),pem);
  const config=path.join(root,'firmware/CookingPebble/pebble_sync_config.h');
  const text=fs.readFileSync(config,'utf8');
  if(!/^#define PEBBLE_ROOT_CA .*$/m.test(text))throw Error('Missing certificate configuration');
  fs.writeFileSync(config,text.replace(/^#define PEBBLE_ROOT_CA .*$/m,()=> '#define PEBBLE_ROOT_CA '+JSON.stringify(pem)));
  console.log('Verified TLS root: '+new X509Certificate(pem).subject+'. Updated ignored local configuration.');
  connection.end();
 });
 connection.on('error',e=>{console.error(e.message);process.exitCode=1;});
});
request.on('error',e=>{console.error(e.message);process.exitCode=1;});request.end();
