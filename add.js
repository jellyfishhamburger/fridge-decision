/* 添加食材 —— 四种录入方式共用一个「确认清单」
   规则：任何方式都不直接改库存；只有最后按「确认入库」才写一次。
   登录了走云端 RPC（confirm_purchase），没登录就写本机 storage。 */
(function () {
  "use strict";
  var $ = function (s) { return document.querySelector(s); };
  var LANG = (function () { try { return JSON.parse(localStorage.getItem("fd.lang")) || "zh"; } catch (e) { return "zh"; } })();
  function fname(f) { return (LANG === "en" ? (f.name || f.cn) : (f.cn || f.name)) || ""; }
  var $$ = function (s) { return Array.prototype.slice.call(document.querySelectorAll(s)); };
  var NL = String.fromCharCode(10);

  var state = { view: "pick", rows: [], shots: [], cat: "", qty: 1, days: 3, locked: false, busy: false };
  var det = { running: false, timer: null, lm: null, armed: true, last: 0, n: 0 };

  var AI_PORT = 8941;
  var AI_URL = (location.protocol === "http:") ? "http://" + (location.hostname || "127.0.0.1") + ":" + AI_PORT : "";

  /* ---------- 视图 ---------- */
  var TITLES = { pick: "添加食材", manual: "手动添加", detect: "自动检测录入", receipt: "小票识别", batch: "摊开俯拍", review: "确认清单" };

  function go(v) {
    state.view = v;
    $$(".v").forEach(function (el) { el.classList.toggle("on", el.id === "v-" + v); });
    $("#title").textContent = TITLES[v] || "添加食材";
    $("#bar").hidden = !(v === "review" && state.rows.length);
    if (v !== "detect") stopCam();
    window.scrollTo({ top: 0 });
  }

  function toast(msg) {
    var t = document.createElement("div");
    t.textContent = msg;
    t.style.cssText = "position:fixed;left:50%;bottom:110px;transform:translateX(-50%);background:#1F3B2D;color:#fff;padding:10px 16px;border-radius:12px;font-size:13.5px;z-index:99";
    document.body.appendChild(t);
    setTimeout(function () { t.remove(); }, 1800);
  }

  /* ---------- 清单 ---------- */
  function addRow(cat, qty, src, img) {
    var f = FD.byId[cat];
    if (!f) return;
    var same = state.rows.filter(function (r) { return r.cat === cat; })[0];
    if (same && src !== "receipt") { same.qty += (qty || 1); renderRows(); return; }
    state.rows.push({ cat: cat, qty: Math.max(1, qty || 1), src: src || "", img: img || "" });
    renderRows();
  }

  function renderRows() {
    var box = $("#rows");
    box.innerHTML = state.rows.map(function (r, i) {
      var f = FD.byId[r.cat];
      var unit = FD.unitOf ? FD.unitOf(r.cat) : "份";
      return '<div class="row" data-i="' + i + '">' +
        (r.img ? '<img src="' + r.img + '" alt="">' : '<img alt="">') +
        '<div class="nm"><b>' + (f ? fname(f) : r.cat) + "</b><span>" + (f ? f.tag : "") + " · 约 " + (f ? f.days : 3) + " 天</span></div>" +
        '<div class="q"><button data-q="-1">−</button><span>' + r.qty + '</span><button data-q="1">＋</button></div>' +
        '<button class="del" data-del="1" aria-label="删掉">✕</button>' +
        "</div>";
    }).join("") || '<p class="tiny">还没有东西。用上面的方式加，或者点「＋ 补一件」。</p>';
    var n = state.rows.length;
    $("#barTxt").textContent = "共 " + n + " 件要入库";
    $("#confirm").textContent = n ? "确认入库（" + n + " 件）" : "确认入库";
    $("#confirm").disabled = !n;
    $("#bar").hidden = !(state.view === "review" && n);
    $("#cnt") && ($("#cnt").textContent = "已拍 " + state.shots.length + " 件");
  }

  $("#rows").addEventListener("click", function (e) {
    var row = e.target.closest(".row"); if (!row) return;
    var i = +row.dataset.i;
    if (e.target.dataset.del) { state.rows.splice(i, 1); renderRows(); return; }
    var q = e.target.dataset.q;
    if (q) {
      state.rows[i].qty = Math.max(1, state.rows[i].qty + (+q));
      renderRows();
    }
  });

  /* ---------- 手动 ---------- */
  function paintGrid() {
    var box = $("#pickGrid");
    box.innerHTML = FD.CATALOG.map(function (f) {
      return '<button data-cat="' + f.id + '" class="' + (state.cat === f.id ? "on" : "") + '">' + fname(f) + "</button>";
    }).join("");
  }
  $("#pickGrid").addEventListener("click", function (e) {
    var b = e.target.closest("button[data-cat]"); if (!b) return;
    state.cat = b.dataset.cat;
    var f = FD.byId[state.cat];
    state.days = f ? f.days : 3;
    paintGrid();
    $("#manualEdit").hidden = false;
    $("#mQty").textContent = state.qty;
    $("#mDays").textContent = state.days;
    $("#mUnit").textContent = FD.unitOf ? FD.unitOf(state.cat) : "份";
  });
  $("#manualEdit").addEventListener("click", function (e) {
    var q = e.target.dataset.q, d = e.target.dataset.d;
    if (q) { state.qty = Math.max(1, state.qty + (+q)); $("#mQty").textContent = state.qty; }
    if (d) { state.days = Math.max(1, state.days + (+d)); $("#mDays").textContent = state.days; }
  });
  $("#mAdd").addEventListener("click", function () {
    if (!state.cat) return toast("先选一样");
    addRow(state.cat, state.qty, "manual");
    state.qty = 1; $("#mQty").textContent = 1;
    toast("加进清单了，可以继续选");
    go("review");
  });

  /* ---------- 识别策略 ---------- */
  var AI_OK = null;
  async function aiReady() {
    if (AI_OK !== null) return AI_OK;
    if (!AI_URL) { AI_OK = false; return AI_OK; }
    try {
      var d = await fetch(AI_URL + "/health").then(function (x) { return x.json(); });
      AI_OK = !!(d && d.ok);
    } catch (e) { AI_OK = false; }
    return AI_OK;
  }

  /* 给一张 canvas 返回 {cat, name, why}：
     - 有本地 Qwen：开放式识别，能说出"水饺"这种没训过的
     - 没有：退回 9 类端侧模型，但置信度不够就不自动填（宁可让你手选，也别硬猜） */
  async function classifySmart(canvas) {
    if (await aiReady()) {
      try {
        var dataUrl = canvas.toDataURL("image/jpeg", 0.8);
        var r = await fetch(AI_URL + "/recognize", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ image: dataUrl })
        }).then(function (x) { return x.json(); });
        var it = (r && r.items || [])[0];
        if (it) return { cat: catFromName(it.name), name: it.name, why: "ai" };
        return { cat: "", name: "", why: "ai-none" };
      } catch (e) { /* 掉线就退回端侧 */ }
    }
    try {
      var res = await FDCLS.classify(canvas);
      var conf = res.conf || 0;
      var cat = (FDCLS.MAP || {})[res.label] || guessCat(res.label);
      if (!cat) return { cat: "", name: res.label, why: "unknown", conf: conf };
      if (conf < 0.72) return { cat: "", name: res.label, why: "lowconf", conf: conf };
      return { cat: cat, name: res.label, why: "ondevice", conf: conf };
    } catch (e) { return { cat: "", name: "", why: "err" }; }
  }

  /* ---------- 相机 ---------- */
  var stream = null;
  async function startCam() {
    if (stream) return stream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 }, height: { ideal: 1280 } }, audio: false
      });
      var v = $("#cam"); v.srcObject = stream; v.classList.add("on"); await v.play().catch(function () {});
      $("#camHint").textContent = "";
    } catch (e) {
      $("#camHint").textContent = camWhy(e);
      stream = null;
    }
    return stream;
  }
  function camWhy(e) {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) return "这个浏览器不支持直接开相机（微信/QQ 内置浏览器常见），用 Safari 或 Chrome 打开就能用。";
    if (e && e.name === "NotAllowedError") return "相机权限被拒了：地址栏左边图标 → 网站设置 → 允许相机。";
    if (e && e.name === "NotReadableError") return "摄像头被别的程序占用，先关掉其它用相机的 App。";
    if (e && e.name === "NotFoundError") return "没找到摄像头，可以从相册选照片。";
    return "相机没打开（" + ((e && e.name) || "未知") + "），可以从相册选照片。";
  }
  function stopCam() {
    if (stream) { stream.getTracks().forEach(function (t) { t.stop(); }); stream = null; }
    var v = $("#cam"); if (v) v.classList.remove("on");
  }

  function grab() {
    var v = $("#cam");
    var c = document.createElement("canvas");
    c.width = 480; c.height = 480;
    var side = Math.min(v.videoWidth || 480, v.videoHeight || 480);
    c.getContext("2d").drawImage(v, ((v.videoWidth || 480) - side) / 2, ((v.videoHeight || 480) - side) / 2, side, side, 0, 0, 480, 480);
    return c;
  }

  function showShot(dataUrl) {
    var img = $("#shot");
    img.src = dataUrl; img.classList.add("on");
    $("#cam").classList.remove("on");
  }

  /* ---------- 自动检测 ---------- */
  async function loadLM() {
    if (det.lm) return det.lm;
    var vision = await import("./vendor/mediapipe/vision_bundle.mjs");
    var fileset = await vision.FilesetResolver.forVisionTasks("./vendor/mediapipe/wasm");
    var opts = function (dl) {
      return { baseOptions: { modelAssetPath: "./models/hand_landmarker.task", delegate: dl }, runningMode: "VIDEO", numHands: 1 };
    };
    det.lm = await vision.HandLandmarker.createFromOptions(fileset, opts("GPU"))
      .catch(function () { return vision.HandLandmarker.createFromOptions(fileset, opts("CPU")); });
    return det.lm;
  }

  function tick() {
    if (!det.running) return;
    var v = $("#cam");
    if (!v.videoWidth) return;
    try {
      var r = det.lm.detectForVideo(v, Date.now());
      var has = r && r.landmarks && r.landmarks.length;
      if (!has) { det.armed = true; return; }
      if (det.armed && det.n < 30) {
        det.armed = false; det.n++;
        snapOne();
      }
    } catch (e) {}
  }

  async function snapOne() {
    var c = grab();
    var url = c.toDataURL("image/jpeg", 0.85);
    showShot(url);
    state.shots.push({ img: url });
    var r = await classifySmart(c);
    if (r.cat) addRow(r.cat, 1, "detect", url);
    else if (r.why === "lowconf") $("#detHint").textContent = "这张没认准（" + Math.round((r.conf || 0) * 100) + "%）—— 先拍着，等下在清单里手动选。";
    else if (r.why === "ai-none") $("#detHint").textContent = "这张没认出食材，跳过。";
    else if (r.name) $("#detHint").textContent = "认成了「" + r.name + "」，不在食材表里 —— 等下手动选。";
    if (!r.cat) { state.needManual = true; }
    $("#detHint").textContent = "已拍 " + state.shots.length + " 件" + (state.needManual ? "（有没认准的，等下补）" : "") + " —— 放完点「结束并确认」。";
    renderRows();
  }

  function guessCat(label) {
    var m = { chili: "chili", egg: "egg", greens: "greens", milk: "milk", mushroom: "mushroom", pork: "pork", tofu: "tofu", tomato: "tomato" };
    return m[label] || "";
  }

  $("#detToggle").addEventListener("click", async function () {
    if (det.running) { detStop(); return; }
    var btn = this;
    if (!stream) await startCam();
    if (!stream) { toast("相机没打开，先用下面的「从相册选」"); return; }
    btn.textContent = "正在加载手部模型…"; btn.disabled = true;
    try { await loadLM(); } catch (e) {
      btn.disabled = false; btn.textContent = "开始检测";
      $("#detHint").textContent = "手部模型加载失败：" + (e && e.message);
      return;
    }
    btn.disabled = false; btn.textContent = "结束并确认"; btn.classList.add("on");
    det.running = true; det.armed = true; det.n = 0;
    $("#detHint").textContent = "手伸进来就自动拍，不用再按。";
    det.timer = setInterval(tick, 220);
  });

  function detStop() {
    det.running = false;
    if (det.timer) { clearInterval(det.timer); det.timer = null; }
    var b = $("#detToggle"); b.textContent = "开始检测"; b.classList.remove("on");
    if (!state.rows.length) { $("#detHint").textContent = "这一轮没拍到东西。可以再试一次，或从相册选。"; return; }
    go("review");
  }

  /* ---------- 相册选图（检测页的兜底） ---------- */
  $("#detPick").addEventListener("click", function () { $("#fileIn").click(); });
  $("#fileIn").addEventListener("change", async function (e) {
    var files = Array.prototype.slice.call(e.target.files || []);
    e.target.value = "";
    for (var i = 0; i < files.length; i++) {
      try {
        var c = await fileToCanvas(files[i]);
        var url = c.toDataURL("image/jpeg", 0.85);
        showShot(url);
        var rr = await classifySmart(c);
        if (rr.cat) addRow(rr.cat, 1, "album", url);
        state.shots.push({ img: url });
      } catch (err) {}
    }
    renderRows();
    if (state.rows.length) go("review");
  });

  function fileToCanvas(file) {
    return new Promise(function (res, rej) {
      var url = URL.createObjectURL(file);
      var img = new Image();
      img.onload = function () {
        var c = document.createElement("canvas");
        var side = Math.min(img.naturalWidth, img.naturalHeight);
        c.width = 480; c.height = 480;
        c.getContext("2d").drawImage(img, (img.naturalWidth - side) / 2, (img.naturalHeight - side) / 2, side, side, 0, 0, 480, 480);
        URL.revokeObjectURL(url); res(c);
      };
      img.onerror = function () { URL.revokeObjectURL(url); rej(new Error("读不了这张图")); };
      img.src = url;
    });
  }

  /* ---------- 小票 ---------- */
  $("#rShot").addEventListener("click", function () { pickReceiptFile(); });
  $("#rPick").addEventListener("click", function () { pickReceiptFile(); });

  function pickReceiptFile() {
    var inp = document.createElement("input");
    inp.type = "file"; inp.accept = "image/*";
    inp.onchange = function () { if (inp.files[0]) readReceipt(inp.files[0]); };
    inp.click();
  }

  async function readReceipt(file) {
    var msg = $("#rMsg");
    msg.textContent = "正在读小票…（第一次要下模型，约 20 秒）";
    try {
      var dataUrl = await fileToDataUrl(file);
      var lines = await RECEIPT.readLines(dataUrl, "fast");
      var text = lines.join(NL);
      $("#rRaw").textContent = text || "（空）";
      $("#rRawBox").hidden = !text;
      var parsed = RECEIPT.parse(text);
      if (!parsed.length) {
        msg.textContent = "没读出商品。可以换一张更清楚的，或者手动添加。";
        return;
      }
      parsed.forEach(function (p) { addRow(p.cat, p.qty || 1, "receipt"); });
      msg.textContent = "读到 " + parsed.length + " 样，已放进清单。";
      go("review");
    } catch (e) {
      msg.textContent = "读不出来：" + (e && e.message);
    }
  }

  function fileToDataUrl(file) {
    return new Promise(function (res, rej) {
      var fr = new FileReader();
      fr.onload = function () { res(fr.result); };
      fr.onerror = function () { rej(new Error("读不了文件")); };
      fr.readAsDataURL(file);
    });
  }

  /* ---------- 摊开俯拍 ---------- */
  $("#bShot").addEventListener("click", function () { pickBatch(); });
  $("#bPick").addEventListener("click", function () { pickBatch(); });

  function pickBatch() {
    var inp = document.createElement("input");
    inp.type = "file"; inp.accept = "image/*";
    inp.onchange = function () { if (inp.files[0]) readBatch(inp.files[0]); };
    inp.click();
  }

  async function readBatch(file) {
    var msg = $("#bMsg");
    if (!AI_URL) {
      msg.textContent = "整批识别要用电脑上的识别服务（本机 http 打开才有）。先用手动添加吧。";
      return;
    }
    msg.textContent = "正在识别…";
    try {
      var dataUrl = await fileToDataUrl(file);
      var r = await fetch(AI_URL + "/recognize", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ image: dataUrl })
      }).then(function (x) { return x.json(); });
      var items = (r && r.items) || [];
      if (!items.length) { msg.textContent = "没认出来。" + (r && r.error ? r.error : ""); return; }
      items.forEach(function (it) {
        var cat = catFromName(it.name);
        if (cat) addRow(cat, it.qty || 1, "batch", dataUrl);
      });
      msg.textContent = "认出 " + items.length + " 样。";
      go("review");
    } catch (e) {
      msg.textContent = "连不上识别服务：" + (e && e.message);
    }
  }

  function catFromName(n) {
    var A = (window.RECEIPT && window.RECEIPT.ALIAS) || {};
    n = String(n || "").trim();
    if (!n) return "";
    for (var k in A) for (var i = 0; i < A[k].length; i++) {
      var a = A[k][i];
      if (n.indexOf(a) >= 0 || a.indexOf(n) >= 0) return k;
    }
    return "";
  }

  /* ---------- 确认入库 ---------- */
  $("#confirm").addEventListener("click", async function () {
    if (state.locked || !state.rows.length) return;
    state.locked = true;
    var btn = this; var old = btn.textContent;
    btn.disabled = true; btn.textContent = "正在入库…";
    try {
      var stats = (window.AUTH && AUTH.configured && AUTH.configured() && AUTH.signedIn())
        ? await cloudConfirm()
        : localConfirm();
      state.rows = [];
      renderRows();
      $("#bar").hidden = true;
      toast("入库完成：新增 " + stats.added + "，改数量 " + stats.adjusted);
      setTimeout(function () { location.href = "index.html#fridge"; }, 700);
    } catch (e) {
      btn.disabled = false; btn.textContent = old; state.locked = false;
      toast("没写成功：" + (e && e.message));
    }
  });

  function localConfirm() {
    var items = [];
    try { items = FD.items() || []; } catch (e) { items = []; }
    var added = 0, adjusted = 0;
    var today = FD.localDate ? FD.localDate() : new Date().toISOString().slice(0, 10);
    state.rows.forEach(function (r) {
      var f = FD.byId[r.cat]; if (!f) return;
      var ex = items.filter(function (i) { return i.cat === r.cat; })[0];
      if (ex) { ex.qty = (Number(ex.qty) || 0) + r.qty; adjusted++; return; }
      items.push({
        id: "i" + Date.now() + Math.floor(Math.random() * 1e4),
        cat: f.id, name: fname(f), tag: f.tag, qty: r.qty, unit: FD.unitOf ? FD.unitOf(f.id) : "份",
        daysLeft: f.days, life: f.days, addedAt: today
      });
      added++;
    });
    FD.saveItems(items);
    return { added: added, adjusted: adjusted };
  }

  async function cloudConfirm() {
    var sid = await AUTH.rpc("start_capture_session", {});
    var payload = state.rows.map(function (r) {
      var f = FD.byId[r.cat];
      return { action: "add", cat: f.id, name: fname(f), tag: f.tag, qty: r.qty, unit: FD.unitOf ? FD.unitOf(f.id) : "份", life: f.days };
    });
    var res = await AUTH.rpc("confirm_purchase", { p_session: sid, p_rows: payload, p_key: sid + ":confirm" });
    return { added: (res && res.added) | 0, adjusted: (res && res.adjusted) | 0 };
  }

  /* ---------- 导航 ---------- */
  $$("[data-go]").forEach(function (b) {
    b.addEventListener("click", function () {
      var v = b.dataset.go;
      go(v);
      if (v === "detect") startCam();
      if (v === "manual") paintGrid();
    });
  });
  $("#back").addEventListener("click", function () {
    if (state.view === "pick") location.href = "index.html#fridge";
    else if (state.view === "review" && state.rows.length) go("pick");
    else go("pick");
  });
  $("#addMore").addEventListener("click", function () { go("manual"); paintGrid(); });
  $("#undo").addEventListener("click", function () {
    var s = state.shots.pop();
    if (s) {
      var i = state.rows.map(function (r) { return r.img; }).lastIndexOf(s.img);
      if (i >= 0) state.rows.splice(i, 1);
    }
    if (state.shots.length) showShot(state.shots[state.shots.length - 1].img); else { $("#shot").classList.remove("on"); $("#cam").classList.add("on"); }
    renderRows();
  });

  /* ---------- 启动 ---------- */
  if (!FD.byId) { document.body.innerHTML = "<p style='padding:20px'>data.js 没加载成功。</p>"; return; }
  paintGrid();
  renderRows();
  var startView = (location.search.match(/[?&]v=([a-z]+)/) || [])[1];
  if (startView && TITLES[startView] && startView !== "pick") {
    go(startView);
    if (startView === "detect") startCam();
    if (startView === "manual") paintGrid();
  } else {
    go("pick");
  }
})();
