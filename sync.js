/* ============================================================
   SYNC — the optional backend layer.
   Inert by default: with URL/KEY empty every function returns
   "disabled" and the app keeps using localStorage exactly as before.

   Fill these two strings (Supabase → Project Settings → API) and the
   same four calls start talking to Postgres over plain fetch — no SDK,
   no server code, no build step.
   ============================================================ */
(function (g) {
  "use strict";

  const SUPABASE_URL = "";        // e.g. "https://abcdefgh.supabase.co"
  const SUPABASE_KEY = "";        // the "anon public" key, safe in a browser
  const TABLE_ITEMS  = "items";
  const TABLE_LOGS   = "logs";

  const enabled = () => !!(SUPABASE_URL && SUPABASE_KEY);

  function headers(extra) {
    return Object.assign({
      "apikey": SUPABASE_KEY,
      "Authorization": "Bearer " + SUPABASE_KEY,
      "Content-Type": "application/json"
    }, extra || {});
  }

  function endpoint(table, query) {
    return SUPABASE_URL.replace(/\/$/, "") + "/rest/v1/" + table + (query || "");
  }

  /* pull every item of one household */
  async function pull(code) {
    if (!enabled()) return { disabled: true };
    const res = await fetch(endpoint(TABLE_ITEMS, "?household=eq." + encodeURIComponent(code) + "&select=*"), { headers: headers() });
    if (!res.ok) throw new Error("pull failed: " + res.status);
    return (await res.json()).map(row => ({
      id: row.id, cat: row.cat, name: row.name, tag: row.tag,
      qty: row.qty, unit: row.unit, life: row.life,
      addedAt: row.added_at, daysLeft: row.days_left, by: row.by
    }));
  }

  /* add one item (the gate or the + button) */
  async function add(code, item) {
    if (!enabled()) return { disabled: true };
    const row = {
      household: code, id: item.id, cat: item.cat, name: item.name, tag: item.tag,
      qty: item.qty == null ? 1 : item.qty, unit: item.unit,
      life: item.life, added_at: item.addedAt, days_left: item.daysLeft,
      by: item.by || null
    };
    const res = await fetch(endpoint(TABLE_ITEMS), {
      method: "POST", headers: headers({ "Prefer": "return=minimal" }), body: JSON.stringify(row)
    });
    if (!res.ok) throw new Error("add failed: " + res.status + " " + (await res.text()));
    return { ok: true };
  }

  /* update quantity after cooking, or delete at zero */
  async function update(code, id, patch) {
    if (!enabled()) return { disabled: true };
    const res = await fetch(endpoint(TABLE_ITEMS, "?household=eq." + encodeURIComponent(code) + "&id=eq." + encodeURIComponent(id)), {
      method: "PATCH", headers: headers({ "Prefer": "return=minimal" }), body: JSON.stringify(patch)
    });
    if (!res.ok) throw new Error("update failed: " + res.status);
    return { ok: true };
  }

  async function remove(code, id) {
    if (!enabled()) return { disabled: true };
    const res = await fetch(endpoint(TABLE_ITEMS, "?household=eq." + encodeURIComponent(code) + "&id=eq." + encodeURIComponent(id)), {
      method: "DELETE", headers: headers({ "Prefer": "return=minimal" })
    });
    if (!res.ok) throw new Error("delete failed: " + res.status);
    return { ok: true };
  }

  /* the take/skip log is the evidence — it needs the server to be pooled */
  async function log(code, action, recipeId) {
    if (!enabled()) return { disabled: true };
    const res = await fetch(endpoint(TABLE_LOGS), {
      method: "POST", headers: headers({ "Prefer": "return=minimal" }),
      body: JSON.stringify({ household: code, action: action, recipe_id: recipeId, at: new Date().toISOString() })
    });
    if (!res.ok) throw new Error("log failed: " + res.status);
    return { ok: true };
  }

  /* light polling: the panel and other phones refresh every N seconds */
  function watch(code, onItems, ms) {
    if (!enabled()) return () => {};
    let alive = true;
    const tick = async () => {
      if (!alive) return;
      try { onItems(await pull(code)); } catch (e) { /* keep quiet, retry next tick */ }
      setTimeout(tick, ms || 5000);
    };
    tick();
    return () => { alive = false; };
  }

  g.SYNC = { enabled, pull, add, update, remove, log, watch, SUPABASE_URL, SUPABASE_KEY };
})(window);
