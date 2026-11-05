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
  // Свет без сферы: мягкий источник в тумане
  const LIGHT = sprite(512, [
    [0, "rgba(255,255,255,1)"],
    [0.035, "rgba(240,247,255,0.92)"],
    [0.12, "rgba(200,222,245,0.42)"],
    [0.3, "rgba(130,160,200,0.13)"],
    [0.6, "rgba(80,105,145,0.04)"],
    [1, "rgba(60,80,120,0)"],
  ]);
  // Ореол вокруг сферы: яркий у края и быстро гаснет
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

  // Свет ходит по истории страницы: data-light="x,y,сила" или "orb,сила" — тогда свет стоит за сферой секции
  const stops = [...document.querySelectorAll("[data-light]")].map((el) => {
    const parts = el.dataset.light.split(",");
    if (parts[0] === "orb") return { el, orb: el.querySelector(".orb"), k: Number(parts[1]) };
    const [x, y, k] = parts.map(Number);
    return { el, x, y, k };
  });
  const light = { x: 0.7, y: 0.45, k: 1, size: 0, halo: 0, locked: false, stop: null };
  const pointer = { x: 0, y: 0, tx: 0, ty: 0 };

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

  let last = 0;
  function frame(now, still) {
    const t = now * 0.001;
    const s = pickStop();
    const drift = still ? 0 : 1;
    if (s !== light.stop) { light.stop = s; light.locked = false; }

    let tx, ty, tsize, thalo;
    const orbRect = s.orb && s.orb.getBoundingClientRect();
    if (orbRect && orbRect.width > 0) {
      // Сфера статична: свет стоит ровно за ней, без дрейфа и параллакса
      const r = orbRect;
      tx = (r.left + r.width / 2) / innerWidth;
      ty = (r.top + r.height / 2) / innerHeight;
      tsize = Math.min(r.width * 3.1, Math.max(W, H) * 2.2) * SCALE;
      thalo = 1;
    } else {
      tx = (s.x ?? 0.5) + Math.sin(t * 0.11) * 0.09 * drift;
      ty = (s.y ?? 0.4) + Math.cos(t * 0.083) * 0.07 * drift;
      tsize = Math.min(W, H) * SCALE * (0.9 + 0.5 * s.k);
      thalo = 0;
    }

    // Переход между секциями плавный; у сферы свет «прилипает» и дальше идёт за ней без отставания
    const ease = still || light.locked ? 1 : 0.04;
    light.x += (tx - light.x) * ease;
    light.y += (ty - light.y) * ease;
    light.k += (s.k - light.k) * ease;
    light.size += (tsize - light.size) * (still ? 1 : 0.06);
    light.halo += (thalo - light.halo) * (still ? 1 : 0.05);
    if (orbRect && orbRect.width > 0 && Math.hypot(tx - light.x, ty - light.y) < 0.004) light.locked = true;
    pointer.x += (pointer.tx - pointer.x) * 0.03;
    pointer.y += (pointer.ty - pointer.y) * 0.03;

    const cw = canvas.width, ch = canvas.height, big = Math.max(cw, ch);
    ctx.globalCompositeOperation = "source-over";
    ctx.globalAlpha = 1;
    ctx.fillStyle = BG;
    ctx.fillRect(0, 0, cw, ch);

    const par = 1 - light.halo; // у сферы параллакса нет
    const lx = (light.x + pointer.x * 0.02 * par) * cw;
    const ly = (light.y + pointer.y * 0.02 * par) * ch;

    // Туман; у сферы расходится к краям, у мягкого света — гуще рядом с ним
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
      const boost = near * 1.6 * light.k * (1 - light.halo * 1.3);
      ctx.globalAlpha = clamp(p.alpha * (0.6 + boost), 0.03, 1);
      ctx.drawImage(FOG, px - size / 2, py - size / 2, size, size);
    }

    ctx.globalCompositeOperation = "lighter";
    const ls = light.size;
    if (light.halo < 1) {
      ctx.globalAlpha = 0.55 * light.k * (1 - light.halo);
      ctx.drawImage(LIGHT, lx - ls / 2, ly - ls / 2, ls, ls);
    }
    if (light.halo > 0) {
      ctx.globalAlpha = 0.6 * Math.min(light.k, 1.2) * light.halo;
      ctx.drawImage(HALO, lx - ls / 2, ly - ls / 2, ls, ls);
    }

    last = now;
    if (!still && motion) requestAnimationFrame(frame);
  }

  addEventListener("resize", resize, { passive: true });
  resize();
  if (motion) {
    requestAnimationFrame((n) => { last = n; frame(n); });
  } else {
    // Без движения: один кадр на каждое изменение прокрутки
    let queued = false;
    addEventListener("scroll", () => {
      if (queued) return;
      queued = true;
      requestAnimationFrame(() => { queued = false; frame(performance.now(), true); });
    }, { passive: true });
  }

  /* ---------- Сцена: сфера заливает экран светом, из неё проявляется лист ---------- */
  const scene = document.querySelector("[data-paper-scene]");
  if (scene && motion) {
    const orb = scene.querySelector(".paper__orb");
    const head = scene.querySelector(".paper__head");
    let queued = false;
    const update = () => {
      queued = false;
      const r = scene.getBoundingClientRect();
      const vh = innerHeight;
      const p = clamp(-r.top / Math.max(1, r.height - vh));
      const cover = Math.hypot(innerWidth, vh) / 160 * 1.06;
      const grow = clamp(p / 0.62);
      orb.style.setProperty("--s", (1 + (cover - 1) * grow ** 2.4).toFixed(3));
      orb.style.setProperty("--o", (1 - clamp((p - 0.12) / 0.34)).toFixed(3));
      head.style.setProperty("--h", clamp((p - 0.6) / 0.24).toFixed(3));
    };
    const request = () => { if (!queued) { queued = true; requestAnimationFrame(update); } };
    addEventListener("scroll", request, { passive: true });
    addEventListener("resize", request, { passive: true });
    update();
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
