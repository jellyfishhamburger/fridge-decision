/* 添加食材 —— 四种录入方式共用一个「确认清单」
   规则：任何方式都不直接改库存；只有最后按「确认入库」才写一次。
   登录了走云端 RPC（confirm_purchase），没登录就写本机 storage。 */
(function () {
  "use strict";
  var $ = function (s) { return document.querySelector(s); };
  /* fd.lang 存的是纯字符串（"zh"/"en"），不是 JSON —— 以前用 JSON.parse 会抛错，
     于是这一页永远中文。也别只看一次：切语言后要跟着变。 */
  window.addEventListener('DOMContentLoaded', function () { if (window.I18N && I18N.apply) I18N.apply(); });

  function curLang() {
    try {
      var v = localStorage.getItem("fd.lang");
      if (window.I18N && I18N.getLang) return I18N.getLang();
      return (v === "en" || v === "zh") ? v : "zh";
    } catch (e) { return "zh"; }
  }
  var LANG = curLang();
  function fname(f) { return (LANG === "en" ? (f.name || f.cn) : (f.cn || f.name)) || ""; }
  var $$ = function (s) { return Array.prototype.slice.call(document.querySelectorAll(s)); };
  var NL = String.fromCharCode(10);

  var state = { view: "pick", rows: [], shots: [], cat: "", qty: 1, days: 3, locked: false, busy: false, editId: "" };
  var EDIT_ID = (location.search.match(/[?&]edit=([^&]+)/) || [])[1] || "";
  var det = { running: false, timer: null, lm: null, armed: true, last: 0, n: 0 };

  var AI_PORT = 8941;
  var AI_URL = (function () {
    var q = (location.search.match(/[?&]ai=([^&]+)/) || [])[1];
    if (q) {
      var u = decodeURIComponent(q);
      try { localStorage.setItem("fd.ai.url", u); } catch (e) {}
      return u.replace(/\/$/, "");
    }
    try {
      var saved = localStorage.getItem("fd.ai.url");
      if (saved) return saved.replace(/\/$/, "");
    } catch (e) {}
    return location.protocol === "http:" ? "http://" + (location.hostname || "127.0.0.1") + ":" + AI_PORT : "";
  })();

  /* ---------- 视图 ---------- */
  var TITLES = { pick: "add.title", manual: "add.mT", detect: "add.dT", receipt: "add.rT", batch: "add.bT", review: "add.revTitle" };
  function tt(key, fallback) {
    if (window.I18N && I18N.t) { var v = I18N.t(key); if (v && v !== key) return v; }
    return fallback || "";
  }

  function go(v) {
    state.view = v;
    $$(".v").forEach(function (el) { el.classList.toggle("on", el.id === "v-" + v); });
    $("#title").textContent = TITLES[v] ? tt(TITLES[v], v) : tt("add.title", "添加食材");
    document.title = $("#title").textContent;
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
  function addRow(cat, qty, src, img, guessName) {
    var f = FD.byId[cat];
    if (cat && !f) return;
    var same = state.rows.filter(function (r) { return r.cat === cat; })[0];
    if (same && src !== "receipt") { same.qty += (qty || 1); renderRows(); return; }
    state.rows.push({ cat: cat || "", qty: Math.max(1, qty || 1), src: src || "", img: img || "", guess: guessName || "" });
    renderRows();
  }

  /* 每一行都能直接改成正确的食材：认错了不用删掉重来 */
  function selHtml(r) {
    var opts = '<option value="">' + (r.guess ? "认成「" + r.guess + "」，选一样" : "选一样…") + "</option>" +
      FD.CATALOG.map(function (c) {
        return '<option value="' + c.id + '"' + (c.id === r.cat ? " selected" : "") + ">" + fname(c) + "</option>";
      }).join("");
    return '<select data-sel="1">' + opts + "</select>";
  }

  function renderRows() {
    var box = $("#rows");
    box.innerHTML = state.rows.map(function (r, i) {
      var f = FD.byId[r.cat];
      var unit = FD.unitOf ? FD.unitOf(r.cat) : "份";
      var ico = (f && window.FD_ICON) ? window.FD_ICON(f.id, 30) : "";
      return '<div class="row" data-i="' + i + '">' +
        '<div class="thumb">' + (r.img ? '<img src="' + r.img + '" alt="">' : ico) + '</div>' +
        '<div class="nm">' + selHtml(r) + "<span>" + (f ? f.tag + " · " + tt("add.aboutDays", "{n} 天").replace("{n}", f.days) : tt("add.notChosen", "还没选是哪一样")) + "</span></div>" +
        '<div class="ctl">' +
          '<div class="q"><button data-q="-1">−</button><span>' + r.qty + '</span><button data-q="1">＋</button></div>' +
          '<button class="del" data-del="1" aria-label="删掉">✕</button>' +
        '</div>' +
        "</div>";
    }).join("") || '<p class="tiny">' + tt("add.noRows", "还没有东西。用上面的方式加，或者点「＋ 补一件」。") + '</p>';
    var n = state.rows.filter(function (r) { return !!r.cat; }).length;
    $("#barTxt").textContent = tt("add.barTxt", "共 " + n + " 件要入库").replace("{n}", n);
    $("#confirm").textContent = n ? tt("add.confirmN", "确认入库").replace("{n}", n) : tt("add.confirm", "确认入库");
    $("#confirm").disabled = !n;
    $("#bar").hidden = !(state.view === "review" && state.rows.length);
    /* 底栏在大字体下会换成两行，高度不固定 → 按实际高度给列表留白 */
    requestAnimationFrame(function () {
      var bar = $("#bar");
      box.style.paddingBottom = (bar && !bar.hidden ? bar.offsetHeight + 18 : 0) + "px";
    });
    $("#cnt") && ($("#cnt").textContent = tt("add.shotN", "已拍 {n} 件").replace("{n}", state.shots.length));
  }

  $("#rows").addEventListener("click", function (e) {
    if (e.target.tagName === "SELECT") return;
    var row = e.target.closest(".row"); if (!row) return;
    var i = +row.dataset.i;
    if (e.target.dataset.del) { state.rows.splice(i, 1); renderRows(); return; }
    var q = e.target.dataset.q;
    if (q) {
      state.rows[i].qty = Math.max(1, state.rows[i].qty + (+q));
      renderRows();
    }
  });

  $("#rows").addEventListener("change", function (e) {
    if (e.target.tagName !== "SELECT") return;
    var row = e.target.closest(".row"); if (!row) return;
    state.rows[+row.dataset.i].cat = e.target.value;
    renderRows();
  });

  /* ---------- 手动 ---------- */
  /* 77 项平铺看不清，按类别分组；顶部给一排跳转 */
  var GROUPS = [
    { id: "veg",   tags: ["greens", "veg"], label: ["蔬菜", "Vegetables"] },
    { id: "meat",  tags: ["protein"],       label: ["肉蛋", "Meat & eggs"] },
    { id: "carb",  tags: ["carb"],          label: ["主食", "Staples"] },
    { id: "dairy", tags: ["dairy"],         label: ["奶制品", "Dairy"] },
    { id: "fruit", tags: ["fruit"],         label: ["水果", "Fruit"] },
    { id: "other", tags: ["other"],         label: ["其他", "Other"] }
  ];

  function paintGrid() {
    var box = $("#pickGrid");
    if (!box) return;
    var en = (window.I18N && I18N.getLang && I18N.getLang() === "en") ? 1 : 0;
    var html = "";
    GROUPS.forEach(function (g) {
      var items = FD.CATALOG.filter(function (f) { return g.tags.indexOf(f.tag) >= 0; });
      if (!items.length) return;
      html += '<section class="grp" id="grp-' + g.id + '">'
        + '<h3><b>' + g.label[en] + '</b><span>' + items.length + '</span></h3>'
        + '<div class="grid">'
        + items.map(function (f) {
            var ic = (window.FD_ICON && FD_ICON(f.id, 26)) || "";
            return '<button data-cat="' + f.id + '" class="' + (state.cat === f.id ? "on" : "") + '">'
              + ic + "<i>" + fname(f) + "</i></button>";
          }).join("")
        + '</div></section>';
    });
    box.innerHTML = html;

    var jump = $("#catJump");
    if (jump) {
      jump.innerHTML = GROUPS.map(function (g) {
        var n = FD.CATALOG.filter(function (f) { return g.tags.indexOf(f.tag) >= 0; }).length;
        if (!n) return "";
        return '<a href="#grp-' + g.id + '" data-jump="grp-' + g.id + '">' + g.label[en] + " " + n + "</a>";
      }).join("");
      jump.querySelectorAll("[data-jump]").forEach(function (a) {
        a.addEventListener("click", function (ev) {
          ev.preventDefault();
          var el = document.getElementById(a.dataset.jump);
          if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
        });
      });
    }
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
    $("#mAdd").textContent = state.editId ? tt("add.mSave", "保存修改") : tt("add.mAdd", "加进清单");
  });
  $("#manualEdit").addEventListener("click", function (e) {
    var q = e.target.dataset.q, d = e.target.dataset.d;
    if (q) { state.qty = Math.max(1, state.qty + (+q)); $("#mQty").textContent = state.qty; }
    if (d) { state.days = Math.max(1, state.days + (+d)); $("#mDays").textContent = state.days; }
  });
  $("#mAdd").addEventListener("click", function () {
    if (!state.cat) return toast("先选一样");
    if (state.editId) {
      var all = FD.items() || [];
      var it = all.filter(function (x) { return x.id === state.editId; })[0];
      if (it) {
        var f = FD.byId[state.cat];
        it.cat = state.cat; it.name = f ? fname(f) : it.name; it.tag = f ? f.tag : it.tag;
        it.qty = state.qty; it.unit = FD.unitOf ? FD.unitOf(state.cat) : it.unit;
        it.life = state.days; it.daysLeft = state.days;
        FD.saveItems(all);
        toast("已保存");
        setTimeout(function () { location.href = "index.html#fridge"; }, 500);
      }
      return;
    }
    addRow(state.cat, state.qty, "manual");
    state.qty = 1; $("#mQty").textContent = 1;
    toast("加进清单了，可以继续选");
    go("review");
  });

  /* ---------- 离线识别：CLIP 零样本（不需要电脑、不需要服务器） ---------- */
  /* 离线 CLIP 还没跑通（onnxruntime 的 wasm 在纯静态托管下起不来），先关掉，
     免得每次识别都白试一遍再超时。代码留着，下一步换成能跑的方案。 */
  var CLIP_ON = true;
  var clipP = null;
  async function clipPipeline() {
    if (clipP) return clipP;
    clipP = (async function () {
      var mod = await import("./vendor/transformers/transformers.min.js");
      mod.env.allowLocalModels = false;
      mod.env.backends.onnx.wasm.wasmPaths = "./vendor/transformers/";
      /* 静态托管没有 COOP/COEP，多线程 wasm 起不来，强制单线程 */
      mod.env.backends.onnx.wasm.numThreads = 1;
      return await mod.pipeline("zero-shot-image-classification", "Xenova/clip-vit-base-patch32", { quantized: true });
    })();
    return clipP;
  }

  /* 同一品类给多个说法：CLIP 对措辞很敏感，多写几种能明显提命中 */
  var CLIP_EXTRA = {
    greens: ["青菜", "小白菜", "生菜", "菠菜", "菜心", "油麦菜", "娃娃菜"],
    tomato: ["番茄", "西红柿"],
    chili: ["辣椒", "青椒", "尖椒"],
    mushroom: ["蘑菇", "香菇", "金针菇", "平菇"],
    egg: ["鸡蛋", "一盒鸡蛋", "蛋"],
    milk: ["牛奶", "一盒牛奶", "鲜奶"],
    tofu: ["豆腐", "一盒豆腐", "豆干"],
    pork: ["猪肉", "一块猪肉", "五花肉", "肉片"],
    beef: ["牛肉", "牛肉片"],
    chicken: ["鸡肉", "鸡胸肉", "鸡腿"],
    fish: ["鱼", "一条鱼", "鱼片"],
    shrimp: ["虾", "一盒虾", "虾仁"],
    dumpling: ["速冻饺子", "水饺", "冷冻水饺", "云吞", "汤圆"],
    bread: ["面包", "一袋面包", "吐司"],
    rice: ["米饭", "大米", "剩饭"],
    noodles: ["面条", "挂面", "一包面"],
    yogurt: ["酸奶", "一杯酸奶"],
    cheese: ["芝士", "奶酪", "黄油"],
    onion: ["洋葱", "一个洋葱"],
    potato: ["土豆", "马铃薯"],
    carrot: ["胡萝卜", "红萝卜"],
    broccoli: ["西兰花", "青花菜"],
    eggplant: ["茄子"],
    cucumber: ["黄瓜", "青瓜"],
    cabbage: ["白菜", "大白菜"],
    baby_cabbage: ["娃娃菜"],
    lettuce: ["生菜"],
    spinach: ["菠菜"],
    celery: ["芹菜"],
    cherry_tomato: ["小番茄", "圣女果"],
    red_chili: ["红辣椒", "小米辣"],
    cauliflower: ["花菜", "菜花"],
    enoki: ["金针菇"],
    corn: ["玉米"],
    pumpkin: ["南瓜"],
    sweet_potato: ["红薯", "地瓜", "番薯"],
    purple_potato: ["紫薯", "紫心红薯", "紫地瓜"],
    mantou: ["馒头"],
    apple: ["苹果"],
    banana: ["香蕉"],
    mandarin: ["砂糖橘", "沙糖橘", "橘子"],
    orange: ["橙子"],
    grape: ["葡萄"],
    strawberry: ["草莓"],
    blueberry: ["蓝莓"],
    pear: ["梨"],
    watermelon: ["西瓜"],
    kiwi: ["猕猴桃"],
    mango: ["芒果"],
    lemon: ["柠檬"],
  };

  /* 展开成 CLIP 的候选标签：每个说法对应回品类 */
  function clipCandidates() {
    var out = [];
    FD.CATALOG.forEach(function (c) {
      var names = [fname(c)].concat(CLIP_EXTRA[c.id] || []);
      names.forEach(function (n) { out.push({ label: n + " / " + (c.name || ""), cat: c.id, name: n }); });
    });
    return out;
  }
  function catFromClipLabel(lbl) {
    var cn = String(lbl).split("/")[0].trim();
    for (var i = 0; i < FD.CATALOG.length; i++) {
      var c = FD.CATALOG[i];
      if (fname(c) === cn || c.name === String(lbl).split("/")[1] && false) return c.id;
    }
    return catFromName(cn);
  }

  function centerCrop(canvas, ratio) {
    var w = canvas.width, h = canvas.height;
    var side = Math.floor(Math.min(w, h) * ratio);
    var c = document.createElement("canvas");
    c.width = side; c.height = side;
    c.getContext("2d").drawImage(canvas, (w - side) / 2, (h - side) / 2, side, side, 0, 0, side, side);
    return c;
  }

  async function clipScores(canvas) {
    var pipe = await clipPipeline();
    var cand = clipCandidates();
    var labels = cand.map(function (c) { return c.label; });
    /* 两遍：整图 + 中心裁切。中心的那次加权，因为拍的是手里那件 */
    var full = await pipe(canvas.toDataURL("image/jpeg", 0.8), labels);
    var mid = await pipe(centerCrop(canvas, 0.62).toDataURL("image/jpeg", 0.8), labels);
    var score = {};
    var name = {};
    [full, mid].forEach(function (list, idx) {
      var wgt = idx === 0 ? 1.0 : 1.35;
      (list || []).forEach(function (o) {
        var hit = cand.filter(function (c) { return c.label === o.label; })[0];
        if (!hit) return;
        var v = o.score * wgt;
        if (!(hit.cat in score) || v > score[hit.cat]) { score[hit.cat] = v; name[hit.cat] = hit.name; }
      });
    });
    var ranked = Object.keys(score).map(function (k) { return { cat: k, score: score[k], name: name[k] }; })
      .sort(function (a, b) { return b.score - a.score; });
    return ranked;
  }

  async function classifyClip(canvas) {
    var ranked = await clipScores(canvas);
    if (!ranked.length) return { cat: "", name: "", why: "clip-none" };
    var top = ranked[0], sec = ranked[1] || { score: 0 };
    var cat = top.cat;

    if (top.score >= 0.12 && (top.score - sec.score) >= 0.03) {
      return { cat: cat, name: top.name, why: "clip", conf: top.score };
    }
    return { cat: "", name: top.name, why: "lowconf", conf: top.score };
  }

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
      var c2 = null;
      if (CLIP_ON) { try { c2 = await classifyClip(canvas); } catch (e2) { c2 = null; } }
      if (c2 && c2.cat) return c2;
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
    var f = document.querySelector(".stage .frame");
    if (f) f.classList.add("off");
  }
  function showLive() {
    var img = $("#shot");
    img.classList.remove("on"); img.removeAttribute("src");
    $("#cam").classList.add("on");
    var f = document.querySelector(".stage .frame");
    if (f) f.classList.remove("off");
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
      if (det.armed && det.n < 30 && !det.busy && Date.now() - (det.last || 0) > 1200) {
        det.armed = false; det.n++;
        snapOne();
      }
    } catch (e) {}
  }

  async function snapOne() {
    if (det.busy) return;
    det.busy = true;
    det.last = Date.now();
    var c = grab();
    var url = c.toDataURL("image/jpeg", 0.85);
    /* 相机保持常亮：抓拍只在画面上闪一下 + 边框变绿 + 提示音，
       否则用户会以为「卡住了 / 相机没了」。 */
    state.shots.push({ img: url });
    flashCapture(url);
    var r = { cat: "", name: "" };
    try { r = await classifySmart(c); } catch (e) { r = { cat: "", name: "" }; }
    if (r.cat) addRow(r.cat, 1, "detect", url);
    else addRow("", 1, "detect", url, r.name || "");
    if (!r.cat) state.needManual = true;
    var note = r.cat ? "" : (r.why === "lowconf" ? "（没认准，等下选）" : r.name ? "（认成「" + r.name + "」，等下选）" : "（没认出来，等下选）");
    $("#detHint").textContent = "✓ 拍到第 " + state.shots.length + " 件" + note +
      " · 继续放下一件，全部放完点「结束并确认」。";
    renderRows();
    det.busy = false;
  }

  /* 抓拍的三重反馈：白闪 + 取景框变绿打勾 + 提示音/震动 */
  function flashCapture(url) {
    var st = document.querySelector(".stage");
    var fr = document.querySelector(".stage .frame");
    var sp = fr && fr.querySelector("span");
    if (st) {
      st.classList.remove("flash");
      void st.offsetWidth;
      st.classList.add("flash");
      setTimeout(function () { st.classList.remove("flash"); }, 460);
    }
    if (fr) {
      fr.classList.add("ok");
      if (sp) sp.textContent = "✓ 拍到了";
      setTimeout(function () {
        fr.classList.remove("ok");
        if (sp) sp.textContent = tt("add.frame", "把手里的东西放进框里");
      }, 950);
    }
    beep();
    try { if (navigator.vibrate) navigator.vibrate(28); } catch (e) {}
    addThumb(url);
  }

  function addThumb(url) {
    var box = $("#detStrip");
    if (!box) return;
    var n = state.shots.length;
    var d = document.createElement("div");
    d.className = "detitem";
    d.innerHTML = '<b>' + n + '</b><img src="' + url + '" alt="">';
    box.insertBefore(d, box.firstChild);
    while (box.children.length > 12) box.removeChild(box.lastChild);
  }

  var AC = null;
  function beep() {
    try {
      AC = AC || new (window.AudioContext || window.webkitAudioContext)();
      var o = AC.createOscillator(), g = AC.createGain();
      o.type = "sine"; o.frequency.value = 880;
      g.gain.setValueAtTime(0.001, AC.currentTime);
      g.gain.exponentialRampToValueAtTime(0.12, AC.currentTime + 0.01);
      g.gain.exponentialRampToValueAtTime(0.001, AC.currentTime + 0.16);
      o.connect(g); g.connect(AC.destination);
      o.start(); o.stop(AC.currentTime + 0.17);
    } catch (e) {}
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
      btn.disabled = false; btn.textContent = tt("add.detStart", "开始检测");
      $("#detHint").textContent = "手部模型加载失败：" + (e && e.message);
      return;
    }
    btn.disabled = false; btn.textContent = "结束并确认"; btn.classList.add("on");
    det.running = true; det.armed = true; det.n = 0;
    $("#detHint").textContent = "把东西拿在手里，伸进虚线框内 —— 会自动抓拍（画面会闪一下、框变绿）。拍完继续放下一件。";
    det.timer = setInterval(tick, 220);
  });

  function detStop() {
    det.running = false;
    if (det.timer) { clearInterval(det.timer); det.timer = null; }
    var b = $("#detToggle"); b.textContent = tt("add.detStart", "开始检测"); b.classList.remove("on");
    if (!state.rows.length) { $("#detHint").textContent = "这一轮没拍到东西。可以再试一次，或从相册选。"; return; }
    go("review");
  }

  /* ---------- 相册选图（检测页的兜底） ---------- */
  var detPickBtn = $("#detPick");
  if (detPickBtn) detPickBtn.addEventListener("click", function () { $("#fileIn").click(); });
  $("#fileIn").addEventListener("change", async function (e) {
    var files = Array.prototype.slice.call(e.target.files || []);
    e.target.value = "";
    for (var i = 0; i < files.length; i++) {
      try {
        var c = await fileToCanvas(files[i]);
        var url = c.toDataURL("image/jpeg", 0.85);
        showShot(url);
        var rr = await classifySmart(c);
        addRow(rr.cat, 1, "album", url, rr.name || "");
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

  function pickReceiptFile() { $("#rcptIn").click(); }
  $("#rcptIn").addEventListener("change", function (e) {
    var f = e.target.files && e.target.files[0];
    e.target.value = "";
    if (f) readReceipt(f);
  });

  /* 相册里的小票动辄 4000x3000，整张丢给 wasm 会跑到内存发抖、几十秒不返回。
     统一先缩到长边 1800，识别率不掉，速度快 3-5 倍。 */
  function shrinkImage(file, maxSide) {
    return new Promise(function (res, rej) {
      var url = URL.createObjectURL(file);
      var img = new Image();
      var done = false;
      var to = setTimeout(function () {
        if (done) return; done = true;
        URL.revokeObjectURL(url);
        rej(new Error("图片打不开（可能是 HEIC 或损坏），换一张 JPG 试试"));
      }, 12000);
      img.onload = function () {
        if (done) return; done = true; clearTimeout(to);
        try {
          var w = img.naturalWidth, h = img.naturalHeight;
          var k = Math.min(1, maxSide / Math.max(w, h));
          var c = document.createElement("canvas");
          c.width = Math.round(w * k); c.height = Math.round(h * k);
          c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
          URL.revokeObjectURL(url);
          res(c.toDataURL("image/jpeg", 0.92));
        } catch (e) { rej(e); }
      };
      img.onerror = function () {
        if (done) return; done = true; clearTimeout(to);
        URL.revokeObjectURL(url);
        rej(new Error("图片打不开（可能是 HEIC 或损坏），换一张 JPG 试试"));
      };
      img.src = url;
    });
  }

  function withTimeout(promise, ms, tag) {
    return new Promise(function (res, rej) {
      var done = false;
      var t = setTimeout(function () {
        if (done) return; done = true;
        rej(new Error(tag + " 超时" + Math.round(ms / 1000) + "秒"));
      }, ms);
      promise.then(function (v) { if (!done) { done = true; clearTimeout(t); res(v); } },
                   function (e) { if (!done) { done = true; clearTimeout(t); rej(e); } });
    });
  }

  async function readReceipt(file) {
    var msg = $("#rMsg");
    var t0 = Date.now();
    msg.textContent = "准备图片…";
    try {
      var dataUrl = await shrinkImage(file, 3200);
      /* 小票是热敏纸 + 手机拍的，tesseract 对中文几乎全是乱码（实测把「品名」读成 he）。
         paddle 在同一张图上能读对 90% 以上，所以默认用它；真跑不起来才退回 fast。 */
      msg.textContent = "正在识别…（第一次加载模型约 10–20 秒，之后 5 秒）";
      var lines = [];
      try {
        lines = await withTimeout(RECEIPT.readLines(dataUrl, "paddle"), 45000, "高精度引擎");
      } catch (e1) {
        msg.textContent = "高精度引擎没起来，换快速引擎再试…";
        lines = await withTimeout(RECEIPT.readLines(dataUrl, "fast"), 25000, "快速引擎");
      }
      if (!lines || !lines.length) {
        msg.textContent = "换快速引擎再试…";
        lines = await withTimeout(RECEIPT.readLines(dataUrl, "fast"), 25000, "快速引擎");
      }
      var text = lines.join(NL);
      $("#rRaw").textContent = text || "（空）";
      $("#rRawBox").hidden = !text;
      var parsed = RECEIPT.parse(text);
      /* 缩图偶尔会吃掉一行（实测 2600 时「香甜蕉」整行消失）。
         商品少于 3 样就用原图再跑一遍，取读到的更多的那个结果。 */
      if (parsed.length < 3) {
        msg.textContent = "商品没读全，用原图再试一次…";
        try {
          var full = await shrinkImage(file, 99999);
          var l2 = await withTimeout(RECEIPT.readLines(full, "paddle"), 60000, "高精度引擎");
          var t2 = l2.join(NL);
          var p2 = RECEIPT.parse(t2);
          if (p2.length > parsed.length) { parsed = p2; text = t2; }
        } catch (e2) {}
        $("#rRaw").textContent = text || "（空）";
        $("#rRawBox").hidden = !text;
      }
      if (!parsed.length) {
        msg.textContent = "没读出商品。可以换一张更清楚的，或者手动添加。";
        return;
      }
      parsed.forEach(function (p) { addRow(p.cat, p.qty || 1, "receipt"); });
      msg.textContent = "读到 " + parsed.length + " 样，已放进清单（" +
        Math.round((Date.now() - t0) / 1000) + " 秒）。";
      go("review");
    } catch (e) {
      msg.textContent = "读不出来：" + (e && e.message) +
        "。可以改用「拍小票」，或者手动添加。";
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

  function pickBatch() { $("#batchIn").click(); }
  $("#batchIn").addEventListener("change", function (e) {
    var f = e.target.files && e.target.files[0];
    e.target.value = "";
    if (f) readBatch(f);
  });

  async function readBatch(file) {
    var msg = $("#bMsg");
    msg.textContent = "正在识别…";
    try {
      var dataUrl = await fileToDataUrl(file);
      var useAI = AI_URL && await aiReady();
      if (!useAI) {
        /* 没有本地服务：用浏览器里的 CLIP 认这一张的主体 */
        var c = await fileToCanvas(file);
        var r0 = await classifyClip(c).catch(function(){ return {cat:"",name:"",why:"clip-off"}; });
        if (r0.cat) addRow(r0.cat, 1, "batch", dataUrl);
        else addRow("", 1, "batch", dataUrl, r0.name || "");
        msg.textContent = r0.cat ? "认出了 1 样。" : "没认准，清单里手动选。";
        go("review");
        return;
      }
      /* CLIP 先给三个候选，作为提示交给 Qwen：既省它瞎猜，也保留开放性 */
      var hint = [];
      try {
        var cc = await fileToCanvas(file);
        var ranked = await clipScores(cc);
        hint = ranked.slice(0, 3).map(function (r) { return r.name; }).filter(Boolean);
      } catch (e) {}
      var r = await fetch(AI_URL + "/recognize", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ image: dataUrl, hint: hint })
      }).then(function (x) { return x.json(); });
      var items = (r && r.items) || [];
      if (!items.length) { msg.textContent = "没认出来。" + (r && r.error ? r.error : ""); return; }
      items.forEach(function (it) {
        var cat = catFromName(it.name);
        if (cat) addRow(cat, it.qty || 1, "batch", dataUrl);
      });
      msg.textContent = "认出 " + items.length + " 样" + (hint.length ? "（CLIP 提示：" + hint.join("/") + "）" : "") + "。";
      go("review");
    } catch (e) {
      msg.textContent = "连不上识别服务：" + (e && e.message);
    }
  }

  function catFromName(n) {
    var A = (window.RECEIPT && window.RECEIPT.ALIAS) || {};
    n = String(n || "").trim();
    if (!n) return "";
    /* 先要「完全一样」，再要「名字里包含别名」并取最长的，
       最后才用「别名包含名字」兜底。
       否则「白菜」会被 greens 的「小白菜」反向命中。 */
    var best = "", bestLen = 0, bestRev = "", revLen = 0;
    for (var k in A) {
      var list = A[k] || [];
      for (var i = 0; i < list.length; i++) {
        var a = list[i];
        if (!a) continue;
        if (n === a) return k;
        if (n.indexOf(a) >= 0 && a.length > bestLen) { best = k; bestLen = a.length; }
        if (a.indexOf(n) >= 0 && n.length > revLen) { bestRev = k; revLen = n.length; }
      }
    }
    return best || bestRev || "";
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
    if (state.shots.length) showShot(state.shots[state.shots.length - 1].img); else showLive();
    renderRows();
  });

  /* ---------- 启动 ---------- */
  if (!FD.byId) { document.body.innerHTML = "<p style='padding:20px'>data.js 没加载成功。</p>"; return; }
  paintGrid();
  renderRows();
  if (EDIT_ID) {
    var all0 = FD.items() || [];
    var it0 = all0.filter(function (x) { return x.id === EDIT_ID; })[0];
    if (it0) {
      state.editId = EDIT_ID; state.cat = it0.cat; state.qty = it0.qty || 1;
      state.days = it0.daysLeft || (FD.byId[it0.cat] ? FD.byId[it0.cat].days : 3);
      go("manual"); paintGrid();
      $("#manualEdit").hidden = false;
      $("#mQty").textContent = state.qty;
      $("#mDays").textContent = state.days;
      $("#mUnit").textContent = FD.unitOf ? FD.unitOf(state.cat) : "份";
      $("#mAdd").textContent = tt("add.mSave", "保存修改");
      $("#title").textContent = "修改这一条";
      return;
    }
  }
  var startView = (location.search.match(/[?&]v=([a-z]+)/) || [])[1];
  if (startView && TITLES[startView] && startView !== "pick") {
    go(startView);
    if (startView === "detect") startCam();
    if (startView === "manual") paintGrid();
  } else {
    go("pick");
  }
})();
