const http=require('node:http'),tls=require('node:tls'),fs=require('node:fs'),crypto=require('node:crypto');
const host='zbrvcwxwecorjdzqltxg.supabase.co';
const request=http.request({host:'127.0.0.1',port:10808,method:'CONNECT',path:host+':443'});request.setTimeout(20000,()=>request.destroy(Error('Proxy timeout')));
request.on('connect',(r,socket)=>{if(r.statusCode!==200)throw Error('Proxy connection failed');
 const connection=tls.connect({socket,servername:host,rejectUnauthorized:true});connection.setTimeout(20000,()=>connection.destroy(Error('TLS timeout')));
 connection.on('secureConnect',()=>{if(!connection.authorized)throw Error('Unverified TLS');let certificate=connection.getPeerCertificate(true);const seen=new Set();while(certificate.issuerCertificate&&!seen.has(certificate.fingerprint256)){seen.add(certificate.fingerprint256);if(certificate.issuerCertificate.fingerprint256===certificate.fingerprint256)break;certificate=certificate.issuerCertificate;}
 const last=new crypto.X509Certificate(certificate.raw);const root=tls.rootCertificates.find(pem=>{const c=new crypto.X509Certificate(pem);return c.fingerprint256===last.fingerprint256||(c.subject===last.subject&&c.publicKey.export({type:'spki',format:'der'}).equals(last.publicKey.export({type:'spki',format:'der'})))});
 if(!root)throw Error('Trusted root not found');fs.mkdirSync('fridge-private',{recursive:true});fs.writeFileSync('fridge-private/root-ca.pem',root);connection.end();console.log('Saved verified public TLS root certificate');
 });connection.on('error',e=>{console.error(e.message);process.exitCode=1;});});request.on('error',e=>{console.error(e.message);process.exitCode=1;});request.end();
