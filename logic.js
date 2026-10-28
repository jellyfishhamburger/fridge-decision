/* ============================================================
   Shared logic + user settings.
   Load order on every page:  data.js  ->  icons.js  ->  logic.js
   The phone app, the fridge panel and the settings page all read the
   same rules here, so the three surfaces can never disagree.
   ============================================================ */
(function (global) {
  "use strict";

  const DB = global.FD_DATA;
  if (!DB) throw new Error("data.js must load before logic.js");

  const CATALOG = DB.foods;
  const DISHES  = DB.dishes;
  const byId    = {};
  CATALOG.forEach(f => { byId[f.id] = f; });

  const LS_ITEMS    = "fd.items.v1";
  const LS_SETTINGS = "fd.settings.v1";
  const LS_LOG      = "fd.log.v1";

  const DEFAULT_SETTINGS = {
    screens: [0, 1, 2],     // which screens the panel cycles through, in order
    rotMs: 6000,            // 0 = only when the button is pressed
    auto: true,             // false = the panel only reacts to the button
    greensPerDay: 1,
    maxMinutes: 20
  };

  /* ---------- storage helpers ---------- */
  function read(key, fallback) {
    try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : fallback; }
    catch (e) { return fallback; }
  }
  function write(key, val) {
    try { localStorage.setItem(key, JSON.stringify(val)); return true; }
    catch (e) { return false; }
  }

  function settings() {
    const s = read(LS_SETTINGS, {});
    return Object.assign({}, DEFAULT_SETTINGS, s || {});
  }
  function saveSettings(patch) {
    const next = Object.assign(settings(), patch || {});
    write(LS_SETTINGS, next);
    return next;
  }

  /* ---------- dates ---------- */
  /* Local calendar date. toISOString() is UTC: after local midnight it still
     returns yesterday, which silently steals a day from every countdown. */
  function localDate(d) {
    const x = d || new Date();
    const p = n => String(n).padStart(2, "0");
    return `${x.getFullYear()}-${p(x.getMonth() + 1)}-${p(x.getDate())}`;
  }

  /* An item is stored with the day it went in and how long it was good for,
     so the number on the panel keeps ticking instead of freezing. */
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

  /* ---------- the decision rule ----------
     urgency   : the closer an ingredient is to dying, the higher
     greens    : a dish that lands a green, when a green goal is set, gets a lift
     time      : anything slower than the user's limit is pushed down
     The whole product claim lives in these three lines. */
  function scoreDish(dish, items, st) {
    st = st || settings();
    const byCat = {};
    items.forEach(i => { (byCat[i.cat] = byCat[i.cat] || []).push(i); });

    const used = [];
    for (const need of dish.needs) {
      const list = byCat[need];
      if (!list || !list.length) return null;              // not possible right now
      used.push(list.slice().sort((a, b) => daysLeftOf(a) - daysLeftOf(b))[0]);
    }
    const urgency     = used.reduce((s, i) => s + Math.max(0, 8 - daysLeftOf(i)) * 0.9, 0);
    const timePenalty = Math.max(0, dish.time - st.maxMinutes) * 1.4;
    const greensBonus = (dish.greens && st.greensPerDay > 0) ? 4 : 0;

    return {dish, score: urgency + greensBonus - timePenalty, used, urgency, greensBonus, timePenalty};
  }

  function decide(items, st) {
    return DISHES.map(d => scoreDish(d, items, st)).filter(Boolean).sort((a, b) => b.score - a.score);
  }

  function urgent(items, limit) {
    return items.slice().sort((a, b) => daysLeftOf(a) - daysLeftOf(b)).slice(0, limit || 3);
  }

  /* ---------- the one signal worth collecting ----------
     The physical button on the panel is the cheapest evidence in the whole
     project: it records whether people actually take the suggestion. */
  function log(action, dishId) {
    const rows = read(LS_LOG, []);
    rows.push({t: Date.now(), action, dishId: dishId || null});
    if (rows.length > 500) rows.splice(0, rows.length - 500);
    write(LS_LOG, rows);
    return rows;
  }
  function stats() {
    const rows = read(LS_LOG, []);
    const taken = rows.filter(r => r.action === "take").length;
    const skipped = rows.filter(r => r.action === "skip").length;
    const decided = taken + skipped;
    return {taken, skipped, decided, rate: decided ? Math.round((taken / decided) * 100) : null, rows};
  }

  global.FD = {
    /* data */
    CATALOG, DISHES, byId, DB,
    /* storage */
    LS_ITEMS, LS_SETTINGS, LS_LOG, read, write,
    items: () => read(LS_ITEMS, []),
    saveItems: list => write(LS_ITEMS, list),
    settings, saveSettings, DEFAULT_SETTINGS,
    /* logic */
    localDate, daysLeftOf, scoreDish, decide, urgent,
    /* evidence */
    log, stats
  };
})(window);
