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
    }
    go(2);
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
      chip.innerHTML = "<b>" + catName(shot.cat) + "</b><span class='pct'>" + pct(shot.conf) + "%"
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
        addShot(await classifyCanvas(c));
      } catch (e) { /* 跳过读不了的 */ }
    }
    $("#fileIn").value = "";
  }

  /* ---------------- 生成草稿 ---------------- */
  function buildRows() {
    state.rows = state.shots.map(function (s) {
      return {
        cat: s.cat, qty: 1, action: s.cat ? "add" : "ignore",
        img: s.img, conf: s.conf, label: s.label, margin: s.margin, err: !!s.err
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
      else if (needsReview(r)) badge = '<span class="badge warn">待确认 ' + pct(r.conf) + "%</span>";
      else badge = '<span class="badge ok">' + pct(r.conf) + "%</span>";

      var opts = '<option value=""' + (r.cat ? '' : ' selected') + '>还没选</option>' +
                 FD.CATALOG.map(function (f) {
        return '<option value="' + f.id + '"' + (f.id === r.cat ? " selected" : "") + ">" +
               (f.cn || f.name) + " " + (f.name || "") + "</option>";
                 }).join("");

      var hint = "";
      if (r.err) hint = "识别服务没起来 —— 从上面选一个，或者忽略。";
      else if (!r.cat) hint = "没认出来 —— 从上面选一个，或者忽略。";
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
            '<button data-a="add" class="' + (r.action === "add" ? "on" : "") + '">新增</button>' +
            '<button data-a="adjust" class="' + (r.action === "adjust" ? "on" : "") + '">调整</button>' +
            '<button data-a="keep" class="' + (r.action === "keep" ? "on" : "") + '">不变</button>' +
            '<button data-a="ignore" class="' + (r.action === "ignore" ? "on" : "") + '">忽略</button>' +
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
    var add = 0, adj = 0, keep = 0, ign = 0;
    state.rows.forEach(function (r) {
      if (!r.cat || r.action === "ignore") ign++;
      else if (r.action === "add") add++;
      else if (r.action === "adjust") adj++;
      else keep++;
    });
    $("#barTxt").innerHTML = "新增 <b>" + add + "</b> · 调整 <b>" + adj + "</b> · 不变 " + keep + " · 忽略 " + ign;
    $("#confirm").textContent = add + adj ? "确认入库（" + (add + adj) + " 件）" : "没有要入库的";
    $("#confirm").disabled = !(add + adj);
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
      if (!r.cat || r.action === "ignore" || r.action === "keep") return;
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
                   unit: r.cat ? FD.unitOf(r.cat) : "", action: r.action,
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
      '<div class="a"><b>' + stats.added + "</b><span>新增</span></div>" +
      '<div class="b"><b>' + stats.adjusted + "</b><span>调整</span></div>" +
      '<div class="c"><b>' + (stats.kept + stats.skipped) + "</b><span>没动</span></div>";
    $("#doneH").textContent = wrote ? "已经记进冰箱了" : "这次没往冰箱加东西";
    $("#doneSub").textContent = wrote
      ? (cloud ? "共 " + wrote + " 件写进云端，家里的手机都能看到。"
               : "共 " + wrote + " 件写进去了。冰箱页和首页的推荐会跟着变。")
      : "你选的都是「不变」或「忽略」，所以库存没动。";
    go(5);
  }


  /* ---------------- 小票核对 ----------------
     只读小票、只提示差异；点「加入清单」才动草稿行，点确认才动库存。 */
  var rcptParsed = [], rcptImage = null;

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
      var text = await RECEIPT.readText(dataUrl);
      rcptParsed = RECEIPT.parse(text);
      if (!rcptParsed.length) {
        rcptMsg("没从小票里读出商品 —— 可能是照片太糊，或者这家店的小票格式认不出来。", true);
        renderDiff();
        return;
      }
      rcptMsg("读到 " + rcptParsed.length + " 样： " + rcptParsed.map(function (p) { return catName(p.cat) + " ×" + p.qty; }).join("、"));
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

  $("#rcptPick").addEventListener("click", function () { $("#rcptFile").click(); });
  $("#rcptFile").addEventListener("change", function (e) {
    var f = e.target.files && e.target.files[0];
    e.target.value = "";
    pickReceipt(f);
  });

  /* ---------------- 绑定 ---------------- */
  $("#startCam").addEventListener("click", startCam);
  $("#pickFiles").addEventListener("click", function () { $("#fileIn").click(); });
  $("#pickFiles2").addEventListener("click", function () { $("#fileIn").click(); });
  $("#fileIn").addEventListener("change", function (e) { takeFiles(e.target.files); });
  $("#shoot").addEventListener("click", shoot);

  $("#undoShot").addEventListener("click", function () {
    state.shots.pop();
    var n = state.shots.length;
    $("#cnt").textContent = "已拍 " + n + " 件";
    $("#undoShot").disabled = !n;
    $("#toDraft").disabled = !n;
    if (!n) { $("#lastChip").hidden = true; return; }
    var s = state.shots[n - 1];
    var chip = $("#lastChip");
    chip.hidden = false;
    chip.innerHTML = s.cat
      ? "<b>" + catName(s.cat) + "</b><span class='pct'>" + pct(s.conf) + "%</span>"
      : "<b>没认出来</b><span class='pct'>下一步手选</span>";
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
