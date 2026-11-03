/* ============================================================
   FD_DISHES — 本地菜名词表（不依赖 AI）
   「锅里这几样 → 有哪些经典菜」的本地知识层。
   sig  : 必须用到的食材（FD 目录 id），锅里全有才算命中
   need : 这道菜还缺的关键食材（用来提示「还差 1 样」）
   tech : 做法归属，对应 techniques.js 的卡；没有卡就只给一句要点
   lib  : 菜谱库里已有的同名菜（点开直接看真步骤）
   ============================================================ */
window.FD_DISHES = [
  /* ---- 酿 ---- */
  { id: "niang-doufu", n: "客家酿豆腐", sig: ["tofu", "pork"], need: [], tech: "niang", cuisine: "客家", min: 40, lib: null,
    tip: "肉馅塞进豆腐，煎至两面黄再焖" },
  { id: "niang-chili", n: "青椒酿肉", sig: ["chili", "pork"], need: [], tech: "niang", cuisine: "客家", min: 35, lib: null },
  { id: "niang-mushroom", n: "香菇酿肉", sig: ["mushroom", "pork"], need: [], tech: "niang", cuisine: "家常", min: 35, lib: null },
  { id: "niang-eggplant", n: "茄子酿肉", sig: ["eggplant", "pork"], need: [], tech: "niang", cuisine: "客家", min: 40, lib: null },
  { id: "niang-waxgourd", n: "冬瓜酿肉", sig: ["wax_gourd", "pork"], need: [], tech: "niang", cuisine: "家常", min: 55, lib: "冬瓜酿肉" },
  { id: "niang-cabbage", n: "白菜酿肉", sig: ["cabbage", "pork"], need: [], tech: "niang", cuisine: "家常", min: 45, lib: null },
  { id: "niang-shrimp", n: "豆腐酿虾滑", sig: ["tofu", "shrimp"], need: [], tech: "niang", cuisine: "粤菜", min: 35, lib: null },
  { id: "niang-lotus", n: "莲藕酿肉", sig: ["lotus_root", "pork"], need: [], tech: "niang", cuisine: "家常", min: 50, lib: null },

  /* ---- 红烧 ---- */
  { id: "hs-pork", n: "红烧肉", sig: ["pork_belly"], need: [], tech: "hongshao", cuisine: "家常", min: 70, lib: null },
  { id: "hs-wing", n: "红烧鸡翅", sig: ["chicken_wing"], need: [], tech: "hongshao", cuisine: "家常", min: 35, lib: null },
  { id: "hs-fish", n: "红烧鱼", sig: ["fish"], need: [], tech: "hongshao", cuisine: "家常", min: 30, lib: null },
  { id: "hs-tofu", n: "红烧豆腐", sig: ["tofu"], need: [], tech: "hongshao", cuisine: "家常", min: 20, lib: null },
  { id: "hs-radish", n: "红烧萝卜", sig: ["radish"], need: [], tech: "hongshao", cuisine: "家常", min: 40, lib: null },
  { id: "hs-potato", n: "红烧土豆", sig: ["potato"], need: [], tech: "hongshao", cuisine: "家常", min: 35, lib: null },
  { id: "hs-ribs", n: "红烧排骨", sig: ["ribs"], need: [], tech: "hongshao", cuisine: "家常", min: 50, lib: null },
  { id: "hs-eggplant", n: "红烧茄子", sig: ["eggplant"], need: [], tech: "hongshao", cuisine: "家常", min: 25, lib: null },
  { id: "hs-waxgourd", n: "红烧冬瓜", sig: ["wax_gourd"], need: [], tech: "hongshao", cuisine: "家常", min: 25, lib: null },
  { id: "hs-brisket", n: "红烧牛腩", sig: ["beef_brisket"], need: ["radish"], tech: "hongshao", cuisine: "粤菜", min: 90, lib: null },

  /* ---- 清蒸 ---- */
  { id: "qz-fish", n: "清蒸鲈鱼", sig: ["fish"], need: [], tech: "qingzheng", cuisine: "粤菜", min: 25, lib: null },
  { id: "qz-shrimp", n: "清蒸虾", sig: ["shrimp"], need: [], tech: "qingzheng", cuisine: "粤菜", min: 20, lib: null },
  { id: "qz-egg", n: "蒸水蛋", sig: ["egg"], need: [], tech: "qingzheng", cuisine: "家常", min: 20, lib: null },
  { id: "qz-eggplant", n: "蒜蓉蒸茄子", sig: ["eggplant"], need: [], tech: "qingzheng", cuisine: "家常", min: 20, lib: null },
  { id: "qz-ribs", n: "清蒸排骨", sig: ["ribs"], need: [], tech: "qingzheng", cuisine: "粤菜", min: 40, lib: null },
  { id: "qz-pumpkin", n: "清蒸南瓜", sig: ["pumpkin"], need: [], tech: "qingzheng", cuisine: "家常", min: 20, lib: null },
  { id: "qz-tofu", n: "清蒸豆腐", sig: ["tofu"], need: [], tech: "qingzheng", cuisine: "家常", min: 15, lib: null },
  { id: "qz-vermicelli", n: "粉丝蒸虾", sig: ["shrimp", "vermicelli"], need: [], tech: "qingzheng", cuisine: "粤菜", min: 25, lib: null },

  /* ---- 库里有，直接看真菜谱 ---- */
  { id: "lib-mapo", n: "麻婆豆腐", sig: ["tofu", "pork"], need: [], tech: null, cuisine: "川菜", min: 20, lib: "麻婆豆腐" },
  { id: "lib-tomato-egg", n: "西红柿炒鸡蛋", sig: ["tomato", "egg"], need: [], tech: null, cuisine: "家常", min: 12, lib: "西红柿炒鸡蛋" },
  { id: "lib-cola-wing", n: "可乐鸡翅", sig: ["chicken_wing", "cola"], need: [], tech: null, cuisine: "家常", min: 30, lib: "可乐鸡翅" },
  { id: "lib-disanxian", n: "地三鲜", sig: ["eggplant", "potato", "chili"], need: [], tech: null, cuisine: "东北", min: 25, lib: "地三鲜" },
  { id: "lib-kungpao", n: "宫保鸡丁", sig: ["chicken", "chili"], need: ["peanut"], tech: null, cuisine: "川菜", min: 25, lib: "宫保鸡丁" },
  { id: "lib-yuxiang", n: "鱼香肉丝", sig: ["pork", "carrot", "wood_ear"], need: [], tech: null, cuisine: "川菜", min: 25, lib: "鱼香肉丝" },
  { id: "lib-huiguo", n: "回锅肉", sig: ["pork"], need: ["garlic_sprout"], tech: null, cuisine: "川菜", min: 30, lib: "回锅肉" },
  { id: "lib-mushroom-chicken", n: "香菇滑鸡", sig: ["chicken", "mushroom"], need: [], tech: null, cuisine: "粤菜", min: 30, lib: "香菇滑鸡" },
  { id: "lib-pidan-tofu", n: "皮蛋豆腐", sig: ["century_egg", "tofu"], need: [], tech: null, cuisine: "家常", min: 8, lib: "皮蛋豆腐" },
  { id: "lib-corn-ribs", n: "玉米排骨汤", sig: ["ribs", "corn"], need: [], tech: null, cuisine: "粤菜", min: 60, lib: "玉米排骨汤" },

  /* ---- 只有要点：库里没有、也不属于上面三种做法 ---- */
  { id: "tip-beef-tomato", n: "番茄牛腩", sig: ["beef_brisket", "tomato"], need: [], tech: null, cuisine: "家常", min: 90, lib: null,
    tip: "牛腩先焯水炖 60 分钟，番茄分两次下：一半炒出汁打底，一半最后 15 分钟放" },
  { id: "tip-beef-potato", n: "土豆炖牛肉", sig: ["beef", "potato"], need: [], tech: null, cuisine: "家常", min: 80, lib: null,
    tip: "牛肉焯水后小火炖 40 分钟再下土豆，土豆后放才不烂成泥" },
  { id: "tip-curry", n: "咖喱鸡", sig: ["chicken", "curry_block"], need: ["potato"], tech: null, cuisine: "家常", min: 40, lib: null,
    tip: "鸡块先煎香，加水没过煮 15 分钟，关小火再化咖喱块，不然容易糊底" },
  { id: "tip-onion-egg", n: "洋葱炒蛋", sig: ["onion", "egg"], need: [], tech: null, cuisine: "家常", min: 10, lib: null,
    tip: "蛋先炒到半凝固盛出，洋葱炒软再回锅，蛋才嫩" },
  { id: "tip-chive-egg", n: "韭菜炒蛋", sig: ["chives", "egg"], need: [], tech: null, cuisine: "家常", min: 10, lib: "韭菜炒蛋" },
  { id: "tip-cucumber-woodear", n: "黄瓜拌木耳", sig: ["cucumber", "wood_ear"], need: [], tech: null, cuisine: "家常", min: 15, lib: null,
    tip: "木耳焯 2 分钟过凉水，黄瓜拍碎不切片，蒜末 + 醋 + 生抽 + 一点糖" },
  { id: "tip-cold-tofu", n: "凉拌豆腐", sig: ["tofu"], need: [], tech: null, cuisine: "家常", min: 8, lib: "凉拌豆腐" },
  { id: "tip-seaweed-egg", n: "紫菜蛋花汤", sig: ["egg", "seaweed"], need: [], tech: null, cuisine: "家常", min: 10, lib: "紫菜蛋花汤" },
  { id: "tip-yam-ribs", n: "山药排骨汤", sig: ["ribs", "yam"], need: [], tech: null, cuisine: "粤菜", min: 70, lib: null,
    tip: "排骨焯水后先炖 40 分钟，山药最后 20 分钟放，久煮会化" },
  { id: "tip-shrimp-egg", n: "虾仁炒蛋", sig: ["shrimp", "egg"], need: [], tech: null, cuisine: "粤菜", min: 12, lib: null,
    tip: "虾仁先滑油到变色盛出，蛋液回锅时再放虾，一起炒会老" },
  { id: "tip-greens-garlic", n: "蒜蓉青菜", sig: ["greens"], need: [], tech: null, cuisine: "家常", min: 8, lib: null,
    tip: "锅要够热，蒜末爆香后大火快炒 40 秒，出锅前再放盐" },
  { id: "tip-mushroom-greens", n: "香菇青菜", sig: ["greens", "mushroom"], need: [], tech: null, cuisine: "家常", min: 12, lib: null,
    tip: "香菇先煎出香味再下青菜，蚝油半勺提鲜" },
  { id: "tip-waxgourd-ribs", n: "冬瓜排骨汤", sig: ["ribs", "wax_gourd"], need: [], tech: null, cuisine: "粤菜", min: 60, lib: null,
    tip: "排骨炖 40 分钟后下冬瓜，再煮 15 分钟，冬瓜透明就好" },
  { id: "tip-beef-tomato-potato", n: "西红柿土豆炖牛肉", sig: ["beef", "potato", "tomato"], need: [], tech: null, cuisine: "家常", min: 90, lib: "西红柿土豆炖牛肉" }
];
