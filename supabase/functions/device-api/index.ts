import '../../../pebble-state.js';
import { makeHandler } from './handler.mjs';

const base = Deno.env.get('SUPABASE_URL');
const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
if (!base || !key) throw new Error('Missing server configuration');
async function rest(path: string, method = 'GET', body?: unknown) {
  const result = await fetch(`${base}/rest/v1/${path}`, {
    method,
    headers: {apikey:key!, authorization:`Bearer ${key}`, 'content-type':'application/json', prefer:'return=representation'},
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  if (!result.ok) throw new Error('Storage unavailable');
  return await result.json();
}
const store = {
  async inventory(household: string) {
    return await rest(`items?household_id=eq.${encodeURIComponent(household)}&deleted_at=is.null&qty=gt.0&select=id,name,qty,unit,life,added_at,days_left&order=added_at.asc,id.asc&limit=500`);
  },
  async device(id: string) {
    return (await rest(`devices?id=eq.${id}&select=id,household_id,secret_hash&limit=1`))[0];
  },
  async session(device: string, household: string) {
    return (await rest(`pebble_sessions?device_id=eq.${device}&household_id=eq.${household}&select=id,state,revision&limit=1`))[0];
  },
  async save(id: string, device: string, household: string, revision: number, state: unknown) {
    return (await rest(`pebble_sessions?id=eq.${id}&device_id=eq.${device}&household_id=eq.${household}&revision=eq.${revision}`, 'PATCH', {state, revision:revision+1, updated_at:new Date().toISOString()}))[0];
  }
};
// Rules are shared verbatim with the local Node tests.
Deno.serve(makeHandler({store,rules:(globalThis as any).PEBBLE_STATE}));
