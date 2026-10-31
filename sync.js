/* ============================================================
   SYNC — the optional backend layer (Supabase).
   Inert by default: with no URL/KEY the app is exactly the static
   prototype it was — localStorage only, zero network calls.

   Two ways to switch it on:
     1) fill the constants below (shared by every device), or
     2) Settings → 云端同步 → paste URL + anon key (per device, wins).
   The anon key is public by design; the service_role key must never
   be used here.
   ============================================================ */
(function (g) {
  "use strict";

  const SUPABASE_URL = "https://zbrvcwxwecorjdzqltxg.supabase.co";
  const SUPABASE_KEY = "sb_publishable_If5WBRuG6b6qacugNXQZVw_FrMpY1o_";  // publishable key: safe in a browser
  const TABLE_ITEMS  = "items";
  const TABLE_LOGS   = "logs";
  const TABLE_HH     = "households";
  const TABLE_PEND   = "pending";
  const LS_CFG       = "fd.sb.v1";

  function cfg() { try { return JSON.parse(localStorage.getItem(LS_CFG) || "{}") || {}; } catch (e) { return {}; } }

  /* 只认 https://xxxx.supabase.co 这一段。
     贴成 https://xxxx.supabase.co/rest/v1/ 是最常见的错 —— 拼起来会变成
     /rest/v1//rest/v1/items，PostgREST 直接回 PGRST125。 */
  function normalizeUrl(u) {
    let s = String(u || "").trim();
    if (!s) return "";
    if (!/^https?:\/\//i.test(s)) s = "https://" + s;
    try {
      const x = new URL(s);
      return x.origin;
    } catch (e) {
      return s.replace(/\/+$/, "").replace(/\/rest\/v1$/i, "");
    }
  }

  function configure(url, key) {
    const c = Object.assign(cfg(), { url: normalizeUrl(url), key: (key || "").trim() });
    localStorage.setItem(LS_CFG, JSON.stringify(c));
    return c;
  }
  const base = () => cfg().url || SUPABASE_URL;
  const anon = () => cfg().key || SUPABASE_KEY;
  const enabled = () => !!(base() && anon());

  function headers(extra) {
    return Object.assign({
      "apikey": anon(),
      "Authorization": "Bearer " + anon(),
      "Content-Type": "application/json"
    }, extra || {});
  }
  const endpoint = (table, q) => base().replace(/\/$/, "") + "/rest/v1/" + table + (q || "");

  /* one row, one household: called before the first add */
  async function ensureHousehold(code) {
    if (!enabled()) return { disabled: true };
    const res = await fetch(endpoint(TABLE_HH), {
      method: "POST",
      headers: headers({ "Prefer": "resolution=merge-duplicates,return=minimal" }),
      body: JSON.stringify({ code: code })
    });
    if (!res.ok) throw new Error("household failed: " + res.status);
    return { ok: true };
  }

  async function ping() {
    if (!enabled()) return { ok: false, reason: "not configured" };
    const res = await fetch(endpoint(TABLE_ITEMS, "?select=id&limit=1"), { headers: headers() });
    return { ok: res.ok, status: res.status, reason: res.ok ? "ok" : (await res.text()).slice(0, 160) };
  }

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

  async function add(code, item) {
    if (!enabled()) return { disabled: true };
    const row = {
      household: code, id: item.id, cat: item.cat, name: item.name, tag: item.tag,
      qty: item.qty == null ? 1 : item.qty, unit: item.unit,
      life: item.life, added_at: item.addedAt, days_left: item.daysLeft,
      by: item.by || null
    };
    const res = await fetch(endpoint(TABLE_ITEMS), {
      method: "POST",
      headers: headers({ "Prefer": "resolution=merge-duplicates,return=minimal" }),
      body: JSON.stringify(row)
    });
    if (!res.ok) throw new Error("add failed: " + res.status + " " + (await res.text()).slice(0, 120));
    return { ok: true };
  }

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

  /* ---- 待确认队列（跨设备）---- */
  async function pullPending(code) {
    if (!enabled()) return { disabled: true };
    const res = await fetch(endpoint(TABLE_PEND,
      "?household=eq." + encodeURIComponent(code) + "&select=*&order=ts.desc&limit=8"), { headers: headers() });
    if (!res.ok) throw new Error("pending pull " + res.status);
    return (await res.json()).map(r => ({
      id: r.id, label: r.label, conf: r.conf, second: r.second, conf2: r.conf2,
      unknown: !!r.unknown, reason: r.reason, thumb: r.thumb, ts: r.ts, from: r.source
    }));
  }

  async function addPendingRow(code, p) {
    if (!enabled()) return { disabled: true };
    const res = await fetch(endpoint(TABLE_PEND), {
      method: "POST",
      headers: headers({ "Prefer": "resolution=merge-duplicates,return=minimal" }),
      body: JSON.stringify({
        id: p.id, household: code, label: p.label, conf: p.conf,
        second: p.second || null, conf2: p.conf2 || null,
        unknown: !!p.unknown, reason: p.reason || null,
        thumb: p.thumb || null, ts: new Date(p.ts || Date.now()).toISOString(),
        source: p.from || "gate"
      })
    });
    if (!res.ok) throw new Error("pending add " + res.status);
    return { ok: true };
  }

  async function delPendingRow(code, id) {
    if (!enabled()) return { disabled: true };
    const res = await fetch(endpoint(TABLE_PEND,
      "?household=eq." + encodeURIComponent(code) + "&id=eq." + encodeURIComponent(id)),
      { method: "DELETE", headers: headers({ "Prefer": "return=minimal" }) });
    if (!res.ok) throw new Error("pending del " + res.status);
    return { ok: true };
  }

  async function log(code, action, recipeId) {
    if (!enabled()) return { disabled: true };
    const res = await fetch(endpoint(TABLE_LOGS), {
      method: "POST", headers: headers({ "Prefer": "return=minimal" }),
      body: JSON.stringify({ household: code, action: action, recipe_id: recipeId || null, at: new Date().toISOString() })
    });
    if (!res.ok) throw new Error("log failed: " + res.status);
    return { ok: true };
  }

  function watch(code, onItems, ms) {
    if (!enabled()) return () => {};
    let alive = true;
    const tick = async () => {
      if (!alive) return;
      try { onItems(await pull(code)); } catch (e) {}
      setTimeout(tick, ms || 5000);
    };
    tick();
    return () => { alive = false; };
  }

  g.SYNC = { enabled, configure, cfg, ensureHousehold, ping, pull, add, update, remove, log, watch,
             pullPending, addPendingRow, delPendingRow };
})(window);
