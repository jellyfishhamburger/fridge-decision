/* ============================================================
   FD_ICONS — one line-drawn pictogram per food, 24x24, stroke only.
   Drawn for a 2.9" e-paper panel: no fills, no thin hairlines, no detail
   below ~1.5 px at 28–34 px rendering. Colour comes from CSS (currentColor),
   so the same icon works black on paper and white on a dark header.
   ============================================================ */
(function (g) {
  "use strict";

  const P = {
    /* protein */
    shrimp: `<g stroke-width="2.5">
               <path d="M20.4 6.4C12.6 5 6 10.6 6 17.2c0 1.7 1.3 2.8 2.9 2.8"/>
               <path d="M20.4 6.4l2.2-2.1M20.4 6.4l1.4 3"/>
             </g>
             <circle cx="9.6" cy="9.4" r="1.7" fill="currentColor" stroke="none"/>`,
    fish: `<path d="M3.6 12c3-4.2 9-4.2 12.2 0-3.2 4.2-9.2 4.2-12.2 0z"/>
           <path d="M15.8 12l4.2-3.1v6.2z"/><circle cx="7.2" cy="11.2" r=".85"/>`,
    chicken: `<path d="M13.4 10.6l5.2 5.2"/><path d="M16.8 16.6a2.2 2.2 0 103.1 3.1 2.2 2.2 0 00-3.1-3.1z"/>
              <path d="M6.4 5.2a4.6 4.6 0 106.5 6.5 4.6 4.6 0 00-6.5-6.5z"/>`,
    meat: `<path d="M5 8.6h14a2.4 2.4 0 012.4 2.4v2a2.4 2.4 0 01-2.4 2.4H5A2.4 2.4 0 012.6 13v-2A2.4 2.4 0 015 8.6z"/>
           <path d="M6.6 12c2-1.2 4 1.2 6 0s3.2-1.2 4.4 0"/>`,
    ham: `<path d="M4.4 9.6c0-2.2 1.8-4 4-4h6.4c2.2 0 4 1.8 4 4v4.8c0 2.2-1.8 4-4 4H8.4c-2.2 0-4-1.8-4-4z"/>
          <path d="M8.4 9.6c0-1 .8-1.8 1.8-1.8h2.4" />`,
    egg: `<path d="M12 4.6c3.6 0 6.4 5 6.4 8.8A6.4 6.4 0 015.6 13.4c0-3.8 2.8-8.8 6.4-8.8z"/>`,
    tofu: `<path d="M4.4 10.4l3.4-3.4h12l-1.6 3.4v7.2H6l-1.6-2.4z"/>
           <path d="M4.4 10.4h13.8M7.8 7v3.4"/>`,

    /* greens & veg */
    greens: `<path d="M12 20.2c0-6.4 3.2-11.4 8.8-12.4 0 8.4-4 12.6-8.8 12.4z"/>
             <path d="M12 20.2c0-3.2-1.2-5.4-3.4-6.8"/>`,
    broccoli: `<circle cx="8.4" cy="9.4" r="2.6"/><circle cx="12" cy="7.6" r="2.8"/><circle cx="15.6" cy="9.4" r="2.6"/>
               <path d="M12 11.8v6.4M12 13.6l-3 2.2M12 13.6l3 2.2"/>`,
    tomato: `<circle cx="12" cy="13.4" r="7"/><path d="M12 6.4l-3.2-2M12 6.4l3.2-2M12 6.4V4"/>`,
    onion: `<path d="M12 20.4c4.2 0 6.4-3 6.4-6.2 0-3.2-2.2-6.2-6.4-8.2-4.2 2-6.4 5-6.4 8.2 0 3.2 2.2 6.2 6.4 6.2z"/>
            <path d="M12 6v14.4M12 6c0-1.4.6-2.4 1.8-2.8"/>`,
    carrot: `<path d="M3.4 20.6l6.2-1 8.2-8.2-5.2-5.2-8.2 8.2z"/>
             <path d="M14.8 6.2l3.4-2.4M14.8 6.2l.6-4M14.8 6.2l4.2 1"/>`,
    mushroom: `<path d="M3.6 12.2a8.4 6.6 0 0116.8 0z"/><path d="M9.4 12.2v5.4h5.2v-5.4"/>`,

    chili: `<path d="M11.4 8.6c3.4-.6 6.6 2 6.9 5.6.3 3.9-2.9 6.6-6.4 6-3.4-.6-5.3-3.6-4.6-6.9"/>
            <path d="M11.4 8.6c.2-1.6-.2-2.6-1.2-3.2M11.4 8.6c1.2-.6 2-1.6 2.2-2.8"/>`,
    potato: `<path d="M12.2 5.6c4 0 6.8 3 6.8 6.6 0 3.8-3 6.4-6.9 6.2-3.6-.2-6.2-2.8-6.2-6.4 0-3.7 2.6-6.4 6.3-6.4z"/>
             <circle cx="10" cy="10.4" r=".9"/><circle cx="14.4" cy="13.2" r=".9"/><circle cx="11.8" cy="15" r=".8"/>`,
    eggplant: `<path d="M11.6 8.4c2.6 0 5.6 2.4 5.6 5.8 0 3.4-2.8 5.6-6 5.6-3.1 0-5.4-2.2-5.4-5.4 0-3.3 2.7-6 5.8-6z"/>
               <path d="M11.6 8.4l-.6-2.6M11 5.8l-2.6.6M11 5.8l2.4.8"/>`,
    cola: `<path d="M8.4 7.6h7.2v11.2a1.6 1.6 0 01-1.6 1.6h-4a1.6 1.6 0 01-1.6-1.6z"/>
           <path d="M8.4 7.6h7.2M11 11.4c1.4-.6 2.2.6 2.2.6"/>`,

    /* carbs */
    rice: `<path d="M2.8 12.6h18.4a9.2 6.4 0 01-18.4 0z"/>
           <path d="M6.6 12.6c.6-3 2.8-4.6 5.4-4.6s4.8 1.6 5.4 4.6"/>`,
    noodle: `<path d="M2.8 12.6h18.4a9.2 6.4 0 01-18.4 0z"/>
             <path d="M6.6 9.4c1-1 1.8.8 2.8-.2s1.8.8 2.8-.2 1.8.8 2.8-.2 1.8.8 2.6 0"/>`,
    dumpling: `<path d="M3.6 14.4a8.4 7 0 0116.8 0z"/>
               <path d="M7.6 14.4v-2.6M12 14.4v-3.4M16.4 14.4v-2.6"/>`,
    bread: `<path d="M4.6 16.4v-3.2a4.8 4.8 0 014.8-4.8h5.2a4.8 4.8 0 014.8 4.8v3.2a1.6 1.6 0 01-1.6 1.6H6.2a1.6 1.6 0 01-1.6-1.6z"/>
            <path d="M9.4 12.2l1.2-2.2M13.4 12.2l1.2-2.2"/>`,

    /* dairy */
    milk: `<path d="M8.6 3.4h6.8v3.6l2 3v10.6H6.6V10l2-3z"/><path d="M8.6 3.4v3.6h6.8V3.4"/>`,
    cheese: `<path d="M3.4 16.6l8.8-8.8h8.4v8.8z"/><circle cx="9" cy="14" r="1.1"/><circle cx="15.4" cy="12.4" r="1.1"/>`,
    yogurt: `<path d="M7.2 8.2h9.6l-1.4 12.2H8.6z"/><path d="M7.2 8.2h9.6M9 11.8h6"/>`,
    /* ---- 本轮扩容：蔬菜 ---- */
    cabbage: `<circle cx="12" cy="13" r="7"/><path d="M12 6c-2.4 2.2-2.4 11.8 0 14"/>
              <path d="M12 6c2.4 2.2 2.4 11.8 0 14"/><path d="M5.3 10.6c2.6 1.4 10.8 1.4 13.4 0"/>`,
    leaf2: `<path d="M12 20.4c0-6.8 3.2-12 8.8-13 0 8.8-4.2 13.2-8.8 13z"/>
            <path d="M12 20.4c-3.4-2.4-5-5.4-5-8.4 2.6.6 4.4 2 5 4.4z"/>`,
    cucumber: `<path d="M8 4.8c2.6-1.4 6.8 1 8.6 4.4 1.9 3.4 1.3 7.9-1.3 9.3-2.6 1.4-6.8-1-8.6-4.4C4.8 10.7 5.4 6.2 8 4.8z"/>
               <path d="M9.4 7.6l4.6 6.4"/>`,
    pumpkin: `<ellipse cx="12" cy="13.2" rx="7.2" ry="6.2"/><path d="M12 7v12.4"/>
              <path d="M8.4 8c-1 3.2-1 7.2 0 10.4M15.6 8c1 3.2 1 7.2 0 10.4"/>
              <path d="M12 5.8c.6-1.4 1.8-2 2.8-2"/>`,
    corn: `<path d="M12 3.8c3 0 4.6 4 4.6 8.4s-1.6 8.4-4.6 8.4-4.6-4-4.6-8.4S9 3.8 12 3.8z"/>
           <path d="M9 7c1.4 1 2.6 1.4 6 0M9 10.6c1.4 1 2.6 1.4 6 0M9 14.2c1.4 1 2.6 1.4 6 0"/>`,
    pod: `<path d="M4.4 16.6c3.4-6.6 11-8.6 15.2-6.2-3 6.4-10 9.4-15.2 6.2z"/>
          <circle cx="9" cy="13.6" r="1.4"/><circle cx="13.4" cy="12" r="1.4"/>`,
    root: `<path d="M12 3.8c2.2 3 4 5.6 4 8.4a4 4 0 01-8 0c0-2.8 1.8-5.4 4-8.4z"/>
           <path d="M12 12v8M9.4 17.4l2.6 2.4 2.6-2.4"/>`,
    bun: `<path d="M4.8 14.6c0-3.4 3.2-6 7.2-6s7.2 2.6 7.2 6-3.2 5.4-7.2 5.4-7.2-2-7.2-5.4z"/>
          <path d="M8.6 9.8c1-1.6 5.8-1.6 6.8 0"/>`,
    bag: `<path d="M6.6 8.8h10.8l1.2 10.6H5.4z"/><path d="M9.2 8.8V6.6a2.8 2.8 0 015.6 0v2.2"/>`,

    /* ---- 本轮扩容：水果 ---- */
    apple: `<path d="M12 7.6c-2.6-1.6-6.4-.4-7 3-.6 3.6 2 8.4 4.8 8.4 1 0 1.4-.5 2.2-.5s1.2.5 2.2.5c2.8 0 5.4-4.8 4.8-8.4-.6-3.4-4.4-4.6-7-3z"/>
            <path d="M12 7.6V4.8"/><path d="M12.4 5.4c1.6-.8 2.6-1.6 2.8-2.6"/>`,
    banana: `<path d="M5 6.6c0 6 4.4 10.2 10.4 10.2 1.6 0 2.6-.6 3.2-1.6-6.6.4-10.4-3.4-11-8.6-.2-1.4-2.6-.6-2.6 0z"/>`,
    citrus: `<circle cx="12" cy="13.2" r="6.8"/><path d="M12 6.4v13.6M5.2 13.2h13.6"/>
             <path d="M12 6.4c.8-1.6 2-2.4 3.4-2.4"/>`,
    grape: `<circle cx="9.6" cy="9.8" r="2"/><circle cx="14.4" cy="9.8" r="2"/>
            <circle cx="7.4" cy="14" r="2"/><circle cx="12" cy="14" r="2"/><circle cx="16.6" cy="14" r="2"/>
            <circle cx="12" cy="18.2" r="2"/><path d="M12 7.8V4.6"/>`,
    berry: `<path d="M12 5.6c3.2 0 5.6 2.2 5.6 5.2 0 3.6-3.6 7.4-5.6 8.8-2-1.4-5.6-5.2-5.6-8.8 0-3 2.4-5.2 5.6-5.2z"/>
            <path d="M9.8 5.2c.8.8 3.6.8 4.4 0"/>
            <circle cx="9.8" cy="10.8" r=".7"/><circle cx="14" cy="10.8" r=".7"/>
            <circle cx="12" cy="13.6" r=".7"/><circle cx="10.4" cy="16.2" r=".7"/><circle cx="13.6" cy="16.2" r=".7"/>`,
    pear: `<path d="M12 4.4c1.4 0 2.4 1.2 2.4 2.8 0 1.8 3 3.6 3 7.2a5.4 5.4 0 01-10.8 0c0-3.6 3-5.4 3-7.2 0-1.6 1-2.8 2.4-2.8z"/>
           <path d="M12 4.4V3"/>`,
    melon: `<path d="M3.6 12.8h16.8a8.4 8.4 0 01-16.8 0z"/><path d="M3.6 12.8h16.8"/>
            <path d="M12 12.8v8.2M8.2 14.4c.8 2.6 2.2 4.6 3.8 6M15.8 14.4c-.8 2.6-2.2 4.6-3.8 6"/>`,
    kiwi: `<circle cx="12" cy="12.8" r="7"/><circle cx="12" cy="12.8" r="2.2"/>
           <path d="M12 5.8v3M12 16.8v3M5 12.8h3M16 12.8h3M7.4 8.2l2 2M14.6 15.4l2 2M16.6 8.2l-2 2M9.4 15.4l-2 2"/>`,
    drupe: `<circle cx="12" cy="13.4" r="6.6"/><path d="M12 6.8c-1.4 2.6-1.4 10.6 0 13.2"/>
            <path d="M12 6.8V3.8"/>`,
    dragon: `<ellipse cx="12" cy="13" rx="5.8" ry="7.2"/>
             <path d="M7.4 8.8L5.8 7.4M9.4 6.4L8.6 4.4M12 5.6V3.4M14.6 6.4l.8-2M16.6 8.8l1.6-1.4"/>`
  };

  const FALLBACK = `<circle cx="12" cy="12" r="7.4"/>`;

  /* mapping food id -> drawing (several foods share one drawing) */
  const MAP = {
    shrimp:"shrimp", fish:"fish", chicken:"chicken", pork:"meat", beef:"meat",
    ham:"ham", egg:"egg", tofu:"tofu",
    greens:"greens", broccoli:"broccoli", tomato:"tomato", onion:"onion",
    carrot:"carrot", mushroom:"mushroom",
    rice:"rice", noodle:"noodle", dumpling:"dumpling", bread:"bread",
    chili:"chili", potato:"potato", eggplant:"eggplant", cola:"cola",
    milk:"milk", cheese:"cheese", yogurt:"yogurt",
    cabbage:"cabbage", baby_cabbage:"cabbage", lettuce:"cabbage", spinach:"cabbage", chives:"cabbage",
    celery:"leaf2", bean_sprout:"leaf2", kelp:"leaf2", wood_ear:"leaf2",
    cucumber:"cucumber", luffa:"cucumber", wax_gourd:"cucumber",
    pumpkin:"pumpkin", corn:"corn", green_beans:"pod", snow_peas:"pod",
    cauliflower:"broccoli", enoki:"mushroom", cherry_tomato:"tomato", red_chili:"chili",
    yam:"root", lotus_root:"root", sweet_potato:"root",
    mantou:"bun", flour:"bag", rice_cake:"rice", butter:"cheese", cream:"milk",
    chicken_wing:"chicken", ribs:"meat", duck:"meat", lamb:"meat", bacon:"ham", sausage:"ham",
    peeled_shrimp:"shrimp", dried_tofu:"tofu",
    apple:"apple", banana:"banana", mandarin:"citrus", orange:"citrus", lemon:"citrus",
    grape:"grape", strawberry:"berry", blueberry:"berry", cherry:"berry",
    pear:"pear", watermelon:"melon", kiwi:"kiwi", peach:"drupe", mango:"drupe", avocado:"drupe",
    dragon_fruit:"dragon"
  };

  function icon(id, size, cls) {
    const s = size || 24;
    const art = P[MAP[id]] || FALLBACK;
    return `<svg class="fdico ${cls || ""}" width="${s}" height="${s}" viewBox="0 0 24 24"
      fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"
      stroke-linejoin="round" aria-hidden="true">${art}</svg>`;
  }

  g.FD_ICON = icon;
  g.FD_ICON_IDS = Object.keys(MAP);
})(window);
