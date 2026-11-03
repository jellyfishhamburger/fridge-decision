/* ============================================================
   COOK_ART_EXTRA — 补齐 cook-art.js 里缺的食材图标
   同一套语言：48×48、平涂两色、无描边、物品略微倾斜。
   做法：用少量"形制模板"（叶菜 / 长条 / 根茎 / 圆果 / 肉块 /
   豆腐块 / 瓶装 / 碗装 / 菌菇 / 海藻 …）+ 每种食材一组颜色，
   保证 84 个缺口一眼分得清类别，又不至于各画各的。
   加载顺序：cook-art.js 之后；会接管 COOK_ART.svg。
   ============================================================ */
(function (g) {
  "use strict";
  if (!g.COOK_ART) return;

  const K = {
    leaf: "#8FB98A", leafD: "#6B9A6A", leafL: "#AEC98F", stalk: "#7E9C82",
    root: "#F1E4CC", rootD: "#D6C29E",
    red: "#D4553F", redD: "#B23F2C",
    orange: "#E8973F", orangeD: "#C97A2B",
    yellow: "#E9C05A", yellowD: "#CBA23F",
    green: "#A9C46C", greenD: "#86A44F",
    pink: "#D98A96", pinkD: "#B96C79",
    purple: "#8E7BA6", purpleD: "#725E8A",
    blue: "#7C8FC9", blueD: "#6374AC",
    meat: "#E79080", meatD: "#CB6A5E",
    bone: "#FFF6E2",
    tofu: "#F7F2DF", tofuD: "#DFD5B8",
    milk: "#FFFDF6", milkD: "#E4DCC6",
    brown: "#C9965F", brownD: "#A97A47",
    ink: "#4A4038"
  };

  /* ---------- 形制模板 ---------- */
  const T = {
    /* 叶菜：三片叶子从根部散开 */
    leaf: (a, b) => `<path d="M24 39c-1-10 3-18 11-21 2 11-3 19-11 21z" fill="${a}"/>
      <path d="M24 39c0-9-4-16-11-18-1 10 3 16 11 18z" fill="${b}"/>
      <path d="M24 39V22" stroke="${K.stalk}" stroke-width="2.2" stroke-linecap="round"/>`,

    /* 直立茎：芦笋 / 芹菜 / 蒜苗 / 竹笋 */
    spear: (a, b) => `<path d="M20 40V16l4-6 4 6v24z" fill="${a}"/>
      <path d="M28 40V20l3-5 3 5v20z" fill="${b}"/>
      <path d="M14 40V24l3-4 3 4v16z" fill="${b}" opacity=".9"/>`,

    /* 长条瓜果 */
    long: (a, b) => `<path d="M18 38c-4-6-4-20 0-26 3-4 9-4 12 0 4 6 4 20 0 26-3 4-9 4-12 0z" fill="${a}"/>
      <path d="M24 14c-2 6-2 14 0 20" stroke="${b}" stroke-width="2.2" fill="none" stroke-linecap="round"/>`,

    /* 根茎：白萝卜 / 胡萝卜类 */
    root: (a, b) => `<path d="M24 14c6 0 10 6 10 12 0 8-6 15-10 15s-10-7-10-15c0-6 4-12 10-12z" fill="${a}"/>
      <path d="M24 16v22" stroke="${b}" stroke-width="2" opacity=".55"/>
      <path d="M20 9c1-4 5-5 8-3-1 3-4 5-8 3z" fill="${K.leaf}"/>`,

    /* 圆果 */
    round: (a, b) => `<circle cx="24" cy="27" r="12" fill="${a}"/>
      <path d="M24 15c0-4 3-6 6-6-1 4-3 6-6 6z" fill="${K.leaf}"/>
      <path d="M22 20c-3 2-4 5-4 8" stroke="${b}" stroke-width="2.2" fill="none" stroke-linecap="round" opacity=".7"/>`,

    /* 长果：香蕉 / 芒果 / 牛油果 */
    curve: (a, b) => `<path d="M14 15c2 12 10 20 21 21 2 0 3 2 1 3C24 41 13 32 11 16c0-2 3-3 3-1z" fill="${a}"/>
      <path d="M17 18c3 9 9 15 17 17" stroke="${b}" stroke-width="2" fill="none" stroke-linecap="round" opacity=".6"/>`,

    /* 切开的果：西瓜 / 猕猴桃 / 无花果 */
    cut: (a, b, c) => `<path d="M10 30a14 14 0 0 1 28 0z" fill="${a}"/>
      <path d="M13 30a11 11 0 0 1 22 0z" fill="${b}"/>
      <circle cx="24" cy="26" r="1.6" fill="${c}"/><circle cx="19" cy="27.5" r="1.4" fill="${c}"/>
      <circle cx="29" cy="27.5" r="1.4" fill="${c}"/>`,

    /* 小果串：葡萄 / 车厘子 / 蓝莓 */
    bunch: (a, b) => `<circle cx="19" cy="21" r="5" fill="${a}"/><circle cx="29" cy="21" r="5" fill="${a}"/>
      <circle cx="24" cy="29" r="5.4" fill="${b}"/><circle cx="17" cy="32" r="4.6" fill="${a}"/>
      <circle cx="31" cy="32" r="4.6" fill="${a}"/>
      <path d="M24 15c0-4 2-6 5-7" stroke="${K.leafD}" stroke-width="2.2" fill="none" stroke-linecap="round"/>`,

    /* 肉块 / 带骨 */
    meat: (a, b) => `<rect x="8" y="15" width="32" height="19" rx="8" fill="${a}"/>
      <path d="M14 25c4-5 8 3 12 0s6 3 10-1" stroke="#F8D9D0" stroke-width="3" fill="none" stroke-linecap="round"/>
      <circle cx="33" cy="20" r="3" fill="${K.bone}"/>
      <path d="M33 20v-4" stroke="${b}" stroke-width="2.4" stroke-linecap="round"/>`,

    /* 排骨：几条带骨的条 */
    ribs: (a, b) => `<rect x="11" y="16" width="6" height="20" rx="3" fill="${a}"/>
      <rect x="21" y="14" width="6" height="22" rx="3" fill="${a}"/>
      <rect x="31" y="17" width="6" height="19" rx="3" fill="${a}"/>
      <path d="M14 16v20M24 14v22M34 17v19" stroke="${b}" stroke-width="2" opacity=".55"/>
      <circle cx="14" cy="18" r="2.4" fill="${K.bone}"/><circle cx="24" cy="16" r="2.4" fill="${K.bone}"/>`,

    /* 培根 / 香肠：波浪条 */
    strip: (a, b) => `<path d="M10 20c6-6 12 6 18 0s8 2 10 0v8c-2 2-4-6-10 0s-12-6-18 0z" fill="${a}"/>
      <path d="M10 32c6-6 12 6 18 0s8 2 10 0v6c-2 2-4-6-10 0s-12-6-18 0z" fill="${b}"/>`,

    /* 豆腐块 / 年糕 / 黄油 / 咖喱块 */
    block: (a, b) => `<path d="M11 18l8-4 18 3-8 4z" fill="#FFFDF4"/>
      <path d="M11 18v14l8 5V21z" fill="${b}"/>
      <path d="M19 21l18 3v14l-18-3z" fill="${a}"/>
      <path d="M19 21l18 3v3l-18-3z" fill="#FFFCF0"/>`,

    /* 瓶装：淡奶油 / 蜂蜜 */
    bottle: (a, b) => `<rect x="18" y="6" width="12" height="6" rx="2" fill="${b}"/>
      <path d="M20 12h8v6l5 6v14a4 4 0 0 1-4 4H19a4 4 0 0 1-4-4V24l5-6z" fill="${a}"/>
      <rect x="17" y="28" width="14" height="7" rx="2" fill="${b}" opacity=".7"/>`,

    /* 碗装：粉丝 / 汤圆 / 面粉 */
    bowl: (a, b) => `<path d="M10 26h28c0 8-6 13-14 13s-14-5-14-13z" fill="${a}"/>
      <ellipse cx="24" cy="26" rx="14" ry="4" fill="${b}"/>
      <path d="M18 22c2-4 10-4 12 0" stroke="${b}" stroke-width="2.4" fill="none" stroke-linecap="round"/>`,

    /* 坚果 / 枣 / 板栗 */
    nut: (a, b) => `<ellipse cx="24" cy="27" rx="9" ry="11" fill="${a}"/>
      <path d="M24 16c0 6 0 14 0 22" stroke="${b}" stroke-width="2" opacity=".6"/>
      <path d="M24 16c-2-3-6-3-7 0 3 1 5 1 7 0z" fill="${K.leaf}"/>`,

    /* 菌菇 / 木耳 */
    shroom: (a, b) => `<path d="M10 24c0-8 6-13 14-13s14 5 14 13z" fill="${a}"/>
      <rect x="20" y="24" width="8" height="14" rx="3" fill="${b}"/>
      <circle cx="19" cy="19" r="1.6" fill="#FFFDF4" opacity=".8"/>
      <circle cx="27" cy="21" r="1.4" fill="#FFFDF4" opacity=".8"/>`,

    /* 海带 / 紫菜 */
    weed: (a, b) => `<path d="M14 38c4-8 0-14 4-22 3 8 1 16-2 22z" fill="${a}"/>
      <path d="M24 38c5-9 2-16 6-24 3 9 0 18-4 24z" fill="${b}"/>
      <path d="M33 38c3-7 1-12 4-18 2 7 1 13-1 18z" fill="${a}"/>`,

    /* 蛋：皮蛋 */
    egg: (a, b) => `<path d="M24 10c7 0 12 9 12 15a12 12 0 0 1-24 0c0-6 5-15 12-15z" fill="${a}"/>
      <ellipse cx="24" cy="28" rx="7" ry="6" fill="${b}" opacity=".8"/>`,

    /* 虾仁 / 鱿鱼 */
    shrimp: (a, b) => `<path d="M34 14c-10-2-18 4-18 11 0 6 5 9 10 9" stroke="${a}" stroke-width="8" fill="none" stroke-linecap="round"/>
      <path d="M26 34c3 0 6-2 7-4-1 5-4 7-8 6z" fill="${b}"/>`,

    /* 小粒：豆豉 / 蓝莓 */
    seeds: (a, b) => `<circle cx="18" cy="22" r="4.4" fill="${a}"/><circle cx="28" cy="20" r="4" fill="${b}"/>
      <circle cx="23" cy="30" r="4.6" fill="${a}"/><circle cx="32" cy="30" r="3.8" fill="${b}"/>
      <circle cx="15" cy="31" r="3.4" fill="${b}"/>`,
    /* 整颗菜：白菜 / 娃娃菜 / 生菜 */
    head: (a, b) => `<path d="M24 10c8 0 13 7 13 16 0 10-6 17-13 17s-13-7-13-17c0-9 5-16 13-16z" fill="${a}"/>
      <path d="M24 13v27" stroke="${b}" stroke-width="2" opacity=".55"/>
      <path d="M18 16c-2 7-2 15 1 21M30 16c2 7 2 15-1 21" stroke="${b}" stroke-width="1.8" fill="none" opacity=".45"/>
      <path d="M13 34c-3-2-5-6-4-9 4 1 6 4 7 7z" fill="${K.leaf}"/>
      <path d="M35 34c3-2 5-6 4-9-4 1-6 4-7 7z" fill="${K.leaf}"/>`,

    /* 鸡腿：肉 + 骨 */
    drum: (a, b) => `<path d="M14 16a11 11 0 1 0 9 18 10 10 0 0 0-9-18z" fill="${a}"/>
      <path d="M22 31l10 8" stroke="${b}" stroke-width="5" stroke-linecap="round"/>
      <path d="M31 38a5 5 0 1 0 6 6 5 5 0 0 0-6-6z" fill="${K.bone}"/>
      <path d="M16 19a8 8 0 0 1 6-3" stroke="#F8D9D0" stroke-width="2.4" fill="none" stroke-linecap="round"/>`,

    /* 桃：带凹槽和叶 */
    peach: (a, b) => `<path d="M24 14c7 0 12 6 12 13s-6 14-12 14-12-6-12-14 5-13 12-13z" fill="${a}"/>
      <path d="M24 15c-2 8-2 17 0 25" stroke="${b}" stroke-width="2" fill="none" opacity=".55"/>
      <path d="M24 12c1-4 4-6 8-5-1 4-4 6-8 5z" fill="${K.leaf}"/>`,
  };

  /* ---------- 84 个缺口 → 模板 + 配色 ---------- */
  const M = {
    /* 叶菜 / 茎 */
    cabbage: ["head", "#EAE6CF", K.leaf], baby_cabbage: ["head", "#F1EEDC", K.leafL],
    lettuce: ["head", K.leafL, K.green], spinach: ["leaf", K.leafD, K.leaf],
    chives: ["spear", K.green, K.leafD], kale: ["leaf", K.leafD, K.green],
    crown_daisy: ["leaf", K.green, K.leafL], garlic_sprout: ["spear", K.leafL, K.green],
    celery: ["spear", K.leafL, K.green], asparagus: ["spear", K.green, K.leafD],
    okra: ["spear", K.green, K.leaf], bean_sprout: ["spear", "#F4EBD2", K.leafL],
    bamboo_shoot: ["spear", K.root, K.rootD], celtuce: ["spear", K.green, K.leafL],
    /* 长条 */
    cucumber: ["long", K.green, K.greenD], wax_gourd: ["long", "#BFD8BE", K.green],
    luffa: ["long", K.greenD, K.green], lotus_root: ["long", K.root, K.rootD],
    yam: ["long", K.root, K.rootD], corn: ["long", K.yellow, K.yellowD],
    green_beans: ["long", K.green, K.greenD], snow_peas: ["long", K.leafL, K.green],
    radish: ["root", "#F6F1E4", K.rootD],
    /* 圆果 / 圆菜 */
    apple: ["round", K.red, K.redD], orange: ["round", K.orange, K.orangeD],
    mandarin: ["round", "#E9A33F", K.orangeD], peach: ["peach", K.pink, K.pinkD],
    pear: ["round", "#D8D06A", K.greenD], tomato2: ["round", K.red, K.redD],
    pumpkin: ["round", K.orange, K.orangeD], cauliflower: ["round", "#F3EEDD", K.leafL],
    cherry_tomato: ["round", K.red, K.redD], red_chili: ["long", K.red, K.redD],
    lemon: ["round", K.yellow, K.yellowD], grapefruit: ["round", K.orange, K.orangeD],
    watermelon: ["cut", K.greenD, K.red, K.ink], kiwi: ["cut", K.brown, K.green, K.ink],
    dragon_fruit: ["cut", K.pink, "#FFFDF4", K.ink], avocado: ["cut", K.greenD, K.leafL, K.brown],
    strawberry: ["cut", K.red, K.pink, K.ink], grape: ["bunch", K.purple, K.purpleD],
    cherry: ["bunch", K.red, K.redD], blueberry: ["seeds", K.blue, K.blueD],
    banana: ["curve", K.yellow, K.yellowD], mango: ["curve", K.orange, K.orangeD],
    /* 菌 / 藻 */
    enoki: ["shroom", "#F3E7C8", "#E4D3AC"], wood_ear: ["shroom", "#6B5548", "#8A6E5C"],
    kelp: ["weed", "#4F6B52", "#6B8A63"], seaweed: ["weed", "#3F5A48", "#5E7A5E"],
    /* 蛋白 */
    chicken_wing: ["drum", "#E39A86", K.meatD], chicken_thigh: ["drum", "#E79080", K.meatD],
    pork_belly: ["meat", "#EFA394", K.meatD], beef_brisket: ["meat", "#B4554B", "#8E3F38"],
    lamb: ["meat", "#CF7F72", "#A85C51"], lamb_chop: ["meat", "#C9756A", "#9E5048"],
    duck: ["meat", "#C97C68", "#A25A4B"], ribs: ["ribs", K.meat, K.meatD],
    pork_trotter: ["ribs", "#E7A08E", K.meatD], chicken_feet: ["ribs", "#E9B79F", K.meatD],
    bacon: ["strip", "#D97C6C", "#F0B9A6"], sausage: ["strip", "#C4664F", "#E39A86"],
    squid: ["shrimp", "#E4CFC2", "#C9A996"], peeled_shrimp: ["shrimp", K.meat, K.meatD],

    /* 豆制品 / 主食 */
    dried_tofu: ["block", "#E8D3A3", "#C9AC74"], tofu_skin: ["block", "#F0E3B8", "#D6C48C"],
    yuba: ["block", "#EBD9A6", "#CBB277"], rice_cake: ["block", "#FFFDF2", "#E2D9C2"],
    mantou: ["round", "#FFFCF1", "#E4DAC4"], flour: ["bowl", "#F3EDDD", "#E3D9C2"],
    butter: ["block", "#F7E39B", "#DCC470"], curry_block: ["block", "#D9A24E", "#B77F32"],
    douchi: ["seeds", "#4B3B33", "#6A554A"],
    sweet_potato: ["root", "#C97A55", "#A55C3C"], purple_potato: ["root", K.purple, K.purpleD],
    taro: ["root", "#CDBFA6", "#A99A80"],
    /* 汤 / 甜 */
    vermicelli: ["bowl", "#F5EFDC", "#DCD2B6"], tangyuan: ["bowl", "#FFFDF4", "#E8DFC8"],
    honey: ["bottle", K.yellow, K.yellowD], cream: ["bottle", K.milk, K.milkD],
    /* 坚果 */
    peanut: ["nut", "#D8B27E", "#B98F5A"], chestnut: ["nut", K.brown, K.brownD],
    lotus_seed: ["nut", "#F2EBD8", "#D7CBB0"], edamame: ["nut", K.green, K.greenD],
    red_date: ["nut", "#B4553F", "#8E3B2C"], century_egg: ["egg", "#5C6B5E", "#3F4B41"]
  };

  const TILT = { cucumber: -8, corn: -6, banana: -12, carrot: -14, peach: 6, grape: -4 };

  function wrap(body, cls, id) {
    const rot = TILT[id] || 0;
    return `<svg class="art ${cls || ""}" viewBox="0 0 48 48" role="img" aria-hidden="true"
      style="transform:rotate(${rot}deg)"><g transform="translate(24 24) scale(1.14) translate(-24 -26)">${body}</g></svg>`;
  }

  const had = g.COOK_ART.has;
  const origSvg = g.COOK_ART.svg;

  g.COOK_ART.svg = function (id, cls) {
    const m = M[id];
    if (!m) return origSvg(id, cls);
    const fn = T[m[0]];
    return wrap(fn(m[1], m[2], m[3]), cls, id);
  };
  g.COOK_ART.has = function (id) { return !!M[id] || had(id); };
  g.COOK_ART.ids = function () { return Object.keys(M).concat(g.COOK_ART.ids ? g.COOK_ART.ids() : []); };
})(window);
