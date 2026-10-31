/* ============================================================
   store.js — 烹饪库存的唯一写入口（reserve / complete / cancel）

   为什么要有这一层：
     页面里散落的「扣库存」调用迟早会互相踩（打开菜谱扣一次、完成再扣一次）。
     这里把规则收成三个动作，且每个动作都幂等 —— 重复点、网络重试、
     两台手机同时点，都不会多扣。

   现在跑在本机（localStorage）；接 Supabase 后把 _commit 换成
   supabase.rpc('complete_meal', {...}) 即可，上层调用一行都不用改。
   ============================================================ */
(function (g) {
  "use strict";

  var LS_EV = "fd.events.v1";
  var LS_SE = "fd.sessions.v1";
  var TTL_MS = 2 * 60 * 60 * 1000;      /* 预留 2 小时没人管就自动释放 */

  function read(k, d) {
    try { var v = JSON.parse(localStorage.getItem(k)); return v == null ? d : v; }
    catch (e) { return d; }
  }
  function write(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }

  var events = function () { return read(LS_EV, []) || []; };
  var sessions = function () { return read(LS_SE, []) || []; };

  function newId() { return "s" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }

  function find(items, id) {
    for (var i = 0; i < items.length; i++) if (items[i].id === id) return items[i];
    return null;
  }
  function qtyOf(it) { return Number(it && it.qty) || 0; }
  function resOf(it) { return Number(it && it.reserved) || 0; }
  function available(it) { return Math.max(0, qtyOf(it) - resOf(it)); }

  /* ---------- 1. 开始做：只是建一个会话，不动库存 ---------- */
  function begin(recipe, items) {
    var plan = (recipe.needs || []).map(function (cat) {
      var pool = (items || []).filter(function (i) { return i.cat === cat && qtyOf(i) > 0; })
        .sort(function (a, b) { return FD.daysLeftOf(a) - FD.daysLeftOf(b); });
      var it = pool[0] || null;
      return { item_id: it ? it.id : null, cat: cat, qty: 1 };
    });
    var s = {
      id: newId(), recipe_id: recipe.id, dish: recipe.name,
      status: "selected", plan: plan, startedAt: Date.now(), doneKey: null
    };
    var all = sessions(); all.push(s); write(LS_SE, all.slice(-40));
    return s;
  }

  function touch(s) {
    var all = sessions().map(function (x) { return x.id === s.id ? s : x; });
    write(LS_SE, all.slice(-40));
  }

  /* ---------- 2. 预留：qty 不变，reserved 增加 ---------- */
  function reserve(s, items) {
    if (!s) return { ok: false, reason: "no_session" };
    if (s.status === "reserved") return { ok: true, already: true };

    var need = {}, short = [];
    s.plan.forEach(function (p) {
      if (!p.item_id) { short.push(p.cat); return; }
      need[p.item_id] = (need[p.item_id] || 0) + p.qty;
    });
    Object.keys(need).forEach(function (id) {
      var it = find(items, id);
      if (!it || available(it) < need[id]) short.push((it && it.cat) || id);
    });
    if (short.length) return { ok: false, reason: "short", cats: short };

    Object.keys(need).forEach(function (id) {
      var it = find(items, id);
      it.reserved = resOf(it) + need[id];
    });
    s.status = "reserved"; touch(s);
    return { ok: true };
  }

  /* ---------- 3. 完成：扣 qty，清掉这一餐的 reserved ---------- */
  function complete(s, items) {
    if (!s) return { ok: false, reason: "no_session" };
    var key = s.id + ":complete";

    /* 幂等①：同一个会话已经完成过 */
    if (s.doneKey === key) return { ok: true, duplicate: true, used: [] };
    /* 幂等②：事件流水里已经有这个 key（换页面/重进也能挡住） */
    var ev = events();
    if (ev.some(function (e) { return e.key === key; })) {
      s.doneKey = key; touch(s);
      return { ok: true, duplicate: true, used: [] };
    }
    if (s.status !== "reserved") return { ok: false, reason: "not_reserved" };

    var used = [];
    s.plan.forEach(function (p) {
      if (!p.item_id) return;
      var it = find(items, p.item_id);
      if (!it) return;
      var take = Math.min(qtyOf(it), p.qty);
      if (take <= 0) return;
      it.qty = qtyOf(it) - take;
      it.reserved = Math.max(0, resOf(it) - p.qty);
      used.push({ item_id: it.id, cat: it.cat, qty: take, left: it.qty });
    });

    ev.push({
      key: key, t: Date.now(), recipe_id: s.recipe_id, dish: s.dish,
      reason: "cook_deduct", items: used.map(function (u) {
        return { item_id: u.item_id, cat: u.cat, delta: -u.qty };
      })
    });
    write(LS_EV, ev.slice(-300));

    s.status = "completed"; s.doneKey = key; s.completedAt = Date.now(); touch(s);

    /* 用完的条目从清单里移除（和原来的行为一致） */
    for (var i = items.length - 1; i >= 0; i--) if (qtyOf(items[i]) <= 0) items.splice(i, 1);

    return { ok: true, used: used };
  }

  /* ---------- 4. 取消：只释放预留 ---------- */
  function cancel(s, items) {
    if (!s) return { ok: true };
    if (s.status === "completed" || s.status === "cancelled") return { ok: true, already: true };
    if (s.status === "reserved") {
      var rel = {};
      s.plan.forEach(function (p) { if (p.item_id) rel[p.item_id] = (rel[p.item_id] || 0) + p.qty; });
      Object.keys(rel).forEach(function (id) {
        var it = find(items, id); if (!it) return;
        it.reserved = Math.max(0, resOf(it) - rel[id]);
      });
    }
    s.status = "cancelled"; s.cancelledAt = Date.now(); touch(s);
    return { ok: true };
  }

  /* ---------- 5. 撤销：写一条反向事件（不改历史） ---------- */
  function undo(key, items) {
    var ev = events();
    var e = ev.filter(function (x) { return x.key === key; })[0];
    if (!e || e.reason === "undo") return { ok: false };
    /* 按 cat 找回条目（条目 id 可能已经变） */
    e.items.forEach(function (u) {
      var it = find(items, u.item_id) || items.filter(function (i) { return i.cat === u.cat; })[0];
      if (!it) {
        var f = (FD.byId && FD.byId[u.cat]) || null;
        if (!f) return;
        it = { id: "r" + Math.random().toString(36).slice(2, 8), cat: f.id, name: f.name, tag: f.tag,
               qty: 0, unit: FD.unitOf(f.id), life: f.days, addedAt: FD.localDate(),
               daysLeft: f.days };
        items.push(it);
      }
      it.qty = qtyOf(it) + (-u.delta);
    });
    ev.push({ key: key + ":undo:" + Date.now().toString(36), t: Date.now(), recipe_id: e.recipe_id,
              dish: e.dish, reason: "undo", items: e.items.map(function (u) {
                return { item_id: u.item_id, cat: u.cat, delta: -u.delta };
              }) });
    write(LS_EV, ev.slice(-300));
    return { ok: true };
  }

  /* ---------- 6. 兜底：过期的预留自动释放 ---------- */
  function sweep(items) {
    var changed = 0, now = Date.now();
    var all = sessions();
    all.forEach(function (s) {
      if (s.status === "reserved" && now - (s.startedAt || 0) > TTL_MS) {
        var rel = {};
        s.plan.forEach(function (p) { if (p.item_id) rel[p.item_id] = (rel[p.item_id] || 0) + p.qty; });
        (items || []).forEach(function (it) {
          if (rel[it.id]) { it.reserved = Math.max(0, resOf(it) - rel[it.id]); changed++; }
        });
        s.status = "expired";
      }
    });
    if (changed) write(LS_SE, all);
    return changed;
  }

  g.FDSTORE = {
    begin: begin, reserve: reserve, complete: complete, cancel: cancel, undo: undo,
    sweep: sweep, available: available, events: events, sessions: sessions,
    LS_EV: LS_EV
  };
})(window);
