import {makeFrameHandler} from './handler.mjs';
const base=Deno.env.get('SUPABASE_URL'),key=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
if(!base||!key)throw Error('Missing server configuration');
async function rest(path:string){const r=await fetch(`${base}/rest/v1/${path}`,{headers:{apikey:key!,authorization:`Bearer ${key}`}});if(!r.ok)throw Error('Storage unavailable');return r.json();}
Deno.serve(makeFrameHandler({store:{
 async device(id:string){return (await rest(`devices?id=eq.${id}&select=household_id,secret_hash&limit=1`))[0];},
 async inventory(home:string){return rest(`items?household_id=eq.${encodeURIComponent(home)}&deleted_at=is.null&qty=gt.0&select=cat,name,qty,life,added_at,days_left&order=added_at.asc,id.asc&limit=500`);}
}}));
