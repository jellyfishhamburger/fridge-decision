/* ============================================================
   cloud.js — 登录态下的「云端优先」数据层

   三条规则：
     1. 读：登录后 items 从 Supabase 拉（RLS 只会给你本家的）
     2. 写：本机先改（界面立刻响应），改动进 outbox，逐个用 RPC 推上去
     3. 推失败就留在 outbox 里重试 —— 不丢、不重复（每条带自己的 key/id）

   没登录时这个文件完全不介入：CLOUD.on() 为 false，一切照旧走本机。
   ============================================================ */
(function (g) {
  "use strict";

  var LS_SNAP = "fd.cloud.snap.v1";
  var LS_OUT = "fd.outbox.v1";
  var suppress = false;
  var timer = null, running = false;

  function on() {
    return !!(g.AUTH && AUTH.configured && AUTH.configured() && AUTH.signedIn());
  }
  function snap() { try { return JSON.parse(localStorage.getItem(LS_SNAP) || "{}") || {}; } catch (e) { return {}; } }
  function saveSnap(o) { try { localStorage.setItem(LS_SNAP, JSON.stringify(o)); } catch (e) {} }
  function outbox() { try { return JSON.parse(localStorage.getItem(LS_OUT) || "[]") || []; } catch (e) { return []; } }
  function saveOut(a) { try { localStorage.setItem(LS_OUT, JSON.stringify(a.slice(-300))); } catch (e) {} }

  function toLocal(r) {
    return {
      id: r.id, cat: r.cat, name: r.name, tag: r.tag,
      qty: Number(r.qty) || 0, unit: r.unit, life: r.life,
      addedAt: r.added_at, daysLeft: r.days_left,
      reserved: Number(r.reserved_qty) || 0
    };
  }

  function withSuppress(fn) {
    suppress = true;
    try { return fn(); } finally { suppress = false; }
  }

  /* ---------- 读：拉云端，合并还没推上去的本地新增 ---------- */
  async function pull() {
    if (!on()) return null;
    var rows = await AUTH.items();
    if (!Array.isArray(rows)) return null;

    var server = rows.map(toLocal);
    var pendingAdds = outbox().filter(function (o) { return o.type === "add"; })
                             .map(function (o) { return o.id; });
    var localById = {};
    (FD.items() || []).forEach(function (i) { localById[i.id] = i; });

    /* 本地新增但云端还没有的，先留着，别在界面上闪一下消失 */
    var keep = pendingAdds.map(function (id) { return localById[id]; })
                          .filter(function (i) { return i && !server.some(function (s) { return s.id === i.id; }); });

    var merged = server.concat(keep);
    var s = {};
    server.forEach(function (i) { s[i.id] = [i.cat, Number(i.qty) || 0]; });
    saveSnap(s);
    return merged;
  }

  /* ---------- 写：对比快照，生成 outbox ---------- */
  function queue(list) {
    var before = snap(), now = {}, q = outbox();
    var byId = {};
    (list || []).forEach(function (i) { byId[i.id] = i; now[i.id] = [i.cat, Number(i.qty) || 0]; });

    Object.keys(now).forEach(function (id) {
      var it = byId[id], a = before[id];
      if (!a) {
        q.push({ type: "add", id: id, cat: it.cat, name: it.name, tag: it.tag,
                 qty: Number(it.qty) || 1, unit: it.unit, life: it.life,
                 daysLeft: it.daysLeft, at: Date.now() });
      } else if (Number(a[1]) !== Number(now[id][1])) {
        q.push({ type: "set", id: id, qty: Number(it.qty) || 0, at: Date.now() });
      }
    });
    Object.keys(before).forEach(function (id) {
      if (!now[id]) q.push({ type: "remove", id: id, at: Date.now() });
    });

    saveOut(q);
    schedule();
    return q.length;
  }

  async function flush() {
    if (!on() || running) return;
    var q = outbox();
    if (!q.length) return;
    running = true;
    try {
      while (q.length) {
        var op = q[0], ok = false;
        try {
          if (op.type === "add") {
            await AUTH.rpc("add_item", {
              p_cat: op.cat, p_name: op.name, p_tag: op.tag, p_qty: op.qty,
              p_unit: op.unit, p_life: op.life, p_days_left: op.daysLeft,
              p_date_source: "manual", p_key: "add:" + op.id, p_id: op.id
            });
            var s = snap(); s[op.id] = [op.cat, Number(op.qty) || 1]; saveSnap(s);
            ok = true;
          } else if (op.type === "set") {
            await AUTH.rpc("set_item_qty", { p_item: op.id, p_qty: op.qty });
            var s2 = snap(); if (s2[op.id]) s2[op.id][1] = Number(op.qty) || 0; saveSnap(s2);
            ok = true;
          } else if (op.type === "remove") {
            await AUTH.rpc("remove_item", { p_item: op.id });
            var s3 = snap(); delete s3[op.id]; saveSnap(s3);
            ok = true;
          }
        } catch (e) {
          /* 条目在云端不存在（比如换设备后本地残留）→ 这条作废，别卡住队列 */
          var msg = String(e && e.message || "");
          if (/item not found|already/i.test(msg)) { ok = true; }
          else { break; }        /* 其他错误：留着下次再推 */
        }
        if (!ok) break;
        q.shift(); saveOut(q);
      }
    } finally {
      running = false;
    }
  }

  function schedule() {
    clearTimeout(timer);
    timer = setTimeout(function () { flush(); }, 700);
  }

  function start() {
    if (!on()) return;
    setTimeout(flush, 1200);
    setInterval(function () { if (outbox().length) flush(); }, 15000);
    g.addEventListener("online", function () { flush(); });
  }

  /* 把 FD.saveItems 包一层：本机照写，同时把差异排进 outbox */
  function hook() {
    if (!g.FD || FD.__cloudHooked) return;
    var orig = FD.saveItems;
    FD.saveItems = function (list) {
      orig(list);
      if (!suppress && on()) { try { queue(list); } catch (e) {} }
    };
    FD.__cloudHooked = true;
  }

  /* 做完一餐后刷新一次（云端已扣，本机跟着同步） */
  async function refresh() {
    var merged = await pull();
    return merged;
  }


  /* ---------- 做饭：开始 = 预留（云端），完成 = 扣减（云端） ---------- */
  async function cookBegin(recipe, items) {
    if (!on()) return { ok: false, reason: "offline" };
    var plan = (recipe.needs || []).map(function (cat) {
      var pool = (items || []).filter(function (i) {
        return i.cat === cat && (Number(i.qty) || 0) - (Number(i.reserved) || 0) > 0;
      }).sort(function (a, b) { return FD.daysLeftOf(a) - FD.daysLeftOf(b); });
      var it = pool[0] || null;
      return { item_id: it ? it.id : null, cat: cat, qty: 1 };
    });

    var short = plan.filter(function (p) { return !p.item_id; }).map(function (p) { return p.cat; });
    if (short.length) return { ok: false, short: short };

    try {
      var sid = await AUTH.rpc("start_meal_session", { p_recipe: recipe.id, p_plan: plan });
      var r = await AUTH.rpc("reserve_meal", { p_session: sid });
      return { ok: true, session: sid, plan: plan, already: !!(r && r.already) };
    } catch (e) {
      var m = String(e && e.message || "");
      var cats = (m.match(/not enough stock: (.+)$/) || [])[1];
      return { ok: false, short: cats ? cats.split(",") : [], error: m };
    }
  }

  async function cookFinish(session, plan) {
    var r = await AUTH.rpc("complete_meal", {
      p_session: session, p_actual: plan, p_key: session + ":complete"
    });
    return r || {};
  }

  async function cookCancel(session) {
    try { await AUTH.rpc("cancel_meal", { p_session: session }); } catch (e) {}
  }

  async function undoEvent(id) {
    if (!id) return false;
    try { await AUTH.rpc("undo_event", { p_event: id }); return true; } catch (e) { return false; }
  }

  g.CLOUD = {
    on: on, pull: pull, flush: flush, queue: queue, snap: snap,
    cookBegin: cookBegin, cookFinish: cookFinish, cookCancel: cookCancel, undoEvent: undoEvent,
    start: start, hook: hook, refresh: refresh, withSuppress: withSuppress,
    outbox: outbox, LS_SNAP: LS_SNAP, LS_OUT: LS_OUT
  };

  if (document.readyState !== "loading") hook();
  else document.addEventListener("DOMContentLoaded", hook);
})(window);
