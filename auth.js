/* ============================================================
   auth.js — 登录（邮箱 magic link）与家庭，不引第三方 SDK

   只用两个 REST 端点：
     POST /auth/v1/otp?redirect_to=…     发登录链接
     POST /auth/v1/token?grant_type=…    刷新 token
   登录后拿到的 JWT 用来调 /rest/v1/rpc/*，数据库那边靠 auth.uid() 认人。

   设计原则：没登录时这个文件什么都不影响 —— 页面照旧走本机存储。
   ============================================================ */
(function (g) {
  "use strict";

  var LS = "fd.auth.v1";

  function cfg() {
    try { return (g.SYNC && SYNC.cfg) ? SYNC.cfg() : {}; } catch (e) { return {}; }
  }
  function base() { var c = cfg(); return (c.url || "").replace(/\/+$/, ""); }
  function key() { var c = cfg(); return c.key || ""; }
  function configured() { return !!(base() && key()); }

  function read() { try { return JSON.parse(localStorage.getItem(LS) || "null"); } catch (e) { return null; } }
  function write(s) { if (s) localStorage.setItem(LS, JSON.stringify(s)); else localStorage.removeItem(LS); }

  function b64url(s) {
    s = String(s).replace(/-/g, "+").replace(/_/g, "/");
    while (s.length % 4) s += "=";
    try { return decodeURIComponent(escape(atob(s))); } catch (e) { return ""; }
  }
  function claims(token) {
    try { return JSON.parse(b64url(String(token).split(".")[1] || "")); } catch (e) { return {}; }
  }

  function storeSession(tok) {
    var c = claims(tok.access_token);
    write({
      access_token: tok.access_token,
      refresh_token: tok.refresh_token || null,
      expires_at: Math.floor(Date.now() / 1000) + (tok.expires_in || 3600),
      user_id: c.sub || null,
      email: c.email || null
    });
    return read();
  }

  /* ---------- 1. 发登录链接 ---------- */
  async function signIn(email) {
    if (!configured()) throw new Error("先在设置里填 Supabase URL 和 anon key");
    var redirect = location.origin + location.pathname.replace(/[^/]*$/, "") + "account.html";
    var res = await fetch(base() + "/auth/v1/otp?redirect_to=" + encodeURIComponent(redirect), {
      method: "POST",
      headers: { "apikey": key(), "Content-Type": "application/json" },
      body: JSON.stringify({ email: email, create_user: true })
    });
    if (!res.ok) {
      var t = await res.text();
      throw new Error((t || "").slice(0, 200) || ("HTTP " + res.status));
    }
    return true;
  }

  /* ---------- 2. 从跳转回来的 URL 里取 token ---------- */
  function handleRedirect() {
    if (!location.hash) return null;
    var h = {};
    location.hash.replace(/^#/, "").split("&").forEach(function (kv) {
      var p = kv.split("=");
      if (p[0]) h[p[0]] = decodeURIComponent(p[1] || "");
    });
    if (!h.access_token) {
      /* 出错时 Supabase 也放在 hash 里：error_description */
      if (h.error_description) {
        history.replaceState(null, "", location.pathname + location.search);
        return { error: decodeURIComponent(h.error_description).replace(/\+/g, " ") };
      }
      return null;
    }
    var s = storeSession({ access_token: h.access_token, refresh_token: h.refresh_token, expires_in: Number(h.expires_in) || 3600 });
    history.replaceState(null, "", location.pathname + location.search);
    return { session: s };
  }

  /* ---------- 3. 会话 ---------- */
  function session() {
    var s = read();
    if (!s || !s.access_token) return null;
    return s;
  }
  function signedIn() { return !!session(); }

  async function refresh() {
    var s = session();
    if (!s || !s.refresh_token) return null;
    var res = await fetch(base() + "/auth/v1/token?grant_type=refresh_token", {
      method: "POST",
      headers: { "apikey": key(), "Content-Type": "application/json" },
      body: JSON.stringify({ refresh_token: s.refresh_token })
    });
    if (!res.ok) { write(null); return null; }
    return storeSession(await res.json());
  }

  /* 有效 token：过期前 90 秒自动换一次 */
  async function token() {
    var s = session();
    if (!s) return null;
    if (s.expires_at && s.expires_at - 90 < Math.floor(Date.now() / 1000)) {
      var n = await refresh();
      return n ? n.access_token : null;
    }
    return s.access_token;
  }

  function signOut() {
    var s = session();
    write(null);
    if (s && s.access_token) {
      fetch(base() + "/auth/v1/logout", {
        method: "POST",
        headers: { "apikey": key(), "Authorization": "Bearer " + s.access_token }
      }).catch(function () {});
    }
  }

  /* ---------- 4. 调 RPC（带登录态） ---------- */
  async function rpc(fn, args) {
    var t = await token();
    if (!t) throw new Error("not signed in");
    var res = await fetch(base() + "/rest/v1/rpc/" + fn, {
      method: "POST",
      headers: { "apikey": key(), "Authorization": "Bearer " + t, "Content-Type": "application/json" },
      body: JSON.stringify(args || {})
    });
    var txt = await res.text();
    var body = null;
    try { body = txt ? JSON.parse(txt) : null; } catch (e) { body = txt; }
    if (!res.ok) {
      var msg = (body && (body.message || body.error_description)) || txt || ("HTTP " + res.status);
      var err = new Error(msg); err.code = body && body.code; err.status = res.status;
      throw err;
    }
    return body;
  }

  /* ---------- 5. 家庭 ---------- */
  async function myHousehold() {
    if (!signedIn()) return null;
    try { return await rpc("my_household", {}); } catch (e) { return null; }
  }
  function createHousehold(name) { return rpc("create_household", { p_name: name || "我的家" }); }
  function joinHousehold(code) { return rpc("join_household", { p_code: code }); }

  /* ---------- 6. 读自己的库存（RLS 生效后按家庭过滤） ---------- */
  async function items() {
    var t = await token();
    if (!t) return null;
    var res = await fetch(base() + "/rest/v1/items?select=*&deleted_at=is.null&order=added_at.desc", {
      headers: { "apikey": key(), "Authorization": "Bearer " + t }
    });
    if (!res.ok) return null;
    return res.json();
  }

  g.AUTH = {
    configured: configured, signIn: signIn, handleRedirect: handleRedirect,
    session: session, signedIn: signedIn, token: token, refresh: refresh, signOut: signOut,
    rpc: rpc, myHousehold: myHousehold, createHousehold: createHousehold,
    joinHousehold: joinHousehold, items: items, LS: LS
  };
})(window);
