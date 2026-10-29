/* ============================================================
   nav.js — 让底部导航那块胶囊跟着选中项滑过去。
   只管三件事：
     1. 首次绘制 / 旋转屏幕 / 字体加载完 → 无动画地量一次位置
     2. 选中项变化 → 带动画滑过去（CSS 负责补间）
     3. 点链接准备跳页时先把胶囊滑过去，再让浏览器接管（配合 nav.css 的 View Transition）
   不接管任何页面切换逻辑：index.html 自己的 show() 照旧。
   ============================================================ */
(function(){
  "use strict";
  var nav = document.querySelector(".nav");
  if(!nav) return;
  var bar = nav.querySelector(".navin");
  if(!bar) return;

  var pill = bar.querySelector(".nav-pill");
  if(!pill){
    pill = document.createElement("span");
    pill.className = "nav-pill";
    pill.setAttribute("aria-hidden", "true");
    bar.insertBefore(pill, bar.firstChild);
  }

  var REDUCE = matchMedia("(prefers-reduced-motion: reduce)").matches;

  function items(){
    return Array.prototype.slice.call(bar.querySelectorAll("a, button"));
  }
  function active(){
    var list = items();
    return list.filter(function(el){
      return el.classList.contains("on") || el.getAttribute("aria-current") === "page";
    })[0] || list[0];
  }

  function place(el, animate){
    if(!el) return;
    var x = el.offsetLeft, w = el.offsetWidth;
    if(!animate || REDUCE){
      var prev = pill.style.transition;
      pill.style.transition = "none";
      pill.style.transform = "translateX(" + x + "px)";
      pill.style.width = w + "px";
      void pill.offsetWidth;                 // 强制回流，别让这次赋值被补间
      pill.style.transition = prev;
    }else{
      pill.style.transform = "translateX(" + x + "px)";
      pill.style.width = w + "px";
    }
    pill.classList.add("on");
  }

  /* 把真实高度写成 --nav-h：锅页的固定面板贴在这条线上，写死 70px 会留一道缝，
     缝里会露出橱柜最后一行的小字。 */
  function setH(){
    var h = Math.round(nav.getBoundingClientRect().height);
    if(h) document.documentElement.style.setProperty("--nav-h", h + "px");
  }

  // 1. 初次定位（等一帧，避免量到还没排好版的大小）
  requestAnimationFrame(function(){ place(active(), false); setH(); });
  // 字体加载完宽度会变，重新量一次
  if(document.fonts && document.fonts.ready){
    document.fonts.ready.then(function(){ place(active(), false); });
  }
  // 旋转屏幕 / 改变窗口
  var rt;
  addEventListener("resize", function(){
    clearTimeout(rt);
    rt = setTimeout(function(){ place(active(), false); setH(); }, 120);
  });
  if(document.fonts && document.fonts.ready){ document.fonts.ready.then(setH); }

  // 2. 任何来源把 .on 换了（页面自己的 show()、hash 路由、脚本），都跟着滑
  var last = null;
  function sync(){ var el = active(); if(el && el !== last){ last = el; place(el, true); } }
  var mo = new MutationObserver(sync);
  items().forEach(function(el){ mo.observe(el, { attributes:true, attributeFilter:["class","aria-current"] }); });
  setTimeout(sync, 60);

  // 3. 点一下就先滑过去（跨页时配合 View Transition，页内时页面自己随后会改 class）
  bar.addEventListener("click", function(e){
    var el = e.target.closest ? e.target.closest("a, button") : null;
    if(!el || !bar.contains(el)) return;
    place(el, true);
  }, true);

  window.NavPill = { place: place, active: active };
})();
