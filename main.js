/* HTDC — туман и свет на фоне, карта разрывов, ситуации. Без зависимостей. */
(() => {
  "use strict";

  document.documentElement.classList.add("js");
  const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)");

  /* ---------- Навигация: прозрачная только над первым экраном ---------- */
  const nav = document.querySelector(".nav");
  const syncNav = () => nav.toggleAttribute("data-top", scrollY < 8);
  syncNav();
  addEventListener("scroll", syncNav, { passive: true });

  /* ---------- Туман и свет ----------
     Текстуры рендерятся один раз в offscreen canvas; в кадре только drawImage.
     Canvas считается в половинном разрешении: туман размыт, разницы не видно. */
  const canvas = document.querySelector(".fog");
  const ctx = canvas.getContext("2d", { alpha: false });
  const SCALE = 0.5;
  const BG = "#06080d";

  function sprite(size, stops) {
    const c = document.createElement("canvas");
    c.width = c.height = size;
    const g = c.getContext("2d");
    const r = size / 2;
    const grad = g.createRadialGradient(r, r, 0, r, r, r);
    for (const [at, color] of stops) grad.addColorStop(at, color);
    g.fillStyle = grad;
    g.fillRect(0, 0, size, size);
    return c;
  }

  const FOG = sprite(128, [
    [0, "rgba(118,138,172,0.55)"],
    [0.45, "rgba(78,96,130,0.22)"],
    [1, "rgba(40,55,85,0)"],
  ]);
  const LIGHT = sprite(512, [
    [0, "rgba(255,255,255,1)"],
    [0.035, "rgba(240,247,255,0.92)"],
    [0.12, "rgba(200,222,245,0.42)"],
    [0.3, "rgba(130,160,200,0.13)"],
    [0.6, "rgba(80,105,145,0.04)"],
    [1, "rgba(60,80,120,0)"],
  ]);

  let W = 0, H = 0;
  const particles = [];

  function seed() {
    particles.length = 0;
    const count = W < 700 ? 8 : 14;
    for (let i = 0; i < count; i++) {
      const depth = Math.random();
      particles.push({
        x: Math.random(), y: Math.random(),
        size: 0.35 + depth * 0.65,           // доля от большей стороны экрана
        alpha: 0.10 + (1 - depth) * 0.16,
        phase: Math.random() * Math.PI * 2,
        speed: 0.00004 + depth * 0.00008,
        drift: (Math.random() - 0.5) * 0.00003,
      });
    }
  }

  function resize() {
    const w = innerWidth, h = canvas.clientHeight || innerHeight;
    // На телефоне адресная строка меняет высоту: не пересеиваем туман из-за этого
    const widthChanged = w !== W;
    if (!widthChanged && Math.abs(h - H) < 120) return;
    W = w; H = h;
    canvas.width = Math.round(W * SCALE);
    canvas.height = Math.round(H * SCALE);
    if (widthChanged) seed();
    frame(performance.now(), true);
  }

  // Свет ходит по истории страницы: у секций есть data-light="x,y,сила"
  const stops = [...document.querySelectorAll("[data-light]")].map((el) => {
    const [x, y, k] = el.dataset.light.split(",").map(Number);
    return { el, x, y, k };
  });
  const light = { x: 0.7, y: 0.46, k: 1, tx: 0.7, ty: 0.46, tk: 1 };
  const pointer = { x: 0, y: 0, tx: 0, ty: 0, onMap: false, mx: 0, my: 0 };

  function pickStop() {
    const mid = innerHeight / 2;
    let best = stops[0], bestD = Infinity;
    for (const s of stops) {
      const r = s.el.getBoundingClientRect();
      const d = r.top <= mid && r.bottom >= mid ? 0 : Math.min(Math.abs(r.top - mid), Math.abs(r.bottom - mid));
      if (d < bestD) { bestD = d; best = s; }
    }
    return best;
  }

  addEventListener("pointermove", (e) => {
    if (e.pointerType !== "mouse") return;
    pointer.tx = e.clientX / innerWidth - 0.5;
    pointer.ty = e.clientY / innerHeight - 0.5;
  }, { passive: true });

  // Над картой свет становится «линзой» и идёт за курсором
  const map = document.querySelector(".map__stack");
  const real = document.querySelector(".map__real");
  if (map) {
    map.addEventListener("pointermove", (e) => {
      if (e.pointerType !== "mouse") return;
      pointer.onMap = true;
      pointer.mx = e.clientX / innerWidth;
      pointer.my = e.clientY / innerHeight;
    });
    map.addEventListener("pointerleave", () => { pointer.onMap = false; });
  }

  let last = 0;
  function frame(now, still) {
    const t = now * 0.001;
    const s = pickStop();
    const drift = still ? 0 : 1;

    if (pointer.onMap && s.el.classList.contains("hero")) {
      light.tx = pointer.mx; light.ty = pointer.my;
    } else {
      light.tx = s.x + Math.sin(t * 0.11) * 0.09 * drift;
      light.ty = s.y + Math.cos(t * 0.083) * 0.07 * drift;
    }
    light.tk = s.k;

    const ease = still ? 1 : 0.035;
    light.x += (light.tx - light.x) * ease;
    light.y += (light.ty - light.y) * ease;
    light.k += (light.tk - light.k) * ease;
    pointer.x += (pointer.tx - pointer.x) * 0.03;
    pointer.y += (pointer.ty - pointer.y) * 0.03;

    const cw = canvas.width, ch = canvas.height, big = Math.max(cw, ch);
    ctx.globalCompositeOperation = "source-over";
    ctx.globalAlpha = 1;
    ctx.fillStyle = BG;
    ctx.fillRect(0, 0, cw, ch);

    const lx = (light.x + pointer.x * 0.02) * cw;
    const ly = (light.y + pointer.y * 0.02) * ch;

    // Туман, гуще у света
    const dt = still ? 0 : Math.min(now - last, 50);
    for (const p of particles) {
      p.phase += p.speed * dt * 6;
      p.x += (Math.sin(p.phase) * p.speed + p.drift) * dt;
      p.y += Math.cos(p.phase * 0.7) * p.speed * 0.6 * dt;
      if (p.x < -0.4) p.x = 1.4; else if (p.x > 1.4) p.x = -0.4;
      const size = p.size * big;
      const px = p.x * cw, py = p.y * ch;
      const dx = (px - lx) / big, dy = (py - ly) / big;
      const near = Math.max(0, 1 - Math.sqrt(dx * dx + dy * dy) * 1.6);
      ctx.globalAlpha = Math.min(1, p.alpha * (0.6 + near * 1.6 * light.k));
      ctx.drawImage(FOG, px - size / 2, py - size / 2, size, size);
    }

    // Свет — один источник, складывается с туманом
    const ls = Math.min(cw, ch) * (0.9 + 0.5 * light.k) * (1 + Math.sin(t * 0.6) * 0.03 * drift);
    ctx.globalCompositeOperation = "lighter";
    ctx.globalAlpha = 0.55 * light.k;
    ctx.drawImage(LIGHT, lx - ls / 2, ly - ls / 2, ls, ls);

    // Карта проявляется там, где свет
    if (real) {
      const r = map.getBoundingClientRect();
      if (r.bottom > 0 && r.top < innerHeight) {
        const mx = ((lx / SCALE) - r.left) / r.width * 100;
        const my = ((ly / SCALE) - r.top) / r.height * 100;
        real.style.setProperty("--mx", mx.toFixed(1) + "%");
        real.style.setProperty("--my", my.toFixed(1) + "%");
      }
    }

    last = now;
    if (!still && !reduceMotion.matches) requestAnimationFrame(frame);
  }

  addEventListener("resize", resize, { passive: true });
  resize();
  if (reduceMotion.matches) {
    // Один статичный кадр; карта видна целиком
    real && real.style.setProperty("--r", "90%");
    addEventListener("scroll", () => frame(performance.now(), true), { passive: true });
  } else {
    requestAnimationFrame((n) => { last = n; frame(n); });
  }

  /* ---------- Ситуации ---------- */
  const list = document.querySelector("[data-situations]");
  if (list) {
    const summary = document.querySelector(".situations__summary");
    const count = summary.querySelector("[data-count]");
    const chosen = new Set();

    const plural = (n) => {
      const m10 = n % 10, m100 = n % 100;
      if (m10 === 1 && m100 !== 11) return "ситуация";
      if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return "ситуации";
      return "ситуаций";
    };

    list.addEventListener("click", (e) => {
      const btn = e.target.closest(".sit__toggle");
      if (!btn) return;
      const on = btn.getAttribute("aria-pressed") !== "true";
      btn.setAttribute("aria-pressed", on);
      btn.setAttribute("aria-expanded", on);
      btn.parentElement.toggleAttribute("data-on", on);
      on ? chosen.add(btn.textContent.trim()) : chosen.delete(btn.textContent.trim());
      const n = chosen.size;
      count.textContent = n ? `Отмечено: ${n} ${plural(n)}` : "Пока ничего не отмечено.";
      summary.toggleAttribute("data-has", n > 0);
    });

    // Плашка на телефоне видна, только пока секция на экране
    new IntersectionObserver(([e]) => summary.toggleAttribute("data-visible", e.isIntersecting))
      .observe(list);

    // Выбор уезжает в форму заявки
    summary.querySelector("[data-discuss]").addEventListener("click", () => {
      window.htdcSituations = [...chosen];
      document.dispatchEvent(new CustomEvent("htdc:situations", { detail: [...chosen] }));
    });
  }
})();
