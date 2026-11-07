// Dependency-injected handler: the same code can be tested without cloud access.
export function makeHandler({store, rules, cryptoApi = globalThis.crypto}) {
  const reply = (status, body) => new Response(JSON.stringify(body), {status, headers:{'content-type':'application/json','cache-control':'no-store'}});
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  return async request => {
    try {
      const url = new URL(request.url), path = url.pathname.split('/').pop();
      if (!['state','action','inventory'].includes(path)) return reply(404,{error:'not_found'});
      if ((['state','inventory'].includes(path) && request.method !== 'GET') || (path === 'action' && request.method !== 'POST')) return reply(405,{error:'method_not_allowed'});
      const id = url.searchParams.get('device_id'), secret = request.headers.get('x-device-secret');
      if (!uuid.test(id || '') || !/^[0-9a-f]{64}$/i.test(secret || '')) return reply(401,{error:'unauthorized'});
      const device = await store.device(id);
      const digest = await cryptoApi.subtle.digest('SHA-256',new TextEncoder().encode(secret));
      const hash = Array.from(new Uint8Array(digest),n=>n.toString(16).padStart(2,'0')).join('');
      let mismatch = 0;
      const expected = device?.secret_hash || '0'.repeat(64);
      for (let i=0;i<64;i++) mismatch |= hash.charCodeAt(i) ^ expected.charCodeAt(i);
      if (!device?.household_id || expected.length !== 64 || mismatch) return reply(401,{error:'unauthorized'});
      if (path === 'inventory') {
        const items = await store.inventory(device.household_id);
        // Explicit allow-list; never expose owner IDs, notes or arbitrary DB columns.
        return reply(200,{schema_version:1,generated_at:new Date().toISOString(),items:items.map(item=>({
          id:item.id,name:item.name,qty:item.qty,unit:item.unit,
          life:item.life,added_at:item.added_at,days_left:item.days_left
        }))});
      }
      const row = await store.session(id,device.household_id);
      if (!row) return reply(200,{state:null});
      if (path === 'state') return reply(200,{state:row.state,revision:row.revision,server_time:Date.now()});
      const declared = request.headers.get('content-length');
      if (declared && Number(declared)>2048) return reply(413,{error:'body_too_large'});
      const reader=request.body?.getReader();
      const decoder=new TextDecoder('utf-8',{fatal:true});
      let text='',bytes=0;
      try {
        if(reader) for(;;){
          const part=await reader.read();if(part.done)break;
          bytes+=part.value.byteLength;
          if(bytes>2048){await reader.cancel().catch(()=>{});return reply(413,{error:'body_too_large'});}
          text+=decoder.decode(part.value,{stream:true});
        }
        text+=decoder.decode();
      }catch{return reply(400,{error:'invalid_body'});}
      finally{reader?.releaseLock();}
      let command;
      try { command=JSON.parse(text); } catch { return reply(400,{error:'invalid_json'}); }
      let next;
      try { next=rules.apply(row.state,command); }
      catch(e) { return reply(e.message === 'Stale revision' ? 409 : 400,{error:e.message}); }
      // Atomic compare-and-swap: only one request can consume a revision.
      const saved = await store.save(row.id,id,device.household_id,row.revision,next);
      if (!saved) return reply(409,{error:'stale_revision'});
      return reply(200,{state:next,revision:next.revision,server_time:Date.now()});
    } catch { return reply(503,{error:'temporarily_unavailable'}); }
  };
}
