/* ============================================================
   FD_DATA — the content database of the product.
   Two tables: what food lasts how long, and which foods make what dish.
   Everything the app and the fridge screen know comes from here.
   Swap this file for a JSON dump / SQLite table and nothing else changes.

   src:"usda" = value taken from the FDA/USDA Cold Food Storage Chart
                (foodsafety.gov, refrigerated at 40°F / 4°C), using the
                conservative end of the published range.
   src:"est"  = practitioner estimate, NOT yet sourced. Must be checked
                before this is presented as fact.
   ============================================================ */
window.FD_DATA = {
  version: "0.2",
  updated: "2026-10-29",
  shelfLifeSource: {
    usda: "FDA/USDA Cold Food Storage Chart — https://www.foodsafety.gov/food-safety-charts/cold-food-storage-charts",
    est: "internal estimate — verify before citing"
  },

  /* tag: protein | greens | veg | carb | dairy | other
     days: how long it is still good after it goes in the fridge */
  foods: [
    {id:"shrimp",  name:"Shrimp",            tag:"protein", days:3,  src:"usda"},  // shellfish 3–5 d
    {id:"chicken", name:"Chicken",           tag:"protein", days:2,  src:"usda"},  // fresh poultry 1–2 d
    {id:"pork",    name:"Pork",              tag:"protein", days:3,  src:"usda"},  // chops 3–5 d
    {id:"beef",    name:"Beef",              tag:"protein", days:3,  src:"usda"},  // steaks 3–5 d
    {id:"fish",    name:"Fish fillet",       tag:"protein", days:2,  src:"usda"},  // fin fish 1–3 d
    {id:"ham",     name:"Ham",               tag:"protein", days:4,  src:"usda"},  // cooked 3–5 d
    {id:"egg",     name:"Eggs",              tag:"protein", days:21, src:"usda"},  // in shell 3–5 wk
    {id:"tofu",    name:"Tofu",              tag:"protein", days:4,  src:"est"},
    {id:"greens",  name:"Leafy greens",      tag:"greens",  days:4,  src:"est"},
    {id:"broccoli",name:"Broccoli",          tag:"greens",  days:5,  src:"est"},
    {id:"tomato",  name:"Tomato",            tag:"greens",  days:6,  src:"est"},
    {id:"onion",   name:"Onion",             tag:"veg",     days:20, src:"est"},
    {id:"carrot",  name:"Carrot",            tag:"veg",     days:14, src:"est"},
    {id:"mushroom",name:"Mushrooms",         tag:"veg",     days:5,  src:"est"},
    {id:"rice",    name:"Cooked rice",       tag:"carb",    days:3,  src:"usda"},  // leftovers 3–4 d
    {id:"noodle",  name:"Noodles",           tag:"carb",    days:3,  src:"est"},
    {id:"dumpling",name:"Frozen dumplings",  tag:"carb",    days:90, src:"est"},
    {id:"bread",   name:"Bread",             tag:"carb",    days:5,  src:"est"},
    {id:"milk",    name:"Milk",              tag:"dairy",   days:7,  src:"est"},
    {id:"cheese",  name:"Cheese",            tag:"dairy",   days:21, src:"usda"},  // opened hard cheese 3–4 wk
    {id:"yogurt",  name:"Yogurt",            tag:"dairy",   days:10, src:"est"}
  ],

  /* needs = exact food ids. A dish is only possible if every id is in the fridge. */
  dishes: [
    {id:"shrimp_greens",  name:"Shrimp with greens",        needs:["shrimp","greens"],           time:12, greens:true,
     steps:["Sear shrimp 2 min a side, set aside","Stir-fry greens 2 min","Return shrimp, season, plate"]},
    {id:"tofu_greens",    name:"Tofu & greens stir-fry",    needs:["tofu","greens"],             time:15, greens:true,
     steps:["Cube tofu, pat dry","Blanch greens 40s, drain","Stir-fry garlic, add tofu, then greens","Season with soy + a pinch of sugar"]},
    {id:"tomato_egg",     name:"Tomato & egg",              needs:["tomato","egg"],              time:10, greens:true,
     steps:["Scramble eggs, set aside","Cook tomato until it collapses","Fold eggs back in, season"]},
    {id:"egg_rice",       name:"Egg fried rice",            needs:["egg","rice"],                time:10, greens:false,
     steps:["Fry egg hard in hot oil","Add rice, break it up","Soy + white pepper, toss 1 min"]},
    {id:"noodle_greens",  name:"Noodle soup with greens",   needs:["noodle","greens"],           time:10, greens:true,
     steps:["Boil water with stock or soy","Noodles 3 min","Greens in for the last 40s"]},
    {id:"dumpling_greens",name:"Dumplings + a plate of greens", needs:["dumpling","greens"],     time:12, greens:true,
     steps:["Boil or pan-fry dumplings","Blanch greens, drizzle oyster sauce","Eat together — the greens are the point"]},
    {id:"pork_onion",     name:"Onion & pork stir-fry",     needs:["pork","onion"],              time:18, greens:false,
     steps:["Slice onion and pork thin","Sear pork, remove","Onion until sweet, return pork, soy"]},
    {id:"mushroom_tofu",  name:"Mushroom & tofu braise",    needs:["mushroom","tofu"],           time:18, greens:false,
     steps:["Sear tofu golden","Add mushroom + soy + splash of water","Braise 6 min"]},
    {id:"cheese_egg",     name:"Cheese omelette",           needs:["egg","cheese"],              time:8,  greens:false,
     steps:["Beat eggs, low heat","Cheese in, fold","60 seconds more"]},
    {id:"chicken_greens", name:"Chicken with greens",       needs:["chicken","greens"],          time:16, greens:true,
     steps:["Slice chicken thin, marinate in soy 5 min","Sear chicken, remove","Greens in the same pan, return chicken"]},
    {id:"beef_onion",     name:"Beef & onion",              needs:["beef","onion"],              time:15, greens:false,
     steps:["Thin-slice beef, dust with cornflour","Sear beef hard, remove","Onion soft, beef back in, soy + pepper"]},
    {id:"fish_greens",    name:"Steamed fish + greens",     needs:["fish","greens"],             time:14, greens:true,
     steps:["Steam fish 8 min with ginger","Blanch greens","Hot oil + soy over both"]},
    {id:"broccoli_beef",  name:"Beef with broccoli",        needs:["beef","broccoli"],           time:15, greens:true,
     steps:["Blanch broccoli 1 min","Sear beef, remove","Garlic, broccoli, beef, oyster sauce"]},
    {id:"carrot_pork",    name:"Pork & carrot stir-fry",    needs:["pork","carrot"],             time:20, greens:false,
     steps:["Julienne carrot, slice pork","Sear pork","Carrot 3 min, season, splash of water"]},
    {id:"ham_egg_rice",   name:"Ham & egg fried rice",      needs:["ham","egg","rice"],          time:12, greens:false,
     steps:["Fry egg, set aside","Ham in, then rice","Egg back, soy, white pepper"]},
    {id:"tomato_egg_noodle", name:"Tomato egg noodles",     needs:["tomato","egg","noodle"],     time:15, greens:true,
     steps:["Noodles 3 min, drain","Tomato down to a sauce","Egg in, noodles back, season"]},
    {id:"tofu_mushroom_noodle", name:"Tofu mushroom noodle", needs:["tofu","mushroom","noodle"], time:18, greens:false,
     steps:["Sear tofu","Mushroom + stock 5 min","Noodles in for the last 2 min"]},
    {id:"toast_egg_cheese", name:"Toast with egg & cheese", needs:["bread","egg","cheese"],      time:8,  greens:false,
     steps:["Toast bread","Fry egg, cheese on top to melt","Assemble, pepper"]}
  ]
};
