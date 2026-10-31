/* ============================================================
   receipt.js — 小票识别与对账（端侧 OCR，不需要任何 key）

   原则（来自产品决策）：
     · 小票只用来「核对」，永远不直接改库存
     · 小票上有 ≠ 一定进了冰箱
     · 数量和名称对不上时，只提示，由人决定

   流程：图片 → Tesseract(chi_sim+eng) → 按行解析 → 匹配到食材 → 与候选清单比对 → 差异列表
   ============================================================ */
(function (g) {
  "use strict";

  /* 用绝对地址：worker 里再解析相对路径会变成 vendor/tesseract/vendor/... 直接 404 */
  var BASE = new URL("./vendor/tesseract/", location.href).href.replace(/\/$/, "");

  /* 常见叫法 → 内容库里的食材 id（用户小票上写什么都有可能） */
  var ALIAS = {
    greens:  ["青菜", "小白菜", "上海青", "菜心", "油菜", "菠菜", "生菜", "叶子菜", "绿叶"],
    broccoli:["西兰花", "青花菜", "西蓝花"],
    tomato:  ["番茄", "西红柿"],
    chili:   ["青椒", "尖椒", "柿子椒", "辣椒"],
    eggplant:["茄子"],
    mushroom:["香菇", "蘑菇", "菌菇", "金针菇", "平菇"],
    onion:   ["洋葱"],
    carrot:  ["胡萝卜", "红萝卜"],
    potato:  ["土豆", "马铃薯"],
    egg:     ["鸡蛋", "土鸡蛋", "鲜蛋", "蛋"],
    tofu:    ["豆腐", "嫩豆腐", "老豆腐", "豆干"],
    pork:    ["猪肉", "五花肉", "里脊", "肉末", "肉馅", "排骨"],
    chicken: ["鸡肉", "鸡腿", "鸡胸", "鸡翅"],
    beef:    ["牛肉", "牛腩", "肥牛"],
    fish:    ["鱼", "鲈鱼", "鲑鱼", "三文鱼", "巴沙鱼"],
    shrimp:  ["虾", "基围虾", "白虾", "虾仁"],
    ham:     ["火腿", "午餐肉", "培根"],
    milk:    ["牛奶", "纯牛奶", "鲜奶", "奶"],
    cheese:  ["芝士", "奶酪", "黄油"],
    yogurt:  ["酸奶"],
    rice:    ["米饭", "大米", "香米"],
    noodle:  ["面条", "挂面", "拉面", "意面"],
    bread:   ["面包", "吐司"],
    dumpling:["饺子", "速冻饺", "水饺"],
    cola:    ["可乐", "汽水"]
  };

  var UNITS = ["盒", "把", "个", "块", "斤", "袋", "瓶", "包", "根", "颗", "条", "罐", "杯", "碗", "片"];
  var SKIP = /合计|总计|应收|实收|找零|付款|支付|微信|支付宝|会员|积分|单号|流水|收银|欢迎|谢谢|地址|电话|日期|时间|营业|税|折扣|优惠|小计|数量|单价|金额/;

  var workerP = null;

  function loadScript(src) {
    return new Promise(function (res, rej) {
      if (g.Tesseract) return res();
      var s = document.createElement("script");
      s.src = src; s.onload = res; s.onerror = function () { rej(new Error("加载 OCR 失败")); };
      document.head.appendChild(s);
    });
  }

  async function worker() {
    if (workerP) return workerP;
    workerP = (async function () {
      await loadScript(BASE + "/tesseract.min.js");
      return await g.Tesseract.createWorker("chi_sim+eng", 1, {
        workerPath: BASE + "/worker.min.js",
        corePath: BASE + "/tesseract-core-simd.wasm.js",
        langPath: BASE,
        gzip: false,
        workerBlobURL: false,
        legacyCore: false,
        legacyLang: false,
        logger: function () {}
      });
    })();
    return workerP;
  }

  /* 图片（URL / canvas / img）→ 纯文本 */
  /* 小票预处理：灰度 + 对比度拉伸。
     热敏纸发灰、手机拍偏黄是最常见的两种「明明看得清但认不出」，
     拉伸一次直方图比换模型便宜得多。 */
  function prep(dataUrl) {
    return new Promise(function (res) {
      var img = new Image();
      img.onload = function () {
        var c = document.createElement("canvas");
        c.width = img.naturalWidth; c.height = img.naturalHeight;
        var ctx = c.getContext("2d", { willReadFrequently: true });
        ctx.drawImage(img, 0, 0);
        try {
          var d = ctx.getImageData(0, 0, c.width, c.height);
          var px = d.data, hist = new Array(256).fill(0), i;
          for (i = 0; i < px.length; i += 4) {
            var g = (0.299 * px[i] + 0.587 * px[i + 1] + 0.114 * px[i + 2]) | 0;
            px[i] = px[i + 1] = px[i + 2] = g;
            hist[g]++;
          }
          /* 只取 2%–98% 的区间拉伸，避开反光的纯白和阴影的纯黑 */
          var total = c.width * c.height, lo = 0, hi = 255, acc = 0;
          for (i = 0; i < 256; i++) { acc += hist[i]; if (acc > total * 0.02) { lo = i; break; } }
          acc = 0;
          for (i = 255; i >= 0; i--) { acc += hist[i]; if (acc > total * 0.02) { hi = i; break; } }
          if (hi - lo > 30) {
            var k = 255 / (hi - lo);
            for (i = 0; i < px.length; i += 4) {
              var v = (px[i] - lo) * k;
              v = v < 0 ? 0 : v > 255 ? 255 : v;
              px[i] = px[i + 1] = px[i + 2] = v;
            }
          }
          ctx.putImageData(d, 0, 0);
        } catch (e) { /* 跨域图会抛，直接用原图 */ }
        res(c.toDataURL("image/jpeg", 0.92));
      };
      img.onerror = function () { res(dataUrl); };
      img.src = dataUrl;
    });
  }

  /* ---------------- 高精度引擎：PaddleOCR（PP-OCRv5/v6） ----------------
     比 tesseract 对中文准得多（番茄不会再认成 ei），代价是首次要下 ~50MB。
     所以做成「默认用 tesseract，认不准时手动切高精度」，不做静默下载。 */
  var paddleP = null;
  function paddle() {
    if (paddleP) return paddleP;
    paddleP = (async function () {
      var mod = await import("./vendor/paddleocr/index.mjs");
      var abs = function (p) { return new URL(p, location.href).href; };
      var defaultName = "PP-OCRv6_tiny";
      return await mod.PaddleOCR.create({
        textDetectionModelName: defaultName + "_det",
        textDetectionModelAsset: { url: abs("./vendor/paddleocr/models/PP-OCRv6_tiny_det.tar") },
        textRecognitionModelName: defaultName + "_rec",
        textRecognitionModelAsset: { url: abs("./vendor/paddleocr/models/PP-OCRv6_tiny_rec.tar") },
        ortOptions: { backend: "wasm", wasmPaths: abs("./vendor/paddleocr/ort/"), numThreads: 1, simd: true },
        worker: true
      });
    })();
    return paddleP;
  }

  /* 高精度：返回「按行重组」后的文本行（PaddleOCR 是按文字块给的，名字/数量/价格可能分三块） */
  async function readLinesPaddle(dataUrl) {
    var ocr = await paddle();
    var blob = await (await fetch(dataUrl)).blob();
    var res = await ocr.predict(blob);
    var items = (res[0] && res[0].items) || [];
    if (!items.length) return [];

    /* 用 poly 的纵坐标把不同文字块归到同一行 */
    var boxes = items.map(function (it) {
      var ys = (it.poly || []).map(function (p) { return p[1] != null ? p[1] : p.y; });
      var xs = (it.poly || []).map(function (p) { return p[0] != null ? p[0] : p.x; });
      var top = Math.min.apply(null, ys), bot = Math.max.apply(null, ys);
      return { text: it.text, top: top, bot: bot, left: Math.min.apply(null, xs),
               cy: (top + bot) / 2, h: Math.max(6, bot - top) };
    }).filter(function (b) { return b.text && b.text.trim(); });

    boxes.sort(function (a, b) { return a.cy - b.cy || a.left - b.left; });
    var rows = [];
    boxes.forEach(function (b) {
      var row = rows[rows.length - 1];
      if (row && Math.abs(b.cy - row.cy) <= Math.max(8, row.h * 0.6)) {
        row.parts.push(b); row.cy = (row.cy + b.cy) / 2; row.h = Math.max(row.h, b.h);
      } else {
        rows.push({ cy: b.cy, h: b.h, parts: [b] });
      }
    });
    return rows.map(function (r) {
      return r.parts.sort(function (a, b) { return a.left - b.left; })
                    .map(function (p) { return p.text.trim(); }).join(" ");
    });
  }

  async function readText(src) {
    var w = await worker();
    try { await w.setParameters({ tessedit_pageseg_mode: "6" }); } catch (e) {}   /* 单块文字，适合小票 */
    var input = (typeof src === "string" && src.indexOf("data:") === 0) ? await prep(src) : src;
    var r = await w.recognize(input);
    return (r && r.data && r.data.text) || "";
  }

  /* 文本 → [{cat, name, qty, unit, price, raw}] */
  function parse(text) {
    var lines = String(text || "").split(/\r?\n/);
    var out = [];
    lines.forEach(function (line) {
      var s = line.replace(/\s+/g, " ").trim();
      if (!s || s.length < 2) return;
      if (SKIP.test(s)) return;

      var hit = null, hitLen = 0;
      Object.keys(ALIAS).forEach(function (cat) {
        ALIAS[cat].forEach(function (alias) {
          if (s.indexOf(alias) >= 0 && alias.length > hitLen) { hit = cat; hitLen = alias.length; }
        });
      });
      if (!hit) return;

      /* 数量：找单位前面那个数字；找不到就当 1 */
      var qty = 1, unit = "";
      var m = s.match(/(\d{1,3})\s*(["'a-zA-Z]?)\s*([盒把个块斤袋瓶包根颗条罐杯碗片])/);
      if (m) { qty = Math.max(1, Math.min(99, parseInt(m[1], 10) || 1)); unit = m[3]; }
      else {
        var m2 = s.match(/([盒把个块斤袋瓶包根颗条罐杯碗片])\s*(\d{1,3})/);
        if (m2) { qty = Math.max(1, Math.min(99, parseInt(m2[2], 10) || 1)); unit = m2[1]; }
        else {
          /* 单位被 OCR 认花了（"2a"）：退一步，取第一个不是价格的整数 */
          var m3 = s.replace(/\d{1,4}\.\d{1,2}/g, " ").match(/(?:^|\s)(\d{1,2})(?=[a-zA-Z]|\s|$)/);
          if (m3) qty = Math.max(1, Math.min(99, parseInt(m3[1], 10) || 1));
        }
      }

      /* 金额：行尾那段 x.xx / xx.xx */
      var price = null;
      var pm = s.match(/(\d{1,4}\.\d{1,2})\s*$/);
      if (pm) price = parseFloat(pm[1]);

      var name = s.slice(0, 12);
      out.push({ cat: hit, name: name, qty: qty, unit: unit, price: price, raw: s });
    });

    /* 同一食材出现多行就合并数量 */
    var merged = {}, order = [];
    out.forEach(function (r) {
      if (!merged[r.cat]) { merged[r.cat] = r; order.push(r.cat); }
      else merged[r.cat].qty += r.qty;
    });
    return order.map(function (c) { return merged[c]; });
  }

  /* 候选清单（草稿行） vs 小票 → 差异 */
  function reconcile(rows, parsed) {
    var byCat = {};
    (rows || []).forEach(function (r, i) {
      if (!r.cat) return;
      byCat[r.cat] = byCat[r.cat] || { idx: [], qty: 0 };
      byCat[r.cat].idx.push(i);
      if (r.action !== "ignore") byCat[r.cat].qty += Number(r.qty) || 0;
    });

    var missing = [], mismatch = [], extra = [];
    parsed.forEach(function (p) {
      var hit = byCat[p.cat];
      if (!hit) { missing.push(p); return; }
      if (hit.qty < p.qty) mismatch.push({ p: p, have: hit.qty, idx: hit.idx[0] });
    });
    Object.keys(byCat).forEach(function (cat) {
      if (!parsed.some(function (p) { return p.cat === cat; })) {
        extra.push({ cat: cat, qty: byCat[cat].qty, idx: byCat[cat].idx[0] });
      }
    });

    return { missing: missing, mismatch: mismatch, extra: extra };
  }

  /* 按行切分：手写循环，避免正则里的转义被工具链吃掉 */
  function toLines(t) {
    var out = [], cur = "";
    var s = String(t || "");
    for (var i = 0; i < s.length; i++) {
      var c = s.charCodeAt(i);
      if (c === 10 || c === 13) { if (cur) out.push(cur); cur = ""; }
      else cur += s[i];
    }
    if (cur) out.push(cur);
    return out;
  }

  /* 统一入口：给图片（dataURL），按引擎返回文本行数组 */
  async function readLines(src, engine) {
    if (engine === "paddle") {
      try { return await readLinesPaddle(src); }
      catch (e) { return toLines(await readText(src)); }
    }
    return toLines(await readText(src));
  }

  g.RECEIPT = {
    readText: readText, readLines: readLines, parse: parse, reconcile: reconcile, prep: prep,
    ALIAS: ALIAS, parseText: function (t) { return parse(t); }
  };
})(window);
