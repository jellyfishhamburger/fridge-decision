/* 库存数据层测试：不依赖浏览器，直接跑
     node tests/inventory.test.mjs
   覆盖：数据完整性、新分类、别名映射、合并键、墨水屏摘要、老数据兼容。 */
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import assert from "node:assert/strict";

import { fileURLToPath } from "node:url";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function makeCtx() {
  const store = new Map();
  const ctx = {
    console,
    Date,
    URL,
    location: { href: "http://localhost/" },
    Math,
    JSON,
    setTimeout, clearTimeout,
    localStorage: {
      getItem: k => (store.has(k) ? store.get(k) : null),
      setItem: (k, v) => store.set(k, String(v)),
      removeItem: k => store.delete(k),
    },
    document: { querySelector: () => null, addEventListener: () => {} },
    navigator: { userAgent: "node" },
    fetch: () => Promise.reject(new Error("no network in tests")),
  };
  ctx.window = ctx;
  ctx.globalThis = ctx;
  return ctx;
}

function load(files) {
  const ctx = makeCtx();
  for (const f of files) {
    vm.runInNewContext(fs.readFileSync(path.join(ROOT, f), "utf8"), ctx, { filename: f });
  }
  return ctx;
}

const { FD } = load(["data.js", "logic.js"]);
const { RECEIPT } = load(["data.js", "logic.js", "receipt.js"]);
let pass = 0;
function ok(name, fn) { fn(); pass++; console.log("  ok  " + name); }

console.log("data / logic");

ok("目录总量与唯一 id", () => {
  assert.ok(FD.CATALOG.length >= 118, "catalog too small: " + FD.CATALOG.length);
  assert.equal(new Set(FD.CATALOG.map(f => f.id)).size, FD.CATALOG.length);
});

ok("每个食材字段完整", () => {
  for (const f of FD.CATALOG) {
    assert.ok(f.id && f.cn && f.name, "bad food: " + JSON.stringify(f));
    assert.equal(typeof f.days, "number");
    assert.ok(f.tag, "missing tag: " + f.id);
  }
});

ok("雪糕 / 饮料两个新分类都在", () => {
  const ice = FD.CATALOG.filter(f => f.tag === "ice");
  const drink = FD.CATALOG.filter(f => f.tag === "drink");
  assert.equal(ice.length, 4, "ice foods: " + ice.map(f => f.cn));
  assert.equal(drink.length, 5, "drink foods: " + drink.map(f => f.cn));
  for (const want of ["雪糕", "冰棍", "冰淇淋杯", "冰淇淋桶"]) {
    assert.ok(ice.some(f => f.cn === want), "missing " + want);
  }
  for (const want of ["汽水", "茶饮", "果汁", "咖啡", "气泡水"]) {
    assert.ok(drink.some(f => f.cn === want), "missing " + want);
  }
});

ok("单位能从 shop 推出来", () => {
  assert.equal(FD.unitOf("ice_cream"), "盒");
  assert.equal(FD.unitOf("soda"), "罐");
  assert.equal(FD.unitOf("juice"), "瓶");
  assert.equal(FD.unitOf("pork"), "盒");
});

ok("小票别名全部指向真实食材", () => {
  const alias = (RECEIPT && RECEIPT.ALIAS) || {};
  const ids = new Set(FD.CATALOG.map(f => f.id));
  for (const k of Object.keys(alias)) assert.ok(ids.has(k), "alias key not in catalog: " + k);
  assert.equal(alias.ice_lolly.includes("冰棍"), true);
  assert.equal(alias.soda.includes("可乐"), true);
  assert.equal(alias.sparkling.includes("元气森林"), true);
});

console.log("counts");

ok("categoryStats 结构固定、分类正确", () => {
  const list = [
    { cat: "soda", tag: "drink", qty: 6, daysLeft: 30 },
    { cat: "ice_cream", tag: "ice", qty: 2, daysLeft: 60 },
    { cat: "pork", tag: "protein", qty: 1, daysLeft: 2 },
    { cat: "greens", tag: "greens", qty: 1, daysLeft: -1 },
  ];
  const s = FD.categoryStats(list);
  assert.deepEqual(
    { total: s.total, drink: s.drink, ice: s.ice, protein: s.protein, veg: s.veg, soon: s.soon, expired: s.expired },
    { total: 4, drink: 1, ice: 1, protein: 1, veg: 1, soon: 1, expired: 1 }
  );
  for (const k of ["veg", "protein", "dairy", "carb", "fruit", "ice", "drink", "other", "soon", "expired", "total"]) {
    assert.ok(k in s, "missing key " + k);
  }
});

console.log("compat");

ok("老形状的条目（只有 daysLeft）还能算天数", () => {
  assert.equal(FD.daysLeftOf({ cat: "pork", daysLeft: 3 }), 3);
  assert.equal(FD.daysLeftOf({ cat: "pork", addedAt: "2000-01-01", life: 5 }) < 0, true);
});

ok("mergeItems：不同口味不合并，同口味合并数量", () => {
  const merged = FD.mergeItems([
    { cat: "ice_cream", tag: "ice", qty: 1, unit: "盒", daysLeft: 30, brand: "梦龙", flavor: "香草" },
    { cat: "ice_cream", tag: "ice", qty: 2, unit: "盒", daysLeft: 30, brand: "梦龙", flavor: "香草" },
    { cat: "ice_cream", tag: "ice", qty: 1, unit: "盒", daysLeft: 30, brand: "梦龙", flavor: "巧克力" },
  ]);
  assert.equal(merged.length, 2, "should keep two flavours apart");
  assert.equal(merged[0].qty, 3);
});

ok("mergeItems：没有新字段的旧数据仍按老规则合并", () => {
  const merged = FD.mergeItems([
    { cat: "pork", qty: 1, unit: "盒", daysLeft: 3 },
    { cat: "pork", qty: 2, unit: "盒", daysLeft: 3 },
  ]);
  assert.equal(merged.length, 1);
  assert.equal(merged[0].qty, 3);
});

console.log(`\n${pass} passed`);
