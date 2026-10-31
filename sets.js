/* ============================================================
   sets.js — 一人份套餐（引用 data.js 里现有的菜，不新增菜谱）

   一条套餐 = 一道主菜 + 一道配菜（主食多为米饭），或者一碗端的面/饭。
   热量 = 各道菜相加 + 米饭 150 kcal（估算，不是实测，和单菜口径一致）。
   minutes = 最长那道菜的时间 + 8 分钟（洗切、换锅、盛饭）。

   想改搭配只动这个文件；名字、顺序、加不加主食都在这儿。
   ============================================================ */
window.FD_SETS = [
  { id: "set_tomato_greens", name: "番茄蛋汤 + 蒜蓉西兰花 + 米饭",
    dishes: ["西红柿鸡蛋汤", "蒜蓉西兰花"], staple: "rice", tag: "清淡" },

  { id: "set_mapo", name: "麻婆豆腐 + 蒜蓉西兰花 + 米饭",
    dishes: ["麻婆豆腐", "蒜蓉西兰花"], staple: "rice", tag: "下饭" },

  { id: "set_mushroom_chicken", name: "香菇滑鸡 + 炒青菜 + 米饭",
    dishes: ["香菇滑鸡", "炒青菜"], staple: "rice", tag: "家常" },

  { id: "set_steam_fish", name: "清蒸鲈鱼 + 蒜蓉西兰花 + 米饭",
    dishes: ["清蒸鲈鱼", "蒜蓉西兰花"], staple: "rice", tag: "清淡" },

  { id: "set_chili_pork", name: "辣椒炒肉 + 蒜蓉西兰花 + 米饭",
    dishes: ["辣椒炒肉", "蒜蓉西兰花"], staple: "rice", tag: "下饭" },

  { id: "set_onion_egg", name: "洋葱炒蛋 + 炒青菜 + 米饭",
    dishes: ["洋葱炒鸡蛋", "炒青菜"], staple: "rice", tag: "快手" },

  { id: "set_shrimp", name: "蒜蓉虾 + 炒青菜 + 米饭",
    dishes: ["蒜蓉虾", "炒青菜"], staple: "rice", tag: "周末" },

  { id: "set_cold_tofu", name: "凉拌豆腐 + 蒜蓉西兰花 + 米饭",
    dishes: ["凉拌豆腐", "蒜蓉西兰花"], staple: "rice", tag: "不开火" },

  { id: "set_boil_shrimp", name: "白灼虾 + 蒜蓉西兰花 + 米饭",
    dishes: ["白灼虾", "蒜蓉西兰花"], staple: "rice", tag: "清淡" },

  { id: "set_micro_egg", name: "微波蒸蛋 + 蒜蓉西兰花 + 米饭",
    dishes: ["微波炉蒸蛋", "蒜蓉西兰花"], staple: "rice", tag: "轻" },

  { id: "set_noodle", name: "番茄鸡蛋面（一碗端）",
    dishes: ["西红柿鸡蛋挂面"], staple: null, tag: "一碗端" },

  { id: "set_fried_rice", name: "蛋炒饭（一碗端）",
    dishes: ["蛋炒饭"], staple: null, tag: "一碗端" }
];
