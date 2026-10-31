/* ============================================================
   realtime.js — 多端「秒级」同步（Supabase Realtime，不引 SDK）

   做法很朴素：订阅 items 表的任何变更，收到就拉一次最新的库存，
   然后让页面重画。拉一次比手工合并 payload 更稳 —— 顺序、删改、
   服务端默认值都由数据库决定。

   连不上/被墙/掉线都不影响使用：15 秒轮询（cloud.js）还在兜底。
   ============================================================ */
(function (g) {
  "use strict";

  var ws = null, ref = 0, joined = false, retry = 0;
  var hbTimer = null, retryTimer = null, debounce = null;
  var onChange = null, started = false;

  function cfg() { try { return (g.SYNC && SYNC.cfg) ? SYNC.cfg() : {}; } catch (e) { return {}; } }
  function session() { try { return g.AUTH && AUTH.session ? AUTH.session() : null; } catch (e) { return null; } }

  function url() {
    if (g.__RT_URL) return g.__RT_URL;
    var c = cfg();
    if (!c.url) return null;
    var base = c.url.replace(/^http/, "ws").replace(/\/+$/, "");
    return base + "/realtime/v1/websocket?apikey=" + encodeURIComponent(c.key || "") + "&vsn=1.0.0";
  }

  /* 把连接状态写到 localStorage，好让设置页也能看到（那个页面不自己连） */
  function mark(state) {
    try { localStorage.setItem("fd.rt.state", JSON.stringify({ s: state, t: Date.now() })); } catch (e) {}
  }

  function send(o) {
    if (ws && ws.readyState === 1) { try { ws.send(JSON.stringify(o)); } catch (e) {} }
  }

  function join() {
    var s = session();
    if (!s) return;
    joined = false;
    send({
      topic: "realtime:public:items",
      event: "phx_join",
      ref: String(++ref),
      payload: {
        config: {
          postgres_changes: [{ event: "*", schema: "public", table: "items" }]
        },
        access_token: s.access_token
      }
    });
  }

  function fire() {
    if (!onChange) return;
    clearTimeout(debounce);
    debounce = setTimeout(function () { try { onChange(); } catch (e) {} }, 250);
  }

  function connect() {
    var u = url();
    if (!u || !session()) return;
    try { ws = new WebSocket(u); } catch (e) { scheduleRetry(); return; }

    ws.onopen = function () {
      retry = 0;
      mark("open");
      join();
      clearInterval(hbTimer);
      hbTimer = setInterval(function () {
        send({ topic: "phoenix", event: "heartbeat", payload: {}, ref: String(++ref) });
      }, 25000);
    };

    ws.onmessage = function (ev) {
      var msg = null;
      try { msg = JSON.parse(ev.data); } catch (e) { return; }

      if (msg.event === "phx_reply" && msg.payload && msg.payload.status === "ok") {
        joined = true;
        mark("joined");
        return;
      }
      if (msg.event === "postgres_changes") { fire(); return; }
      /* 服务端要求重新授权（token 过期）：换一个 token 再 join */
      if (msg.event === "phx_error" || (msg.payload && msg.payload.status === "error")) {
        joined = false;
        if (g.AUTH && AUTH.refresh) AUTH.refresh().then(join).catch(function () {});
      }
    };

    ws.onclose = function () {
      joined = false;
      mark("closed");
      clearInterval(hbTimer);
      scheduleRetry();
    };
    ws.onerror = function () { try { ws.close(); } catch (e) {} };
  }

  function scheduleRetry() {
    clearTimeout(retryTimer);
    retry = Math.min(retry + 1, 6);
    var wait = Math.min(30000, 1500 * Math.pow(1.7, retry));
    retryTimer = setTimeout(connect, wait);
  }

  function start(cb) {
    onChange = cb || onChange;
    if (started) return;
    started = true;
    connect();
    /* 页面回到前台时补一次连接（手机切走会断） */
    document.addEventListener("visibilitychange", function () {
      if (!document.hidden && (!ws || ws.readyState > 1)) { retry = 0; connect(); }
    });
    g.addEventListener("online", function () { retry = 0; connect(); });
  }

  function stop() {
    started = false;
    clearInterval(hbTimer); clearTimeout(retryTimer); clearTimeout(debounce);
    if (ws) { try { ws.close(); } catch (e) {} }
    ws = null;
  }

  g.RT = {
    start: start, stop: stop, connect: connect,
    state: function () {
      return { open: !!ws && ws.readyState === 1, joined: joined, retry: retry };
    }
  };
})(window);
