/* Shared data + decision rules.
   Loaded by both index.html (phone) and display.html (fridge screen), so the two
   surfaces can never disagree about what is in the fridge or what gets recommended. */
(function (global) {
  "use strict";

  const CATALOG = [
    {id:"tofu",    name:"Tofu",             tag:"protein", life:5},
    {id:"shrimp",  name:"Shrimp",           tag:"protein", life:2},
    {id:"egg",     name:"Eggs",             tag:"protein", life:21},
    {id:"chicken", name:"Chicken",          tag:"protein", life:3},
    {id:"pork",    name:"Pork",             tag:"protein", life:3},
    {id:"greens",  name:"Leafy greens",     tag:"greens",  life:3},
    {id:"tomato",  name:"Tomato",           tag:"greens",  life:6},
    {id:"onion",   name:"Onion",            tag:"veg",     life:21},
    {id:"carrot",  name:"Carrot",           tag:"veg",     life:14},
    {id:"mushroom",name:"Mushrooms",        tag:"veg",     life:4},
    {id:"rice",    name:"Cooked rice",      tag:"carb",    life:2},
    {id:"noodle",  name:"Noodles",          tag:"carb",    life:10},
    {id:"dumpling",name:"Frozen dumplings", tag:"carb",    life:30},
    {id:"milk",    name:"Milk",             tag:"dairy",   life:5},
    {id:"cheese",  name:"Cheese",           tag:"dairy",   life:14}
  ];

  /* dishes name exact catalogue ids so the reason line can never name an
     ingredient the dish does not actually consume */
  const DISHES = [
    {id:"tofu_greens",  name:"Tofu & greens stir-fry",       short:"Tofu + greens",   needs:["tofu","greens"],      time:15, greens:true,
     steps:["Cube tofu, pat dry","Blanch greens 40s, drain","Stir-fry garlic, add tofu, then greens","Season with soy + a pinch of sugar"]},
    {id:"shrimp_greens",name:"Shrimp with greens",            short:"Shrimp + greens", needs:["shrimp","greens"],    time:12, greens:true,
     steps:["Sear shrimp 2 min a side, set aside","Stir-fry greens 2 min","Return shrimp, season, plate"]},
    {id:"tomato_egg",   name:"Tomato & egg",                  short:"Tomato + egg",    needs:["tomato","egg"],       time:10, greens:true,
     steps:["Scramble eggs, set aside","Cook tomato until it collapses","Fold eggs back in, season"]},
    {id:"egg_rice",     name:"Egg fried rice",                short:"Egg fried rice",  needs:["egg","rice"],         time:10, greens:false,
     steps:["Fry egg hard in hot oil","Add rice, break it up","Soy + white pepper, toss 1 min"]},
    {id:"noodle_greens",name:"Noodle soup with greens",       short:"Noodle soup",     needs:["noodle","greens"],    time:10, greens:true,
     steps:["Boil water with stock or soy","Noodles 3 min","Greens in for the last 40s"]},
    {id:"dumpling_grns",name:"Dumplings + a plate of greens",  short:"Dumplings + greens",needs:["dumpling","greens"],time:12, greens:true,
     steps:["Boil or pan-fry dumplings","Blanch greens, drizzle oyster sauce","Eat together — the greens are the point"]},
    {id:"pork_onion",   name:"Onion & pork stir-fry",          short:"Pork + onion",    needs:["pork","onion"],       time:18, greens:false,
     steps:["Slice onion, pork thin","Sear pork, remove","Onion until sweet, return pork, soy"]},
    {id:"mushroom_tofu",name:"Mushroom & tofu braise",         short:"Mushroom + tofu", needs:["mushroom","tofu"],    time:18, greens:false,
     steps:["Sear tofu golden","Add mushroom + soy + splash of water","Braise 6 min"]},
    {id:"cheese_egg",   name:"Cheese omelette",                short:"Cheese omelette", needs:["egg","cheese"],       time:8,  greens:false,
     steps:["Beat eggs, low heat","Cheese in, fold","60 seconds more"]},
    {id:"chicken_grns", name:"Chicken with greens",            short:"Chicken + greens",needs:["chicken","greens"],   time:16, greens:true,
     steps:["Slice chicken thin, marinate in soy 5 min","Sear chicken, remove","Greens in the same pan, return chicken"]}
  ];

  const DEFAULT_GOAL = {greensPerDay:1, maxMinutes:20};

  /* Local calendar date. toISOString() is UTC: after midnight in HK it still returns
     yesterday's date, which silently steals a day from every countdown. */
  function localDate(d) {
    const x = d || new Date();
    const p = n => String(n).padStart(2, "0");
    return `${x.getFullYear()}-${p(x.getMonth() + 1)}-${p(x.getDate())}`;
  }

  /* A display sits on a fridge for weeks, so "3 days" must actually tick.
     Items store addedAt + life as well; fall back to the stored number for old data. */
  function daysLeftOf(it) {
    if (it && it.addedAt && typeof it.life === "number") {
      const added = new Date(it.addedAt + "T00:00:00");
      if (!isNaN(added)) {
        const elapsed = Math.floor((Date.now() - added.getTime()) / 86400000);
        return Math.max(0, it.life - elapsed);
      }
    }
    return typeof it.daysLeft === "number" ? it.daysLeft : 0;
  }

  function itemsByCat(items) {
    const m = {};
    items.forEach(i => { (m[i.cat] = m[i.cat] || []).push(i); });
    return m;
  }

  function scoreDish(d, items, goal) {
    goal = goal || DEFAULT_GOAL;
    const byCat = itemsByCat(items);
    const used = [];
    for (const c of d.needs) {
      const list = byCat[c];
      if (!list || !list.length) return null;
      used.push(list.slice().sort((a, b) => daysLeftOf(a) - daysLeftOf(b))[0]);
    }
    const urgency     = used.reduce((s, i) => s + Math.max(0, 8 - daysLeftOf(i)) * 0.9, 0);
    const timePenalty = Math.max(0, d.time - goal.maxMinutes) * 1.4;
    const greensBonus = (d.greens && goal.greensPerDay > 0) ? 4 : 0;
    return {dish: d, score: urgency + greensBonus - timePenalty, used, urgency, greensBonus, timePenalty};
  }

  function decide(items, goal) {
    return DISHES.map(d => scoreDish(d, items, goal)).filter(Boolean).sort((a, b) => b.score - a.score);
  }

  /* what the fridge screen cares about: the most urgent items, one line each */
  function urgent(items, limit) {
    return items.slice().sort((a, b) => daysLeftOf(a) - daysLeftOf(b)).slice(0, limit || 3);
  }

  global.FD = {CATALOG, DISHES, DEFAULT_GOAL, scoreDish, decide, urgent, daysLeftOf, localDate};
})(window);
