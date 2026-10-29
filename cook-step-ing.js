/* ============================================================
   cook-step-ing.js — 「这一步要用」的人工标注（食材 + 调料）
   20 道菜 / 136 步逐条过了一遍。
   · 食材 id = recipes.needs 里的那几样（fish / pork / egg …）
   · 调料 id = FD.PANTRY 里的 19 样（garlic / soy / salt / oil …）
   · 空数组 = 这一步没有东西下锅（洗锅、热锅、装盘、纯工具动作）
   index.html 的「跟着做」用它渲染每一步那一行；锅页以后要用也直接 include。
   校验：tools/check-step-ing.js（食物 id 必须在 needs 里、调料 id 必须在 pantry 里、步数要对上）
   ============================================================ */
(function (g) {
  "use strict";

  const TABLE = {
    /* 清蒸鲈鱼 */
    "清蒸鲈鱼#0": ["ginger", "scallion"],
    "清蒸鲈鱼#1": ["fish", "salt"],
    "清蒸鲈鱼#2": ["fish"],
    "清蒸鲈鱼#3": ["fish", "ginger", "scallion"],
    "清蒸鲈鱼#4": ["fish"],
    "清蒸鲈鱼#5": ["fish"],

    /* 白灼虾 */
    "白灼虾#0": ["onion", "ginger"],
    "白灼虾#1": ["shrimp", "onion", "ginger"],
    "白灼虾#2": ["wine"],
    "白灼虾#3": [],
    "白灼虾#4": ["shrimp"],

    /* 蒜蓉虾 */
    "蒜蓉虾#0": ["shrimp"],
    "蒜蓉虾#1": ["shrimp", "garlic"],
    "蒜蓉虾#2": ["shrimp"],
    "蒜蓉虾#3": ["shrimp", "oil", "soy"],

    /* 微波炉蒸蛋 */
    "微波炉蒸蛋#0": ["egg", "salt", "soy"],
    "微波炉蒸蛋#1": ["egg"],
    "微波炉蒸蛋#2": [],
    "微波炉蒸蛋#3": ["egg"],
    "微波炉蒸蛋#4": ["egg"],
    "微波炉蒸蛋#5": ["egg", "sesame_oil", "scallion"],

    /* 可乐鸡翅 */
    "可乐鸡翅#0": ["chicken", "ginger", "wine"],
    "可乐鸡翅#1": ["chicken", "soy"],
    "可乐鸡翅#2": ["chicken", "ginger", "oil"],
    "可乐鸡翅#3": ["chicken", "cola", "scallion"],
    "可乐鸡翅#4": ["chicken", "salt", "sugar", "soy", "dark_soy"],
    "可乐鸡翅#5": ["chicken", "cola", "scallion", "ginger"],
    "可乐鸡翅#6": ["chicken"],

    /* 宫保鸡丁 */
    "宫保鸡丁#0": ["chicken"],
    "宫保鸡丁#1": ["scallion", "ginger", "peanut"],
    "宫保鸡丁#2": ["chicken", "salt", "dark_soy", "wine", "starch", "scallion", "ginger"],
    "宫保鸡丁#3": ["dried_chili", "pepper_corn"],
    "宫保鸡丁#4": ["chicken", "oil"],
    "宫保鸡丁#5": ["chicken", "scallion", "ginger"],
    "宫保鸡丁#6": ["chicken", "dried_chili", "pepper_corn", "msg", "vinegar", "sugar", "peanut"],
    "宫保鸡丁#7": ["starch"],

    /* 洋葱炒猪肉 */
    "洋葱炒猪肉#0": ["onion", "pork", "garlic"],
    "洋葱炒猪肉#1": ["pork", "oil"],
    "洋葱炒猪肉#2": ["pork", "garlic"],
    "洋葱炒猪肉#3": ["onion"],
    "洋葱炒猪肉#4": ["onion", "pork"],
    "洋葱炒猪肉#5": ["onion", "pork"],

    /* 辣椒炒肉 */
    "辣椒炒肉#0": ["chili"],
    "辣椒炒肉#1": ["garlic", "ginger"],
    "辣椒炒肉#2": ["pork"],
    "辣椒炒肉#3": ["pork", "soy", "oyster", "salt"],
    "辣椒炒肉#4": ["chili", "salt"],
    "辣椒炒肉#5": ["oil", "garlic", "ginger"],
    "辣椒炒肉#6": ["pork", "chili"],
    "辣椒炒肉#7": ["pork", "chili", "douchi", "soy"],

    /* 青椒土豆炒肉 */
    "青椒土豆炒肉#0": ["chili", "potato", "pork", "scallion", "ginger", "garlic", "starch"],
    "青椒土豆炒肉#1": ["pork", "oil", "soy", "salt"],
    "青椒土豆炒肉#2": ["potato", "scallion", "ginger", "garlic", "soy", "salt"],
    "青椒土豆炒肉#3": ["chili", "starch"],
    "青椒土豆炒肉#4": [],

    /* 香菇滑鸡 */
    "香菇滑鸡#0": ["mushroom"],
    "香菇滑鸡#1": ["ginger", "scallion", "garlic"],
    "香菇滑鸡#2": ["chicken"],
    "香菇滑鸡#3": ["mushroom"],
    "香菇滑鸡#4": ["chicken"],
    "香菇滑鸡#5": ["chicken", "wine", "soy", "salt", "dark_soy"],
    "香菇滑鸡#6": ["chicken", "oil"],
    "香菇滑鸡#7": ["mushroom", "scallion", "ginger", "garlic", "oil"],

    /* 麻婆豆腐 */
    "麻婆豆腐#0": ["garlic", "ginger"],
    "麻婆豆腐#1": ["bird_chili"],
    "麻婆豆腐#2": ["pork"],
    "麻婆豆腐#3": ["pork", "salt", "soy"],
    "麻婆豆腐#4": [],
    "麻婆豆腐#5": ["tofu"],
    "麻婆豆腐#6": ["oil"],
    "麻婆豆腐#7": ["garlic", "ginger", "pepper_corn", "chili_garlic_sauce"],

    /* 西红柿鸡蛋汤 */
    "西红柿鸡蛋汤#0": ["tomato"],
    "西红柿鸡蛋汤#1": ["scallion", "ginger", "garlic"],
    "西红柿鸡蛋汤#2": ["egg"],
    "西红柿鸡蛋汤#3": ["oil", "scallion", "ginger", "garlic"],
    "西红柿鸡蛋汤#4": ["tomato"],
    "西红柿鸡蛋汤#5": ["tomato", "salt"],
    "西红柿鸡蛋汤#6": ["egg", "msg", "sesame_oil"],
    "西红柿鸡蛋汤#7": ["tomato", "egg"],

    /* 蛋炒饭 */
    "蛋炒饭#0": [],
    "蛋炒饭#1": ["carrot"],
    "蛋炒饭#2": ["beef"],
    "蛋炒饭#3": ["egg"],
    "蛋炒饭#4": ["egg", "oil"],
    "蛋炒饭#5": ["egg", "oil"],
    "蛋炒饭#6": ["carrot", "beef"],
    "蛋炒饭#7": ["egg"],

    /* 西红柿鸡蛋挂面 */
    "西红柿鸡蛋挂面#0": ["scallion"],
    "西红柿鸡蛋挂面#1": ["tomato"],
    "西红柿鸡蛋挂面#2": ["chili"],
    "西红柿鸡蛋挂面#3": ["egg", "white_vinegar"],
    "西红柿鸡蛋挂面#4": ["oil"],
    "西红柿鸡蛋挂面#5": ["egg"],
    "西红柿鸡蛋挂面#6": ["egg"],
    "西红柿鸡蛋挂面#7": ["scallion", "garlic", "oil"],

    /* 凉拌豆腐 */
    "凉拌豆腐#0": ["tofu"],
    "凉拌豆腐#1": [],
    "凉拌豆腐#2": ["tofu"],
    "凉拌豆腐#3": ["tofu"],
    "凉拌豆腐#4": ["scallion"],
    "凉拌豆腐#5": ["garlic"],
    "凉拌豆腐#6": ["soy", "sesame_oil", "vinegar", "sugar"],
    "凉拌豆腐#7": ["garlic"],

    /* 洋葱炒鸡蛋 */
    "洋葱炒鸡蛋#0": ["egg", "onion", "salt"],
    "洋葱炒鸡蛋#1": ["egg", "onion", "oil", "wine"],
    "洋葱炒鸡蛋#2": ["egg", "scallion"],

    /* 炒茄子 */
    "炒茄子#0": ["eggplant"],
    "炒茄子#1": ["scallion"],
    "炒茄子#2": ["star_anise"],
    "炒茄子#3": ["oil"],
    "炒茄子#4": [],
    "炒茄子#5": ["oil"],
    "炒茄子#6": ["scallion", "oil", "star_anise", "dried_shrimp"],
    "炒茄子#7": ["oil"],

    /* 炒青菜 */
    "炒青菜#0": ["greens"],
    "炒青菜#1": ["garlic"],
    "炒青菜#2": ["oil"],
    "炒青菜#3": ["greens"],
    "炒青菜#4": ["greens", "garlic"],
    "炒青菜#5": ["greens", "salt"],
    "炒青菜#6": ["greens", "sugar"],
    "炒青菜#7": ["greens"],

    /* 蒜蓉空心菜 */
    "蒜蓉空心菜#0": ["greens"],
    "蒜蓉空心菜#1": ["oil"],
    "蒜蓉空心菜#2": ["garlic"],
    "蒜蓉空心菜#3": ["greens"],
    "蒜蓉空心菜#4": ["greens", "salt", "sugar", "soy"],
    "蒜蓉空心菜#5": ["greens"],

    /* 蒜蓉西兰花 */
    "蒜蓉西兰花#0": ["broccoli"],
    "蒜蓉西兰花#1": ["garlic"],
    "蒜蓉西兰花#2": [],
    "蒜蓉西兰花#3": ["broccoli"],
    "蒜蓉西兰花#4": ["broccoli"],
    "蒜蓉西兰花#5": ["oil", "garlic"],
    "蒜蓉西兰花#6": ["soy", "oyster", "sugar"],
    "蒜蓉西兰花#7": []
  };

  /* 返回这一步要用的 id 数组（食材+调料混排，顺序即显示顺序）；没有这条数据返回 null */
  function stepIngredients(recipeId, index){
    const key = recipeId + "#" + index;
    return Object.prototype.hasOwnProperty.call(TABLE, key) ? TABLE[key] : null;
  }

  g.COOK_STEP_ING = TABLE;
  g.stepIngredients = stepIngredients;
})(window);
