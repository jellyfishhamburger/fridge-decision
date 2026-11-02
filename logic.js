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
  const LS_PENDING   = "fd.pending.v1";   /* 门口认出但不确定的，手机和屏幕共用这一份 */
  const LS_DIRTY      = "fd.dirty.v1";     /* ids written here, not yet confirmed by the server */
  const LS_TOMB       = "fd.tomb.v1";      /* ids deleted here, not yet confirmed by the server */

  const DEFAULT_SETTINGS = {
    screens: [0, 1, 2],
    rotMs: 6000,
    auto: true,
    greensPerDay: 1,
    maxMinutes: 20,
    /* 推荐偏好：style 默认「家常均衡」，restrict 是硬性忌口，goals 是进阶营养倾向 */
    style: "balance",
    restrict: [],
    goals: []
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

  /* ---------- pending: 认得拿不准的，放在数据里而不是某个页面里 ----------
     这样门口那块屏和手机看的是同一份：设备负责提议，手机负责裁决。 */
  const pending      = () => { const v = read(LS_PENDING, null); return Array.isArray(v) ? v : []; };
  const savePending  = list => { write(LS_PENDING, (list || []).slice(-8)); return pending(); };
  /* 缩略图压到 96×96 再上云：dataURL 太大，一行能有几十 KB */
  function shrinkThumb(canvas, size){
    try{
      const c = document.createElement("canvas");
      c.width = size; c.height = size;
      c.getContext("2d").drawImage(canvas, 0, 0, size, size);
      return c.toDataURL("image/jpeg", 0.6);
    }catch(e){ return canvas && canvas.toDataURL ? canvas.toDataURL("image/jpeg", 0.5) : null; }
  }

  const addPending   = it => {
    const l = pending(); l.push(it); const out = savePending(l);
    try { if (cloudOn()) global.SYNC.addPendingRow(household().code, it).catch(() => {}); } catch (e) {}
    return out;
  };
  const removePending = id => {
    const out = savePending(pending().filter(p => p.id !== id));
    try { if (cloudOn()) global.SYNC.delPendingRow(household().code, id).catch(() => {}); } catch (e) {}
    return out;
  };
  const takePending  = id => {
    const l = pending(); const it = l.find(p => p.id === id) || null;
    if (it) removePending(id);
    return it;
  };

  /* 从云端合并待确认：服务端为准，本地独有的保留，最多 8 条 */
  async function pullPendingCloud(){
    if (!cloudOn()) return false;
    try{
      const rows = await global.SYNC.pullPending(household().code);
      if (!Array.isArray(rows)) return false;
      const have = {}; rows.forEach(r => have[r.id] = 1);
      const extra = pending().filter(p => !have[p.id]);
      write(LS_PENDING, rows.concat(extra).slice(-8));
      return true;
    }catch(e){ return false; }     /* 表还没建 / 没网：安静退回本地 */
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

    /* 一道菜如果连一个库存食材都对不上（多半是「萝卜」这类还没进目录），
       不能算 ready —— 否则「现在就能做」里会出现根本做不了的菜 */
    const status = !recipe.needs || !recipe.needs.length
      ? "blocked"
      : (missing.length === 0 ? "ready" : (missing.length === 1 ? "shop1" : "blocked"));
    /* 排序的主轴是「最先坏的那一样」，不是把几样临期加起来：
       一条 1 天的鱼必须压过「2 天的猪肉 + 3 天的豆腐」，否则今天该吃的鱼永远排不上。
       次要项只给很小权重，避免多料菜靠数量堆分。 */
    const lefts = used.map(daysLeftOf);
    const soonest = lefts.length ? Math.min.apply(null, lefts) : 99;
    const urgency = used.reduce((s, i) => s + Math.max(0, 8 - daysLeftOf(i)) * 0.35, 0)
                  + (soonest <= 3 ? (4 - soonest) * 2.2 : 0);
    const greensBonus = (recipe.greens && st.greensPerDay > 0) ? 4 : 0;
    const timePenalty = Math.max(0, recipe.minutes - st.maxMinutes) * 1.2;
    const gapPenalty = missing.length ? 10 * missing.length : 0;

    const pantryMissing = (recipe.pantry || []).filter(p => !pantryHave.has(p));

    return {
      recipe, status, used, missing, pantryMissing, soonest,
      score: urgency + greensBonus - timePenalty - gapPenalty,
      urgency, greensBonus, timePenalty
    };
  }

  /* 小吃/饮品/甜点/调料都不算「一道菜」：不进套餐，也不上今晚吃什么的推荐 */
  const DISH_KINDS = { meat: 1, veg: 1, soup: 1, staple: 1 };
  function isDish(recipe) { return !!DISH_KINDS[(recipe && recipe.kind) || "meat"]; }

  function decide(items, st, opts) {
    const pool = (opts && opts.all) ? RECIPES : RECIPES.filter(isDish);
    return pool.map(r => evaluate(r, items, st)).sort((a, b) => b.score - a.score);
  }

  /* ---------- 一人份套餐 ----------
     套餐不是新菜，是把现有菜组合起来。评分沿用单菜那套（临期优先、缺料扣分），
     再加上「整套齐不齐」「总时长」两条。 */
  const SETS = global.FD_SETS || [];

  function evaluateSet(set, items, st) {
    const dishes = (set.dishes || [])
      .map(id => RECIPES.filter(r => r.id === id)[0])
      .filter(Boolean)
      .map(r => evaluate(r, items, st));

    const ready = dishes.length > 0 && dishes.every(d => d.status === "ready");
    const shop1 = dishes.filter(d => d.status === "shop1").length;
    const missing = [];
    dishes.forEach(d => d.missing.forEach(c => { if (missing.indexOf(c) < 0) missing.push(c); }));

    const minutes = Math.max.apply(null, dishes.map(d => d.recipe.minutes).concat([0])) + 8;
    const kcal = dishes.reduce((a, d) => a + (d.recipe.kcal || 0), 0) + (set.staple === "rice" ? 150 : 0);
    const urgent = dishes.some(d => d.used.some(i => daysLeftOf(i) <= 2));
    const soonest = Math.min.apply(null, dishes.map(d => d.soonest == null ? 99 : d.soonest).concat([99]));
    const greens = dishes.some(d => d.recipe.greens);
    const score = dishes.reduce((a, d) => a + d.score, 0) - (dishes.length - 1) * 3;

    return { set, dishes, ready, shop1, missing, minutes, kcal, urgent, soonest, greens, score,
             status: ready ? "ready" : (missing.length <= 1 && shop1 <= 1 ? "shop1" : "blocked") };
  }

  /* 一套套餐怎么排：同一把尺子（先能吃、再缺得少、再最先坏的先做、再分高、再快）
     —— 生成式套餐和手写套餐都走这里，不再各写一份 */
  function compareSet(a, b) {
    return (b.ready - a.ready) ||
      (a.missing.length - b.missing.length) ||
      ((a.soonest == null ? 99 : a.soonest) - (b.soonest == null ? 99 : b.soonest)) ||
      (b.score - a.score) ||
      (a.minutes - b.minutes);
  }

  function decideSets(items, st) {
    return SETS.map(s => evaluateSet(s, items, st)).sort(compareSet);
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
  let connOK = false;                      /* only true after a successful round trip */
  const cloudOn = () => !!(global.SYNC && global.SYNC.enabled && global.SYNC.enabled());

  function pushDiff(list) {
    if (!cloudOn() || !connOK) return;
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
        }).then(() => clearDirty([id])).catch(() => { if (lastCloud) delete lastCloud[id]; });
      } else if (a.join("|") !== b.join("|")) {
        global.SYNC.update(code, id, { qty: b[3], days_left: b[7] }).then(() => clearDirty([id])).catch(() => {
          /* keep it dirty: the next poll re-pushes it */
          if (lastCloud && lastCloud[id]) lastCloud[id] = [null];
        });
      }
    });
    Object.keys(before).forEach(id => {
      if (!now[id]) {
        const t = tombMap(); t[id] = 1; write(LS_TOMB, t);
        global.SYNC.remove(code, id).then(() => clearDirty([id]))
          .catch(() => { if (lastCloud) lastCloud[id] = before[id]; });
      }
    });
    lastCloud = now;
  }

  const dirtyMap = () => read(LS_DIRTY, {}) || {};
  const tombMap  = () => read(LS_TOMB, {}) || {};
  const clearDirty = ids => {
    if (!ids || !ids.length) return;
    const d = dirtyMap(); ids.forEach(id => delete d[id]); write(LS_DIRTY, d);
    const t = tombMap();  ids.forEach(id => delete t[id]); write(LS_TOMB, t);
  };

  const saveItems = list => {
    const prev = {};
    (read(LS_ITEMS, []) || []).forEach(i => { prev[i.id] = i; });
    const d = dirtyMap();
    (list || []).forEach(i => {
      const o = prev[i.id];
      if (!o || o.qty !== i.qty || o.life !== i.life || o.addedAt !== i.addedAt) d[i.id] = 1;
    });
    (read(LS_ITEMS, []) || []).forEach(i => { if (!(list || []).some(x => x.id === i.id)) d[i.id] = 1; });
    write(LS_DIRTY, d);
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
      const local = read(LS_ITEMS, []) || [];
      const dirty = dirtyMap(), tomb = tombMap();
      connOK = true;

      /* a household with nothing in the cloud yet: adopt what this device has */
      if (!rows.length && local.length) local.forEach(i => { dirty[i.id] = 1; });

      const have = {}, localById = {};
      rows.forEach(r => { have[r.id] = 1; });
      local.forEach(i => { localById[i.id] = i; });

      /* cloud rows, except ones this device just deleted */
      const merged = rows.filter(r => !tomb[r.id]).map(r =>
        (dirty[r.id] && localById[r.id]) ? localById[r.id] : r);

      /* local-only: keep & push if we wrote it here, drop if it was deleted elsewhere */
      local.forEach(i => {
        if (!have[i.id] && dirty[i.id] && !tomb[i.id]) merged.push(i);
      });

      lastCloud = snap(rows);
      write(LS_ITEMS, merged);
      if (merged.length) pushDiff(merged);
      return true;
    },
    start(onChange, ms) {
      if (!cloudOn()) return false;
      const me = this;
      (async () => {
        try {
          const p = await global.SYNC.ping();
          if (!p.ok) { console.warn("[sync] staying local:", p.reason); return; }
        } catch (e) { console.warn("[sync] staying local:", e.message); return; }
        try { await me.pull(); onChange && onChange(); } catch (e) {}
      })();
      setInterval(async () => {
        if (document.hidden) return;
        const before = JSON.stringify(snap(read(LS_ITEMS, [])));
        try { await me.pull(); } catch (e) { return; }   /* offline: keep local, retry next tick */
        const after = JSON.stringify(snap(read(LS_ITEMS, [])));
        if (before !== after) onChange && onChange();
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


  /* ============================================================
     生成式套餐：按「角色」分桶 → 按模板组合 → 约束过滤 → 排序
     不写死任何组合，加菜不用改代码。
     ============================================================ */
  const TAGS = global.FD_TAGS || {};

  /* 没登记的菜，按 needs 里的食材猜一个角色 */
  function inferRole(recipe) {
    const need = recipe.needs || [];
    /* 按目录里的 tag 判断，别写死名单 —— 扩了库（排骨/白菜/鸭肉…）之后名单会漏 */
    const tag = c => (byId[c] && byId[c].tag) || "";
    const hasP = need.some(c => tag(c) === "protein");
    const hasV = need.some(c => tag(c) === "greens" || tag(c) === "veg");
    const hasC = need.some(c => tag(c) === "carb");
    if (hasC && need.length <= 3) return "onepot";
    if (hasP && hasV) return "halfProtein";
    if (hasP) return "mainProtein";
    if (hasV) return "veg";
    return "veg";
  }
  function inferProtein(recipe) {
    const need = recipe.needs || [];
    const MEATY = ["fish","shrimp","peeled_shrimp","chicken","chicken_wing","beef","pork","ribs","lamb","duck"];
    if (need.some(c => MEATY.indexOf(c) >= 0)) return "high";
    if (need.some(c => ["egg","tofu","ham"].indexOf(c) >= 0)) return "mid";
    return "low";
  }

  /* ============================================================
     一顿饭（Meal Plan）
     - 一道主项 + 至多两道配菜 + 主食；同一主项只出一套
     - 同一主项下另外能配的菜，作为这套饭里的「可替换」，不拆成新套餐
     - 风格只影响打分/结构，不改变「能不能做」
     ============================================================ */

  /* 硬性忌口用的食材集合。来源是 foods 表里的 id，不是菜名推测。 */
  const IDS_SEAFOOD = ["shrimp","fish","peeled_shrimp","squid","dried_shrimp"];
  const IDS_PORK    = ["pork","ribs","bacon","sausage","pork_belly","pork_trotter"];
  const IDS_BEEF    = ["beef","beef_brisket"];
  const IDS_MEAT    = IDS_SEAFOOD.concat(IDS_PORK, IDS_BEEF,
                      ["chicken","ham","duck","lamb","lamb_chop","chicken_wing","chicken_thigh","chicken_feet"]);
  const IDS_EGG     = ["egg","century_egg"];
  const IDS_DAIRY   = ["milk","cheese","yogurt","butter","cream"];
  const IDS_SOY     = ["tofu","dried_tofu","yuba","tofu_skin"];

  const DIET = [
    { id: "veg",        name: "素食",     nameEn: "Vegetarian" },
    { id: "vegan",      name: "纯素",     nameEn: "Vegan" },
    { id: "eggdairy",   name: "蛋奶素",   nameEn: "Vegetarian + egg/dairy" },
    { id: "nopork",     name: "不吃猪肉", nameEn: "No pork" },
    { id: "nobeef",     name: "不吃牛肉", nameEn: "No beef" },
    { id: "noseafood",  name: "不吃海鲜", nameEn: "No seafood" },
    { id: "al_peanut",  name: "花生过敏", nameEn: "Peanut allergy" },
    { id: "al_egg",     name: "鸡蛋过敏", nameEn: "Egg allergy" },
    { id: "al_milk",    name: "乳制品过敏", nameEn: "Dairy allergy" },
    { id: "al_soy",     name: "大豆过敏", nameEn: "Soy allergy" },
    { id: "al_shell",   name: "甲壳类过敏", nameEn: "Shellfish allergy" }
  ];

  const STYLES = [
    { id: "balance", name: "家常均衡", nameEn: "Home-style",
      main: ["mainProtein","halfProtein","onepot"], sides: ["veg","vegProtein","soup"], staple: true },
    { id: "protein", name: "高蛋白", nameEn: "Protein-forward",
      main: ["mainProtein","halfProtein","vegProtein"], sides: ["veg","vegProtein"], staple: true },
    { id: "plant",   name: "植物为主", nameEn: "Plant-forward", noMeat: true,
      main: ["vegProtein","veg"], sides: ["veg","vegProtein"], staple: true },
    { id: "light",   name: "清爽轻食", nameEn: "Light", maxSpicy: 0, kcalMax: 720,
      main: ["vegProtein","veg","soup"], sides: ["veg","soup"], staple: false },
    { id: "hearty",  name: "满足感",   nameEn: "Hearty", kcalMin: 480,
      main: ["mainProtein","halfProtein","onepot"], sides: ["veg","vegProtein"], staple: true },
    { id: "quick",   name: "省时省事", nameEn: "Quick", maxMinutes: 25, maxSpicy: 2,
      main: ["mainProtein","halfProtein","vegProtein","veg","onepot"], sides: ["veg","vegProtein"], staple: true }
  ];

  /* HowToCook 的配料表对部分菜是错的（咸肉菜饭里没有咸肉、荔枝肉里没有猪肉），
     所以忌口判断在 needs 之外再加一层「菜名关键词」兜底。
     宁可多排除，也不能漏 —— 过敏是安全问题，不是推荐问题。 */
  const NAME_RULES = [
    { ids: IDS_SEAFOOD, re: /鱼|虾|蟹|贝|鱿|鳝|蚝|蛤|海参|墨鱼|海鲜/ },
    { ids: IDS_PORK,    re: /猪|排骨|五花|培根|香肠|火腿|肘|蹄|腊肉|里脊/ },
    { ids: IDS_BEEF,    re: /牛/ },
    { ids: [],          re: /肉|鸡|鸭|鹅|羊|培根|香肠/ },
    { ids: IDS_EGG,     re: /蛋/ },
    { ids: IDS_DAIRY,   re: /奶|黄油|芝士|奶酪/ },
    { ids: IDS_SOY,     re: /豆腐|豆干|腐竹|千张|豆皮|豆泡/ }
  ];

  function nameHits(recipe, ids) {
    const name = recipe.name || "";
    for (const rule of NAME_RULES) {
      if (!rule.re.test(name)) continue;
      const overlap = rule.ids.length ? rule.ids.some(x => ids.indexOf(x) >= 0) : true;
      if (overlap) return true;
    }
    return false;
  }

  function usedIds(recipe, st) {
    const r = (st && st.restrict) || [];
    const n = recipe.needs || [];
    const hit = ids => ids.some(x => n.indexOf(x) >= 0);
    if (r.indexOf("veg") >= 0 && hit(IDS_MEAT)) return true;
    if (r.indexOf("eggdairy") >= 0 && hit(IDS_MEAT)) return true;
    if (r.indexOf("vegan") >= 0 && (hit(IDS_MEAT) || hit(IDS_EGG) || hit(IDS_DAIRY))) return true;
    if (r.indexOf("nopork") >= 0 && hit(IDS_PORK)) return true;
    if (r.indexOf("nobeef") >= 0 && hit(IDS_BEEF)) return true;
    if (r.indexOf("noseafood") >= 0 && hit(IDS_SEAFOOD)) return true;
    if (r.indexOf("al_peanut") >= 0 && hit(["peanut"])) return true;
    if (r.indexOf("al_egg") >= 0 && hit(IDS_EGG)) return true;
    if (r.indexOf("al_milk") >= 0 && hit(IDS_DAIRY)) return true;
    if (r.indexOf("al_soy") >= 0 && hit(IDS_SOY)) return true;
    if (r.indexOf("al_shell") >= 0 && hit(IDS_SEAFOOD)) return true;

    /* 菜名兜底（配料表不可靠时的安全网） */
    const nm = recipe.name || "";
    const meaty = /肉|猪|牛|羊|鸡|鸭|鹅|鱼|虾|蟹|贝|鱿|鳝|蚝|蛤|排骨|培根|香肠|火腿|肘|蹄/.test(nm);
    if ((r.indexOf("veg") >= 0 || r.indexOf("vegan") >= 0 || r.indexOf("eggdairy") >= 0) && meaty) return true;
    if (r.indexOf("nopork") >= 0 && /猪|排骨|五花|培根|香肠|火腿|肘|蹄|腊肉|里脊/.test(nm)) return true;
    if (r.indexOf("nobeef") >= 0 && /牛/.test(nm)) return true;
    if (r.indexOf("noseafood") >= 0 && /鱼|虾|蟹|贝|鱿|鳝|蚝|蛤|海鲜/.test(nm)) return true;
    if (r.indexOf("al_peanut") >= 0 && /花生/.test(nm)) return true;
    if (r.indexOf("al_egg") >= 0 && /蛋/.test(nm)) return true;
    if (r.indexOf("al_milk") >= 0 && /奶|黄油|芝士|奶酪/.test(nm)) return true;
    if (r.indexOf("al_soy") >= 0 && /豆腐|豆干|腐竹|千张|豆皮/.test(nm)) return true;
    if (r.indexOf("al_shell") >= 0 && /虾|蟹|贝|鱿|蛤|蚝/.test(nm)) return true;
    return false;
  }

  function styleBonus(ev, style, st) {
    const t = tagOf(ev.recipe);
    let b = 0;
    if (style.id === "quick")  b += Math.max(0, 30 - (ev.recipe.minutes || 20)) * 0.5;
    if (style.id === "protein") b += t.protein === "high" ? 7 : 0;
    if (style.id === "plant")   b += t.role === "vegProtein" ? 6 : 0;
    if (style.id === "light")   b += (ev.recipe.kcal || 500) <= 350 ? 5 : 0;
    if (style.id === "hearty")  b += (ev.recipe.kcal || 0) >= 380 ? 4 : 0;
    if (style.id === "balance" && ev.recipe.greens) b += 3;
    return b;
  }

  function planRank(ev, style, st) {
    const base = ev.score + (ev.status === "ready" ? 26 : (ev.status === "shop1" ? -18 : -99));
    return base + styleBonus(ev, style, st);
  }

  function planReasons(main, side, totalMin, style, staple) {
    const out = [];
    const soon = [];
    [main, side].forEach(ev => (ev.used || []).forEach(i => {
      const d = daysLeftOf(i);
      if (d <= 3) soon.push({ name: i.cn || (byId[i.cat] || {}).cn || i.name || i.cat, d: d });
    }));
    soon.sort((a, b) => a.d - b.d);
    if (soon.length) {
      const top = soon[0];
      out.push((top.d <= 0 ? "今天到期：" : "还剩 " + top.d + " 天：") + top.name + "，这顿先用掉");
    }
    const miss = []
      .concat(main.missing || [], side.missing || [])
      .filter((x, i, a) => a.indexOf(x) === i);
    if (!miss.length) out.push("食材冰箱里都有，不用再买");
    else if (miss.length <= 2) out.push("只差 " + miss.length + " 样，顺路买一下就行");
    out.push("约 " + totalMin + " 分钟");
    out.push("按「" + style.name + "」配的" + (staple ? "，带主食" : "，主食另配"));
    return out.slice(0, 3);
  }

  function buildPlans(items, st, n) {
    st = st || settings();
    n = n || 3;
    const style = STYLES.filter(s => s.id === (st.style || "balance"))[0] || STYLES[0];

    const usable = RECIPES.filter(isDish)
      .filter(r => !usedIds(r, st))
      .map(r => evaluate(r, items, st))
      .filter(ev => ev.status !== "blocked" && (!style.noMeat || !(ev.recipe.needs || []).some(c => IDS_MEAT.indexOf(c) >= 0)))
      .filter(ev => style.maxSpicy == null || tagOf(ev.recipe).spicy <= style.maxSpicy);

    const roleIn = (ev, roles) => roles.indexOf(tagOf(ev.recipe).role) >= 0;
    const mains = usable.filter(ev => roleIn(ev, style.main))
      .sort((a, b) => (styleBonus(b, style, st) - styleBonus(a, style, st)) ||
                      (planRank(b, style, st) - planRank(a, style, st)));
    const pool = usable.slice().sort((a, b) => planRank(b, style, st) - planRank(a, style, st));

    const out = [];
    const usedMain = {};
    const usedSide = {};
    for (const m of mains) {
      if (out.length >= n) break;
      if (usedMain[m.recipe.id]) continue;
      let sides = pool.filter(ev => ev.recipe.id !== m.recipe.id && roleIn(ev, style.sides));
      if (!sides.length) continue;
      /* 配菜尽量不重复：三套都配炒茄子会显得像只有一道菜 */
      const fresh = sides.filter(ev => !usedSide[ev.recipe.id]);
      if (fresh.length) sides = fresh;
      const side = sides[0];
      const totalMin = Math.max(m.recipe.minutes || 20, side.recipe.minutes || 15) + 8;
      if (style.maxMinutes && totalMin > style.maxMinutes + 12) continue;
      const kcal = (m.recipe.kcal || 0) + (side.recipe.kcal || 0) + (style.staple ? 150 : 0);
      if (style.kcalMax && kcal > style.kcalMax) continue;
      if (style.kcalMin && kcal < style.kcalMin) continue;

      usedMain[m.recipe.id] = 1;
      usedSide[side.recipe.id] = 1;
      out.push({
        id: m.recipe.id + "|" + side.recipe.id,
        style: style.id,
        styleName: style.name,
        main: m,
        side: side,
        alts: sides.slice(1, 4),
        staple: !!style.staple,
        minutes: totalMin,
        kcal: kcal,
        ready: m.status === "ready" && side.status === "ready",
        missing: [].concat(m.missing || [], side.missing || []).filter((x, i, a) => a.indexOf(x) === i),
        reasons: planReasons(m, side, totalMin, style, style.staple),
        ids: [m.recipe.id, side.recipe.id]
      });
    }
    out.sort((a, b) => (b.ready ? 1 : 0) - (a.ready ? 1 : 0) ||
                        a.missing.length - b.missing.length || a.minutes - b.minutes);
    if (!out.length && style.id !== "balance") {
      return buildPlans(items, Object.assign({}, st, { style: "balance" }), n);
    }
    return out;
  }

  /* 按 id 直接评估（decide() 只返回前若干名，套餐里的菜可能不在里面） */
  function evalsByIds(ids, items, st) {
    st = st || settings();
    const map = {};
    RECIPES.filter(isDish).forEach(r => { map[r.id] = r; });
    return (ids || []).map(id => map[id]).filter(Boolean).map(r => evaluate(r, items, st));
  }

  /* 只换配菜，主项和主食不动 */
  function swapPlanSide(plan) {
    if (!plan || !plan.alts || !plan.alts.length) return null;
    const next = plan.alts[0];
    const rest = plan.alts.slice(1);
    const kcal = (plan.main.recipe.kcal || 0) + (next.recipe.kcal || 0) + (plan.staple ? 150 : 0);
    return {
      id: plan.main.recipe.id + "|" + next.recipe.id,
      style: plan.style, styleName: plan.styleName,
      main: plan.main, side: next, alts: rest, staple: plan.staple,
      minutes: Math.max(plan.main.recipe.minutes || 20, next.recipe.minutes || 15) + 8,
      kcal: kcal,
      ready: plan.main.status === "ready" && next.status === "ready",
      missing: [].concat(plan.main.missing || [], next.missing || []).filter((x, i, a) => a.indexOf(x) === i),
      reasons: plan.reasons,
      ids: [plan.main.recipe.id, next.recipe.id]
    };
  }

  function tagOf(recipe) {
    const t = TAGS[recipe.id] || {};
    return {
      role: t.role || inferRole(recipe),
      method: t.method || "stirfry",
      protein: t.protein || inferProtein(recipe),
      spicy: typeof t.spicy === "number" ? t.spicy : 0,
      cuisine: t.cuisine || "家常"
    };
  }

  /* 三种「今晚想要什么」：模板 + 硬约束 */
  const INTENTS = [
    { id: "hearty",  name: "一荤一素", nameEn: "Meat + veg", slots: [["mainProtein","halfProtein","soup"], ["veg","vegProtein"]],
      kcalMin: 420, kcalMax: 1050, maxSpicy: 3, needGreens: true },
    { id: "protein", name: "健身高蛋白", nameEn: "High protein", slots: [["mainProtein","halfProtein","vegProtein"], ["veg","vegProtein"]],
      kcalMin: 400, kcalMax: 900, maxSpicy: 1, needGreens: true, minHighProtein: 1 },
    { id: "veg",     name: "清淡素菜", nameEn: "Light veggie", slots: [["veg","vegProtein"], ["veg","vegProtein"]],
      kcalMin: 260, kcalMax: 850, maxSpicy: 0, needGreens: true, noMeat: true }
  ];

  const MEAT = ["pork","chicken","beef","fish","shrimp","ham"];
  const STAPLE_KCAL = 150;

  function combinations(groups) {
    /* groups: [[a,b],[c,d]] → [[a,c],[a,d],[b,c],[b,d]]；最多两张槽 */
    if (groups.length === 1) return groups[0].map(x => [x]);
    const out = [];
    groups[0].forEach(a => groups[1].forEach(b => { if (a.recipe.id !== b.recipe.id) out.push([a, b]); }));
    return out;
  }

  function buildSets(items, st, intentId) {
    st = st || settings();
    const all = RECIPES.filter(isDish).map(r => evaluate(r, items, st));
    const pantryHave = new Set(pantry());
    const out = [];

    INTENTS.filter(it => !intentId || it.id === intentId).forEach(it => {
      /* 每个槽取前 N 个候选：N 小一点，组合才不至于爆炸 */
      const groups = it.slots.map(slot =>
        all.filter(e => slot.indexOf(tagOf(e.recipe).role) >= 0 && e.status !== "blocked")
           .sort((a, b) => b.score - a.score)
           .slice(0, 6));

      if (groups.some(g => !g.length)) return;

      combinations(groups).forEach(dishes => {
        const tags = dishes.map(d => tagOf(d.recipe));
        if (it.maxSpicy != null && tags.some(t => t.spicy > it.maxSpicy)) return;
        if (it.noMeat && dishes.some(d => (d.recipe.needs || []).some(c => MEAT.indexOf(c) >= 0))) return;
        if (it.minHighProtein && tags.filter(t => t.protein === "high").length < it.minHighProtein) return;
        if (it.needGreens && !dishes.some(d => d.recipe.greens)) return;

        /* 同主料重复（两个都靠番茄）就不要 */
        const usedSets = dishes.map(d => new Set((d.recipe.needs || []).filter(c => MEAT.indexOf(c) >= 0)));
        if (usedSets.length === 2 && [...usedSets[0]].some(c => usedSets[1].has(c))) return;

        const onepot = dishes.some(d => tagOf(d.recipe).role === "onepot");
        const kcal = dishes.reduce((a, d) => a + (d.recipe.kcal || 0), 0) + (onepot ? 0 : STAPLE_KCAL);
        if (kcal < it.kcalMin || kcal > it.kcalMax) return;

        const minutes = Math.max.apply(null, dishes.map(d => d.recipe.minutes)) + 8;
        if (minutes > (st.maxMinutes || 60) + 10) return;

        /* 两个都爆炒 → 一个灶排不开，扣分而不是禁用 */
        const methodPenalty = tags.filter(t => t.method === "stirfry").length > 1 ? 6 : 0;
        const spicyMix = tags.some(t => t.spicy >= 2) && tags.some(t => t.spicy === 0) ? 2 : 0;

        const score = dishes.reduce((a, d) => a + d.score, 0) - methodPenalty - spicyMix;
        const missing = [];
        dishes.forEach(d => d.missing.forEach(c => { if (missing.indexOf(c) < 0) missing.push(c); }));

        out.push({
          id: dishes.map(d => d.recipe.id).sort().join("+"),
          intent: it.id, intentName: it.name,
          dishes, minutes, kcal, missing, score,
          soonest: Math.min.apply(null, dishes.map(d => d.soonest == null ? 99 : d.soonest).concat([99])),
          ready: dishes.every(d => d.status === "ready"),
          urgent: dishes.some(d => d.used.some(i => daysLeftOf(i) <= 2)),
          name: dishes.map(d => d.recipe.name).join(" + ") + (onepot ? "" : " + 米饭"),
          onepot: onepot,
          pantryMissing: [...new Set(dishes.flatMap(d => d.pantryMissing))]
        });
      });
    });

    const sorted = out.sort(compareSet);

    /* 去重（同一组菜换个顺序只留一次）+ 同一道主菜最多带两个配菜，避免整页都是同一道 */
    const seenIds = {}, mainCount = {}, picked = [];
    sorted.forEach(s => {
      if (seenIds[s.id]) return;
      const main = s.dishes[0].recipe.id;
      if ((mainCount[main] || 0) >= 2) return;
      seenIds[s.id] = 1; mainCount[main] = (mainCount[main] || 0) + 1;
      picked.push(s);
    });
    return picked;
  }


  /* ---------- 套餐内的「换一道」 ---------- */
  /* 同一角色里还有哪些能做（用于给某一格换菜） */
  function altDishes(recipeId, items, st, limit, roles) {
    st = st || settings();
    /* roles：这一格允许的角色（来自意图模板）；不传就按这道菜自己的角色找同类 */
    const base = RECIPES.filter(r => r.id === recipeId)[0] || {};
    const allowed = roles && roles.length ? roles : [tagOf(base).role];
    return RECIPES.filter(r => r.id !== recipeId && allowed.indexOf(tagOf(r).role) >= 0)
      .map(r => evaluate(r, items, st))
      .filter(e => e.status !== "blocked")
      .sort((a, b) => b.score - a.score)
      .slice(0, limit || 6)
      .map(e => ({ recipe: e.recipe, status: e.status, missing: e.missing, minutes: e.recipe.minutes, kcal: e.recipe.kcal }));
  }

  /* 用指定的几道菜拼一套（用户换过菜之后走这里） */
  function composeSet(ids, items, st) {
    st = st || settings();
    const dishes = (ids || []).map(id => RECIPES.filter(r => r.id === id)[0]).filter(Boolean)
      .map(r => evaluate(r, items, st));
    if (!dishes.length) return null;
    const onepot = dishes.some(d => tagOf(d.recipe).role === "onepot");
    const minutes = Math.max.apply(null, dishes.map(d => d.recipe.minutes)) + 8;
    const kcal = dishes.reduce((a, d) => a + (d.recipe.kcal || 0), 0) + (onepot ? 0 : STAPLE_KCAL);
    const missing = [];
    dishes.forEach(d => d.missing.forEach(c => { if (missing.indexOf(c) < 0) missing.push(c); }));
    const used = [], seen = {};
    dishes.forEach(d => (d.used || []).forEach(i => { if (i && !seen[i.id]) { seen[i.id] = 1; used.push(i); } }));
    return {
      id: ids.slice().sort().join("+"), custom: true,
      dishes, minutes, kcal, missing, used, onepot,
      ready: dishes.every(d => d.status === "ready"),
      urgent: used.some(i => daysLeftOf(i) <= 2),
      name: dishes.map(d => d.recipe.name).join(" + ") + (onepot ? "" : " + 米饭"),
      pantryMissing: [...new Set(dishes.flatMap(d => d.pantryMissing))]
    };
  }


  /* ---------- 做饭记录 ----------
     每做完一道菜记一条；同一餐内的多道菜按 90 分钟内合并成「一顿」。
     纯本机记录（不上云）：用来回答「今天做过什么 / 这周做了几顿」。 */
  const LS_COOK = "fd.cooked.v1";
  const MEAL_GAP = 90 * 60 * 1000;

  function cookLog() {
    try { const v = JSON.parse(localStorage.getItem(LS_COOK) || "[]"); return Array.isArray(v) ? v : []; }
    catch (e) { return []; }
  }
  function noteCooked(recipe, setName) {
    if (!recipe) return;
    const a = cookLog();
    a.push({ at: Date.now(), dish: recipe.id, name: recipe.name, set: setName || null });
    try { localStorage.setItem(LS_COOK, JSON.stringify(a.slice(-300))); } catch (e) {}
  }
  function dayKey(ts) {
    const d = new Date(ts);
    return d.getFullYear() + "-" + (d.getMonth() + 1) + "-" + d.getDate();
  }
  /* 把记录按「一顿」分组：相邻两条间隔 < 90 分钟算同一顿 */
  function cookMeals(sinceMs) {
    const list = cookLog().filter(e => e.at >= (sinceMs || 0)).sort((a, b) => a.at - b.at);
    const meals = [];
    list.forEach(e => {
      const last = meals[meals.length - 1];
      if (last && e.at - last.end <= MEAL_GAP) {
        last.dishes.push(e); last.end = e.at;
      } else {
        meals.push({ start: e.at, end: e.at, dishes: [e] });
      }
    });
    return meals;
  }
  function cookSummary() {
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const weekStart = todayStart - 6 * 24 * 3600 * 1000;
    const today = cookLog().filter(e => e.at >= todayStart);
    const meals = cookMeals(weekStart);
    return {
      todayDishes: today,
      todayMeals: cookMeals(todayStart),
      weekMeals: meals.length,
      weekDishes: meals.reduce((a, m) => a + m.dishes.length, 0)
    };
  }

  global.FD = {
    CATALOG, RECIPES, PANTRY, byId, pantryById, DB, SETS,
    evaluateSet, decideSets, buildSets, INTENTS, tagOf, altDishes, composeSet, compareSet,
    buildPlans, swapPlanSide, evalsByIds, STYLES, DIET, usedIds,
    cookLog, noteCooked, cookMeals, cookSummary,
    LS_ITEMS, LS_SETTINGS, LS_LOG, LS_PANTRY, LS_HOUSEHOLD,
    read, write,
    items, saveItems, unitOf, consumptionOf, consume, migrate, mergeItems,
    settings, saveSettings, DEFAULT_SETTINGS,
    pantry, savePantry,
    household, saveHousehold, newCode, sync, cloudOn,
    LS_PENDING, pending, savePending, addPending, removePending, takePending,
    pullPendingCloud, shrinkThumb,
    localDate, daysLeftOf,
    evaluate, decide, urgent, shoppingHint, isDish, DISH_KINDS,
    log, stats
  };
})(window);
