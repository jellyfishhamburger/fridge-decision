import {renderFrame} from './render.mjs';
export function makeFrameHandler({store,cryptoApi=globalThis.crypto,now=Date.now}){
 const error=(status,message)=>new Response(JSON.stringify({error:message}),{status,headers:{'content-type':'application/json','cache-control':'no-store'}});
 return async request=>{
  try{
   if(request.method!=='GET')return error(405,'method_not_allowed');
   const url=new URL(request.url),id=url.searchParams.get('device_id'),secret=request.headers.get('x-device-secret');
   if(!/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(id||'')||!/^[0-9a-f]{64}$/i.test(secret||''))return error(401,'unauthorized');
   const device=await store.device(id);
   const digest=await cryptoApi.subtle.digest('SHA-256',new TextEncoder().encode(secret));
   const hash=Array.from(new Uint8Array(digest),v=>v.toString(16).padStart(2,'0')).join('');
   const expected=device?.secret_hash||'0'.repeat(64);let mismatch=expected.length^64;
   for(let i=0;i<64;i++)mismatch|=hash.charCodeAt(i)^(expected.charCodeAt(i)||0);
   if(!device?.household_id||mismatch)return error(401,'unauthorized');
   const items=await store.inventory(device.household_id),bytes=renderFrame(items,now());
   const sum=await cryptoApi.subtle.digest('SHA-256',bytes);
   const sha=Array.from(new Uint8Array(sum),v=>v.toString(16).padStart(2,'0')).join('');
   const headers={'content-type':'application/octet-stream','cache-control':'private, no-cache','etag':'"'+sha+'"','x-frame-sha256':sha,'x-frame-format':'400x300-msb-black1-v1'};
   if(request.headers.get('if-none-match')===headers.etag)return new Response(null,{status:304,headers});
   return new Response(bytes,{headers:{...headers,'content-length':'15000'}});
  }catch{return error(503,'temporarily_unavailable');}
 };
}
