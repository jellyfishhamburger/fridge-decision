/* Opt-in phone API. Not loaded by production pages until migrations are deployed.
 * Device secret is returned once in memory, never stored in localStorage. */
(function(g) {
  'use strict';
  function auth() {
    if (!g.AUTH || !g.AUTH.signedIn()) throw Error('请先登录');
    return g.AUTH;
  }
  const hex = bytes => Array.from(bytes,n=>n.toString(16).padStart(2,'0')).join('');
  async function register(household, name='Cooking Pebble') {
    const client=auth();
    const secret=hex(g.crypto.getRandomValues(new Uint8Array(32)));
    const secretHash=hex(new Uint8Array(await g.crypto.subtle.digest('SHA-256',new TextEncoder().encode(secret))));
    const device=await client.rpc('pebble_register',{p_household:household,p_name:name,p_secret_hash:secretHash});
    return {device_id:device,device_secret:secret};
  }
  async function start(device,recipeId,steps) {
    return auth().rpc('pebble_start',{p_device:device,p_recipe:recipeId,p_steps:steps});
  }
  async function read(device) { return auth().rpc('pebble_read',{p_device:device}); }
  async function action(device,state,type,step=null) {
    return auth().rpc('pebble_action',{p_device:device,p_session:state.id,p_revision:state.revision,p_action:type,p_step:step});
  }
  g.PEBBLE_PHONE={register,start,read,action};
})(typeof window !== 'undefined' ? window : globalThis);
