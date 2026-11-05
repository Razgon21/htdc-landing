/* HTDC — свет и туман на фоне, сфера, ситуации, сцена раскрытия, заявка. Без зависимостей. */

// Куда уходит заявка. Пока null — отправка имитируется.
const FORM_ENDPOINT = null;
// Файл с примером управленческой инструкции. Пока null — кнопка ведёт к форме.
const SAMPLE_URL = null;

(() => {
  "use strict";

  const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)");
  const root = document.documentElement;
  root.classList.add("js");
  const motion = !reduceMotion.matches && "IntersectionObserver" in window;
  if (motion) root.classList.add("motion");

  const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));

  /* ---------- Навигация: прозрачная только над первым экраном ---------- */
  const nav = document.querySelector(".nav");
  const syncNav = () => nav.toggleAttribute("data-top", scrollY < 8);
  syncNav();
  addEventListener("scroll", syncNav, { passive: true });

  /* ---------- Туман, свет и сфера ----------
     На странице одна сфера. У якорей ([data-anchor]) она крупная и резкая и стоит точно в слоте;
     между ними уменьшается, размывается и уходит в туман мягким светом. Состояние считается
     от положения прокрутки, поэтому обратный скролл проигрывает переход обратно.
     Туман рендерится один раз в offscreen canvas; в кадре только drawImage, в половинном разрешении. */
  const canvas = document.querySelector(".fog");
  const ctx = canvas.getContext("2d", { alpha: false });
  const SCALE = 0.5;
  const BG = "#06080d";
  const sphere = document.querySelector(".sphere");
  const layers = {
    soft: sphere.querySelector(".sphere__soft"),
    mid: sphere.querySelector(".sphere__mid"),
    sharp: sphere.querySelector(".sphere__sharp"),
    sheet: sphere.querySelector(".sphere__sheet"),
  };
  const BASE = 600; // размер элемента сферы в CSS

  const smooth = (a, b, v) => { const t = clamp((v - a) / (b - a)); return t * t * (3 - 2 * t); };
  const mix = (a, b, t) => a + (b - a) * t;

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
  // Свечение тумана вокруг мягкого света
  const GLOW = sprite(512, [
    [0, "rgba(200,222,245,0.5)"],
    [0.2, "rgba(150,178,215,0.2)"],
    [0.5, "rgba(90,115,160,0.06)"],
    [1, "rgba(60,80,120,0)"],
  ]);
  // Ореол вокруг резкой сферы: ярко у края, быстро гаснет
  const HALO = sprite(512, [
    [0, "rgba(230,242,255,0.95)"],
    [0.3, "rgba(200,222,248,0.7)"],
    [0.36, "rgba(160,190,230,0.34)"],
    [0.5, "rgba(110,140,190,0.12)"],
    [0.75, "rgba(70,95,140,0.04)"],
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

  // Куда уходит мягкий свет в каждой секции: data-light="x,y,сила"
  const stops = [...document.querySelectorAll("[data-light]")].map((el) => {
    const [x, y, k] = el.dataset.light.split(",").map(Number);
    return { el, x, y, k };
  });
  const anchors = [...document.querySelectorAll("[data-anchor]")];
  const soft = { x: 0.74, y: 0.4, k: 1, ready: false };
  const pointer = { x: 0, y: 0, tx: 0, ty: 0 };
  const paper = { el: document.querySelector(".paper__orb"), fill: 0 };

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

  // Ближайший якорь и насколько сфера «собрана» у него: 1 — слот у середины экрана.
  // Диапазон широкий, чтобы переход растягивался почти на экран прокрутки.
  function pickAnchor() {
    const vh = innerHeight;
    let best = null, bestE = 0;
    for (const el of anchors) {
      if (!el.offsetWidth) continue;
      const r = el.getBoundingClientRect();
      const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
      const e = 1 - smooth(vh * 0.14, vh * 0.85, Math.abs(cy - vh / 2));
      if (e > bestE) { bestE = e; best = { el, cx, cy, d: r.width, e }; }
    }
    return best;
  }

  addEventListener("pointermove", (e) => {
    if (e.pointerType !== "mouse") return;
    pointer.tx = e.clientX / innerWidth - 0.5;
    pointer.ty = e.clientY / innerHeight - 0.5;
  }, { passive: true });

  let last = 0;
  function frame(now, still) {
    const t = now * 0.001;
    const vw = innerWidth, vh = innerHeight;
    const drift = still ? 0 : 1;

    // Мягкий свет плывёт к точке текущей секции
    const s = pickStop();
    const sx = s.x + Math.sin(t * 0.11) * 0.06 * drift;
    const sy = s.y + Math.cos(t * 0.083) * 0.05 * drift;
    const ease = still || !soft.ready ? 1 : 0.03;
    soft.x += (sx - soft.x) * ease;
    soft.y += (sy - soft.y) * ease;
    soft.k += (s.k - soft.k) * ease;
    soft.ready = true;
    pointer.x += (pointer.tx - pointer.x) * 0.03;
    pointer.y += (pointer.ty - pointer.y) * 0.03;

    // Одно состояние сферы: смесь мягкого света и якоря
    const a = pickAnchor();
    const e = a ? a.e : 0;
    const softD = Math.min(vw, vh) * 0.13 * (0.8 + 0.3 * soft.k);
    const px = (soft.x + pointer.x * 0.03) * vw, py = (soft.y + pointer.y * 0.03) * vh;
    // Положение держится за слотом дольше, чем резкость: сфера сначала уезжает вместе с ним, потом растворяется
    const ep = smooth(0, 0.6, e);
    const cx = a ? mix(px, a.cx, ep) : px;
    const cy = a ? mix(py, a.cy, ep) : py;
    const d = a ? mix(softD, a.d, e) : softD;

    const k = d / BASE;
    sphere.style.transform = `translate3d(${(cx - d / 2).toFixed(1)}px, ${(cy - d / 2).toFixed(1)}px, 0) scale(${k.toFixed(4)})`;
    // Резкий слой лежит сверху, под ним полуразмытый, ещё ниже мягкий свет
    layers.sharp.style.opacity = smooth(0.55, 0.95, e).toFixed(3);
    layers.mid.style.opacity = (smooth(0.1, 0.45, e) * (1 - smooth(0.85, 1, e))).toFixed(3);
    // На узком экране текст идёт во всю ширину, поэтому мягкий свет тише: под ним должен читаться текст
    const softMax = vw < 860 ? 0.36 : clamp(0.55 + 0.4 * soft.k);
    layers.soft.style.opacity = ((1 - smooth(0.25, 0.7, e)) * softMax).toFixed(3);
    const sheet = a && a.el === paper.el ? paper.fill * e : 0;
    layers.sheet.style.opacity = sheet.toFixed(3);

    // Туман: у резкой сферы расходится к краям, у мягкого света гуще рядом с ним
    const cw = canvas.width, ch = canvas.height, big = Math.max(cw, ch);
    ctx.globalCompositeOperation = "source-over";
    ctx.globalAlpha = 1;
    ctx.fillStyle = BG;
    ctx.fillRect(0, 0, cw, ch);
    const lx = cx * SCALE, ly = cy * SCALE;

    const dt = still ? 0 : Math.min(now - last, 50);
    for (const p of particles) {
      p.phase += p.speed * dt * 6;
      p.x += (Math.sin(p.phase) * p.speed + p.drift) * dt;
      p.y += Math.cos(p.phase * 0.7) * p.speed * 0.6 * dt;
      if (p.x < -0.4) p.x = 1.4; else if (p.x > 1.4) p.x = -0.4;
      const size = p.size * big;
      const fx = p.x * cw, fy = p.y * ch;
      const dx = (fx - lx) / big, dy = (fy - ly) / big;
      const near = Math.max(0, 1 - Math.sqrt(dx * dx + dy * dy) * 1.6);
      const boost = near * 1.6 * soft.k * (1 - e * 1.3);
      ctx.globalAlpha = clamp(p.alpha * (0.6 + boost), 0.03, 1);
      ctx.drawImage(FOG, fx - size / 2, fy - size / 2, size, size);
    }

    // Свет вокруг сферы — того же центра и размера, поэтому никогда не расходится с ней
    ctx.globalCompositeOperation = "lighter";
    if (e < 1) {
      const gs = Math.min(cw, ch) * (1.1 + 0.4 * soft.k);
      ctx.globalAlpha = 0.6 * soft.k * (1 - e);
      ctx.drawImage(GLOW, lx - gs / 2, ly - gs / 2, gs, gs);
    }
    if (e > 0 && sheet < 1) {
      const hs = Math.min(d * 3.1, Math.max(vw, vh) * 2.2) * SCALE;
      ctx.globalAlpha = 0.6 * e * (1 - sheet);
      ctx.drawImage(HALO, lx - hs / 2, ly - hs / 2, hs, hs);
    }

    last = now;
    if (!still && motion) requestAnimationFrame(frame);
  }

  /* ---------- Сцена: сфера заливает экран светом, из неё проявляется лист ---------- */
  const scene = document.querySelector("[data-paper-scene]");
  const updateScene = () => {
    if (!scene || !motion) return;
    const stage = scene.querySelector(".paper__stage");
    const head = scene.querySelector(".paper__head");
    const r = scene.getBoundingClientRect();
    const vh = innerHeight;
    const p = clamp(-r.top / Math.max(1, r.height - vh));
    const cover = Math.hypot(innerWidth, vh) / 160 * 1.06;
    const grow = clamp(p / 0.62);
    paper.el.style.setProperty("--s", (1 + (cover - 1) * grow ** 2.4).toFixed(3));
    paper.fill = clamp((p - 0.12) / 0.34);
    head.style.setProperty("--h", clamp((p - 0.6) / 0.24).toFixed(3));
    // Когда свет залил экран, лист держит фон сам — сфера может уходить
    stage.toggleAttribute("data-filled", p > 0.97);
  };

  addEventListener("resize", () => { resize(); updateScene(); }, { passive: true });
  updateScene();
  resize();
  if (motion) {
    addEventListener("scroll", updateScene, { passive: true });
    requestAnimationFrame((n) => { last = n; frame(n); });
  } else {
    // Без движения: сфера просто стоит у якорей, кадр пересчитывается при прокрутке
    let queued = false;
    addEventListener("scroll", () => {
      if (queued) return;
      queued = true;
      requestAnimationFrame(() => { queued = false; frame(performance.now(), true); });
    }, { passive: true });
  }

  /* ---------- Ситуации ---------- */
  const checks = document.querySelector("[data-checks]");
  if (checks) {
    const reading = document.getElementById("reading");
    const empty = reading.querySelector("[data-empty]");
    const cta = reading.querySelector("[data-cta]");
    const bar = document.querySelector("[data-bar]");
    const count = bar.querySelector("[data-count]");
    const items = new Map([...reading.querySelectorAll("[data-for]")].map((a) => [a.dataset.for, a]));
    const boxes = [...checks.querySelectorAll("input[type=checkbox]")];

    const plural = (n) => {
      const m10 = n % 10, m100 = n % 100;
      if (m10 === 1 && m100 !== 11) return "ситуация";
      if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return "ситуации";
      return "ситуаций";
    };

    const sync = () => {
      let n = 0;
      for (const box of boxes) {
        const on = box.checked;
        n += on;
        box.closest(".check").toggleAttribute("data-on", on);
        items.get(box.value)?.toggleAttribute("data-on", on);
      }
      empty.hidden = n > 0;
      cta.toggleAttribute("data-has", n > 0);
      bar.toggleAttribute("data-has", n > 0);
      count.textContent = `Отмечено: ${n} ${plural(n)}`;
    };
    checks.addEventListener("change", sync);
    sync();

    // Плашка на телефоне видна, только пока список на экране
    new IntersectionObserver(([e]) => bar.toggleAttribute("data-visible", e.isIntersecting))
      .observe(checks);

    // Выбор уезжает в форму заявки
    cta.querySelector("[data-discuss]").addEventListener("click", () => {
      const message = document.getElementById("f-message");
      const chosen = boxes.filter((b) => b.checked).map((b) => b.nextElementSibling.textContent.trim());
      if (message && chosen.length && !message.value.trim()) {
        message.value = "Узнаём у себя:\n" + chosen.map((s) => "— " + s).join("\n");
      }
    });
  }

  /* ---------- Появление частей секций ---------- */
  if (motion) {
    const groups = document.querySelectorAll(
      ".hero__text, .situations__head, .checks, .not__head, .not__rows, .lens__title, .lens__grid, " +
      ".process__head, .steps, .process__terms, .case, .formats > .h2, .formats__grid, " +
      ".faq > .h2, .faq__list, .contact__intro, .form"
    );
    const io = new IntersectionObserver((entries) => {
      for (const e of entries) {
        if (!e.isIntersecting) continue;
        e.target.classList.add("is-in");
        io.unobserve(e.target);
      }
    }, { rootMargin: "0px 0px -12% 0px" });
    for (const g of groups) {
      // Одиночный заголовок появляется сам, у группы — каждый ребёнок по очереди
      if (g.matches(".h2")) {
        g.setAttribute("data-reveal-self", "");
      } else {
        g.setAttribute("data-reveal", "");
        [...g.children].forEach((c, i) => c.style.setProperty("--i", Math.min(i, 6)));
      }
      io.observe(g);
    }
  }

  /* ---------- Кнопки форматов выбирают формат в заявке ---------- */
  const sample = document.querySelector("[data-sample]");
  if (sample && SAMPLE_URL) {
    sample.href = SAMPLE_URL;
    sample.setAttribute("download", "");
    sample.textContent = "Скачать пример инструкции";
    delete sample.dataset.format;
  }
  document.querySelectorAll("[data-format]").forEach((a) => {
    a.addEventListener("click", () => {
      const radio = document.querySelector(`.form input[name="format"][value="${a.dataset.format}"]`);
      if (radio) radio.checked = true;
    });
  });

  /* ---------- Заявка ---------- */
  const form = document.querySelector("[data-form]");
  if (form) {
    const status = form.querySelector(".form__status");
    const checksForm = {
      name: (v) => v.trim().length >= 2 || "Напишите, как к вам обращаться.",
      company: (v) => v.trim().length >= 2 || "Напишите название компании.",
      // Принимаем любой привычный формат: +7 (999) 123-45-67, 89991234567, 8 999 123 45 67
      phone: (v) => { const d = v.replace(/\D/g, ""); return (d.length >= 10 && d.length <= 15) || "Проверьте номер: в нём должно быть не меньше 10 цифр."; },
      consent: (_, el) => el.checked || "Без согласия мы не можем принять заявку.",
    };

    function check(el) {
      const rule = checksForm[el.name];
      if (!rule) return true;
      const res = rule(el.value, el);
      const err = document.getElementById(el.getAttribute("aria-describedby"));
      const ok = res === true;
      el.setAttribute("aria-invalid", String(!ok));
      if (err) { err.hidden = ok; err.textContent = ok ? "" : res; }
      return ok;
    }

    form.addEventListener("change", (e) => { if (e.target.getAttribute("aria-invalid")) check(e.target); });
    form.addEventListener("input", (e) => { if (e.target.getAttribute("aria-invalid") === "true") check(e.target); });

    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const fields = [...form.elements].filter((el) => checksForm[el.name]);
      const bad = fields.filter((el) => !check(el));
      if (bad.length) { bad[0].focus(); return; }

      const submit = form.querySelector(".form__submit");
      submit.disabled = true;
      status.textContent = "Отправляем…";
      const data = Object.fromEntries(new FormData(form));
      try {
        if (FORM_ENDPOINT) {
          const res = await fetch(FORM_ENDPOINT, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(data),
          });
          if (!res.ok) throw new Error(res.status);
        } else {
          await new Promise((r) => setTimeout(r, 900)); // имитация отправки
        }
        const done = document.createElement("div");
        done.className = "form__done";
        done.tabIndex = -1;
        done.innerHTML = '<h3 class="h3">Спасибо, заявка у нас</h3>' +
          '<p>Свяжемся с вами <span class="draft">в течение рабочего дня</span>, чтобы договориться о встрече.</p>';
        form.replaceWith(done);
        done.focus();
      } catch {
        submit.disabled = false;
        status.textContent = "Не получилось отправить. Попробуйте ещё раз или напишите нам на почту.";
      }
    });
  }
})();
