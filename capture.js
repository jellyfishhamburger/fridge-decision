/* ============================================================
   capture.js — 采购整理（Phase 1：端侧识别 + 用户确认才入库）

   规则（与产品决策一致）：
     拍照        → 不改库存
     识别        → 不改库存
     用户确认    → 才写一次库存（按钮立刻锁死，重复点无效）
   ============================================================ */
(function () {
  "use strict";

  var $ = function (s) { return document.querySelector(s); };
  var $$ = function (s) { return Array.prototype.slice.call(document.querySelectorAll(s)); };

  /* 模型 8 类 → 内容库里的食材 id */
  var MAP = { chili: "chili", egg: "egg", greens: "greens", milk: "milk",
              mushroom: "mushroom", pork: "pork", tofu: "tofu", tomato: "tomato" };

  var state = {
    step: 1,
    shots: [],       // {img, label, conf, second, margin, cat, err}
    rows: [],        // {cat, qty, action, img, conf, label, merged}
    stream: null,
    locked: false,   // 确认按钮已点 → 永不再写
    done: false
  };

  /* ---------------- 工具 ---------------- */
  function uid() {
    return Math.random().toString(36).slice(2, 9) + Date.now().toString(36).slice(-3);
  }
  function food(cat) {
    if (!cat) return null;
    try { return (FD.byId && FD.byId[cat]) || null; } catch (e) { return null; }
  }
  function catName(cat) {
    var f = food(cat);
    return f ? (f.cn || f.name) : (FD_RowNameFallback(cat));
  }
  function FD_RowNameFallback(cat) {
    return cat || "未选";
  }
  function pct(x) { return Math.round((x || 0) * 100); }

  function go(n) {
    state.step = n;
    $$(".pane").forEach(function (p) { p.classList.remove("on"); });
    var pane = $("#s" + n);
    if (pane) pane.classList.add("on");
    $$(".steps .sd").forEach(function (d, i) {
      d.classList.toggle("on", i < n - 1 || (i === 0 && n === 1));
      d.classList.toggle("cur", i === n - 1);
    });
    var labels = { 1: "第 1 步 · 准备", 2: "第 2 步 · 拍照", 3: "第 3 步 · 生成清单", 4: "第 4 步 · 确认", 5: "完成" };
    $("#stepLabel").textContent = labels[n] || "";
    $("#bar").hidden = n !== 4;
    window.scrollTo({ top: 0, behavior: "instant" in window ? "instant" : "auto" });
  }

  /* ---------------- 拍照 ---------------- */
  async function startCam() {
    try {
      state.stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 }, height: { ideal: 1280 } },
        audio: false
      });
      var v = $("#cam");
      v.srcObject = state.stream;
      await v.play().catch(function () {});
      $("#stage").classList.remove("off");
    } catch (e) {
      $("#stage").classList.add("off");
      var why = $("#camWhy");
      var msg;
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        msg = "这个浏览器不支持直接开摄像头（微信/QQ 等内置浏览器常见）。用 Safari 或 Chrome 打开这个网址就能拍。";
      } else if (e && e.name === "NotAllowedError") {
        msg = "相机权限被拒了。点地址栏左边的「大小 / 锁」图标 → 网站设置 → 允许相机，再刷新。";
      } else if (e && e.name === "NotFoundError") {
        msg = "没找到摄像头。";
      } else if (e && e.name === "NotReadableError") {
        msg = "摄像头被别的 App 占用，先关掉其它用相机的程序。";
      } else if (location.protocol !== "https:" && !/^(localhost|127\.0\.0\.1)$/.test(location.hostname)) {
        msg = "现在不是 https，浏览器不给相机。用 https 网址，或者从相册选照片。";
      } else {
        msg = "摄像头没打开（" + ((e && e.name) || "未知原因") + "）。可以先用「从相册选照片」。";
      }
      if (why) { why.textContent = msg; }
    }
    go(2);
  }

  /* 把某张图铺到舞台上；没有图就恢复黑底 */
  function showStage(src) {
    var img = $("#stageShot");
    if (!img) return;
    if (src) { img.src = src; img.style.display = "block"; }
    else { img.style.display = "none"; img.removeAttribute("src"); }
  }

  function stopCam() {
    if (state.stream) {
      state.stream.getTracks().forEach(function (t) { t.stop(); });
      state.stream = null;
    }
  }

  /* 从视频取一帧，正方形，480px */
  function grab(video) {
    var side = Math.min(video.videoWidth || 0, video.videoHeight || 0) || 480;
    var c = document.createElement("canvas");
    c.width = 480; c.height = 480;
    var ctx = c.getContext("2d");
    var sx = ((video.videoWidth || side) - side) / 2;
    var sy = ((video.videoHeight || side) - side) / 2;
    ctx.drawImage(video, sx, sy, side, side, 0, 0, 480, 480);
    return c;
  }

  /* 从文件取一帧 */
  function fromFile(file) {
    return new Promise(function (res, rej) {
      var img = new Image();
      var url = URL.createObjectURL(file);
      img.onload = function () {
        var side = Math.min(img.naturalWidth, img.naturalHeight);
        var c = document.createElement("canvas");
        c.width = 480; c.height = 480;
        c.getContext("2d").drawImage(
          img, (img.naturalWidth - side) / 2, (img.naturalHeight - side) / 2, side, side, 0, 0, 480, 480);
        URL.revokeObjectURL(url);
        res(c);
      };
      img.onerror = function () { URL.revokeObjectURL(url); rej(new Error("读不了这张图")); };
      img.src = url;
    });
  }

  async function classifyCanvas(canvas) {
    try {
      var r = await FDCLS.classify(canvas);
      return {
        label: r.label, conf: r.conf, second: r.second, margin: r.margin,
        cat: MAP[r.label] || "",
        img: canvas.toDataURL("image/jpeg", 0.72),
        votes: 1, total: 1, ok: (r.conf >= 0.6 && r.margin >= 0.12 && r.label !== "unknown"),
        reason: r.label === "unknown" ? "没认出来" : (r.conf < 0.6 ? "置信度不够" : "与第二名太接近"),
        blur: blurScore(canvas)
      };
    } catch (e) {
      return { label: "", conf: 0, second: "", margin: 0, cat: "",
               img: canvas.toDataURL("image/jpeg", 0.72), err: true };
    }
  }

  /* 拉普拉斯方差：越低越糊。手机抖动、镜头没贴上焦都会掉到 40 以下 */
  function blurScore(canvas) {
    var c = document.createElement("canvas");
    c.width = 96; c.height = 96;
    var ctx = c.getContext("2d", { willReadFrequently: true });
    ctx.drawImage(canvas, 0, 0, 96, 96);
    var d = ctx.getImageData(0, 0, 96, 96).data;
    var g = new Float32Array(96 * 96);
    for (var i = 0, j = 0; i < d.length; i += 4, j++) {
      g[j] = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
    }
    var sum = 0, sum2 = 0, n = 0;
    for (var y = 1; y < 95; y++) {
      for (var x = 1; x < 95; x++) {
        var v = 4 * g[y * 96 + x] - g[(y - 1) * 96 + x] - g[(y + 1) * 96 + x]
                - g[y * 96 + x - 1] - g[y * 96 + x + 1];
        sum += v; sum2 += v * v; n++;
      }
    }
    var mean = sum / n;
    return sum2 / n - mean * mean;
  }

  var BLUR_MIN = 45;   /* 低于这个当作糊帧丢掉，但不至于一张都不剩 */

  /* 连拍 3 帧：扔掉糊的，剩下的投票 */
  async function grabBurst(video, n) {
    var frames = [];
    for (var i = 0; i < (n || 3); i++) {
      if (!video || !video.videoWidth) break;
      var c = grab(video);
      frames.push({ canvas: c, blur: blurScore(c) });
      if (i < (n || 3) - 1) await sleep(320);
    }
    var sorted = frames.slice().sort(function (a, b) { return b.blur - a.blur; });
    var sharp = sorted.filter(function (f) { return f.blur >= BLUR_MIN; });
    return (sharp.length ? sharp : sorted).slice(0, 3);
  }

  function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

  function addShot(shot) {
    state.shots.push(shot);
    var n = state.shots.length;
    $("#cnt").textContent = "已拍 " + n + " 件";
    $("#undoShot").disabled = false;
    $("#toDraft").disabled = false;

    var chip = $("#lastChip");
    chip.hidden = false;
    if (shot.err) {
      chip.innerHTML = "<b>识别服务没起来</b><span class='pct'>下一步手选</span>";
    } else if (!shot.cat || shot.label === "unknown") {
      chip.innerHTML = "<b>没认出来</b><span class='pct'>下一步手选</span>";
    } else {
      chip.innerHTML = "<b>" + catName(shot.cat) + "</b><span class='pct'>" + (shot.ai ? "AI" : pct(shot.conf) + "%")
        + (shot.total > 1 ? " · " + shot.votes + "/" + shot.total + " 帧一致" : "") + "</span>";
    }
  }

  async function shoot() {
    if (!state.stream) { $("#fileIn").click(); return; }
    var v = $("#cam");
    if (!v.videoWidth) { $("#fileIn").click(); return; }
    var btn = $("#shoot");
    btn.disabled = true;
    btn.textContent = "拍 3 帧…";
    try {
      var frames = await grabBurst(v, 3);
      var results = [];
      for (var i = 0; i < frames.length; i++) {
        try { results.push(await FDCLS.classify(frames[i].canvas)); }
        catch (e) { results.push({ label: "unknown", conf: 0, second: "unknown", conf2: 0, margin: 0 }); }
      }
      var vote = (window.FDCLS && FDCLS.vote) ? FDCLS.vote(results)
               : { ok: true, label: results[0].label, conf: results[0].conf, votes: 1, total: 1 };
      var shot = {
        label: vote.label,
        conf: vote.conf,
        second: vote.second,
        margin: (vote.conf || 0) - (vote.conf2 || 0),
        cat: MAP[vote.label] || "",
        img: frames[0].canvas.toDataURL("image/jpeg", 0.72),
        votes: vote.votes, total: vote.total, ok: vote.ok, reason: vote.reason,
        blur: Math.round(frames[0].blur)
      };
      addShot(shot);
    } finally {
      btn.disabled = false;
      btn.textContent = "拍这一件";
    }
  }

  async function takeFiles(files) {
    var list = Array.prototype.slice.call(files || []);
    if (!list.length) return;
    go(2);
    $("#stage").classList.add("off");
    for (var i = 0; i < list.length; i++) {
      try {
        var c = await fromFile(list[i]);
        var shot = await classifyCanvas(c);
        shot.fullImg = c.toDataURL("image/jpeg", 0.85);
        addShot(shot);
        showStage(shot.fullImg);
      } catch (e) { /* 跳过读不了的 */ }
    }
    $("#fileIn").value = "";
  }

  /* ---------------- 生成草稿 ---------------- */
  function buildRows() {
    state.rows = state.shots.map(function (s) {
      return {
        cat: s.cat, qty: (s.ai && s.qty > 0 ? s.qty : 1), action: s.cat ? "add" : "ignore",
        img: s.img, conf: s.conf, label: s.label, margin: s.margin, err: !!s.err,
        ai: !!s.ai, qty2: s.qty, unit2: s.unit
      };
    });
  }

  function needsReview(r) {
    if (!r.cat) return true;
    if (r.err) return true;
    if (typeof r.ok === "boolean") return !r.ok;   /* 连拍投票说了算 */
    if (r.conf < 0.6) return true;
    if (r.margin < 0.12) return true;
    return false;
  }

  function renderRows() {
    var box = $("#rows");
    box.innerHTML = "";

    state.rows.forEach(function (r, i) {
      var el = document.createElement("div");
      el.className = "cand" + (r.action === "ignore" ? " dim" : "");
      if (r.action === "add" || r.action === "adjust") el.classList.add("needqty");

      var ph = r.img
        ? '<img class="ph" src="' + r.img + '" alt="">'
        : '<div class="ph empty">＋</div>';

      var badge = "";
      if (!r.cat) badge = '<span class="badge warn">没认出来</span>';
      else if (r.err) badge = '<span class="badge warn">服务未接</span>';
      else if (needsReview(r)) badge = '<span class="badge warn">待确认' + (r.ai ? "" : " " + pct(r.conf) + "%") + "</span>";
      else badge = '<span class="badge ok">' + (r.ai ? "AI 判断" : pct(r.conf) + "%") + "</span>";

      var opts = '<option value=""' + (r.cat ? '' : ' selected') + '>还没选</option>' +
                 FD.CATALOG.map(function (f) {
        return '<option value="' + f.id + '"' + (f.id === r.cat ? " selected" : "") + ">" +
               (f.cn || f.name) + " " + (f.name || "") + "</option>";
                 }).join("");

      var hint = "";
      if (r.err) hint = "识别服务没起来 —— 从上面选一个，或者删掉这行。";
      else if (!r.cat) hint = "没认出来 —— 从上面选一个，或者删掉这行。";
      else if (r.margin < 0.12) hint = "和第二名（" + (r.second === r.label ? "同类" : (MAP[r.second] ? catName(MAP[r.second]) : "其它")) + "）很接近，看一眼图。";
      else if (r.conf < 0.6) hint = "不太确定，确认一下是不是" + catName(r.cat) + "。";
      else if (r.total > 1) hint = (r.votes + "/" + r.total + " 帧一致，比较可信。") + (r.blur < 45 ? " 图有点糊，下次靠近点。" : "");

      var unit = (food(r.cat) && FD.unitOf(r.cat)) || "个";

      el.innerHTML =
        ph +
        '<div class="meta">' +
          '<div class="l1"><select aria-label="食材">' + opts + "</select>" + badge + "</div>" +
          '<p class="l2">' + (hint || (food(r.cat) ? (food(r.cat).tag === "protein" ? "蛋白质" : food(r.cat).tag === "greens" ? "蔬菜" : food(r.cat).tag === "dairy" ? "乳品" : food(r.cat).tag === "carb" ? "主食" : "其它") + " · 约 " + food(r.cat).days + " 天" : "")) + "</p>" +
          '<div class="acts">' +
            '<button data-a="ignore" class="del">✕ 这次不买</button>' +
          "</div>" +
          '<div class="qty"><button data-q="-1" aria-label="减少">−</button>' +
            '<span class="v">' + r.qty + '</span>' +
            '<button data-q="1" aria-label="增加">＋</button>' +
            '<span class="u">' + unit + "</span></div>" +
        "</div>";

      /* 重复提示：同一食材出现两次 */
      var firstSame = state.rows.findIndex(function (x, j) { return j < i && x.cat && x.cat === r.cat; });
      if (firstSame > -1) {
        var dn = document.createElement("div");
        dn.className = "dupnote";
        dn.innerHTML = "<span>和第 " + (firstSame + 1) + " 条都是" + catName(r.cat) + "，同一件吗？</span>" +
                       '<button data-merge="' + i + '">合并</button>';
        el.style.position = "relative";
        el.appendChild(dn);
      }

      el.addEventListener("change", function (e) {
        if (e.target.tagName === "SELECT") {
          r.cat = e.target.value;
          if (r.action === "ignore" && r.cat) r.action = "add";
          if (!r.cat) r.action = "ignore";
          renderRows();
        }
      });
      el.addEventListener("click", function (e) {
        var a = e.target.getAttribute("data-a");
        var q = e.target.getAttribute("data-q");
        var m = e.target.getAttribute("data-merge");
        if (a) {
          r.action = a;
          if ((a === "add" || a === "adjust") && !r.cat) {
            r.action = "add";
          }
          renderRows();
        } else if (q) {
          r.qty = Math.max(1, Math.min(99, r.qty + Number(q)));
          renderRows();
        } else if (m) {
          var j = Number(m);
          var tgt = state.rows.findIndex(function (x, k) { return k < j && x.cat && x.cat === state.rows[j].cat; });
          if (tgt > -1) {
            state.rows[tgt].qty += state.rows[j].qty;
            state.rows.splice(j, 1);
            updateBar();
            renderRows();
          }
        }
      });

      box.appendChild(el);
    });

    var unclear = state.rows.filter(needsReview).length;
    $("#reviewNote").textContent = unclear
      ? "有 " + unclear + " 件要你看一眼（识别不确定或没认出来）。"
      : "都认得挺确定的，扫一眼就行。";
    updateBar();
  }

  function updateBar() {
    var add = 0;
    state.rows.forEach(function (r) {
      if (r.cat && r.action !== "ignore") add++;
    });
    $("#barTxt").innerHTML = "共 <b>" + add + "</b> 件要入库";
    $("#confirm").textContent = add ? "确认入库（" + add + " 件）" : "没有要入库的";
    $("#confirm").disabled = !add;
  }

  /* ---------------- 确认入库（只写一次） ---------------- */
  function confirmAll() {
    if (state.locked) return;
    state.locked = true;
    var btn = $("#confirm");
    btn.disabled = true;
    btn.textContent = "正在入库…";

    /* 登录了就写云端（唯一真相），没登录就写本机 —— 两条路都只写一次 */
    if (window.AUTH && AUTH.configured && AUTH.configured() && AUTH.signedIn()) {
      cloudConfirm().then(function (st) {
        finish(st, true);
      }).catch(function (err) {
        state.locked = false;
        btn.disabled = false;
        btn.textContent = "再试一次";
        $("#reviewNote").textContent =
          "云端没写成功（" + (err && err.message ? err.message : "网络") + "）。库存一件都没动，检查网络再点一次。";
      });
      return;
    }

    var stats = { added: 0, adjusted: 0, kept: 0, skipped: 0 };
    var items = [];
    try { items = FD.items() || []; } catch (e) { items = []; }

    var today = FD.localDate ? FD.localDate() : new Date().toISOString().slice(0, 10);

    state.rows.forEach(function (r) {
      if (!r.cat || r.action === "ignore") { stats.skipped++; return; }
      if (r.action === "keep") { stats.kept++; return; }

      var f = food(r.cat);
      if (!f) { stats.skipped++; return; }

      if (r.action === "adjust") {
        var ex = items.filter(function (i) { return i.cat === r.cat; })
                      .sort(function (a, b) { return FD.daysLeftOf(a) - FD.daysLeftOf(b); })[0];
        if (ex) {
          ex.qty = (Number(ex.qty) || 0) + r.qty;
          stats.adjusted++;
          return;
        }
      }
      items.push({
        id: uid(), cat: f.id, name: f.name, tag: f.tag, qty: r.qty,
        unit: FD.unitOf(f.id), daysLeft: f.days, life: f.days, addedAt: today
      });
      stats.added++;
    });

    if (stats.added + stats.adjusted) {
      try { FD.saveItems(items); }
      catch (e) {
        state.locked = false;
        btn.disabled = false;
        btn.textContent = "再试一次";
        $("#reviewNote").textContent = "写不进去（浏览器存储满了或出错了），先别关页面，再点一次。";
        return;
      }
    }

    finish(stats, false);
  }

  /* 云端确认：开会话 → 留一份候选 → confirm_purchase（事务里一次改完） */
  async function cloudConfirm() {
    var sid = await AUTH.rpc("start_capture_session", {});

    var payload = [];
    state.rows.forEach(function (r) {
      if (!r.cat || r.action === "ignore") return;
      var f = food(r.cat);
      if (!f) return;
      payload.push({
        action: r.action, cat: f.id, name: f.name, tag: f.tag,
        qty: r.qty, unit: FD.unitOf(f.id), life: f.days
      });
    });

    /* 候选留档是附加动作，失败不影响入库 */
    try {
      await AUTH.rpc("save_capture_candidates", {
        p_session: sid,
        p_rows: state.rows.map(function (r) {
          return { cat: r.cat, label: r.label, conf: r.conf, qty: r.qty,
                   unit: r.cat ? FD.unitOf(r.cat) : "", action: r.action, ai: !!r.ai,
                   needs_review: needsReview(r), reason: r.err ? "service" : (r.cat ? "" : "unknown") };
        })
      });
    } catch (e) { /* 留档失败就算了 */ }

    var res = await AUTH.rpc("confirm_purchase", {
      p_session: sid,
      p_rows: payload,
      p_key: sid + ":confirm"
    });

    return {
      added: (res && res.added) | 0,
      adjusted: (res && res.adjusted) | 0,
      skipped: (res && res.skipped) | 0,
      kept: 0
    };
  }

  function finish(stats, cloud) {
    var wrote = stats.added + stats.adjusted;
    state.done = true;
    stopCam();

    $("#sumcards").innerHTML =
      '<div class="a"><b>' + stats.added + "</b><span>加进冰箱</span></div>" +
      '<div class="b"><b>' + stats.adjusted + "</b><span>改数量</span></div>" +
      '<div class="c"><b>' + (stats.kept + stats.skipped) + "</b><span>没动</span></div>";
    $("#doneH").textContent = wrote ? "已经记进冰箱了" : "这次没往冰箱加东西";
    $("#doneSub").textContent = wrote
      ? (cloud ? "共 " + wrote + " 件写进云端，家里的手机都能看到。"
               : "共 " + wrote + " 件写进去了。冰箱页和首页的推荐会跟着变。")
      : "这行你都删掉了，所以库存没动。";
    go(5);
  }


  /* ---------------- 小票核对 ----------------
     只读小票、只提示差异；点「加入清单」才动草稿行，点确认才动库存。 */
  var rcptParsed = [], rcptImage = null, rcptRawText = "";
  var NL = String.fromCharCode(10);
  /* 本地 AI（电脑上跑的 Qwen2.5-VL 服务）。没有这个服务时按钮永远不出现，
     原来的端上 9 类模型完全不受影响。 */
  /* 必须用「当前页面所在的主机名」：用 127.0.0.1 只有电脑自己能连，
     手机访问时那是手机自己。https 页面不允许连 http，直接不启用。 */
  var AI_PORT = 8941;
  var AI_URL = (location.protocol === "http:")
    ? "http://" + (location.hostname || "127.0.0.1") + ":" + AI_PORT
    : "";

  function catFromName(n) {
    var A = (window.RECEIPT && window.RECEIPT.ALIAS) || {};
    n = String(n || "").trim();
    if (!n) return "";
    for (var k in A) {
      for (var i = 0; i < A[k].length; i++) {
        var a = A[k][i];
        if (n.indexOf(a) >= 0 || a.indexOf(n) >= 0) return k;
      }
    }
    return "";
  }

  function aiProbe() {
    var btn = $("#aiRecog");
    if (!btn) return;
    if (!AI_URL) { btn.style.display = "none"; return; }
    var ctl = window.AbortController ? new AbortController() : null;
    var t = setTimeout(function () { if (ctl) ctl.abort(); }, 1500);
    fetch(AI_URL + "/health", ctl ? { signal: ctl.signal } : {})
      .then(function (r) { return r.json(); })
      .then(function (d) { clearTimeout(t); btn.style.display = (d && d.ok) ? "" : "none"; })
      .catch(function () { clearTimeout(t); btn.style.display = "none"; });
  }
  var ocrEngine = (function () {
    try { return (JSON.parse(localStorage.getItem("fd.prefs.v1") || "{}").ocr) || "fast"; }
    catch (e) { return "fast"; }
  })();

  function engineLabel() {
    var b = $("#rcptEngine");
    if (!b) return;
    b.textContent = ocrEngine === "paddle"
      ? "当前：高精度模式（点击切回快速）"
      : "识别不准？换高精度模式（首次约 50MB）";
  }

  function rcptMsg(text, isErr) {
    var el = $("#rcptMsg");
    el.textContent = text || "";
    el.className = "rmsg" + (isErr ? " err" : "");
  }

  async function pickReceipt(file) {
    if (!file) return;
    if (!window.RECEIPT) { rcptMsg("小票识别没加载成功", true); return; }
    rcptMsg("正在读小票…（第一次要下载识别模型，约 20 秒）");
    try {
      var dataUrl = await fileToDataUrl(file);
      rcptImage = dataUrl;
      var lines = await RECEIPT.readLines(dataUrl, ocrEngine);
      var text = lines.join(NL);
      rcptRawText = text;
      var raw = $("#rcptRaw"), rawBox = $("#rcptRawBox");
      if (raw && rawBox) { raw.textContent = text || "（空）"; rawBox.hidden = !text; }
      try { localStorage.setItem("fd.receipt.last", text.slice(0, 4000)); } catch (e) {}
      rcptParsed = RECEIPT.parse(text);
      if (!rcptParsed.length) {
        rcptMsg("没从小票里读出商品 —— 可能是照片太糊，或者这家店的小票格式认不出来。可以直接贴文字。", true);
        $("#rcptManual").hidden = false;
        renderDiff();
        return;
      }
      rcptMsg("读到 " + rcptParsed.length + " 样： " + rcptParsed.map(function (p) { return catName(p.cat) + " ×" + p.qty; }).join("、"));
      if (!state.rows.length) {
        /* 小票模式：没有照片，小票就是清单本身 */
        state.rows = rcptParsed.map(function (p) {
          return { cat: p.cat, label: p.cat, qty: Math.max(1, p.qty || 1), action: "add",
                   img: "", conf: 1, margin: 1, err: false, ai: false, src: "receipt" };
        });
        go(4); renderRows();
        rcptMsg("已按小票生成清单，下面可以改数量或删掉。");
        return;
      }
      renderDiff();
      /* 差异就在下面，自动滚过去，别让人以为没反应 */
      setTimeout(function () {
        var d = $("#rcptDiff");
        if (d && d.children.length) d.scrollIntoView({ behavior: "smooth", block: "center" });
      }, 120);
    } catch (e) {
      rcptMsg("读不出来：" + (e && e.message ? e.message : "未知错误"), true);
    }
  }

  /* 读成 dataURL 再交给 OCR：blob URL 在 worker 里会踩到缓存层，dataURL 最稳。
     顺手把长边压到 1600，手机拍的 4000px 原图既慢又没必要。 */
  function fileToDataUrl(file) {
    return new Promise(function (res, rej) {
      var img = new Image();
      var url = URL.createObjectURL(file);
      img.onload = function () {
        var max = 1600;
        var k = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
        var c = document.createElement("canvas");
        c.width = Math.round(img.naturalWidth * k);
        c.height = Math.round(img.naturalHeight * k);
        c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
        URL.revokeObjectURL(url);
        res(c.toDataURL("image/jpeg", 0.9));
      };
      img.onerror = function () { URL.revokeObjectURL(url); rej(new Error("图片读不了")); };
      img.src = url;
    });
  }

  function renderDiff() {
    var box = $("#rcptDiff");
    box.innerHTML = "";
    if (!rcptParsed.length) return;

    var d = RECEIPT.reconcile(state.rows, rcptParsed);
    if (!d.missing.length && !d.mismatch.length) {
      var ok = document.createElement("div");
      ok.className = "d quiet";
      ok.innerHTML = '<span class="tx">小票上的东西清单里都有，数量也对得上。</span>';
      box.appendChild(ok);
      return;
    }

    d.missing.forEach(function (p) {
      var el = document.createElement("div");
      el.className = "d";
      el.innerHTML = '<span class="tx">小票上有 <b>' + catName(p.cat) + ' ×' + p.qty + '</b>，照片里没看到。要补进去吗？</span>' +
                     '<button data-addrcpt="' + p.cat + '" data-qty="' + p.qty + '">加入清单</button>';
      box.appendChild(el);
    });

    d.mismatch.forEach(function (m) {
      var el = document.createElement("div");
      el.className = "d";
      el.innerHTML = '<span class="tx">' + catName(m.p.cat) + '：小票 <b>' + m.p.qty + '</b>，清单 <b>' + m.have + '</b>。</span>' +
                     '<button data-setrcpt="' + m.idx + '" data-qty="' + m.p.qty + '">改成 ' + m.p.qty + '</button>';
      box.appendChild(el);
    });

    box.querySelectorAll("[data-addrcpt]").forEach(function (b) {
      b.addEventListener("click", function () {
        state.rows.push({ cat: b.dataset.addrcpt, qty: Number(b.dataset.qty) || 1, action: "add",
                          img: "", conf: 0, label: "", margin: 0, fromReceipt: true });
        renderRows();
        renderDiff();
      });
    });
    box.querySelectorAll("[data-setrcpt]").forEach(function (b) {
      b.addEventListener("click", function () {
        var r = state.rows[Number(b.dataset.setrcpt)];
        if (r) { r.qty = Number(b.dataset.qty) || 1; r.action = "add"; }
        renderRows();
        renderDiff();
      });
    });
  }

  aiProbe();

  /* 从冰箱页「拍小票」进来：跳过拍照，直接开小票识别 */
  if (/[?&]receipt=1/.test(location.search)) {
    /* 等页面初始化完再跳，否则会被后面的 reset 拽回第 1 步 */
    setTimeout(function () {
      go(4);
      var box = $("#rcptBox");
      if (box) { box.open = true; box.scrollIntoView({ block: "center" }); }
      rcptMsg("拍一张小票，我来读上面的商品。");
    }, 400);
  }

  $("#rcptPick").addEventListener("click", function () { $("#rcptFile").click(); });
  $("#rcptPick2").addEventListener("click", function () { $("#rcptFile").click(); });

  /* 引擎切换：切完如果手上还有小票图，直接重跑一遍 */
  $("#rcptEngine").addEventListener("click", function () {
    ocrEngine = ocrEngine === "paddle" ? "fast" : "paddle";
    try {
      var v = JSON.parse(localStorage.getItem("fd.prefs.v1") || "{}");
      v.ocr = ocrEngine;
      localStorage.setItem("fd.prefs.v1", JSON.stringify(v));
    } catch (e) {}
    engineLabel();
    if (!rcptImage) { rcptMsg(ocrEngine === "paddle" ? "已切到高精度模式，下次拍小票会用。" : "已切回快速模式。"); return; }
    rcptMsg("正在用高精度模式重读…（首次要下载模型，约 50MB，稍等）");
    RECEIPT.readLines(rcptImage, ocrEngine).then(function (lines) {
      rcptRawText = lines.join(NL);
      var raw = $("#rcptRaw"), rawBox = $("#rcptRawBox");
      if (raw && rawBox) { raw.textContent = rcptRawText || "（空）"; rawBox.hidden = !rcptRawText; }
      rcptParsed = RECEIPT.parse(rcptRawText);
      rcptMsg(rcptParsed.length
        ? "高精度读到 " + rcptParsed.length + " 样： " + rcptParsed.map(function (p) { return catName(p.cat) + " ×" + p.qty; }).join("、")
        : "高精度也没读出商品 —— 直接贴文字吧。", !rcptParsed.length);
      renderDiff();
    }).catch(function (e) { rcptMsg("高精度模式失败：" + e.message, true); });
  });

  engineLabel();

  /* OCR 认不出时的手动兜底：贴文字 → 走同一套解析与对账 */
  $("#rcptParse").addEventListener("click", function () {
    var txt = ($("#rcptText").value || "").trim();
    if (!txt) { rcptMsg("先把小票上的商品行贴进来。", true); return; }
    rcptParsed = RECEIPT.parse(txt);
    if (!rcptParsed.length) {
      rcptMsg("这几行里没认出食材 —— 试试写成「牛奶 2盒 25.60」这样。", true);
      return;
    }
    rcptMsg("认到 " + rcptParsed.length + " 样： " + rcptParsed.map(function (p) { return catName(p.cat) + " ×" + p.qty; }).join("、"));
    renderDiff();
  });
  $("#rcptFile").addEventListener("change", function (e) {
    var f = e.target.files && e.target.files[0];
    e.target.value = "";
    pickReceipt(f);
  });

  /* ---------------- 绑定 ---------------- */
  $("#startCam").addEventListener("click", startCam);
  $("#pickFiles").addEventListener("click", function () { $("#fileIn").click(); });
  $("#pickFiles2").addEventListener("click", function () { $("#fileIn").click(); });
  /* 一旦从相册选了照片，"没给摄像头"那段提示就没意义了 */
  $("#fileIn").addEventListener("change", function () {
    var why = $("#camWhy");
    if (why) why.textContent = "";
  });
  $("#fileIn").addEventListener("change", function (e) { takeFiles(e.target.files); });
  $("#shoot").addEventListener("click", shoot);

  $("#undoShot").addEventListener("click", function () {
    state.shots.pop();
    var n = state.shots.length;
    $("#cnt").textContent = "已拍 " + n + " 件";
    $("#undoShot").disabled = !n;
    $("#toDraft").disabled = !n;
    if (!n) { $("#lastChip").hidden = true; showStage(""); return; }
    var s = state.shots[n - 1];
    showStage(s.fullImg || s.img || "");
    var chip = $("#lastChip");
    chip.hidden = false;
    chip.innerHTML = s.cat
      ? "<b>" + catName(s.cat) + "</b><span class='pct'>" + pct(s.conf) + "%</span>"
      : "<b>没认出来</b><span class='pct'>下一步手选</span>";
  });

  /* 本地 AI 重认：逐张送给电脑上的 Qwen，把识别结果回填到每一张 shot 上。
     只改 shot 的标签，不改库存；后面的确认流程完全照旧。 */
  $("#aiRecog").addEventListener("click", async function () {
    var btn = $("#aiRecog");
    if (!state.shots.length) return;
    btn.disabled = true;
    var done = 0, hit = 0, miss = [];
    for (var i = 0; i < state.shots.length; i++) {
      var sh = state.shots[i];
      btn.textContent = "识别中 " + (i + 1) + "/" + state.shots.length + "…";
      try {
        var r = await fetch(AI_URL + "/recognize", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ image: sh.img })
        }).then(function (x) { return x.json(); });
        done++;
        var items = (r && r.items) || [];
        var first = items[0];
        var cat = first ? catFromName(first.name) : "";
        if (cat) {
          hit++;
          sh.cat = cat; sh.label = first.name; sh.ai = true;
          sh.conf = 0.9; sh.second = ""; sh.margin = 1;
          /* 只有量纲对得上才采信 AI 的数量：它说「10 个鸡蛋」而我们按「盒」记，
             就不能照搬，否则会变成「10 盒」。量纲不一致时退回 1。 */
          var catalogUnit = FD.unitOf ? FD.unitOf(cat) : "";
          if (first.qty != null && first.unit && catalogUnit && first.unit === catalogUnit) {
            sh.qty = first.qty; sh.unit = first.unit;
          }
        } else {
          sh.cat = ""; sh.label = first ? first.name : ""; sh.ai = true; sh.conf = 0;
          miss.push(sh);
        }
      } catch (e) {
        sh.aiErr = String(e && e.message || e);
        miss.push(sh);
      }
    }
    btn.disabled = false;
    btn.textContent = "本地 AI 重认一遍（更准，需电脑上跑服务）";
    var chip = $("#lastChip");
    if (chip) {
      chip.hidden = false;
      var why = "";
      if (!done) why = "连不上识别服务（" + AI_URL + "）";
      else if (miss.length && miss[0].aiErr) why = "报错：" + miss[0].aiErr;
      else if (miss.length && miss[0].label) why = "认成「" + miss[0].label + "」，不在食材表里";
      chip.innerHTML = "<b>AI 认出 " + hit + "/" + done + " 件</b><span class='pct'>"
        + (why || (miss.length ? miss.length + " 件要手选" : "全部有标签")) + "</span>";
    }
    if (typeof renderRows === "function" && state.step === 4) renderRows();
  });

  $("#toDraft").addEventListener("click", function () {
    if (!state.shots.length) return;
    buildRows();
    var prog = $("#prog");
    prog.innerHTML = state.rows.map(function (r) {
      return '<li><img src="' + r.img + '" alt="">' +
             '<span class="lb">' + (r.cat ? catName(r.cat) : "没认出来") + "</span>" +
             '<span class="ok">✓</span></li>';
    }).join("");
    go(3);
    setTimeout(function () {
      renderRows();
      go(4);
    }, 700);
  });

  $("#addManual").addEventListener("click", function () {
    state.rows.push({ cat: "", qty: 1, action: "ignore", img: "", conf: 0, label: "", margin: 0 });
    renderRows();
    var last = $("#rows").lastElementChild;
    if (last) last.scrollIntoView({ behavior: "smooth", block: "center" });
  });

  $("#confirm").addEventListener("click", confirmAll);

  $("#again").addEventListener("click", function () {
    state.shots = []; state.rows = []; state.locked = false; state.done = false;
    $("#cnt").textContent = "已拍 0 件";
    $("#undoShot").disabled = true; $("#toDraft").disabled = true;
    $("#lastChip").hidden = true;
    $("#confirm").disabled = false;
    $("#confirm").textContent = "确认入库";
    $("#rows").innerHTML = "";
    go(1);
  });

  /* 页面隐藏时关摄像头 */
  document.addEventListener("visibilitychange", function () {
    if (document.hidden && state.step === 2) stopCam();
  });
  window.addEventListener("pagehide", stopCam);

  go(1);
})();
