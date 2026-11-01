/* ============================================================
   i18n-static.js —— 给「没有 data-i18n」的页面兜底

   背景：index / cook / add / settings 走的是 i18n.js 的 key 表；
   account、gate、disc、display、stack、collect 这些后加的页面是中文写死的，
   一条条塞 data-i18n 改动量很大，而且 JS 里动态写进去的文字照样漏。

   做法：一张「中文原文 → 英文」的表 + 一个文本节点扫描器。
   只在 lang === "en" 时生效；找不到对应条目就保持原文（不会翻错，也不会翻一半就乱）。
   新增页面时把它的句子往 DICT 里加即可，不需要改页面结构。

   已知边界：只替换「整段文本完全相等」的节点；带变量的句子（"共 3 件"）
   由页面自己的 i18n 处理，不在这里硬匹配。
   ============================================================ */
(function (g) {
  "use strict";

  const DICT = {
    /* ---- 底部导航（所有页面共用） ---- */
    "登录与家庭": "Sign in & household", "首页": "Home", "冰箱": "Fridge", "菜谱": "Recipes", "自己选": "Pick", "设置": "Settings",
    "冰箱里有什么": "What's in the fridge", "今晚吃什么": "What's for dinner",

    /* ---- 登录 / 家庭（account.html） ---- */
    "还没连上云端": "Not connected to the cloud yet",
    "登录要先用 Supabase 的 URL 和 anon key。去设置页填好，再回来。":
      "Signing in needs your Supabase URL and anon key. Fill them in on Settings, then come back.",
    "去设置": "Open settings",
    "登录": "Sign in",
    "用邮箱加密码最稳；也可以发一条邮件链接，不用记密码。":
      "Email plus password is the most reliable; you can also get a magic link so there is no password to remember.",
    "用密码": "Use password", "发邮件链接": "Email me a link",
    "邮箱": "Email", "密码": "Password", "至少 6 位": "at least 6 characters",
    "登录 / 首次自动注册": "Sign in / sign up automatically",
    "发登录链接": "Send sign-in link",
    "家里其他人各用自己的邮箱注册，然后用邀请码加入同一个家。密码登录不依赖邮件额度。":
      "Everyone at home signs up with their own email, then joins the same household with an invite code. Password sign-in does not depend on email quota.",
    "你在哪一家？": "Which household are you in?",
    "冰箱里的东西属于「一个家」。你可以新建一个，或者用家人给的邀请码加入。":
      "Fridge contents belong to a household. Create one, or join with the invite code a family member gave you.",
    "给这个家起个名字": "Name this household", "我的家": "My household",
    "建一个家": "Create household",
    "或者，用邀请码加入": "Or join with an invite code",
    "加入这个家": "Join this household",
    "邀请码": "Invite code", "我的身份": "My role", "云端库存": "Cloud stock",
    "创建者": "Owner", "成员": "Member",
    "复制邀请码": "Copy invite code", "刷新": "Refresh",
    "设一个密码（以后不用等邮件）": "Set a password (no more waiting for email)",
    "保存密码": "Save password",
    "用邮件链接登录的账号本来没有密码。设一个之后，换设备可以直接用「用密码」登录。":
      "Accounts created by magic link have no password. Set one and you can sign in with a password on another device.",
    "去冰箱看看": "Go to the fridge", "退出登录": "Sign out",
    "把本机已有的库存搬进这个家": "Move this device's stock into this household",
    "把这个邀请码发给家人，他们在自己的手机上登录后填一次，就共用同一个冰箱。":
      "Send this code to your family; once they sign in on their phone and enter it, you all share one fridge.",
    "没有 Supabase 配置时，所有数据只存在这台设备。":
      "Without Supabase configured, everything stays on this device.",
    "登录只用于多设备共享；不登录也能用，数据在本机。":
      "Signing in is only for sharing across devices; the app works without it, with data on this device.",
    "你还没有加入任何家庭。": "You have not joined a household yet.",
    "已登录": "Signed in", "读不到": "Cannot read",

    /* ---- 设置页残留 ---- */
    "语言 / Language": "Language", "冰箱屏": "Fridge panel",
    "显示哪些屏 · 顺序": "Screens & order", "它在追什么": "What it aims for",
    "屏上的三个按键": "The three buttons", "数据": "The database", "菜谱库": "Recipe library",
    "门口摄像头（闸机）": "Door camera (gate)",
    "抓拍和识别都在这一页，它跑在冰箱那块屏上；手机这边只负责确认和改。":
      "Capture and recognition run on this page, on the fridge screen; the phone only confirms and edits.",
    "打开闸机页": "Open gate page", "拍样本": "Capture samples",
    "云端同步 / Cloud sync": "Cloud sync", "未连接": "Not connected", "已连接": "Connected",
    "家庭": "Household",

    /* ---- 通用 ---- */
    "返回": "Back", "关闭": "Close", "保存": "Save", "取消": "Cancel", "删除": "Delete",
    "完成": "Done", "下一步": "Next", "上一步": "Previous", "重试": "Retry"
  };

  function lang() {
    try {
      if (g.I18N && I18N.getLang) return I18N.getLang();
      const v = localStorage.getItem("fd.lang");
      return v === "en" ? "en" : "zh";
    } catch (e) { return "zh"; }
  }

  function translateNode(node) {
    const raw = node.nodeValue;
    if (!raw) return;
    const key = raw.trim();
    if (!key) return;
    const hit = DICT[key];
    if (!hit) return;
    /* 保留原来的首尾空白，避免把排版吃掉 */
    const lead = raw.match(/^\s*/)[0], trail = raw.match(/\s*$/)[0];
    node.nodeValue = lead + hit + trail;
  }

  function walk(root) {
    if (!root) return;
    if (root.nodeType === 3) { translateNode(root); return; }
    if (root.nodeType !== 1) return;
    const tag = root.tagName;
    if (tag === "SCRIPT" || tag === "STYLE" || tag === "PRE") return;
    if (root.placeholder) {
      const hit = DICT[root.placeholder.trim()];
      if (hit) root.placeholder = hit;
    }
    if (root.getAttribute && root.getAttribute("aria-label")) {
      const a = root.getAttribute("aria-label").trim();
      if (DICT[a]) root.setAttribute("aria-label", DICT[a]);
    }
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, null);
    const nodes = [];
    while (walker.nextNode()) nodes.push(walker.currentNode);
    nodes.forEach(translateNode);
  }

  function apply() {
    if (lang() !== "en") return;
    walk(document.body);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", apply);
  } else {
    apply();
  }
  /* 页面自己 await 完数据后可以再调一次，把后写进去的节点也翻掉 */
  g.I18N_STATIC = { apply, dict: DICT };
})(window);
