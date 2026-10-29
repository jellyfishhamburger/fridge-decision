/* ============================================================
   MOTION — 一个极小的弹簧动画引擎（无依赖）
   思路来自 Framer Motion / sprung / Vaul：
   - 用阻尼谐振子的解析解（closed form），不是逐帧积分 → 与帧率无关
   - 弹簧天然带一点过冲（overshoot），比 cubic-bezier 更像真实物体
   - 被打断时从当前位移+速度重新起算（velocity-continuous）

   用法：
     const h = MOTION.spring({ from: 0, to: 240, stiffness: 420, damping: 34,
                               onUpdate: v => el.style.height = v + "px" });
     h.retarget(120);   // 中途改目标，不会跳变
     h.stop();
   ============================================================ */
(function (g) {
  "use strict";

  const reduce = g.matchMedia && g.matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* 阻尼谐振子：返回 f(x0, v0, t) = 相对目标的位移 */
  function solver(k, c, m) {
    const w0 = Math.sqrt(k / m);
    const zeta = c / (2 * Math.sqrt(k * m));
    if (zeta < 1) {
      const wd = w0 * Math.sqrt(1 - zeta * zeta);
      return (x0, v0, t) => {
        const e = Math.exp(-zeta * w0 * t);
        const A = x0;
        const B = (v0 + zeta * w0 * x0) / wd;
        return e * (A * Math.cos(wd * t) + B * Math.sin(wd * t));
      };
    }
    if (Math.abs(zeta - 1) < 1e-4) {
      return (x0, v0, t) => Math.exp(-w0 * t) * (x0 + (v0 + w0 * x0) * t);
    }
    const s = Math.sqrt(zeta * zeta - 1);
    const r1 = -w0 * (zeta - s), r2 = -w0 * (zeta + s);
    return (x0, v0, t) => {
      const c1 = (v0 - r2 * x0) / (r1 - r2);
      const c2 = x0 - c1;
      return c1 * Math.exp(r1 * t) + c2 * Math.exp(r2 * t);
    };
  }

  function spring(opts) {
    const from = opts.from == null ? 0 : opts.from;
    const o = {
      stiffness: opts.stiffness == null ? 420 : opts.stiffness,
      damping: opts.damping == null ? 34 : opts.damping,
      mass: opts.mass == null ? 1 : opts.mass,
      onUpdate: opts.onUpdate || function () {},
      onComplete: opts.onComplete || function () {},
      epsilon: opts.epsilon == null ? 0.4 : opts.epsilon
    };

    if (reduce) {                       // 尊重无障碍设置：直接到位
      o.onUpdate(opts.to);
      o.onComplete();
      return { stop() {}, retarget(t) { o.onUpdate(t); }, get value() { return opts.to; } };
    }

    let target = opts.to;
    let t0 = performance.now();
    let x0 = from - target;
    let v0 = opts.velocity || 0;
    let raf = 0, dead = false, last = from, lastT = t0, lastV = v0;

    function frame(now) {
      if (dead) return;
      const dt = (now - lastT) / 1000;
      const t = (now - t0) / 1000;
      const f = solver(o.stiffness, o.damping, o.mass);
      const d = f(x0, v0, t);
      const v = target + d;
      if (dt > 0) lastV = (v - last) / dt;
      last = v; lastT = now;
      o.onUpdate(v);
      if (Math.abs(d) < o.epsilon && t > 0.1) {
        o.onUpdate(target);
        dead = true;
        o.onComplete();
        return;
      }
      raf = requestAnimationFrame(frame);
    }
    raf = requestAnimationFrame(frame);

    return {
      stop() { dead = true; cancelAnimationFrame(raf); },
      retarget(nt) {
        const now = performance.now();
        const f = solver(o.stiffness, o.damping, o.mass);
        const t = (now - t0) / 1000;
        const cur = target + f(x0, v0, t);
        const vel = lastV || 0;
        target = nt;
        x0 = cur - nt; v0 = vel;
        t0 = now; last = cur; lastT = now;
        if (dead) { dead = false; raf = requestAnimationFrame(frame); }
      },
      get value() { return last; }
    };
  }

  /* 高度动画：先量好起止，再交给弹簧；结束后把内联样式收掉，交回 CSS */
  function height(el, to, o) {
    o = o || {};
    const from = el.getBoundingClientRect().height;
    el.style.overflow = "hidden";
    el.style.willChange = "height";
    const h = spring({
      from, to,
      stiffness: o.stiffness || 380,
      damping: o.damping || 32,
      onUpdate: v => { el.style.height = Math.max(0, v) + "px"; },
      onComplete: () => {
        el.style.height = "";
        el.style.overflow = o.keepOverflow ? "hidden" : "";
        el.style.willChange = "";
        o.onComplete && o.onComplete();
      }
    });
    return h;
  }

  /* 按压反馈：所有可点的东西都该有「按下去再弹回来」的手感 */
  function press(el, opts) {
    opts = opts || {};
    const deep = opts.scale == null ? 0.955 : opts.scale;
    let h = null;
    const down = () => {
      if (h) h.stop();
      h = spring({ from: 1, to: deep, stiffness: 620, damping: 34,
                   onUpdate: v => { el.style.transform = "scale(" + v + ")"; } });
    };
    const up = () => {
      if (h) h.stop();
      h = spring({ from: h ? h.value : deep, to: 1, stiffness: 520, damping: 20,
                   onUpdate: v => { el.style.transform = "scale(" + v + ")"; },
                   onComplete: () => { el.style.transform = ""; } });
    };
    el.addEventListener("pointerdown", down, { passive: true });
    el.addEventListener("pointerup", up, { passive: true });
    el.addEventListener("pointercancel", up, { passive: true });
    el.addEventListener("pointerleave", up, { passive: true });
  }

  g.MOTION = { spring, height, press, reduce };
})(window);
