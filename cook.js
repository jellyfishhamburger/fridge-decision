/* ============================================================
   cook.js — 「拖食材进锅 → 推荐一道菜 → 真的扣库存」
   这一页不动 index.html 的任何一行；它只调用 logic.js 已有的
   FD.items / FD.decide / FD.consume / FD.saveItems / FD.log。

   三条边界（刻意守着）：
   1. 选中食材只是界面状态（sel:Set<cat>），不写任何存储；
   2. 只有按「开始做饭」才写库存，且只走 FD.saveItems 这唯一写入口；
   3. 这一页不启动 FD.sync.start()，所以云端一行都不会被改。
   ============================================================ */
(function () {
  "use strict";

  const $ = (s, r) => (r || document).querySelector(s);
  const $$ = (s, r) => [...(r || document).querySelectorAll(s)];

  /* ---------- 这一页自己的文案（挂进现有 i18n 表，不改 i18n.js） ---------- */
  Object.assign(I18N.STR.zh, {
    "cook.back": "冰箱",
    "cook.title": "今天的锅",
    "cook.myFridge": "我的冰箱",
    "cook.lede": "点一下食材，或者直接把它拖进锅里。",
    "cook.pot": "锅里",
    "cook.picked0": "还没放东西",
    "cook.pickedN": "已放 {n} 样",
    "cook.dropHint": "把食材拖进来",
    "cook.dropHere": "锅：把食材放进来",
    "cook.ask": "帮我做一道菜",
    "cook.prefsTab": "筛选",
    "cook.goalTitle": "想怎么吃？",
    "cook.goalOpt": "可选",
    "cook.goalHint": "不设置也没关系，直接按锅里的食材推荐。",
    "cook.kcalCap": "热量上限",
    "cook.kcalNote": "每人每餐的估算值",
    "cook.timeCap": "最多用时",
    "cook.minUnit": "分钟",
    "cook.greens": "必须有绿叶菜",
    "cook.fibre": "纤维倾向较高",
    "cook.gen": "生成菜谱 →",
    "cook.skip": "不用限制，直接推荐",
    "cook.applied": "已按：{s}",
    "cook.match": "锅里匹配 {a}/{b} 样",
    "cook.noPrefs": "不设限制",
    "cook.empty": "冰箱还是空的。先载入一份示例，看看这个玩法长什么样。",
    "cook.demo": "载入示例",
    "cook.demoDone": "已载入示例库存",
    "cook.ready": "现在就能做",
    "cook.gap1": "差一样",
    "cook.gapN": "差 {n} 样",
    "cook.mins": "{n} 分钟",
    "cook.kcal": "{n} kcal",
    "cook.uses": "用掉",
    "cook.needBuy": "还差：{s}",
    "cook.needPantry": "柜里也没有：{s}",
    "cook.steps": "看做法",
    "cook.cook": "开始做饭",
    "cook.cookLocked": "食材不齐",
    "cook.noMatch": "这几样凑不出菜。换一样试试，或者多加一样。",
    "cook.none": "锅里还是空的 —— 先放点东西。",
    "cook.done": "用掉 {s}，库存已扣减",
    "cook.doneTitle": "做好了",
    "cook.again": "再选一锅",
    "cook.local": "库存存在这台设备 · 这个页面不往云端写",
    "cook.legOk": "还新鲜",
    "cook.legSoon": "3 天内到期",
    "cook.legNow": "今天到期",
    "cook.leftN": "剩 {n}",
    "cook.today": "今天到期",
    "cook.dayN": "{n} 天",
    /* AI 现配 */
    "cook.aiBadge": "AI 生成",
    "cook.aiBy": "本机模型 · 未入库",
    "cook.aiNotSaved": "未入库",
    "cook.aiCtaTitle": "库里没有同时用上「{s}」的菜",
    "cook.aiCtaBody": "让你电脑上的本地模型现配一道，约 3–15 秒。生成的菜只在这里显示，不会写进菜谱库。",
    "cook.aiGo": "让 AI 配一道",
    "cook.aiLink": "也可以用这几样让 AI 配一道 →",
    "cook.aiNoUrl": "这一步需要本机 AI 服务：先用 python start.py 启动，再用带 ?ai= 的地址打开页面。",
    "cook.aiThinking": "正在配菜…",
    "cook.aiThinkingBody": "用 {s} 现配一道，通常几秒钟。",
    "cook.aiUses": "用了 {s}",
    "cook.aiNote": "这道是本机模型现写的，不是菜谱库里的菜；觉得合适可以收藏。",
    "cook.aiZhNote": "",
    "cook.aiExtra": "还要买：{s}",
    "cook.aiWarn": "注意：{s}",
    "cook.aiMissing": "模型没按要求用上：{s}",
    "cook.aiSave": "收藏这一道",
    "cook.aiSaved": "已收藏",
    "cook.aiSavedToast": "已收藏「{s}」",
    "cook.aiAgain": "再配一道",
    "cook.aiRetry": "重试",
    "cook.aiFail": "连不上本地 AI 服务（{s}）",
    "cook.aiTimeout": "等太久了，模型没有在 60 秒内返回",
    "cook.aiSavedN": "收藏的 AI 菜谱（{n}）",
    "cook.aiRemove": "删除",
    "cook.aiRemoved": "已删除"
  });
  Object.assign(I18N.STR.en, {
    "cook.back": "Fridge",
    "cook.title": "Tonight's pot",
    "cook.myFridge": "My fridge",
    "cook.lede": "Tap an ingredient, or drag it straight into the pot.",
    "cook.pot": "In the pot",
    "cook.picked0": "Nothing yet",
    "cook.pickedN": "{n} in the pot",
    "cook.dropHint": "Drag something in",
    "cook.dropHere": "Pot: drop ingredients here",
    "cook.ask": "What can I cook?",
    "cook.prefsTab": "Filters",
    "cook.goalTitle": "Any preferences?",
    "cook.goalOpt": "optional",
    "cook.goalHint": "Skip it and we'll just use what's in the pot.",
    "cook.kcalCap": "Calorie cap",
    "cook.kcalNote": "Rough estimate per serving",
    "cook.timeCap": "Max time",
    "cook.minUnit": "min",
    "cook.greens": "Must include greens",
    "cook.fibre": "Higher fibre",
    "cook.gen": "Show recipes →",
    "cook.skip": "Skip — just recommend",
    "cook.applied": "Applied: {s}",
    "cook.match": "{a}/{b} in the pot",
    "cook.noPrefs": "No filters",
    "cook.empty": "The fridge is empty. Load the sample stock to see how this works.",
    "cook.demo": "Load sample",
    "cook.demoDone": "Sample stock loaded",
    "cook.ready": "Ready now",
    "cook.gap1": "One missing",
    "cook.gapN": "{n} missing",
    "cook.mins": "{n} min",
    "cook.kcal": "{n} kcal",
    "cook.uses": "Uses",
    "cook.needBuy": "Missing: {s}",
    "cook.needPantry": "Not in the cupboard: {s}",
    "cook.steps": "Steps",
    "cook.cook": "Start cooking",
    "cook.cookLocked": "Not enough ingredients",
    "cook.noMatch": "Nothing matches that selection. Swap one, or add another.",
    "cook.none": "The pot is empty — put something in first.",
    "cook.done": "Used {s}; stock updated",
    "cook.doneTitle": "Done",
    "cook.again": "Another pot",
    "cook.local": "Stock lives on this device · this page never writes to the cloud",
    "cook.legOk": "fresh",
    "cook.legSoon": "within 3 days",
    "cook.legNow": "due today",
    "cook.leftN": "{n} left",
    "cook.today": "today",
    "cook.dayN": "{n} d",
    /* AI 现配 */
    "cook.aiBadge": "AI generated",
    "cook.aiBy": "local model · not in the library",
    "cook.aiNotSaved": "not saved",
    "cook.aiCtaTitle": "Nothing in the library uses {s} together",
    "cook.aiCtaBody": "Let the local model on your computer invent one — 3 to 15 seconds. It stays here; nothing is written to the recipe library.",
    "cook.aiGo": "Ask the AI for a dish",
    "cook.aiLink": "Or let the AI build one from these →",
    "cook.aiNoUrl": "This needs the local AI service: run python start.py, then open the page with the ?ai= address.",
    "cook.aiThinking": "Cooking up an idea…",
    "cook.aiThinkingBody": "Writing one recipe with {s}. Usually a few seconds.",
    "cook.aiUses": "Uses {s}",
    "cook.aiNote": "Written just now by the local model — not a library recipe. Save it if you like it.",
    "cook.aiZhNote": "The model answers in Chinese, so the dish text below stays Chinese.",
    "cook.aiExtra": "Also needed: {s}",
    "cook.aiWarn": "Watch out: {s}",
    "cook.aiMissing": "The model left out: {s}",
    "cook.aiSave": "Save this one",
    "cook.aiSaved": "Saved",
    "cook.aiSavedToast": "Saved “{s}”",
    "cook.aiAgain": "Another one",
    "cook.aiRetry": "Retry",
    "cook.aiFail": "Can't reach the local AI service ({s})",
    "cook.aiTimeout": "The model didn't answer within 60 seconds",
    "cook.aiSavedN": "Saved AI recipes ({n})",
    "cook.aiRemove": "Remove",
    "cook.aiRemoved": "Removed"
  });

  const t = (k, v) => I18N.t(k, v);
  const foodName = id => I18N.foodName(id);
  /* 调料不在地铁图里，也要出中文名（pantryById 是 logic.js 已经建好的表） */
  const pantryName = id => {
    const p = FD.pantryById[id];
    if (!p) return id;
    return I18N.getLang() === "en" ? (p.name || p.cn) : (p.cn || p.name);
  };
  const art = (id, cls) => COOK_ART.svg(id, cls);
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* ---------- 本地 AI：现配一道（只展示，不写菜谱库、不写云端） ----------
     地址沿用 add.js 那套约定：?ai=<隧道> → 记进 localStorage；http 页面默认直连本机 8941。
     https 页面（GitHub Pages）没有 ?ai= 时就拿不到 http 地址，这里如实提示，不去猜。 */
  const AI_PORT = 8941, AI_TIMEOUT = 60000;
  const AI_URL = (function () {
    const q = (location.search.match(/[?&]ai=([^&]+)/) || [])[1];
    if (q) {
      const u = decodeURIComponent(q).replace(/\/$/, "");
      try { localStorage.setItem("fd.ai.url", u); } catch (e) {}
      return u;
    }
    try { const s = localStorage.getItem("fd.ai.url"); if (s) return s.replace(/\/$/, ""); } catch (e) {}
    return location.protocol === "http:" ? "http://" + (location.hostname || "127.0.0.1") + ":" + AI_PORT : "";
  })();

  const AI_SAVED = "fd.ai.saved.v1";
  let aiBusy = false, aiLast = null;
  const aiSavedList = () => { try { return JSON.parse(localStorage.getItem(AI_SAVED) || "[]") || []; } catch (e) { return []; } };
  const aiStoreSave = list => { try { localStorage.setItem(AI_SAVED, JSON.stringify(list.slice(-30))); } catch (e) {} };
  const esc = s => String(s == null ? "" : s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

  /* ---------- 状态 ---------- */
  let items = [];              // 真实库存快照（FD.items()）
  const sel = new Set();       // 选中的 cat，纯界面状态
  let cooked = null;           // 刚做完的那道菜

  /* ---------- 库存 → 砖 ---------- */
  function grouped() {
    const map = new Map();     // cat -> {cat, qty, days, name, tag}
    items.forEach(it => {
      const days = FD.daysLeftOf(it);
      const qty = it.qty == null ? 1 : it.qty;
      const cur = map.get(it.cat);
      if (cur) { cur.qty += qty; cur.days = Math.min(cur.days, days); }
      else map.set(it.cat, { cat: it.cat, qty, days, name: it.name, tag: it.tag });
    });
    return [...map.values()].sort((a, b) => a.days - b.days || a.cat.localeCompare(b.cat));
  }

  const SHELVES = [
    { id: "protein", label: "蛋白 · protein", tags: ["protein"] },
    { id: "veg", label: "菜 · veg", tags: ["veg", "greens"] },
    { id: "carb", label: "主食 · others", tags: ["carb", "dairy", "other", ""] }
  ];

  function renderFridge() {
    items = FD.items();
    const shelves = $("#shelves");
    const empty = $("#empty");
    const list = grouped();
    empty.hidden = list.length > 0;
    shelves.innerHTML = "";
    if (!list.length) { renderPot(); return; }

    SHELVES.forEach(sh => {
      const row = document.createElement("div");
      row.className = "shelf";
      const inRow = list.filter(x => sh.tags.includes(x.tag) || (sh.id === "carb" && !SHELVES[0].tags.includes(x.tag) && !SHELVES[1].tags.includes(x.tag)));
      const lab = document.createElement("span");
      lab.className = "shelf-label"; lab.textContent = sh.label;
      row.appendChild(lab);
      if (!inRow.length) { row.style.minHeight = "26px"; }
      inRow.forEach(x => row.appendChild(tile(x)));
      shelves.appendChild(row);
    });
    renderPot();
  }

  function tile(x) {
    const b = document.createElement("button");
    b.className = "tile";
    b.type = "button";
    b.dataset.cat = x.cat;
    b.setAttribute("aria-pressed", sel.has(x.cat) ? "true" : "false");
    const urgent = x.days <= 1 ? "2" : x.days <= 3 ? "1" : "0";
    b.dataset.urgent = urgent;
    const dayTxt = x.days <= 0 ? t("cook.today") : t("cook.dayN", { n: x.days });
    b.title = `${foodName(x.cat)} · ${x.qty} · ${dayTxt}`;
    b.innerHTML = `
      <span class="exp" aria-hidden="true"></span>
      ${art(x.cat)}
      <span class="nm">${foodName(x.cat)}</span>
      <span class="qt">×${x.qty} · ${dayTxt}</span>`;
    b.addEventListener("click", () => {
      if (Date.now() - lastDragEnd < 400) return;      // 刚拖完，click 是残留事件，忽略
      toggle(x.cat, b);
    });
    attachDrag(b, x.cat);
    return b;
  }

  /* ---------- 选中 / 取消 ---------- */
  function toggle(cat, el, fromDrop) {
    if (sel.has(cat)) sel.delete(cat);
    else {
      sel.add(cat);
      if (!fromDrop) flyToPot(el, cat);
    }
    if (el) el.setAttribute("aria-pressed", sel.has(cat) ? "true" : "false");
    renderPot();
  }

  function renderPot() {
    const pot = $("#pot"), chips = $("#chips");
    chips.innerHTML = "";
    sel.forEach(cat => {
      const li = document.createElement("li");
      li.className = "chip";
      li.innerHTML = `${art(cat)}<span>${foodName(cat)}</span>
        <button type="button" aria-label="移除 ${foodName(cat)}">×</button>`;
      li.querySelector("button").addEventListener("click", () => {
        sel.delete(cat);
        const el = $(`.tile[data-cat="${cat}"]`); if (el) el.setAttribute("aria-pressed", "false");
        renderPot();
      });
      chips.appendChild(li);
    });
    pot.classList.toggle("has", sel.size > 0);
    pot.classList.toggle("warm", sel.size > 0);
    $("#potCount").textContent = sel.size ? t("cook.pickedN", { n: sel.size }) : t("cook.picked0");
    $("#askBtn").disabled = sel.size === 0;
    /* 这一页刻意不启动 sync.start()：无论在云端开着还是关着，它都只写本地 */
    $("#syncNote").textContent = t("cook.local");
  }

  /* ---------- 飞进锅：clone → WAAPI 弧线 ---------- */
  function flyToPot(el, cat) {
    if (reduce || !el) return bump();
    const from = el.getBoundingClientRect();
    const pot = $("#pot").getBoundingClientRect();
    const flyer = document.createElement("div");
    flyer.className = "flyer";
    flyer.innerHTML = art(cat);
    flyer.style.left = from.left + from.width / 2 - 27 + "px";
    flyer.style.top = from.top + from.height / 2 - 27 + "px";
    document.body.appendChild(flyer);
    const dx = (pot.left + pot.width / 2) - (from.left + from.width / 2);
    const dy = (pot.top + pot.height / 2) - (from.top + from.height / 2);
    const lift = Math.min(-90, dy / 2 - 40);
    const anim = flyer.animate([
      { transform: "translate(0,0) scale(1) rotate(0deg)", opacity: 1 },
      { transform: `translate(${dx * 0.45}px,${lift}px) scale(1.15) rotate(-12deg)`, opacity: 1, offset: .45 },
      { transform: `translate(${dx}px,${dy}px) scale(.35) rotate(8deg)`, opacity: .2 }
    ], { duration: 560, easing: "cubic-bezier(.3,.7,.2,1)" });
    anim.onfinish = () => { flyer.remove(); bump(); };
  }
  function bump() {
    const pot = $("#pot");
    pot.classList.remove("bump");
    void pot.offsetWidth;                 // 重启动画
    pot.classList.add("bump");
  }

  /* ---------- 拖拽 ----------
     鼠标：移动 10px 即视为拖拽。
     触摸：按住 170ms 再移动才拖（避免和「滚动页面」抢手势），松手即取消。
     拖完到锅里 → 选中；拖到别处 → 什么都不变（不会误选）。
     拖拽结束后的那次 click 会被 lastDragEnd 吃掉，所以不会出现
     「放进去又立刻被取消」的双触发。 */
  let lastDragEnd = 0;
  function attachDrag(el, cat) {
    const HOLD_MS = 170;      // 触摸：按住多久才开始算拖拽
    const MOVE_PX = 10;       // 移动多少像素算拖拽
    let pid = null, sx = 0, sy = 0, ghost = null, dragging = false, holdTimer = null, isTouch = false;

    const potEl = () => document.getElementById("pot");
    const overPot = (x, y) => {
      const r = potEl().getBoundingClientRect();
      const pad = 18;                                   // 锅的判定范围比可视区大一圈，手指抬起不会差几像素就落空
      return x > r.left - pad && x < r.right + pad && y > r.top - pad && y < r.bottom + pad;
    };

    function makeGhost(x, y) {
      const g = document.createElement("div");
      g.className = "flyer drag-ghost";
      g.innerHTML = art(cat);
      document.body.appendChild(g);
      moveGhost(g, x, y);
      return g;
    }
    function moveGhost(g, x, y) {
      g.style.left = (x - 27) + "px";
      g.style.top = (y - 27) + "px";
    }

    function startDrag(x, y) {
      if (dragging) return;
      dragging = true;
      el.classList.add("dragging");
      document.body.classList.add("is-dragging");
      ghost = makeGhost(x, y);
      potEl().classList.add("can-drop");
      if (navigator.vibrate) { try { navigator.vibrate(12); } catch (e) {} }
    }

    function finish(x, y, cancelled) {
      clearTimeout(holdTimer); holdTimer = null;
      potEl().classList.remove("can-drop", "over");
      document.body.classList.remove("is-dragging");
      if (ghost) { ghost.remove(); ghost = null; }
      el.classList.remove("dragging");
      if (dragging) {
        lastDragEnd = Date.now();
        if (!cancelled && overPot(x, y) && !sel.has(cat)) { toggle(cat, el, true); bump(); }
      }
      dragging = false;
      pid = null;
    }

    el.addEventListener("pointerdown", e => {
      if (e.button != null && e.button > 0) return;      // 只响应主键
      pid = e.pointerId;
      isTouch = e.pointerType === "touch";
      sx = e.clientX; sy = e.clientY;
      try { el.setPointerCapture(pid); } catch (err) {}
      if (isTouch) {                                     // 触摸：先按住，拖不动页面
        holdTimer = setTimeout(() => { if (pid === e.pointerId) startDrag(sx, sy); }, HOLD_MS);
      }
    });

    el.addEventListener("pointermove", e => {
      if (e.pointerId !== pid) return;
      const dx = e.clientX - sx, dy = e.clientY - sy;
      if (!dragging) {
        if (Math.hypot(dx, dy) < MOVE_PX) return;
        if (isTouch) { clearTimeout(holdTimer); holdTimer = null; pid = null; return; } // 未按住就滑 → 让页面滚
        startDrag(sx, sy);
      }
      e.preventDefault();
      moveGhost(ghost, e.clientX, e.clientY);
      potEl().classList.toggle("over", overPot(e.clientX, e.clientY));
    }, { passive: false });

    el.addEventListener("pointerup", e => {
      if (e.pointerId !== pid) return;
      finish(e.clientX, e.clientY, false);
    });
    el.addEventListener("pointercancel", e => {
      if (e.pointerId !== pid) return;
      finish(e.clientX, e.clientY, true);
    });
    // 触摸时若提前松手但还没进入拖拽 → 当作点击（click 事件照常触发）
  }

  /* ---------- 推荐 ---------- */
  /* ---------- 客制化：可选，不设置也能直接生成 ----------
     放在「帮我做一道菜」之后而不是常驻页面：
     用户先自由挑食材（这是好玩的部分），要收窄条件时才展开这一层。 */
  let lastGoal = null;

  function highFibre(r){
    return !!(r.greens || (r.needs || []).some(id => ["broccoli","eggplant","mushroom","carrot","greens"].includes(id)));
  }

  /* ---------- 偏好：常驻在锅下方，不再每次弹窗 ---------- */
  const GOAL_KEY = "fd.cook.goal";
  let goal = (function(){
    try { return Object.assign({ kcalMax: 600, maxMinutes: 30, greens: false, fibre: false },
                               JSON.parse(localStorage.getItem(GOAL_KEY) || "{}")); }
    catch (e) { return { kcalMax: 600, maxMinutes: 30, greens: false, fibre: false }; }
  })();
  function saveGoal(){ try { localStorage.setItem(GOAL_KEY, JSON.stringify(goal)); } catch (e) {} }

  function paintPrefs(){
    const k = $("#kRange"), m = $("#mRange");
    if (!k || !m) return;
    k.value = goal.kcalMax; m.value = goal.maxMinutes;
    $("#kLbl").textContent = goal.kcalMax + " kcal";
    $("#mLbl").textContent = goal.maxMinutes + " " + t("cook.minUnit");
    [["pfGreens", goal.greens], ["pfFibre", goal.fibre]].forEach(function(pair){
      const b = $("#" + pair[0]);
      if (!b) return;
      b.classList.toggle("on", !!pair[1]);
      b.setAttribute("aria-pressed", String(!!pair[1]));
    });
    const parts = [];
    if (goal.kcalMax < 900) parts.push("≤" + goal.kcalMax + " kcal");
    if (goal.maxMinutes < 60) parts.push("≤" + goal.maxMinutes + " " + t("cook.minUnit"));
    if (goal.greens) parts.push(t("cook.greens"));
    if (goal.fibre) parts.push(t("cook.fibre"));
    const sum = $("#prefSummary");
    if (sum) sum.textContent = parts.length ? parts.join(" · ") : t("cook.noPrefs");
  }

  function bindPrefs(){
    const k = $("#kRange"), m = $("#mRange");
    if (!k || !m) return;
    k.addEventListener("input", function(e){ goal.kcalMax = +e.target.value; saveGoal(); paintPrefs(); });
    m.addEventListener("input", function(e){ goal.maxMinutes = +e.target.value; saveGoal(); paintPrefs(); });
    [["pfGreens","greens"], ["pfFibre","fibre"]].forEach(function(pair){
      const b = $("#" + pair[0]);
      if (b) b.addEventListener("click", function(){
        goal[pair[1]] = !goal[pair[1]]; saveGoal(); paintPrefs();
      });
    });
    const tg = $("#prefToggle");
    if (tg) tg.addEventListener("click", function(e){
      e.preventDefault();
      const body = $("#prefsBody");
      const open = !body.classList.contains("on");
      body.classList.toggle("on", open);
      tg.setAttribute("aria-expanded", String(open));
      if (open) {
        body.style.height = "auto";
        const h = body.getBoundingClientRect().height || 1;
        body.style.height = "0px";
        MOTION.spring({ from: 0, to: h, stiffness: 450, damping: 29,
          onUpdate: function(v){ body.style.height = v + "px"; },
          onComplete: function(){ body.style.height = "auto"; } });
      } else {
        const h = body.getBoundingClientRect().height || 1;
        MOTION.spring({ from: h, to: 0, stiffness: 440, damping: 32,
          onUpdate: function(v){ body.style.height = Math.max(0, v) + "px"; },
          onComplete: function(){ body.style.height = "0px"; } });
      }
    });
    paintPrefs();
  }

  function generate(goal) {
    cooked = null;
    // 只为选中的 cat 造一份虚拟库存：每个 cat 取最先过期的那一件
    const byCat = {};
    items.forEach(it => {
      const d = FD.daysLeftOf(it);
      if (!byCat[it.cat] || d < FD.daysLeftOf(byCat[it.cat])) byCat[it.cat] = it;
    });
    const virtual = [...sel].map(c => byCat[c]).filter(Boolean);
    const st = Object.assign(FD.settings(), {
      maxMinutes: goal.maxMinutes,
      greensPerDay: goal.greens ? 1 : 0
    });
    let ranked = FD.decide(virtual, st)
      .filter(x => x.recipe.needs.some(n => sel.has(n)));
    if (goal.kcalMax) ranked = ranked.filter(x => !x.recipe.kcal || x.recipe.kcal <= goal.kcalMax);
    if (goal.fibre)   ranked = ranked.filter(x => highFibre(x.recipe));
    const rank = x => (x.status === "ready" ? 0 : x.status === "shop1" ? 1 : 2);
    ranked.sort((a, b) => rank(a) - rank(b) || b.score - a.score);
    renderResult(ranked.slice(0, 3), goal);
    /* 库里有多少道真的同时用上锅里这几样 —— 0 就把「让 AI 现配」摆到台面上 */
    renderAiCta(dbAllUsedCount([...sel]));
  }

  function pick() {
    if (!sel.size) { toast(t("cook.none")); return; }
    generate(goal);            /* 偏好已经常驻，直接生成 */
  }

  function renderResult(list, goal) {
    const box = $("#result");
    box.innerHTML = "";
    if (!list.length) {
      box.innerHTML = `<div class="rcard note">${t("cook.noMatch")}</div>`;
      return;
    }
    if (goal) {
      const parts = [];
      if (goal.kcalMax) parts.push("≤ " + goal.kcalMax + " kcal");
      if (goal.maxMinutes && goal.maxMinutes < 60) parts.push("≤ " + goal.maxMinutes + " " + t("cook.minUnit"));
      if (goal.greens) parts.push(t("cook.greens"));
      if (goal.fibre) parts.push(t("cook.fibre"));
      if (parts.length) box.insertAdjacentHTML("afterbegin",
        `<p class="applied">${t("cook.applied", { s: parts.join(" · ") })}</p>`);
    }
    list.forEach((r, i) => {
      const card = document.createElement("article");
      card.className = "rcard";
      card.style.animationDelay = i * 70 + "ms";
      const status = r.status === "ready" ? `<span class="ok">${t("cook.ready")}</span>`
        : r.status === "shop1" ? `<span class="gap">${t("cook.gap1")}</span>`
        : `<span class="gap">${t("cook.gapN", { n: r.missing.length })}</span>`;
      const needs = r.recipe.needs.map(id =>
        `<span>${art(id)}${foodName(id)}</span>`).join("");
      // 自己拼缺料，不用 FD.shoppingHint（它已经带「买」字，英文界面也不合适）
      const buy = r.missing.length
        ? r.missing.map(id => `${foodName(id)}${FD.byId[id] && FD.byId[id].shop ? "（" + FD.byId[id].shop + "）" : ""}`).join("、")
        : "";
      const pantry = r.pantryMissing.length
        ? `<p class="meta">${t("cook.needPantry", { s: r.pantryMissing.map(pantryName).join("、") })}</p>` : "";
      // 注意：这里拿到的是 evaluate() 的包裹对象，真正的菜谱在 r.recipe 上
      const steps = (I18N.recipeSteps(r.recipe) || [])
        .filter(s => s && !/^!\[/.test(s.trim()))
        .map((s, i) => {
          const act = COOK_STEPS.of(s, r.recipe.id + "#" + i);   // 人工校正优先，其次关键词
          return `<li data-act="${act.id}">
            <span class="n">${i + 1}</span>
            <span class="act" title="${I18N.getLang() === "en" ? act.en : act.zh}">${COOK_STEPS.svg(act.id)}</span>
            <span class="tx">${s}</span>
          </li>`;
        }).join("");
      const dp = window.DISH_PHOTO && DISH_PHOTO.get(r.recipe.name);
      const photo = dp ? { src: dp.src, credit: dp.credit, license: dp.license, page: dp.page } : null;
      const arts = (r.recipe.needs || []).slice(0,3)
        .map(id => `<span class="ic">${art(id)}<i>${foodName(id)}</i></span>`).join("");
      card.innerHTML = `
        ${photo ? `<div class="rphoto"><img src="${photo.src}" alt="${I18N.recipeName(r.recipe)}" loading="lazy" decoding="async">${photo.credit?`<span class="cr"><a href="${photo.page}" target="_blank" rel="noopener">${photo.credit} · ${photo.license}</a></span>`:""}</div>` : `<div class="rphoto art">${arts}</div>`}
        <h3>${I18N.recipeName(r.recipe)}</h3>
        <div class="meta">
          ${status}
          <span>${t("cook.mins", { n: r.recipe.minutes })}</span>
          <span>${t("cook.kcal", { n: r.recipe.kcal })}</span>
          <span class="ok">${t("cook.match", { a: r.recipe.needs.filter(id => sel.has(id)).length, b: r.recipe.needs.length })}</span>
        </div>
        <div class="use">${needs}</div>
        ${buy ? `<p class="meta"><span class="gap">${t("cook.needBuy", { s: buy })}</span></p>` : ""}
        ${pantry}
        <details><summary>${t("cook.steps")}</summary><ol>${steps}</ol></details>
        <button class="cook" data-recipe="${r.recipe.id}" ${r.status === "ready" ? "" : "disabled"}>
          ${r.status === "ready" ? t("cook.cook") : t("cook.cookLocked")}
        </button>`;
      const btn = card.querySelector(".cook");
      btn.addEventListener("click", () => cook(r.recipe, btn));
      box.appendChild(card);
      MOTION.press(btn, { scale: 0.97 });
      /* 入场：从下方 18px + 轻微缩小弹上来，逐张错开 70ms */
      card.style.opacity = "0";
      card.style.transform = "translateY(18px) scale(.985)";
      setTimeout(function(){
        MOTION.spring({
          from: 0, to: 1, stiffness: 320, damping: 26,
          onUpdate: function(v){
            card.style.opacity = String(v);
            card.style.transform = "translateY(" + (18 * (1 - v)) + "px) scale(" + (0.985 + 0.015 * v) + ")";
          },
          onComplete: function(){ card.style.opacity = ""; card.style.transform = ""; }
        });
      }, 80 + i * 70);
    });
  }

  /* ---------- 本地 AI：现配一道 ---------- */
  const sep = () => (I18N.getLang() === "en" ? ", " : "、");

  function dbAllUsedCount(core) {
    if (!core.length) return 0;
    return FD.RECIPES.filter(r => core.every(c => (r.needs || []).indexOf(c) >= 0)).length;
  }

  function renderAiCta(allUsed) {
    const core = [...sel];
    const box = $("#result");
    if (!core.length || !box) return;
    const names = core.map(foodName).join(sep());
    const card = document.createElement("div");
    card.id = "aiBox";
    card.className = "aibox" + (allUsed ? " minor" : "");
    card.innerHTML = allUsed
      ? `<button type="button" class="ai-link" id="aiGo">${t("cook.aiLink", { s: names })}</button>`
      : `<article class="rcard ai">
           <div class="ai-head"><span class="ai-badge">${t("cook.aiBadge")}</span>
             <span class="ai-by">${t("cook.aiBy")}</span></div>
           <h3>${t("cook.aiCtaTitle", { s: names })}</h3>
           <p class="ai-note">${t("cook.aiCtaBody")}</p>
           ${AI_URL ? `<button type="button" class="cook" id="aiGo">${t("cook.aiGo")}</button>`
                    : `<p class="ai-warn">${t("cook.aiNoUrl")}</p>`}
         </article>`;
    box.appendChild(card);
    const go = $("#aiGo", card);
    if (go) {
      go.addEventListener("click", askAi);
      MOTION.press(go, { scale: 0.97 });
    }
    renderAiSaved(box);
  }

  function renderAiSaved(box) {
    const list = aiSavedList();
    const old = box.querySelector(".ai-saved");
    if (old) old.remove();
    if (!list.length) return;
    const d = document.createElement("details");
    d.className = "ai-saved";
    d.innerHTML = `<summary>${t("cook.aiSavedN", { n: list.length })}</summary><ul>` +
      list.map((x, i) => `<li><span>${esc((x.recipe || {}).name)}</span>
        <button type="button" data-del="${i}" aria-label="${t("cook.aiRemove")}">✕</button></li>`).join("") +
      `</ul>`;
    box.appendChild(d);
    d.querySelectorAll("[data-del]").forEach(b => b.addEventListener("click", () => {
      const l = aiSavedList(); l.splice(+b.dataset.del, 1); aiStoreSave(l);
      d.remove(); toast(t("cook.aiRemoved"));
    }));
  }

  function renderAiResult(d, box) {
    const rc = d.recipe || {};
    const meta = d.meta || {};
    const chk = (d.checks && d.checks.must_use) || {};
    const bad = Object.keys(chk).filter(k => !(chk[k].in_ingredients && chk[k].in_steps));
    const ings = (rc.ingredients || [])
      .map(x => `<span><b>${esc(x.name)}</b><i>${esc(x.amount || "")}</i></span>`).join("");
    const steps = (rc.steps || [])
      .map((s, i) => `<li><span class="n">${i + 1}</span><span class="tx">${esc(s)}</span></li>`).join("");
    const extra = (rc.extra_ingredients || []).filter(Boolean);
    const warns = (rc.warnings || []).filter(Boolean);
    const used = (meta.must_use || []).join(sep());

    box.innerHTML = `<article class="rcard ai" id="aiCard">
      <div class="ai-head"><span class="ai-badge">${t("cook.aiBadge")}</span>
        <span class="ai-by">${esc(meta.model || "")}${meta.seconds ? " · " + meta.seconds + "s" : ""} · ${t("cook.aiNotSaved")}</span></div>
      <h3>${esc(rc.name)}</h3>
      <div class="meta">
        <span>${t("cook.mins", { n: rc.cooking_time })}</span>
        ${used ? `<span class="ok">${t("cook.aiUses", { s: used })}</span>` : ""}
      </div>
      ${bad.length ? `<p class="ai-warn">${t("cook.aiMissing", { s: bad.join(sep()) })}</p>` : ""}
      ${I18N.getLang() === "en" ? `<p class="ai-note">${t("cook.aiZhNote")}</p>` : ""}
      <p class="ai-note">${t("cook.aiNote")}</p>
      <div class="ai-ings">${ings}</div>
      <details open><summary>${t("cook.steps")}</summary><ol>${steps}</ol></details>
      ${extra.length ? `<p class="meta"><span class="gap">${t("cook.aiExtra", { s: extra.join(sep()) })}</span></p>` : ""}
      ${warns.length ? `<p class="ai-warn">${t("cook.aiWarn", { s: warns.join("；") })}</p>` : ""}
      <div class="ai-actions">
        <button type="button" class="cook" data-ai-save="1">${t("cook.aiSave")}</button>
        <button type="button" class="ghost" data-ai-again="1">${t("cook.aiAgain")}</button>
      </div>
    </article>`;

    box.querySelector("[data-ai-again]").addEventListener("click", askAi);
    const save = box.querySelector("[data-ai-save]");
    save.addEventListener("click", () => {
      const l = aiSavedList();
      l.push({ ts: Date.now(), recipe: rc, meta: meta, must: meta.must_use || [] });
      aiStoreSave(l);
      save.textContent = t("cook.aiSaved");
      save.disabled = true;
      toast(t("cook.aiSavedToast", { s: rc.name }));
      renderAiSaved($("#result"));
    });
  }

  async function askAi() {
    if (aiBusy) return;
    if (!AI_URL) { toast(t("cook.aiNoUrl")); return; }
    const core = [...sel];
    if (!core.length) { toast(t("cook.none")); return; }
    const box = $("#aiBox");
    if (!box) return;
    const must = core.map(c => (FD.byId[c] && FD.byId[c].cn) || foodName(c));
    const avail = [...new Set(items.map(i => i.cat))]
      .filter(c => core.indexOf(c) < 0)
      .map(c => (FD.byId[c] && FD.byId[c].cn) || foodName(c)).slice(0, 12);

    aiBusy = true;
    box.innerHTML = `<article class="rcard ai loading">
      <div class="ai-head"><span class="ai-badge">${t("cook.aiBadge")}</span>
        <span class="ai-by">${t("cook.aiThinking")}</span></div>
      <p class="ai-note">${t("cook.aiThinkingBody", { s: must.join(sep()) })}</p>
    </article>`;

    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), AI_TIMEOUT);
    try {
      const r = await fetch(AI_URL + "/api/generate-recipe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          must_use: must,
          available: avail,
          max_minutes: (goal && goal.maxMinutes) || 30
        }),
        signal: ctl.signal
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok || d.error || !d.recipe) throw new Error(d.reason || d.error || ("HTTP " + r.status));
      aiLast = d;
      renderAiResult(d, box);
    } catch (e) {
      const msg = (e && e.name === "AbortError") ? t("cook.aiTimeout") : (e.message || String(e));
      box.innerHTML = `<article class="rcard ai">
        <div class="ai-head"><span class="ai-badge">${t("cook.aiBadge")}</span></div>
        <p class="ai-warn">${t("cook.aiFail", { s: AI_URL })}<br><span class="ai-err">${esc(msg)}</span></p>
        <div class="ai-actions"><button type="button" class="cook" data-ai-retry="1">${t("cook.aiRetry")}</button></div>
      </article>`;
      box.querySelector("[data-ai-retry]").addEventListener("click", askAi);
    } finally {
      clearTimeout(timer);
      aiBusy = false;
    }
  }

  /* ---------- 真正扣库存：唯一写入口 ---------- */
  function cook(recipe, btn) {
    const cur = FD.items();
    const res = FD.consume(cur, recipe);          // 纯函数，返回新数组
    if (!res.used.length) { toast(t("cook.cookLocked")); return; }
    FD.saveItems(res.items);                       // ← 生产环境这里会自动推 Supabase
    FD.log("take", recipe.id);                     // 决策信号，原有统计照用
    const names = res.used.map(u => `${foodName(u.cat)}${u.qty > 1 ? " ×" + u.qty : ""}`).join("、");
    cooked = { recipe, used: res.used, removed: res.removed };
    sel.clear();
    renderFridge();
    btn.disabled = true;
    btn.textContent = t("cook.doneTitle");
    $("#result").insertAdjacentHTML("afterbegin", `
      <article class="rcard" style="border-color:#C9DEC4;background:#F3F8F0">
        <h3>${t("cook.doneTitle")} · ${I18N.recipeName(recipe)}</h3>
        <p class="meta">${t("cook.done", { s: names })}</p>
        <button class="cook" id="againBtn" style="background:#7E9C82">${t("cook.again")}</button>
      </article>`);
    $("#againBtn").addEventListener("click", () => {
      $("#result").innerHTML = ""; window.scrollTo({ top: 0, behavior: reduce ? "auto" : "smooth" });
    });
    toast(t("cook.done", { s: names }));
  }

  /* ---------- 示例库存（与 index.html 的 demoBtn 同一套，写进同一份 localStorage） ---------- */
  function loadDemo() {
    const today = FD.localDate();
    const mk = (cat, days, qty) => {
      const f = FD.byId[cat];
      return {
        id: "demo-" + cat + "-" + Math.random().toString(36).slice(2, 7),
        cat, name: f.name, tag: f.tag, qty: qty || 1, unit: FD.unitOf(cat),
        daysLeft: days, life: days, addedAt: today
      };
    };
    FD.saveItems([mk("pork", 3, 1), mk("chili", 6, 3), mk("egg", 20, 10), mk("greens", 4, 1), mk("rice", 3, 2), mk("tofu", 4, 1)]);
    sel.clear(); cooked = null;
    renderFridge();
    $("#result").innerHTML = "";
    toast(t("cook.demoDone"));
  }

  /* ---------- toast / 语言 ---------- */
  let toastTimer = null;
  function toast(msg) {
    const el = $("#toast");
    el.textContent = msg; el.classList.add("on");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove("on"), 2200);
  }

  function applyLang() {
    I18N.apply();
    if ($("#prefToggle")) paintPrefs();
    $("#langBtn").textContent = I18N.getLang() === "en" ? "EN" : "中";
    renderFridge();
    if (cooked) renderResult([]);           // 换语言时清掉旧结果，避免中英混排
  }

  /* ---------- 启动 ---------- */
  $("#demoBtn").addEventListener("click", loadDemo);
  /* 手机上「帮我做一道菜」第一次点常被吞掉：iOS 在固定底栏 + 平滑滚动的组合下会丢 click。
     改成触摸一抬手就响应（pointerup），click 再兜底，用时间戳去重。 */
  let askAt = 0;
  function askOnce(){
    const now = Date.now();
    if (now - askAt < 500) return;
    askAt = now;
    pick();
  }
  $("#askBtn").addEventListener("click", askOnce);
  $("#askBtn").addEventListener("pointerup", e => {
    if (e.pointerType === "mouse") return;      // 鼠标仍走 click，避免双触发
    askOnce();
  });
  $("#langBtn").addEventListener("click", () => {
    I18N.setLang(I18N.getLang() === "en" ? "zh" : "en");
    applyLang();
  });
  // 锅本身也能当放置目标：点一下等于「把选中的都收进来」（键盘可达）
  $("#pot").addEventListener("keydown", e => {
    if (e.key === "Enter" || e.key === " ") { e.preventDefault(); pick(); }
  });


  /* ---------- 滚动：橱柜看不见时把锅「弹」上去收好；标题栏下滑收起 ----------
     全部用弹簧（MOTION）而不是 CSS transition：CSS 无法做过冲，
     收起来会像"啪一下没了"，弹簧才有物件感。 */
  let compacted = false, headerTween = null, potTween = null;

  function setCompact(on){
    if (on === compacted) return;
    compacted = on;
    document.body.classList.toggle("past-fridge", on);
    const sec = $("#potSec");
    if (sec) sec.classList.toggle("compact", on);
    const pot = $("#pot");
    if (!pot) return;
    if (potTween) potTween.stop();

    if (on) {
      const h = pot.getBoundingClientRect().height || 1;
      potTween = MOTION.spring({
        from: h, to: 0, stiffness: 330, damping: 26,
        onUpdate: function(v){
          const hh = Math.max(0, v);
          pot.style.height = hh + "px";
          pot.style.opacity = String(Math.max(0, Math.min(1, hh / h)));
        },
        onComplete: function(){ pot.style.pointerEvents = "none"; }
      });
    } else {
      pot.style.height = "auto"; pot.style.pointerEvents = "";
      const h = pot.getBoundingClientRect().height || 1;
      pot.style.height = "0px"; pot.style.opacity = "0";
      potTween = MOTION.spring({
        from: 0, to: h, stiffness: 380, damping: 22,
        onUpdate: function(v){
          pot.style.height = v + "px";
          pot.style.opacity = String(Math.min(1, v / h));
        },
        onComplete: function(){ pot.style.height = ""; pot.style.opacity = ""; }
      });
    }
  }

  function tuckHeader(on){
    const top = document.querySelector(".top");
    if (!top) return;
    const h = top.offsetHeight || 60;
    const target = on ? -h : 0;
    if (headerTween && headerTween.retarget) headerTween.retarget(target);
    else headerTween = MOTION.spring({
      from: 0, to: target, stiffness: 430, damping: 33,
      onUpdate: function(v){ top.style.transform = "translateY(" + v + "px)"; },
      onComplete: function(){ if (target === 0) top.style.transform = ""; }
    });
  }

  function setupScroll(){
    const fridge = document.querySelector(".fridge-sec");
    if (fridge && "IntersectionObserver" in window) {
      new IntersectionObserver(function(es){ setCompact(!es[0].isIntersecting); },
                               { threshold: 0, rootMargin: "-8px 0px 0px 0px" }).observe(fridge);
    }
    let lastY = window.scrollY, ticking = false;
    window.addEventListener("scroll", function(){
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(function(){
        const y = window.scrollY;
        if (y < 40) tuckHeader(false);
        else if (y > lastY + 10) tuckHeader(true);
        else if (y < lastY - 6) tuckHeader(false);
        lastY = y; ticking = false;
      });
    }, { passive: true });

    const back = $("#backTop");
    if (back) back.addEventListener("click", function(){
      window.scrollTo({ top: 0, behavior: MOTION.reduce ? "auto" : "smooth" });
    });

    /* 每一个可点的东西都要有「按下去再弹回来」的手感 */
    document.querySelectorAll(".tile, .primary, .pf, .nav a, .chip button, #prefToggle, .lang, .backtop")
      .forEach(function(el){ MOTION.press(el, { scale: el.classList.contains("tile") ? 0.94 : 0.965 }); });
  }

  bindPrefs();
  setupScroll();
  renderFridge();
  applyLang();
})();
