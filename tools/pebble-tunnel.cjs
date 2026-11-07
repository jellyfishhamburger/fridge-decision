// Restricted local CONNECT relay. No device credentials are inspected or logged.
const http=require('node:http'),crypto=require('node:crypto'),fs=require('node:fs'),path=require('node:path');
const config=JSON.parse(fs.readFileSync(path.resolve(__dirname,'../../pebble-content-preview/.local-pebble-tunnel.json'),'utf8'));
const target='blobcadhyoudubcnbdml.supabase.co:443';
const server=http.createServer((req,res)=>{res.writeHead(405);res.end();});
server.on('connect',(req,client,head)=>{
 const provided=Buffer.from(req.headers['proxy-authorization']||''),expected=Buffer.from('Bearer '+config.token);
 if(provided.length!==expected.length||!crypto.timingSafeEqual(provided,expected)){client.end('HTTP/1.1 407 Proxy Authentication Required\r\nConnection: close\r\n\r\n');return;}
 if(req.url!==target){client.end('HTTP/1.1 403 Forbidden\r\n\r\n');return;}
 const upstream=http.request({host:'127.0.0.1',port:10808,method:'CONNECT',path:target});
 upstream.setTimeout(15000,()=>upstream.destroy());
 upstream.on('connect',(response,socket,initial)=>{
  if(response.statusCode!==200){socket.destroy();client.end('HTTP/1.1 502 Bad Gateway\r\n\r\n');return;}
  // CONNECT's establishment timeout must not cut off the subsequent TLS tunnel.
  socket.setTimeout(60000);client.setTimeout(60000);
  socket.on('timeout',()=>socket.destroy());client.on('timeout',()=>client.destroy());
  let sent=0,received=0;const started=Date.now();
  client.on('data',b=>{sent+=b.length;});socket.on('data',b=>{received+=b.length;});
  client.once('close',()=>console.log(JSON.stringify({event:'tunnel_closed',elapsed_ms:Date.now()-started,sent_bytes:sent,received_bytes:received})));
  client.write('HTTP/1.1 200 Connection Established\r\n\r\n');
  if(initial.length)client.write(initial);if(head.length)socket.write(head);
  client.pipe(socket);socket.pipe(client);
  client.on('close',()=>socket.destroy());socket.on('close',()=>client.destroy());
  socket.on('error',()=>client.destroy());client.on('error',()=>socket.destroy());
 });
 upstream.on('error',()=>client.destroy());client.on('error',()=>upstream.destroy());upstream.end();
});
server.headersTimeout=10000;server.maxConnections=4;
server.listen(config.port,config.host,()=>console.log('Restricted test relay ready; only the configured Supabase target is allowed.'));
