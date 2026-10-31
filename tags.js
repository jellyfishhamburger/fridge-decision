/* ============================================================
   tags.js — 每道菜在「一顿饭」里的角色（生成套餐要用）

   role    主荤 mainProtein / 半荤 halfProtein / 蛋白菜 protein /
           纯素 veg / 素蛋白 vegProtein / 汤 soup / 一碗端 onepot
   method  炒 stirfry / 蒸 steam / 煮 boil / 焖 braise / 凉拌 cold / 微波 microwave
   protein high / mid / low      spicy 0–3      cuisine 川/湘/粤/家常/西式

   加菜时在这里补一行；没有登记的菜，代码会按 needs 里的食材自动推断角色。
   ============================================================ */
window.FD_TAGS = {
  "清蒸鲈鱼":       { role: "mainProtein", method: "steam",     protein: "high", spicy: 0, cuisine: "粤" },
  "白灼虾":         { role: "mainProtein", method: "boil",      protein: "high", spicy: 0, cuisine: "粤" },
  "蒜蓉虾":         { role: "mainProtein", method: "steam",     protein: "high", spicy: 0, cuisine: "家常" },
  "可乐鸡翅":       { role: "mainProtein", method: "braise",    protein: "mid",  spicy: 0, cuisine: "家常" },
  "宫保鸡丁":       { role: "mainProtein", method: "stirfry",   protein: "high", spicy: 2, cuisine: "川" },
  "洋葱炒猪肉":     { role: "mainProtein", method: "stirfry",   protein: "mid",  spicy: 0, cuisine: "家常" },
  "辣椒炒肉":       { role: "mainProtein", method: "stirfry",   protein: "mid",  spicy: 2, cuisine: "湘" },
  "香菇滑鸡":       { role: "mainProtein", method: "braise",    protein: "high", spicy: 0, cuisine: "粤" },
  "青椒土豆炒肉":   { role: "halfProtein", method: "stirfry",   protein: "mid",  spicy: 1, cuisine: "家常" },
  "麻婆豆腐":       { role: "halfProtein", method: "braise",    protein: "mid",  spicy: 2, cuisine: "川" },
  "洋葱炒鸡蛋":     { role: "halfProtein", method: "stirfry",   protein: "mid",  spicy: 0, cuisine: "家常" },
  "微波炉蒸蛋":     { role: "protein",     method: "microwave", protein: "mid",  spicy: 0, cuisine: "家常" },
  "凉拌豆腐":       { role: "vegProtein",  method: "cold",      protein: "mid",  spicy: 0, cuisine: "家常" },
  "西红柿鸡蛋汤":   { role: "soup",        method: "boil",      protein: "low",  spicy: 0, cuisine: "家常" },
  "炒茄子":         { role: "veg",         method: "stirfry",   protein: "low",  spicy: 0, cuisine: "家常" },
  "炒青菜":         { role: "veg",         method: "stirfry",   protein: "low",  spicy: 0, cuisine: "粤" },
  "蒜蓉空心菜":     { role: "veg",         method: "stirfry",   protein: "low",  spicy: 0, cuisine: "粤" },
  "蒜蓉西兰花":     { role: "veg",         method: "steam",     protein: "low",  spicy: 0, cuisine: "家常" },
  "蛋炒饭":         { role: "onepot",      method: "stirfry",   protein: "mid",  spicy: 0, cuisine: "家常" },
  "西红柿鸡蛋挂面": { role: "onepot",      method: "boil",      protein: "low",  spicy: 0, cuisine: "家常" }
};
