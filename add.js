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

  var state = { view: "pick", rows: [], shots: [], cat: "", qty: 1, days: 3, locked: false, busy: false, editId: "", picked: {} };
  var EDIT_ID = (location.search.match(/[?&]edit=([^&]+)/) || [])[1] || "";
  var det = { running: false, timer: null, lm: null, armed: true, last: 0, n: 0, cost: 0, errs: 0, paused: false };

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
    if (v !== "detect") { if (det.running) detStop(true); stopCam(); }
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
    state.rows.push({ cat: cat || "", qty: Math.max(1, qty || 1), src: src || "", img: img || "", guess: guessName || "", days: cat && FD.byId[cat] ? FD.byId[cat].days : 3 });
    renderRows();
  }

  /* 每一行都能直接改成正确的食材：认错了不用删掉重来 */
  /* 下拉里的食材按拼音排，虾、虾仁、虾皮会挨在一起，不用满屏找 */
  var SORTED_CATALOG = FD.CATALOG.slice().sort(function (a, b) {
    var A = (a.cn || a.name || ""), B = (b.cn || b.name || "");
    try { return A.localeCompare(B, "zh-Hans-CN"); } catch (e) { return A < B ? -1 : 1; }
  });

  function selHtml(r) {
    var opts = '<option value="">' + (r.guess ? "认成「" + r.guess + "」，选一样" : "选一样…") + "</option>" +
      SORTED_CATALOG.map(function (c) {
        return '<option value="' + c.id + '"' + (c.id === r.cat ? " selected" : "") + ">" + fname(c) + "</option>";
      }).join("");
    return '<select data-sel="1">' + opts + "</select>";
  }

  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) { return ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]; }); }

  /* 雪糕/饮料在清单里补一行可选信息：品牌、口味、规格、开封。
     其余食材不显示，免得把清单撑长。 */
  function moreRow(r) {
    var f = FD.byId[r.cat];
    if (!f || (f.tag !== "ice" && f.tag !== "drink")) return "";
    return '<details class="rmore"><summary>' + tt("add.more", "品牌 / 口味 / 规格") + "</summary>" +
      '<div class="rmore-g">' +
      '<input data-mf="brand" placeholder="' + tt("sheet.brand", "品牌") + '" value="' + esc(r.brand) + '">' +
      '<input data-mf="flavor" placeholder="' + tt("sheet.flavor", "口味") + '" value="' + esc(r.flavor) + '">' +
      '<input data-mf="size" placeholder="' + tt("sheet.size", "规格") + '" value="' + esc(r.size) + '">' +
      '<label class="rmore-ck"><input type="checkbox" data-mf="opened"' + (r.opened ? " checked" : "") + "> " +
      tt("sheet.opened", "已开封") + "</label></div></details>";
  }

  var TAG_CN = { protein: "蛋白", veg: "蔬菜", greens: "蔬菜", dairy: "乳品", carb: "主食",
                 fruit: "水果", ice: "雪糕 / 冰品", drink: "饮料", other: "其他" };
  function tagLabel(tag) {
    var key = { protein: "fridge.grpProtein", veg: "fridge.grpVeg", greens: "fridge.grpVeg",
                dairy: "fridge.grpDairy", carb: "fridge.grpCarb", fruit: "fridge.grpVeg",
                ice: "fridge.grpIce", drink: "fridge.grpDrink", other: "fridge.grpOther" }[tag];
    return (key && tt(key, "")) || TAG_CN[tag] || tag || "";
  }

  function stateChip(r) {
    if (r.state === "pending") return '<span class="rstate pend">识别中…</span>';
    if (r.state === "fail") return '<span class="rstate fail">没认出来<button type="button" class="retry" data-retry="1">重试</button></span>';
    return "";
  }

  function renderRows() {
    var box = $("#rows");
    box.innerHTML = state.rows.map(function (r, i) {
      var f = FD.byId[r.cat];
      var unit = FD.unitOf ? FD.unitOf(r.cat) : "份";
      var ico = (f && window.FD_ICON) ? window.FD_ICON(f.id, 30) : "";
      return '<div class="row" data-i="' + i + '">' +
        '<div class="thumb">' + (r.img ? '<img src="' + r.img + '" alt="" loading="lazy" decoding="async">' : ico) + '</div>' +
        '<div class="nm">' + selHtml(r) + stateChip(r) + '<span class="mtl">' + (f
            ? tagLabel(f.tag) + ' · <button type="button" class="dbtn" data-d="-1" aria-label="少一天">−</button><b>' + (r.days == null ? f.days : r.days) + '</b> 天<button type="button" class="dbtn" data-d="1" aria-label="多一天">＋</button>'
            : tt("add.notChosen", "还没选是哪一样")) + "</span></div>" + moreRow(r) +
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
    /* 识别完再回来看小票/俯拍页时，给一个直接回清单的入口 —— 不然只能重新上传 */
    var nRows = state.rows.filter(function (r) { return !!r.cat; }).length;
    ["#rGoList", "#bGoList"].forEach(function (sel) {
      var b = $(sel);
      if (!b) return;
      b.hidden = !nRows || state.view === "review";
      if (nRows) b.textContent = "查看清单（" + nRows + " 样）→";
    });
    /* 底栏在大字体下会换成两行，高度不固定 → 按实际高度给列表留白 */
    requestAnimationFrame(function () {
      var bar = $("#bar");
      box.style.paddingBottom = (bar && !bar.hidden ? bar.offsetHeight + 18 : 0) + "px";
    });
    $("#cnt") && ($("#cnt").textContent = tt("add.shotN", "已拍 {n} 件").replace("{n}", state.shots.length));
  }

  ["#rGoList", "#bGoList"].forEach(function (sel) {
    var b = $(sel);
    if (b) b.addEventListener("click", function () { go("review"); });
  });

  $("#rows").addEventListener("click", function (e) {
    if (e.target.tagName === "SELECT") return;
    var row = e.target.closest(".row"); if (!row) return;
    var i = +row.dataset.i;
    if (e.target.dataset.del) { state.rows.splice(i, 1); renderRows(); return; }
    if (e.target.dataset.retry) {
      var r0 = state.rows[i];
      var shot = state.shots.filter(function (s) { return s.id === r0.sid; })[0];
      if (shot && shot.img) { r0.state = "pending"; renderRows(); enqueueRecognize(shot, r0); }
      else { r0.state = "fail"; renderRows(); toast("这张的原图已经释放了，请在这行直接选食材"); }
      return;
    }
    if (e.target.dataset.d) {
      var dlt = +e.target.dataset.d;
      var cur = state.rows[i].days;
      if (cur == null) cur = (FD.byId[state.rows[i].cat] || {}).days || 3;
      state.rows[i].days = Math.max(0, Math.min(365, cur + dlt));
      renderRows();
      return;
    }
    var q = e.target.dataset.q;
    if (q) {
      state.rows[i].qty = Math.max(1, state.rows[i].qty + (+q));
      renderRows();
    }
  });

  $("#rows").addEventListener("input", function (e) {
    var k = e.target.dataset.mf; if (!k) return;
    var row = e.target.closest(".row"); if (!row) return;
    var r = state.rows[+row.dataset.i]; if (!r) return;
    if (k === "opened") r.opened = !!e.target.checked;
    else r[k] = e.target.value;
  });

  $("#rows").addEventListener("change", function (e) {
    if (e.target.tagName !== "SELECT") return;
    var row = e.target.closest(".row"); if (!row) return;
    var rr = state.rows[+row.dataset.i];
    rr.cat = e.target.value; rr.guess = "";
    rr.state = rr.cat ? "ok" : "fail";
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
      var items = FD.CATALOG.filter(function (f) { return g.tags.indexOf(f.tag) >= 0; })
        .sort(function (a, b) {
          try { return (a.cn || "").localeCompare(b.cn || "", "zh-Hans-CN"); }
          catch (e) { return 0; }
        });
      if (!items.length) return;
      html += '<section class="grp" id="grp-' + g.id + '">'
        + '<h3><b>' + g.label[en] + '</b><span>' + items.length + '</span></h3>'
        + '<div class="grid">'
        + items.map(function (f) {
            var ic = (window.FD_ICON && FD_ICON(f.id, 26)) || "";
            return '<button data-cat="' + f.id + '" class="' + ((state.editId ? state.cat === f.id : !!state.picked[f.id]) ? "on" : "") + '">'
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
  function paintBar() {
    var n = Object.keys(state.picked).length;
    var bar = $("#mBar");
    if (bar) bar.hidden = !n || !!state.editId;
    var t = $("#mBarTxt");
    if (t) t.textContent = "已选 " + n + " 样";
    var btn = $("#mBarAdd");
    if (btn) btn.textContent = "加入清单（" + n + "）";
    document.body.classList.toggle("has-pick", n > 0 && !state.editId);
  }

  $("#pickGrid").addEventListener("click", function (e) {
    var b = e.target.closest("button[data-cat]"); if (!b) return;
    if (!state.editId) {
      var pid = b.dataset.cat;
      if (state.picked[pid]) delete state.picked[pid]; else state.picked[pid] = 1;
      paintGrid(); paintBar();
      return;
    }
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
  $("#mBarAdd").addEventListener("click", function () {
    var ids = Object.keys(state.picked);
    if (!ids.length) return;
    ids.forEach(function (id) {
      var f = FD.byId[id];
      addRow(id, 1, "manual");
      var row = state.rows.filter(function (r) { return r.cat === id; })[0];
      if (row && f) row.days = f.days;
    });
    state.picked = {};
    paintGrid(); paintBar();
    go("review");
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
  /* CLIP 走 HuggingFace 权重 + onnx wasm：实测一次加载能把主线程锁死 34 秒，
     国内的手机基本必现「网页暂无响应」。默认关闭，只有显式 ?clip=1 才开。 */
  var CLIP_ON = /[?&]clip=1/.test(location.search);
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
      /* 电脑关机时这个请求会一直挂着等 TCP 超时 → 页面就「一直加载」。
         3 秒拿不到就当没有服务，直接走浏览器模型。 */
      var d = await withTimeout(fetch(AI_URL + "/health", { cache: "no-store" })
        .then(function (x) { return x.json(); }), 3000, "健康检查");
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

  /* ---------- 性能日志（只记尺寸/耗时/错误，不记录图片内容） ----------
     手机上排查用：打开 add.html?...&perf=1，控制台会有 [fd-perf]；
     或者远程调试时读 window.__fdPerf.buf / __fdPerf.dump()。 */
  var PERF = {
    on: /[?&]perf=1/.test(location.search),
    buf: [],
    push: function (name, ms, extra) {
      var row = { t: Date.now(), name: name, ms: Math.round(ms || 0) };
      if (extra) for (var k in extra) if (extra[k] != null && k !== "t" && k !== "name" && k !== "ms") row[k] = extra[k];
      this.buf.push(row);
      if (this.buf.length > 240) this.buf.shift();
      if (this.on && window.console) console.debug("[fd-perf]", row.name, row.ms + "ms", row);
      return row;
    },
    dump: function () { return JSON.stringify(this.buf); }
  };
  window.__fdPerf = PERF;
  function perf(name, t0, extra) { return PERF.push(name, (window.performance ? performance.now() : Date.now()) - t0, extra); }
  /* 设备信息记一次：同一个 bug 在不同手机上表现不同，先要能区分机型 */
  (function () {
    try {
      PERF.push("env", 0, {
        ua: navigator.userAgent.slice(0, 120),
        cores: navigator.hardwareConcurrency || 0,
        mem: navigator.deviceMemory || 0,
        dpr: window.devicePixelRatio || 1
      });
    } catch (e) {}
  })();

  /* 统一的 AI 请求：必须带超时。没超时的 fetch 在半死的隧道上会挂到天荒地老，
     上一版就是这样：第二张拍完以后一直「识别中」，用户以为页面死了。 */
  async function aiRecognize(dataUrl, hint, ms) {
    if (!AI_URL) throw new Error("no-ai");
    var ctl = window.AbortController ? new AbortController() : null;
    var timer = setTimeout(function () { if (ctl) ctl.abort(); }, ms || 12000);
    try {
      var r = await fetch(AI_URL + "/recognize", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ image: dataUrl, hint: hint || undefined }),
        signal: ctl ? ctl.signal : undefined
      });
      if (!r.ok) throw new Error("HTTP " + r.status);
      return await r.json();
    } finally { clearTimeout(timer); }
  }

  /* 给一个 dataURL 走完整识别链：AI 优先，失败退回端侧。
     端侧需要 canvas，但 canvas 用完就丢，不在 state 里留（每张 480² 的位图 0.9MB）。 */
  async function classifyDataUrl(dataUrl) {
    perf("stage.enter", performance.now(), { ai: AI_OK });
    if (await aiReady()) {
      var t0 = performance.now();
      try {
        var r = await aiRecognize(dataUrl, null, 9000);
        var it = (r && r.items || [])[0];
        perf("ai.recognize", t0, { ok: !!it, hit: it && it.name });
        if (it) return { cat: catFromName(it.name), name: it.name, why: "ai" };
        return { cat: "", name: "", why: "ai-none" };
      } catch (e) {
        perf("ai.error", t0, { err: String(e && e.message || e).slice(0, 80) });
        /* 任何一次失败（超时/断线/5xx）都先把 AI 判为不可用：
           这一轮后续的图直接走端侧，不要每张都等满超时。下次点「开始检测」会重新探一次。 */
        AI_OK = false;
      }
    }
    var t1 = performance.now();
    perf("stage.decode.start", t1, { len: dataUrl.length });
    var canvas = await canvasFromDataUrl(dataUrl);
    perf("img.decode", t1, { w: 480, h: 480 });
    return classifyCanvasLocal(canvas);
  }

  async function classifyCanvasLocal(canvas) {
    try {
      var c2 = null;
      /* CLIP 的权重在 HuggingFace 上：国内网络要么很慢要么直接不通。
         原来这里没有超时，一张图能卡 30 秒（实测 34s 的主线程长任务就是它）。
         给它 3.5 秒，失败一次这一页就再也不试。 */
      if (CLIP_ON) {
        var tc = performance.now();
        try { c2 = await withTimeout(classifyClip(canvas), 3500, "CLIP"); }
        catch (e2) { c2 = null; CLIP_ON = false; }
        perf("clip", tc, { ok: !!(c2 && c2.cat), off: !CLIP_ON });
      }
      if (c2 && c2.cat) return c2;
      var res = await FDCLS.classify(canvas);
      var conf = res.conf || 0;
      var cat = (FDCLS.MAP || {})[res.label] || guessCat(res.label);
      if (!cat) return { cat: "", name: res.label, why: "unknown", conf: conf };
      if (conf < 0.72) return { cat: "", name: res.label, why: "lowconf", conf: conf };
      return { cat: cat, name: res.label, why: "ondevice", conf: conf };
    } catch (e) { return { cat: "", name: "", why: "err" }; }
  }

  function canvasFromDataUrl(dataUrl) {
    return new Promise(function (res, rej) {
      var img = new Image();
      img.onload = function () {
        var c = document.createElement("canvas");
        c.width = 480; c.height = 480;
        c.getContext("2d").drawImage(img, 0, 0, 480, 480);
        img.src = "";              /* 立刻断开引用，别等 GC */
        res(c);
      };
      img.onerror = function () { rej(new Error("decode")); };
      img.src = dataUrl;
    });
  }

  /* 列表/条带只放 192px 的缩略图：480 的原图解码出来是 0.9MB 位图，
     十来张一起挂在 DOM 上就是几十兆，低端机直接被系统杀掉。 */
  function makeThumb(canvas) {
    var t = document.createElement("canvas");
    t.width = 192; t.height = 192;
    var ctx = t.getContext("2d");
    ctx.drawImage(canvas, 0, 0, 192, 192);
    return t.toDataURL("image/jpeg", 0.62);
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

  var MAX_SHOTS = 40;

  /* 识别队列：一次只发一个请求。并发请求既抢带宽又抢内存，
     上一版一次拍两张就同时发两个 /recognize，第二张还卡着第一张的结果。 */
  var recq = [], recBusy = false;
  function enqueueRecognize(shot, row) {
    recq.push({ shot: shot, row: row });
    pumpRecognize();
  }
  async function pumpRecognize() {
    if (recBusy) return;
    recBusy = true;
    perf("queue.start", performance.now(), { n: recq.length });
    try {
      while (recq.length) {
        var job = recq.shift();
        if (!job.shot || !job.shot.img) continue;
        perf("queue.job", performance.now(), { left: recq.length });
        try { await recognizeInto(job.shot, job.row); }
        catch (e) {
          perf("queue.error", performance.now(), { err: String(e && e.message || e).slice(0, 80) });
          if (job.row) { job.row.state = "fail"; renderRows(); }
        }
      }
    } finally { recBusy = false; perf("queue.end", performance.now(), {}); }
  }

  async function recognizeInto(shot, row) {
    row.state = "pending";
    renderRows();
    var t0 = performance.now();
    var r = { cat: "", name: "", why: "err" };
    try { r = await classifyDataUrl(shot.img); } catch (e) { r = { cat: "", name: "", why: "err" }; }
    perf("recognize.total", t0, { why: r.why || "?", cat: r.cat || "-" });
    shot.cat = r.cat || "";
    shot.name = r.name || "";
    shot.why = r.why || "";
    shot.state = shot.cat ? "ok" : "fail";
    /* 用户可能已经在行里手选了：手选优先，AI 结果不覆盖 */
    if (row.cat) { renderRows(); return; }
    if (shot.cat) {
      var other = state.rows.filter(function (x) { return x !== row && x.cat === shot.cat; })[0];
      var f = FD.byId[shot.cat];
      if (other) {
        other.qty += row.qty;
        state.rows.splice(state.rows.indexOf(row), 1);
      } else {
        row.cat = shot.cat; row.guess = ""; row.days = f ? f.days : row.days; row.state = "ok";
      }
      shot.img = null;                 /* 认出来了就不再留原图 */
    } else {
      row.state = "fail";
      state.needManual = true;
    }
    updateDetHint();
    renderRows();
  }

  function updateDetHint() {
    var h = $("#detHint");
    if (!h) return;
    var pend = state.shots.filter(function (s) { return s.state === "pending"; }).length;
    var fail = state.shots.filter(function (s) { return s.state === "fail"; }).length;
    var msg = "✓ 已拍 " + state.shots.length + " 件";
    if (pend) msg += " · 识别中 " + pend;
    if (fail) msg += " · " + fail + " 件没认出来（在下面点「重试」或直接选）";
    if (AI_URL && AI_OK === false) msg += " · 本地 AI 没连上，只用了端侧的 8 类模型";
    h.textContent = msg + " · 继续放下一件，放完点「结束并确认」。";
  }

  /* 自适应节拍：MediaPipe 是同步跑在主线程上的，固定 220ms 一次，
     低端机上一次要 300–600ms，定时器就排队、主线程永远不空闲 → 浏览器弹「网页暂无响应」。 */
  function scheduleNext(gap) {
    if (det.timer) { clearTimeout(det.timer); det.timer = null; }
    if (det.running) det.timer = setTimeout(tick, gap);
  }

  function tick() {
    if (!det.running) return;
    if (det.paused || document.hidden) { scheduleNext(500); return; }
    var v = $("#cam");
    if (!v || !v.videoWidth || v.readyState < 2) { scheduleNext(350); return; }
    var t0 = performance.now();
    var res;
    try {
      res = det.lm.detectForVideo(v, t0);
      det.errs = 0;
    } catch (e) {
      det.errs = (det.errs || 0) + 1;
      perf("detect.error", performance.now() - t0, { err: String(e && e.message || e).slice(0, 80) });
      if (det.errs >= 5) { detStop(true); toast("手部检测连续出错，已停下，可用「从相册选照片」"); return; }
      scheduleNext(450);
      return;
    }
    var cost = performance.now() - t0;
    det.cost = det.cost ? det.cost * 0.7 + cost * 0.3 : cost;
    perf("detect.frame", t0, { cost: Math.round(det.cost) });

    var has = res && res.landmarks && res.landmarks.length;
    if (!has) { det.armed = true; }
    else if (det.armed && det.n < MAX_SHOTS && !det.busy && Date.now() - (det.last || 0) > 1200) {
      det.armed = false; det.n++;
      snapOne();
    }
    /* 至少留 55% 的空闲给渲染和触摸；推理越慢，采样越疏 */
    scheduleNext(Math.min(1000, Math.max(160, det.cost * 2.4)));
  }

  async function snapOne() {
    if (det.busy) return;
    det.busy = true;
    det.last = Date.now();
    try {
      if (state.shots.length >= MAX_SHOTS) { toast("一次最多 " + MAX_SHOTS + " 件，先结束并确认"); det.busy = false; return; }
      var t0 = performance.now();
      var c = grab();
      var img = c.toDataURL("image/jpeg", 0.82);
      var thumb = makeThumb(c);
      c.width = c.height = 0;                    /* 立刻放掉 480² 的画布 */
      perf("capture", t0, { bytes: img.length, thumb: thumb.length });

      var shot = { id: "sh" + Date.now() + Math.random().toString(36).slice(2, 5),
                   img: img, thumb: thumb, cat: "", name: "", why: "", state: "pending" };
      state.shots.push(shot);
      /* 计数跟「拍了几张」走，不跟「认出几件」走 */
      if ($("#cnt")) $("#cnt").textContent = tt("add.shotN", "已拍 {n} 件").replace("{n}", state.shots.length);
      flashCapture(thumb);

      /* 先建行、立刻出图，识别放到后台队列：拍照这条路再也不会被 AI 卡住 */
      var row = { cat: "", qty: 1, src: "detect", img: thumb, guess: "", days: 3, sid: shot.id, state: "pending" };
      state.rows.push(row);
      renderRows();
      updateDetHint();
      enqueueRecognize(shot, row);
    } finally {
      det.busy = false;
    }
  }

  /* 抓拍的三重反馈：白闪 + 取景框变绿打勾 + 提示音/震动 */
  function flashCapture(thumb) {
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
    addThumb(thumb);
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
    det.running = true; det.armed = true; det.n = 0; det.errs = 0; det.cost = 0; det.paused = false;
    AI_OK = null;   /* 新的一轮重新探一次本地 AI */
    /* 端侧 8 类模型第一次加载要 3 秒起步（手机上更久）。趁用户还在对准，
       先在后台把它热起来，别等 AI 超时那一刻才去加载。 */
    setTimeout(function () { try { if (window.FDCLS) FDCLS.ready(); } catch (e) {} }, 1200);
    $("#detHint").textContent = "把东西拿在手里，伸进虚线框内 —— 会自动抓拍（画面会闪一下、框变绿）。拍完继续放下一件。";
    scheduleNext(120);
  });

  /* silent=true：只停循环，不跳转（离开页面/出错时用） */
  function detStop(silent) {
    det.running = false;
    if (det.timer) { clearTimeout(det.timer); det.timer = null; }
    var b = $("#detToggle"); if (b) { b.textContent = tt("add.detStart", "开始检测"); b.classList.remove("on"); }
    if (silent) return;
    if (!state.rows.length) { $("#detHint").textContent = "这一轮没拍到东西。可以再试一次，或从相册选。"; return; }
    go("review");
  }

  /* 取消这一轮：把图、条带、队列全部放掉，回到选方式 */
  function detCancel() {
    detStop(true);
    recq = [];
    state.shots.forEach(function (s) { s.img = null; s.thumb = null; });
    state.shots = [];
    state.rows = [];
    var strip = $("#detStrip"); if (strip) strip.innerHTML = "";
    if ($("#cnt")) $("#cnt").textContent = tt("add.shotN", "已拍 {n} 件").replace("{n}", 0);
    stopCam();
    renderRows();
    go("pick");
  }

  /* ---------- 相册选图（检测页的兜底） ---------- */
  var detPickBtn = $("#detPick");
  if (detPickBtn) detPickBtn.addEventListener("click", function () { $("#fileIn").click(); });
  $("#fileIn").addEventListener("change", async function (e) {
    var files = Array.prototype.slice.call(e.target.files || []);
    e.target.value = "";
    for (var i = 0; i < files.length; i++) {
      try {
        var t0 = performance.now();
        var c = await fileToCanvas(files[i]);
        var img = c.toDataURL("image/jpeg", 0.82);
        var thumb = makeThumb(c);
        c.width = c.height = 0;
        perf("album.load", performance.now() - t0, { bytes: img.length });
        showShot(thumb);
        var shot = { id: "sh" + Date.now() + Math.random().toString(36).slice(2, 5),
                     img: img, thumb: thumb, cat: "", name: "", why: "", state: "pending" };
        state.shots.push(shot);
        var row = { cat: "", qty: 1, src: "album", img: thumb, guess: "", days: 3, sid: shot.id, state: "pending" };
        state.rows.push(row);
        renderRows();
        enqueueRecognize(shot, row);
      } catch (err) { perf("album.error", 0, { err: String(err && err.message || err).slice(0, 60) }); }
    }
    if (state.rows.length) setTimeout(function () { go("review"); }, 60);
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

  /* 线上是 https，浏览器不允许它去请求 http://电脑IP:8941（混合内容会被拦），
     所以「摊开俯拍 / 多品识别」只有在局域网 http 地址下才可用。这里提前说清楚。 */
  (function batchEnvHint(){
    if (AI_URL) return;
    var box = $("#v-batch");
    if (!box || box.querySelector(".envhint")) return;
    var p = document.createElement("p");
    p.className = "tiny envhint";
    p.style.cssText = "margin:10px 0 0;color:#8a6d1f";
    p.textContent = "当前是线上版（https），连不到你电脑上的识别服务。摊开俯拍要在同一个 WiFi 下用 http://电脑IP:8766 打开才认得出。";
    box.appendChild(p);
  })();

  async function readBatch(file) {
    var msg = $("#bMsg");
    msg.textContent = "准备图片…";
    try {
      /* 俯拍图动辄 4000x3000：整张 base64 上传到本地服务要十几秒，
         服务端还要自己缩一遍。这里先缩到长边 1600，传输和推理都快 3-5 倍。 */
      var dataUrl = await shrinkImage(file, 1600);
      msg.textContent = "正在识别…（CLIP 找候选 + 千问确认，约 5–15 秒）";
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
        var ranked = await withTimeout(clipScores(cc), 5000, "CLIP");
        hint = ranked.slice(0, 3).map(function (r) { return r.name; }).filter(Boolean);
      } catch (e) { /* CLIP 超时或失败都不影响千问 */ }
      msg.textContent = "千问正在看图…（最多等 45 秒）";
      var r = await withTimeout(fetch(AI_URL + "/recognize", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ image: dataUrl, hint: hint })
      }).then(function (x) { return x.json(); }), 45000, "识别服务");
      var items = (r && r.items) || [];
      if (!items.length) { msg.textContent = "没认出来。" + (r && r.error ? r.error : ""); return; }
      items.forEach(function (it) {
        var cat = catFromName(it.name);
        if (cat) addRow(cat, it.qty || 1, "batch", dataUrl);
      });
      msg.textContent = "认出 " + items.length + " 样" + (hint.length ? "（CLIP 提示：" + hint.join("/") + "）" : "") + "。";
      go("review");
    } catch (e) {
      var t = String((e && e.message) || e);
      msg.textContent = /超时/.test(t)
        ? "识别服务没响应（" + t + "）。电脑上的 start.py 还开着吗？也可以改用「从相册选」。"
        : "连不上识别服务：" + t;
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
      var extra = {};
      ["brand", "flavor", "size"].forEach(function (k) { if (r[k]) extra[k] = String(r[k]).trim(); });
      if (r.opened) extra.opened = true;
      if (f.tag === "ice") extra.place = "冷冻";
      else if (f.tag === "drink") extra.place = "门架";
      items.push(Object.assign({
        id: "i" + Date.now() + Math.floor(Math.random() * 1e4),
        cat: f.id, name: fname(f), tag: f.tag, qty: r.qty, unit: FD.unitOf ? FD.unitOf(f.id) : "份",
        daysLeft: (r.days == null ? f.days : r.days), life: (r.days == null ? f.days : r.days), addedAt: today
      }, extra));
      added++;
    });
    FD.saveItems(items);
    return { added: added, adjusted: adjusted };
  }

  async function cloudConfirm() {
    var sid = await AUTH.rpc("start_capture_session", {});
    var payload = state.rows.map(function (r) {
      var f = FD.byId[r.cat];
      return { action: "add", cat: f.id, name: fname(f), tag: f.tag, qty: r.qty, unit: FD.unitOf ? FD.unitOf(f.id) : "份", life: (r.days == null ? f.days : r.days) };
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
      s.img = null; s.thumb = null;
      var i = state.rows.map(function (r) { return r.sid; }).lastIndexOf(s.id);
      if (i >= 0) state.rows.splice(i, 1);
      var box = $("#detStrip");
      if (box && box.firstChild) box.removeChild(box.firstChild);
      if ($("#cnt")) $("#cnt").textContent = tt("add.shotN", "已拍 {n} 件").replace("{n}", state.shots.length);
      updateDetHint();
    }
    if (state.shots.length) showShot(state.shots[state.shots.length - 1].thumb); else showLive();
    renderRows();
  });

  /* 取消这一轮：释放相机与所有图片引用（她这个按钮点完就回「选方式」） */
  var cancelBtn = $("#detCancel");
  if (cancelBtn) cancelBtn.addEventListener("click", function () {
    if (!state.shots.length && !det.running) { go("pick"); return; }
    if (!confirm("取消这一轮？已经拍的照片会丢掉。")) return;
    detCancel();
  });

  /* 切到后台就暂停推理：微信里切个聊天再回来，不能还在跑 MediaPipe */
  document.addEventListener("visibilitychange", function () {
    if (document.hidden) {
      det.paused = true;
    } else {
      det.paused = false;
      if (!det.running) return;
      scheduleNext(200);
    }
  });
  /* 离开页面：停相机、停循环、把大图放掉，别把内存留给返回缓存 */
  window.addEventListener("pagehide", function () {
    detStop(true);
    stopCam();
    state.shots.forEach(function (s) { s.img = null; });
    recq = [];
  });

  /* 测试/验收钩子：只在这个参数下暴露，正常使用不挂任何全局 */
  if (/[?&]selftest=1/.test(location.search)) {
    window.__fdTest = {
      snap: function () { return snapOne(); },
      go: function (v) { go(v); },
      state: state, det: det, perf: PERF,
      rowsHtml: function () { return $("#rows").innerHTML.length; }
    };
  }

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
