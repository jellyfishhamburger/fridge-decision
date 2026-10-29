/* 校验 cook-step-ing.js：步数对得上、每个 id 都合法（食材 ∈ needs，调料 ∈ pantry）
   用法：node tools/check-step-ing.js            （在仓库根目录跑）
*/
const fs = require("fs");
const path = require("path");
const root = path.join(__dirname, "..");

global.window = global;
require(path.join(root, "data.js"));
require(path.join(root, "cook-step-ing.js"));

const DB = global.FD_DATA;
const T = global.COOK_STEP_ING;
const PANTRY = new Set((DB.pantry || []).map(p => p.id));

let errs = [], filled = 0, empty = 0, nFood = 0, nPantry = 0, nSteps = 0;

DB.recipes.forEach(r => {
  const steps = r.steps.filter(s => !/^!\[/.test(s.trim()));
  nSteps += steps.length;
  steps.forEach((_, i) => {
    const key = r.id + "#" + i;
    if (!(key in T)) { errs.push("缺标注: " + key); return; }
    const ids = T[key];
    if (!Array.isArray(ids)) { errs.push("不是数组: " + key); return; }
    if (!ids.length) { empty++; return; }
    filled++;
    ids.forEach(id => {
      const isFood = r.needs.indexOf(id) >= 0;
      const isPantry = PANTRY.has(id);
      if (!isFood && !isPantry) errs.push(`非法 id: ${key} -> ${id}（既不在 needs 也不在 pantry）`);
      if (isFood) nFood++;
      else nPantry++;
    });
  });
});

/* 多余的键（菜名改了、步数变少时会冒出来） */
Object.keys(T).forEach(k => {
  const [rid, idx] = k.split("#");
  const r = DB.recipes.find(x => x.id === rid);
  if (!r) { errs.push("多余标注（没有这道菜）: " + k); return; }
  const n = r.steps.filter(s => !/^!\[/.test(s.trim())).length;
  if (+idx >= n) errs.push(`多余标注（${rid} 只有 ${n} 步）: ${k}`);
});

console.log(JSON.stringify({
  recipes: DB.recipes.length,
  steps: nSteps,
  annotated: Object.keys(T).length,
  有物品的步骤: filled, 空步骤: empty,
  食材引用: nFood, 调料引用: nPantry,
  errors: errs.length ? errs : "none"
}, null, 1));
process.exit(errs.length ? 1 : 0);
