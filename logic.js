/* ============================================================
   Shared logic: the decision rule, dates, pantry, household.
   Load order on every page:  data.js -> icons.js -> logic.js
   ============================================================ */
(function (global) {
  "use strict";

  const DB = global.FD_DATA;
  if (!DB) throw new Error("data.js must load before logic.js");

  const CATALOG  = DB.foods;
  const RECIPES  = DB.recipes;
  const PANTRY   = DB.pantry || [];
  const byId = {}; CATALOG.forEach(f => byId[f.id] = f);
  const pantryById = {}; PANTRY.forEach(p => pantryById[p.id] = p);

  const LS_ITEMS     = "fd.items.v1";
  const LS_SETTINGS  = "fd.settings.v1";
  const LS_LOG       = "fd.log.v1";
  const LS_PANTRY    = "fd.pantry.v1";
  const LS_HOUSEHOLD = "fd.household.v1";

  const DEFAULT_SETTINGS = {
    screens: [0, 1, 2],
    rotMs: 6000,
    auto: true,
    greensPerDay: 1,
    maxMinutes: 20
  };

  const read  = (k, d) => { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (e) { return d; } };
  const write = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch (e) { return false; } };

  /* ---------- settings ---------- */
  const settings     = () => Object.assign({}, DEFAULT_SETTINGS, read(LS_SETTINGS, {}) || {});
  const saveSettings = patch => { const n = Object.assign(settings(), patch || {}); write(LS_SETTINGS, n); return n; };

  /* ---------- pantry: what is already in the cupboard ----------
     Condiments are not fridge contents, so they get their own checklist.
     This is what lets the product say "you only need to buy one thing". */
  const pantry   = () => { const v = read(LS_PANTRY, null); return Array.isArray(v) ? v : ["salt", "oil", "soy", "garlic"]; };
  const savePantry = list => write(LS_PANTRY, list);

  /* ---------- household: one panel, several phones ---------- */
  function newCode() {
    const A = "ACDEFGHJKLMNPQRSTUVWXYZ23456789";
    let s = "";
    for (let i = 0; i < 6; i++) s += A[Math.floor(Math.random() * A.length)];
    return s;
  }
  const household = () => Object.assign({ code: null, panel: false, members: [] }, read(LS_HOUSEHOLD, {}) || {});
  function saveHousehold(patch) {
    const n = Object.assign(household(), patch || {});
    write(LS_HOUSEHOLD, n);
    return n;
  }

  /* ---------- dates ---------- */
  function localDate(d) {
    const x = d || new Date();
    const p = n => String(n).padStart(2, "0");
    return `${x.getFullYear()}-${p(x.getMonth() + 1)}-${p(x.getDate())}`;
  }
  function daysLeftOf(it) {
    if (it && it.addedAt && typeof it.life === "number") {
      const added = new Date(it.addedAt + "T00:00:00");
      if (!isNaN(added)) {
        const elapsed = Math.floor((Date.now() - added.getTime()) / 86400000);
        return Math.max(0, it.life - elapsed);
      }
    }
    return typeof it.daysLeft === "number" ? it.daysLeft : 0;
  }

  /* ---------- the rule ----------
     A dish is:
       ready        every ingredient is in the fridge
       shop1        exactly one fridge ingredient is missing -> "buy one thing"
       blocked      two or more missing, or it needs something exotic
     Ranking: what dies soonest wins, greens get a lift, slow recipes sink,
     and anything you cannot cook right now sinks hard. */
  function evaluate(recipe, items, st, pantrySet) {
    st = st || settings();
    const pantryHave = new Set(pantrySet || pantry());
    const byCat = {};
    items.forEach(i => { (byCat[i.cat] = byCat[i.cat] || []).push(i); });

    const used = [], missing = [];
    for (const need of recipe.needs) {
      const list = byCat[need];
      if (list && list.length) used.push(list.slice().sort((a, b) => daysLeftOf(a) - daysLeftOf(b))[0]);
      else missing.push(need);
    }

    const status = missing.length === 0 ? "ready" : (missing.length === 1 ? "shop1" : "blocked");
    const urgency = used.reduce((s, i) => s + Math.max(0, 8 - daysLeftOf(i)) * 0.9, 0);
    const greensBonus = (recipe.greens && st.greensPerDay > 0) ? 4 : 0;
    const timePenalty = Math.max(0, recipe.minutes - st.maxMinutes) * 1.2;
    const gapPenalty = missing.length ? 10 * missing.length : 0;

    const pantryMissing = (recipe.pantry || []).filter(p => !pantryHave.has(p));

    return {
      recipe, status, used, missing, pantryMissing,
      score: urgency + greensBonus - timePenalty - gapPenalty,
      urgency, greensBonus, timePenalty
    };
  }

  function decide(items, st) {
    return RECIPES.map(r => evaluate(r, items, st)).sort((a, b) => b.score - a.score);
  }

  function urgent(items, limit) {
    return items.slice().sort((a, b) => daysLeftOf(a) - daysLeftOf(b)).slice(0, limit || 3);
  }

  /* shopping line for the one-shop-away case */
  function shoppingHint(r) {
    if (!r.missing.length) return null;
    return r.missing.map(id => {
      const f = byId[id];
      return `买 ${f ? (f.shop || "1 份") + " " + (f.cn || f.name) : id}`;
    }).join("，");
  }

  /* ---------- quantities ----------
     A fridge does not hold "one tofu", it holds "a box of eggs, 10 left".
     Each item carries qty + unit; cooking decrements it and removes it at zero. */
  const UNIT_RE = /(盒|个|把|颗|根|包|袋|罐|条|杯|碗|块|片|斤|克)/;
  function unitOf(cat) {
    const f = byId[cat];
    const shop = (f && f.shop) || "1 份";
    const m = shop.match(UNIT_RE);
    return m ? m[1] : "份";
  }

  /* which ingredients a recipe uses, and how many units of each.
     Without reliable gram data (only 4 of 20 recipes parse grams), we deduct
     one unit per ingredient — and say so in the UI instead of pretending. */
  function consumptionOf(recipe) {
    return recipe.needs.map(cat => ({cat, qty: 1}));
  }

  /* apply a cooking event: returns {items, removed, used} */
  function consume(items, recipe) {
    const plan = consumptionOf(recipe);
    const used = [], removed = [];
    const next = items.map(it => Object.assign({}, it));
    for (const p of plan) {
      const cands = next.filter(i => i.cat === p.cat && (i.qty == null ? 1 : i.qty) > 0)
                        .sort((a, b) => daysLeftOf(a) - daysLeftOf(b));
      const target = cands[0];
      if (!target) continue;
      const before = target.qty == null ? 1 : target.qty;
      const after = before - p.qty;
      used.push({cat: p.cat, name: target.name, qty: p.qty, left: Math.max(0, after)});
      if (after <= 0) {
        removed.push(target.id);
        next.splice(next.indexOf(target), 1);
      } else {
        target.qty = after;
      }
    }
    return {items: next, removed, used};
  }

  /* Old records (created before quantities existed) carry a frozen daysLeft and no
     addedAt — so they would sit there at "2 days" forever. Give them a start date of
     today so they begin ticking now, instead of silently never expiring. */
  function migrate(list) {
    let changed = false;
    const out = (list || []).map(it => {
      if (it.addedAt && typeof it.life === "number") return it;
      const left = typeof it.daysLeft === "number" ? it.daysLeft : 3;
      changed = true;
      return Object.assign({}, it, {
        qty: it.qty == null ? 1 : it.qty,
        daysLeft: left, life: left, addedAt: localDate()
      });
    });
    return {items: out, changed};
  }

  /* 三盒同一天到期的酸奶不该是三行 —— 合并成一行「酸奶 ×3」。
     只有「到期日不同」才算不同的一批，因为决策要用到各自的剩余天数。 */
  function mergeItems(list) {
    const out = [], index = {};
    (list || []).forEach(it => {
      const key = [it.cat, daysLeftOf(it), it.unit || "", it.by || ""].join("|");
      if (index[key] != null) {
        const target = out[index[key]];
        target.qty = (target.qty == null ? 1 : target.qty) + (it.qty == null ? 1 : it.qty);
      } else {
        index[key] = out.length;
        out.push(Object.assign({}, it, {qty: it.qty == null ? 1 : it.qty}));
      }
    });
    return out;
  }

  /* ---------- items ---------- */
  const items = () => {
    const v = read(LS_ITEMS, []);
    return Array.isArray(v) ? v : [];
  };
  /* ---------- optional cloud (Supabase) ----------
     saveItems() is the only write path in the whole app, so the bridge
     lives here: no page has to know whether a backend exists. */
  const daysOf = i => (i && typeof i.life === "number" && i.addedAt)
    ? Math.max(0, i.life - Math.floor((Date.now() - new Date(i.addedAt + "T00:00:00").getTime()) / 86400000))
    : (i && typeof i.daysLeft === "number" ? i.daysLeft : 0);

  const snap = list => {
    const m = {};
    (list || []).forEach(i => { m[i.id] = [i.cat, i.name, i.tag, i.qty, i.unit, i.life, i.addedAt, daysOf(i)]; });
    return m;
  };

  let lastCloud = null;
  const cloudOn = () => !!(global.SYNC && global.SYNC.enabled && global.SYNC.enabled());

  function pushDiff(list) {
    if (!cloudOn()) return;
    const code = household().code; if (!code) return;
    const now = snap(list);
    const before = lastCloud || {};
    Object.keys(now).forEach(id => {
      const a = before[id], b = now[id];
      if (!a) {
        const it = (list || []).filter(x => x.id === id)[0] || {};
        global.SYNC.add(code, {
          id: it.id, cat: it.cat, name: it.name, tag: it.tag, qty: it.qty, unit: it.unit,
          life: it.life, addedAt: it.addedAt, daysLeft: daysOf(it), by: it.by
        }).catch(() => {});
      } else if (a.join("|") !== b.join("|")) {
        global.SYNC.update(code, id, { qty: b[3], days_left: b[7] }).catch(() => {});
      }
    });
    Object.keys(before).forEach(id => { if (!now[id]) global.SYNC.remove(code, id).catch(() => {}); });
    lastCloud = now;
  }

  const saveItems = list => {
    write(LS_ITEMS, list);
    try { pushDiff(list); } catch (e) {}
    return true;
  };

  const sync = {
    on: cloudOn,
    code() {
      const h = household();
      if (h.code) return h.code;
      const c = newCode(); saveHousehold({ code: c }); return c;
    },
    async pull() {
      if (!cloudOn()) return false;
      const rows = await global.SYNC.pull(sync.code());
      if (!Array.isArray(rows)) return false;
      lastCloud = snap(rows);
      write(LS_ITEMS, rows);          /* raw write: never echo back what we just got */
      return true;
    },
    start(onChange, ms) {
      if (!cloudOn()) return false;
      const me = this;
      (async () => {
        try { await global.SYNC.ensureHousehold(me.code()); } catch (e) {}
        try { await me.pull(); onChange && onChange(); } catch (e) {}
      })();
      setInterval(async () => {
        if (document.hidden) return;
        try {
          const rows = await global.SYNC.pull(me.code());
          if (!Array.isArray(rows)) return;
          if (JSON.stringify(snap(rows)) !== JSON.stringify(snap(read(LS_ITEMS, [])))) {
            lastCloud = snap(rows);
            write(LS_ITEMS, rows);
            onChange && onChange();
          }
        } catch (e) {}
      }, ms || 5000);
      return true;
    }
  };

  /* ---------- the signal ---------- */
  function log(action, recipeId) {
    const rows = read(LS_LOG, []);
    rows.push({ t: Date.now(), action, recipeId: recipeId || null });
    if (rows.length > 500) rows.splice(0, rows.length - 500);
    write(LS_LOG, rows);
    return rows;
  }
  function stats() {
    const rows = read(LS_LOG, []);
    const taken = rows.filter(r => r.action === "take").length;
    const skipped = rows.filter(r => r.action === "skip").length;
    const decided = taken + skipped;
    return { taken, skipped, decided, rate: decided ? Math.round(taken / decided * 100) : null, rows };
  }

  global.FD = {
    CATALOG, RECIPES, PANTRY, byId, pantryById, DB,
    LS_ITEMS, LS_SETTINGS, LS_LOG, LS_PANTRY, LS_HOUSEHOLD,
    read, write,
    items, saveItems, unitOf, consumptionOf, consume, migrate, mergeItems,
    settings, saveSettings, DEFAULT_SETTINGS,
    pantry, savePantry,
    household, saveHousehold, newCode, sync, cloudOn,
    localDate, daysLeftOf,
    evaluate, decide, urgent, shoppingHint,
    log, stats
  };
})(window);
