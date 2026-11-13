/* HTDC: туман и сфера (WebGL), вступление, шапка, ситуации, сцена раскрытия, заявка. Без зависимостей.
   Один файл на все страницы: каждая часть включается, только если на странице есть её разметка. */

// Куда уходит заявка. Пока null, отправка имитируется.
const FORM_ENDPOINT = null;

(() => {
  "use strict";

  const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)");
  const root = document.documentElement;
  root.classList.add("js");
  const motion = !reduceMotion.matches && "IntersectionObserver" in window;
  if (motion) root.classList.add("motion");

  const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
  const smooth = (a, b, v) => { const t = clamp((v - a) / (b - a)); return t * t * (3 - 2 * t); };
  const mix = (a, b, t) => a + (b - a) * t;
  const $ = (q, el = document) => el.querySelector(q);
  const $$ = (q, el = document) => [...el.querySelectorAll(q)];

  /* ---------- Вступление: размеры ---------- */
  const intro = $("[data-intro]");
  const introStage = intro && $(".intro__stage", intro);
  const slides = intro ? $$("[data-slide]", intro) : [];
  let introTop = 0, introH = 1;
  const measureIntro = () => {
    if (!intro) return;
    introTop = intro.getBoundingClientRect().top + scrollY;
    introH = Math.max(1, introStage.offsetHeight);
  };
  measureIntro();

  /* ---------- Шапка: прозрачная над вступлением, меню на узком экране, текущий раздел ---------- */
  const nav = $(".nav");
  const navLinks = $(".nav__links");
  const navToggle = $(".nav__toggle");
  const syncNav = () => {
    const top = intro && motion ? scrollY < introTop + introH * slides.length - 96 : scrollY < 8;
    nav.toggleAttribute("data-top", top);
  };
  const setMenu = (open) => {
    nav.toggleAttribute("data-open", open);
    root.toggleAttribute("data-menu", open);
    navToggle.setAttribute("aria-expanded", String(open));
  };
  if (navToggle && navLinks) {
    navToggle.addEventListener("click", () => setMenu(navToggle.getAttribute("aria-expanded") !== "true"));
    navLinks.addEventListener("click", (e) => { if (e.target.closest("a")) setMenu(false); });
    addEventListener("keydown", (e) => {
      if (e.key === "Escape" && nav.hasAttribute("data-open")) { setMenu(false); navToggle.focus(); }
    });
    matchMedia("(min-width: 1101px)").addEventListener("change", () => setMenu(false));
  }

  // Ссылки шапки, которые ведут к блокам этой страницы: отмечаем ту, чей блок сейчас на экране
  const spy = navLinks ? $$('a[href^="#"]', navLinks)
    .map((a) => ({ a, el: document.getElementById(a.getAttribute("href").slice(1)) })).filter((s) => s.el) : [];
  const spyEnd = document.getElementById("contact");
  let spyCur = null;
  const syncSpy = () => {
    if (!spy.length) return;
    const line = innerHeight * 0.42;
    let cur = null;
    for (const s of spy) if (s.el.getBoundingClientRect().top <= line) cur = s;
    if (spyEnd && spyEnd.getBoundingClientRect().top <= line) cur = null;
    if (cur === spyCur) return;
    spyCur?.a.removeAttribute("aria-current");
    cur?.a.setAttribute("aria-current", "true");
    spyCur = cur;
  };

  /* =====================================================================
     Туман и сфера
     ---------------------------------------------------------------------
     Два WebGL-холста. Туман на весь экран, в треть разрешения: он размыт,
     разницы не видно, а пикселей в девять раз меньше. Сфера на отдельном
     небольшом холсте в полном разрешении; страница двигает и масштабирует
     его через transform.

     Сфера одна на всю страницу, и у неё есть сюжет. Во вступлении она
     проходит путь от размытого света за туманом до резкой сферы. Дальше
     у якорей ([data-anchor]) она собирается в слоте, между ними уходит в
     мягкий свет. Мягкий свет не привязан к середине страницы: он встаёт
     в отмеченные места ([data-light]) и за отмеченный чекбокс.

     Цель (где быть и какой быть) считается от прокрутки, поэтому обратный
     скролл проигрывает всё обратно. Когда цель меняется скачком (другой
     якорь, другое место света), сфера не прыгает, а перелетает.

     Движение внутри: поверхность и глубина сферы вращаются вокруг
     наклонённой оси, быстрее при прокрутке; туман течёт, клубится и
     закручивается вокруг сферы; по событиям от неё расходится волна света.
     ===================================================================== */

  const NOISE = `
    float hash(vec2 p) {
      p = fract(p * vec2(123.34, 456.21));
      p += dot(p, p + 45.32);
      return fract(p.x * p.y);
    }
    float vnoise(vec2 p) {
      vec2 i = floor(p), f = fract(p);
      vec2 u = f * f * (3.0 - 2.0 * f);
      return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x),
                 mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
    }
    float fbm(vec2 p) {
      float a = 0.5, s = 0.0;
      for (int i = 0; i < 4; i++) { s += a * vnoise(p); p = p * 2.03 + vec2(17.1, 9.2); a *= 0.5; }
      return s;
    }
    mat2 rot(float a) { float c = cos(a), s = sin(a); return mat2(c, -s, s, c); }
    // Ближний слой тумана. Общий для фона и для сферы: p в экранных CSS-пикселях
    float nearFog(vec2 p, float t, float scroll, float unit) {
      vec2 q = (p + vec2(0.0, scroll * 0.5)) / unit;
      return smoothstep(0.42, 0.9, fbm(q * 2.4 + vec2(t * 0.06, -t * 0.022)));
    }
  `;

  const VERT = `
    attribute vec2 a;
    varying vec2 vUv;
    void main() { vUv = a * 0.5 + 0.5; gl_Position = vec4(a, 0.0, 1.0); }
  `;

  const PRECISION = `
    #ifdef GL_FRAGMENT_PRECISION_HIGH
    precision highp float;
    #else
    precision mediump float;
    #endif
  `;

  const FOG_FRAG = PRECISION + `
    varying vec2 vUv;
    uniform vec2 uRes;        // размер холста в CSS-пикселях
    uniform float uTime;      // время тумана: идёт быстрее на беспокойных экранах и при прокрутке
    uniform float uScroll, uUnit;
    uniform float uDensity;   // плотность тумана в текущей части страницы
    uniform float uClear;     // насколько туман расступается вокруг сферы
    uniform vec3 uSphere;     // центр (x, y) и радиус сферы, CSS-пиксели
    uniform float uFocus;     // 1: сфера резкая (её рисует второй холст), 0: мягкий свет
    uniform float uGlow;      // сила света
    uniform vec2 uShift;      // параллакс от курсора, пиксели
    uniform float uBoil;      // клубление
    uniform float uSwirl;     // закручивание вокруг сферы
    uniform float uSpin;      // угол поворота лучей
    uniform vec3 uWave;       // волна света: радиус, ширина (пиксели) и сила
    ${NOISE}
    float midLayer(vec2 q, float t, float far, vec2 boil) {
      return fbm(q * 1.7 + vec2(-t * 0.04, t * 0.016) + far * 0.6 + boil);
    }
    void main() {
      vec2 p = vec2(vUv.x, 1.0 - vUv.y) * uRes;
      vec2 pp = p + uShift;
      float t = uTime;

      vec2 sv = p - uSphere.xy;
      float R = max(uSphere.z, 1.0);
      float dist = length(sv) / R;

      // Три слоя на разной глубине: дальний почти стоит, ближний едет за прокруткой
      vec2 qf = (pp * 0.6 + vec2(0.0, uScroll * 0.10)) / uUnit;
      float far = fbm(qf * 0.9 + vec2(t * 0.018, 0.0));

      // Средний слой клубится и идёт по кругу вокруг сферы. Круговое течение собрано из двух
      // проходов со сдвигом по фазе: каждый поворачивается всё дальше и сменяется, пока не виден
      vec2 c = uSphere.xy + uShift;
      float w = uSwirl / (1.0 + dist * dist * 0.05);
      float ph = fract(t * 0.07);
      float ph2 = fract(ph + 0.5);
      vec2 q1 = (c + rot(w * (ph - 0.5)) * (pp - c)) * 0.8;
      vec2 q2 = (c + rot(w * (ph2 - 0.5)) * (pp - c)) * 0.8;
      vec2 drift = vec2(0.0, uScroll * 0.25) / uUnit;
      vec2 bq = pp / uUnit * 1.1;
      vec2 boil = uBoil * 0.55 * (vec2(vnoise(bq + vec2(0.0, t * 0.17)), vnoise(bq + vec2(7.3, -t * 0.14))) - 0.5);
      float mid = mix(midLayer(q1 / uUnit + drift, t, far, boil), midLayer(q2 / uUnit + drift + 3.7, t, far, boil), abs(ph * 2.0 - 1.0));
      float near = nearFog(pp, t, uScroll, uUnit);

      float body = smoothstep(0.32, 0.74, far * 0.55 + mid * 0.45);
      float y = p.y / uRes.y;
      float dens = (0.16 + body * 0.8 + near * 0.5) * uDensity * mix(0.7, 1.25, y * y); // лёгкая дымка везде, гуще понизу
      dens *= mix(1.0, smoothstep(0.9, 3.4, dist), uClear);
      dens = min(dens, 1.2);

      vec3 col = vec3(0.0235, 0.0314, 0.051);
      col += vec3(0.135, 0.180, 0.265) * dens;

      // Свет сферы: широкое рассеяние в тумане, лучи идут по кругу, плотный ореол у края,
      // мягкое ядро без фокуса, по которому проходят клочья ближнего тумана
      vec2 dir = sv / max(length(sv), 1.0);
      float rays = smoothstep(0.25, 0.85, fbm(rot(uSpin * 0.35) * dir * 2.6 + vec2(t * 0.02, -t * 0.012)));
      rays = mix(0.5, rays, smoothstep(0.6, 2.6, dist));   // у самого центра лучи сливаются в ровный свет
      float fall = 1.0 / (1.0 + dist * dist * 0.5);
      float halo = exp(-max(dist - 1.0, 0.0) * 2.4);
      float core = exp(-dist * dist * 1.25) * (1.0 - uFocus) * (1.0 - 0.42 * near);
      vec3 lightCol = vec3(0.78, 0.88, 1.0);
      float lit = fall * (0.05 + dens * 0.30) * (0.5 + 1.0 * rays)
                + halo * 0.30 * uFocus * (0.65 + 0.35 * rays)
                + core * 0.85;
      col += lightCol * uGlow * lit;

      // Волна: кольцо света расходится от сферы и подсвечивает туман, через который идёт
      float ring = exp(-pow((length(sv) - uWave.x) / max(uWave.y, 1.0), 2.0)) * uWave.z;
      col += lightCol * ring * (0.05 + dens * 0.32);

      vec2 cc = vUv - 0.5;
      col *= 1.0 - dot(cc, cc) * 0.5;                                  // виньетка
      col += (hash(gl_FragCoord.xy + fract(t) * 61.0) - 0.5) / 255.0 * 1.6; // дизеринг против полос
      gl_FragColor = vec4(col, 1.0);
    }
  `;

  const SPHERE_FRAG = PRECISION + `
    varying vec2 vUv;
    uniform float uTime, uScroll, uUnit, uDensity;
    uniform float uClock;     // настоящее время, секунды: дыхание и кипение
    uniform float uSpin;      // угол поворота поверхности
    uniform float uBoil;      // насколько беспокойно внутри
    uniform float uFocus;     // резкость края
    uniform float uTurb;      // насколько видны внутренние слои
    uniform float uGlass;     // «стекло»: ярче кромка, свет проходит насквозь
    uniform float uFlat;      // 1: сфера стала ровным светлым листом
    uniform float uPulse;     // дыхание ядра
    uniform float uAlpha;
    uniform vec2 uLight;      // сдвиг источника света от курсора
    uniform vec2 uOrigin;     // левый верхний угол холста на экране, CSS-пиксели
    uniform float uSize;      // сторона холста на экране, CSS-пиксели
    uniform vec2 uShift;
    ${NOISE}
    float hash3(vec3 p) {
      p = fract(p * 0.3183099 + vec3(0.71, 0.113, 0.419));
      p *= 17.0;
      return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
    }
    float vnoise3(vec3 p) {
      vec3 i = floor(p), f = fract(p);
      vec3 u = f * f * (3.0 - 2.0 * f);
      return mix(mix(mix(hash3(i), hash3(i + vec3(1.0, 0.0, 0.0)), u.x),
                     mix(hash3(i + vec3(0.0, 1.0, 0.0)), hash3(i + vec3(1.0, 1.0, 0.0)), u.x), u.y),
                 mix(mix(hash3(i + vec3(0.0, 0.0, 1.0)), hash3(i + vec3(1.0, 0.0, 1.0)), u.x),
                     mix(hash3(i + vec3(0.0, 1.0, 1.0)), hash3(i + vec3(1.0, 1.0, 1.0)), u.x), u.y), u.z);
    }
    float fbm3(vec3 p) {
      float a = 0.5, s = 0.0;
      for (int i = 0; i < 3; i++) { s += a * vnoise3(p); p = p * 2.03 + vec3(17.1, 9.2, 3.7); a *= 0.5; }
      return s / 0.875;
    }
    void main() {
      vec2 st = vec2(vUv.x, 1.0 - vUv.y);          // 0..1, y вниз
      vec2 uv = (st * 2.0 - 1.0) / 0.8;            // радиус сферы = 1, поле вокруг оставлено под ореол
      float r = length(uv);
      float soft = mix(0.5, 0.012, uFocus);
      float mask = 1.0 - smoothstep(1.0 - soft, 1.0 + soft * 0.3, r);
      float z = sqrt(max(1.0 - min(r * r, 1.0), 0.0));
      vec3 n = normalize(vec3(uv, z + 0.0001));

      vec3 L = normalize(vec3(-0.50 + uLight.x, -0.62 + uLight.y, 0.62));
      float ndl = dot(n, L);
      float wrap = clamp((ndl + 0.45) / 1.45, 0.0, 1.0);

      // Поверхность: шум взят в точке на шаре и вращается вокруг наклонённой оси, поэтому
      // облака уходят за край, как на настоящем шаре. Вытянут вдоль широты: вращение читается
      vec3 s1 = n;
      s1.xy = rot(0.42) * s1.xy;
      s1.xz = rot(uSpin) * s1.xz;
      vec3 seethe = uBoil * 0.24 * vec3(sin(uClock * 0.9 + s1.y * 4.0), sin(uClock * 0.7 + s1.z * 4.0 + 1.7), sin(uClock * 0.8 + s1.x * 4.0 + 3.1));
      float c1 = fbm3(s1 * vec3(1.5, 2.7, 1.5) + seethe);
      // Глубина: внутренняя оболочка крупнее и идёт навстречу, вокруг другой оси
      vec2 iu = uv * 0.62;
      vec3 s2 = vec3(iu, sqrt(max(1.0 - dot(iu, iu), 0.0)));
      s2.xy = rot(-0.7) * s2.xy;
      s2.xz = rot(-uSpin * 0.62 + 1.3) * s2.xz;
      float c2 = fbm3(s2 * 2.5 + 7.3 + seethe * 1.5);
      float clouds = (c1 - 0.5) * 1.15 + (c2 - 0.5) * 0.8;

      vec3 deep = vec3(0.19, 0.28, 0.46), midc = vec3(0.50, 0.64, 0.83), pale = vec3(0.85, 0.92, 0.99);
      vec3 col = mix(deep, midc, smoothstep(0.0, 0.55, wrap));
      col = mix(col, pale, smoothstep(0.42, 0.96, wrap));
      col += clouds * uTurb * vec3(0.30, 0.32, 0.34) * (0.35 + wrap);

      // Стекло: тело темнеет и становится прозрачным, внутри видны светящиеся волокна и своё ядро
      float fil = smoothstep(-0.22, 0.42, clouds);
      vec3 glass = mix(vec3(0.06, 0.10, 0.19), vec3(0.46, 0.62, 0.86), fil * (0.55 + 0.45 * wrap));
      glass += vec3(0.9, 0.95, 1.0) * exp(-dot(uv, uv) * 5.5) * 0.75;
      col = mix(col, glass, uGlass * 0.62);

      // Светящееся ядро, смещено к источнику света и дышит
      float breath = 1.0 + sin(uClock * 0.9) * 0.11 * uPulse;
      vec2 cu = uv - L.xy * 0.28;
      float core = exp(-dot(cu, cu) * mix(3.0, 4.6, uGlass)) * breath;
      col = mix(col, vec3(1.0), clamp(core * mix(0.8, 0.5, uGlass), 0.0, 1.0));

      // Объём: тень на дальней стороне, кромка-атмосфера, блик
      col *= mix(0.70, 1.0, smoothstep(-0.55, 0.35, ndl));
      float fres = pow(1.0 - z, 2.6);
      col += vec3(0.60, 0.77, 1.0) * fres * (0.26 + 0.5 * uGlass) * (0.5 + 0.5 * wrap) * (0.9 + 0.1 * breath);
      float through = pow(max(dot(n.xy, -L.xy), 0.0), 3.0) * fres;   // свет, прошедший сквозь стекло
      col += vec3(0.75, 0.87, 1.0) * through * uGlass * 0.9;
      vec3 hv = normalize(L + vec3(0.0, 0.0, 1.0));
      col += pow(max(dot(n, hv), 0.0), 56.0) * 0.32;

      // Ближний слой тумана проходит поверх сферы
      vec2 screen = uOrigin + st * uSize + uShift;
      float veil = nearFog(screen, uTime, uScroll, uUnit) * uDensity * (1.0 - uFlat);
      col = mix(col, vec3(0.50, 0.60, 0.76) * (0.6 + 0.4 * wrap), veil * 0.34);

      col = mix(col, vec3(0.875, 0.894, 0.922), uFlat);

      // Тонкая атмосфера сразу за краем
      float atm = exp(-max(r - 1.0, 0.0) * 16.0) * 0.55 * uFocus * (1.0 - uFlat);
      float a = mask + atm * (1.0 - mask);
      vec3 outc = col * mask + vec3(0.72, 0.85, 1.0) * atm * (1.0 - mask);
      gl_FragColor = vec4(outc, a) * uAlpha;
    }
  `;

  function program(canvas, frag, alpha) {
    const gl = canvas.getContext("webgl", {
      alpha, premultipliedAlpha: true, antialias: false, depth: false, stencil: false,
      powerPreference: "low-power",
    });
    if (!gl) return null;
    const shader = (type, src) => {
      const s = gl.createShader(type);
      gl.shaderSource(s, src);
      gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
      return s;
    };
    const prog = gl.createProgram();
    gl.attachShader(prog, shader(gl.VERTEX_SHADER, VERT));
    gl.attachShader(prog, shader(gl.FRAGMENT_SHADER, frag));
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog));
    gl.useProgram(prog);
    gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(prog, "a");
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    const uniforms = {};
    return {
      set(name, ...v) {
        const u = uniforms[name] ?? (uniforms[name] = gl.getUniformLocation(prog, name));
        if (v.length === 1) gl.uniform1f(u, v[0]);
        else if (v.length === 2) gl.uniform2f(u, v[0], v[1]);
        else gl.uniform3f(u, v[0], v[1], v[2]);
      },
      size(w, h) {
        if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
        gl.viewport(0, 0, w, h);
      },
      draw() { gl.drawArrays(gl.TRIANGLES, 0, 3); },
    };
  }

  const fogCanvas = $(".fog");
  const sphereCanvas = $(".sphere");
  const backdrop = Boolean(fogCanvas && sphereCanvas);
  let fog = null, orb = null;
  if (backdrop) {
    try {
      fog = program(fogCanvas, FOG_FRAG, false);
      orb = program(sphereCanvas, SPHERE_FRAG, true);
    } catch (err) {
      console.warn("HTDC: шейдеры не собрались, включён простой фон.", err);
      fog = orb = null;
    }
    // Потерянный контекст проще всего вернуть перезагрузкой холстов
    for (const c of [fogCanvas, sphereCanvas]) {
      c.addEventListener("webglcontextlost", (e) => e.preventDefault());
      c.addEventListener("webglcontextrestored", () => location.reload());
    }
  }
  const gl = Boolean(fog && orb);
  root.classList.toggle("no-gl", backdrop && !gl);

  const BASE = 600;                 // размер холста сферы в CSS
  const BOX = gl ? 1.25 : 1;        // холст шире сферы: место под размытый край и атмосферу

  // Характер сферы и тумана вокруг неё.
  //   turb, glass, glow, pulse: как выглядит сфера
  //   focus: предел резкости (0: только свет за туманом, 1: резкая сфера)
  //   spin, boil: скорость вращения и беспокойство внутри
  //   flow, swirl: скорость тумана и закручивание вокруг сферы
  //   sway: блуждание вокруг слота; pull: тяга к курсору (минус: уходит от него)
  //   air: плотность тумана и просвет вокруг сферы на экранах вступления
  const KEYS = ["turb", "glass", "glow", "pulse", "focus", "spin", "boil", "flow", "swirl", "sway", "pull"];
  const KINDS = {
    haze:    { turb: 0.8,  glass: 0.3,  glow: 0.5,  pulse: 0.4, focus: 0,    spin: 0.08, boil: 0.35, flow: 1.0, swirl: 0.35, sway: 0,    pull: 0 },
    // Вступление: неведомое прячется в тумане и уходит от курсора, беспокойный «человеческий фактор»
    // приближается, ресурс собирается в резкую сферу и идёт за курсором
    unknown: { turb: 0.9,  glass: 0.2,  glow: 0.62, pulse: 0.9, focus: 0,    spin: 0.05, boil: 1.0,  flow: 1.8, swirl: 0.6,  sway: 1.0,  pull: -1,   air: [1.3, 0] },
    factor:  { turb: 1.35, glass: 0.4,  glow: 0.85, pulse: 0.8, focus: 0.55, spin: 0.62, boil: 1.0,  flow: 2.1, swirl: 1.5,  sway: 0.45, pull: -0.3, air: [1.05, 0.3] },
    source:  { turb: 0.95, glass: 0.75, glow: 1.25, pulse: 0.5, focus: 1,    spin: 0.2,  boil: 0.2,  flow: 0.8, swirl: 1.0,  sway: 0.05, pull: 1,    air: [0.7, 1] },
    pearl:   { turb: 0.8,  glass: 0.24, glow: 1.0,  pulse: 0.6, focus: 1,    spin: 0.14, boil: 0.15, flow: 1.0, swirl: 0.6,  sway: 0.04, pull: 0.35, air: [0.8, 0.5] },
    guide:   { turb: 0.75, glass: 0.55, glow: 0.8,  pulse: 1.0, focus: 1,    spin: 0.36, boil: 0.25, flow: 1.0, swirl: 0.6,  sway: 0,    pull: 0 },      // указатель у строки
    lens:    { turb: 1.0,  glass: 1.0,  glow: 1.15, pulse: 0.3, focus: 1,    spin: 0.17, boil: 0.4,  flow: 0.9, swirl: 1.1,  sway: 0,    pull: 0 },      // «что смотрим»: стекло, слои видны
    sheet:   { turb: 0.5,  glass: 0.25, glow: 0.9,  pulse: 0.3, focus: 1,    spin: 0.1,  boil: 0.1,  flow: 1.0, swirl: 0.35, sway: 0,    pull: 0 },      // перед листом: ровнеет и растёт
    beacon:  { turb: 0.8,  glass: 0.55, glow: 0.8,  pulse: 1.0, focus: 1,    spin: 0.26, boil: 0.3,  flow: 1.1, swirl: 0.7,  sway: 0,    pull: 0 },      // у формы: небольшая, дышит
  };
  const look = { ...KINDS[slides.length && motion ? "unknown" : "haze"] };
  const introKind = { ...KINDS.unknown };
  const introAir = { fog: 1, clear: 0 };

  const sections = $$("main > section, .footer").map((el) => ({
    el, fog: Number(el.dataset.fog ?? 0.2), clear: Number(el.dataset.clear ?? 0),
  }));
  const allAnchors = $$("[data-anchor]");
  // С движением слоты вступления ведёт прокрутка, а не близость к центру экрана
  const introSlots = motion && intro ? slides.map((s) => $("[data-anchor]", s)) : [];
  const anchors = allAnchors.filter((el) => !introSlots.includes(el));
  const lights = $$("[data-light]");
  const pointer = { x: 0, y: 0, tx: 0, ty: 0 };
  const aim = { x: 0, y: 0, tx: 0, ty: 0 };              // куда повёрнут свет линзы
  const paper = { el: $(".paper__orb"), stage: $(".paper__stage"), fill: 0 };
  const spot = { el: null };                             // отмеченный чекбокс, за который встаёт свет
  const cur = { x: 0, y: 0, d: 60, focus: 0, alpha: 0, glow: 0.5 };
  const off = { x: 0, y: 0, d: 0, focus: 0, alpha: 0, glow: 0 };
  const FIELDS = Object.keys(cur);
  const wave = { t: -100, amp: 0 };
  let srcKey = null, forced = null, guideRow = null;
  let last = 0, clock = 12, fogT = 12, spin = 0, speed = 0, bump = 0, lastY = scrollY;

  // Волна света от сферы и короткий толчок: ярче, чуть крупнее, быстрее вращение
  function pulse(strength = 1) {
    if (!motion) return;
    wave.t = clock; wave.amp = strength;
    bump = Math.max(bump, strength);
  }

  addEventListener("pointermove", (e) => {
    if (e.pointerType !== "mouse") return;
    pointer.tx = e.clientX / innerWidth - 0.5;
    pointer.ty = e.clientY / innerHeight - 0.5;
  }, { passive: true });

  function sizeCanvases() {
    if (!gl) return;
    const w = fogCanvas.clientWidth, h = fogCanvas.clientHeight;
    const px = w < 700 ? 2.5 : 3;
    fog.size(Math.ceil(w / px), Math.ceil(h / px));
    const dpr = Math.min(devicePixelRatio || 1, 2);
    const biggest = Math.max(160, ...allAnchors.map((el) => el.offsetWidth));
    const side = Math.round(clamp(biggest * BOX * dpr, 256, 1024));
    orb.size(side, side);
  }

  // Плотность тумана: среднее по секциям, взвешенное тем, сколько каждой видно на экране
  function atmosphere(vh) {
    let fogSum = 0, clearSum = 0, total = 0;
    for (const s of sections) {
      const r = s.el.getBoundingClientRect();
      const seen = Math.min(r.bottom, vh) - Math.max(r.top, 0);
      if (seen <= 0) continue;
      const own = introSlots.length && s.el === intro;
      fogSum += (own ? introAir.fog : s.fog) * seen;
      clearSum += (own ? introAir.clear : s.clear) * seen;
      total += seen;
    }
    return total ? { density: fogSum / total, clear: clearSum / total } : { density: 0.5, clear: 0 };
  }

  const place = (el) => {
    const r = el.getBoundingClientRect();
    return { cx: r.left + r.width / 2, cy: r.top + r.height / 2, d: r.width, top: r.top, bottom: r.bottom, h: r.height };
  };

  // Где сфере собраться и насколько: e = 1, когда слот у середины экрана
  function pickTarget(vh) {
    let best = null;
    if (introSlots.length) {
      const sr = introStage.getBoundingClientRect();
      if (sr.bottom > 0) {
        // Между экранами вступления слот, характер и воздух плавно перетекают по прокрутке
        const n = introSlots.length;
        const p = clamp((scrollY - introTop) / introH, 0, n - 1);
        const i = Math.min(n - 2, Math.floor(p)), f = smooth(0.1, 0.9, p - i);
        const A = place(introSlots[i]), B = place(introSlots[i + 1]);
        const ka = KINDS[introSlots[i].dataset.anchor], kb = KINDS[introSlots[i + 1].dataset.anchor];
        for (const key of KEYS) introKind[key] = mix(ka[key], kb[key], f);
        introAir.fog = mix(ka.air[0], kb.air[0], f);
        introAir.clear = mix(ka.air[1], kb.air[1], f);
        best = { key: "intro", el: null, kind: introKind, cx: mix(A.cx, B.cx, f), cy: mix(A.cy, B.cy, f), d: mix(A.d, B.d, f),
          e: 1 - smooth(vh * 0.08, vh * 0.7, -sr.top) };
      }
    }
    for (let i = 0; i < anchors.length; i++) {
      const el = anchors[i];
      if (!el.offsetWidth) continue;
      const r = place(el);
      const away = Math.abs(r.cy - vh / 2);
      let e;
      if (motion) e = 1 - smooth(vh * 0.14, vh * 0.85, away);
      // Без движения сфера просто стоит в слоте, ближайшем к середине экрана
      else e = r.bottom > -r.h && r.top < vh + r.h ? 1 - away / (vh * 40) : 0;
      if (el === forced && e > 0.3) e = 1.001;           // строка под курсором зовёт сферу к себе
      if (e > 0 && (!best || e > best.e)) best = { key: "a" + i, el, kind: KINDS[el.dataset.anchor] ?? KINDS.pearl, cx: r.cx, cy: r.cy, d: r.d, e: Math.min(e, 1) };
    }
    return best && best.e > 0 ? best : null;
  }

  // Мягкий свет между якорями. По умолчанию держится осевой линии страницы, где нет текста
  // (на телефоне уходит в угол под шапку), но встаёт в отмеченные места, когда они на экране
  function haze(vw, vh, wide) {
    if (spot.el) {
      const r = spot.el.getBoundingClientRect();
      if (r.bottom > 0 && r.top < vh) return { x: r.left + r.width / 2, y: r.top + r.height / 2, d: wide ? 56 : 42, glow: 0.62, key: "spot" };
      spot.el = null;
    }
    let x = wide ? vw / 2 + Math.sin(clock * 0.21) * 6 : vw * 0.86;
    let y = wide ? vh * (0.42 + Math.sin(clock * 0.13) * 0.05) : 104 + Math.sin(clock * 0.13) * 8;
    let d = wide ? clamp(vw * 0.045, 44, 68) : 36;
    let glow = wide ? 0.5 : 0.26;
    let key = "axis", best = null, bw = 0;
    for (let i = 0; i < lights.length; i++) {
      const r = lights[i].getBoundingClientRect();
      if (!r.width && !r.height) continue;
      const ly = r.top + r.height / 2;
      const w = 1 - smooth(vh * 0.14, vh * 0.44, Math.abs(ly - vh * 0.5));
      if (w > bw) { bw = w; best = { i, x: lights[i].dataset.light === "end" ? r.right : r.left + r.width / 2, y: ly }; }
    }
    if (best) {
      x = mix(x, best.x, bw); y = mix(y, best.y, bw);
      d = mix(d, wide ? 50 : 30, bw); glow = mix(glow, wide ? 0.56 : 0.34, bw);
      key = "light" + best.i;
    }
    return { x, y, d, glow, key };
  }

  let introRender = null;   // вступление перерисовывает свои экраны в общем кадре

  function frame(now, once) {
    const still = once === true || !motion;
    const dt = still ? 0 : clamp((now - last) / 1000, 0, 0.05);
    last = now;
    if (motion) clock = now * 0.001;
    const vw = innerWidth, vh = innerHeight;
    const wide = vw >= 860;

    pointer.x += (pointer.tx - pointer.x) * 0.04;
    pointer.y += (pointer.ty - pointer.y) * 0.04;
    aim.x += (aim.tx - aim.x) * 0.05;
    aim.y += (aim.ty - aim.y) * 0.05;

    if (introRender) introRender();

    // Скорость прокрутки раскручивает сферу и подгоняет туман; по направлению скролла
    const sy = scrollY;
    const vel = dt > 0 ? (sy - lastY) / dt : 0;
    lastY = sy;
    speed += (clamp(vel / 1500, -3, 3) - speed) * (still ? 1 : 0.1);

    const a = pickTarget(vh);
    const e = a ? a.e : 0;
    const kind = a ? a.kind : KINDS.haze;
    const ease = still ? 1 : 1 - Math.exp(-dt / 0.3);
    for (const key of KEYS) look[key] += (kind[key] - look[key]) * ease;

    bump *= Math.exp(-dt / 0.55);
    spin += dt * (look.spin + speed * 0.9 + bump * 1.5);
    fogT += dt * (look.flow + Math.abs(speed) * 1.3 + bump * 0.6);

    // Строка, у которой стоит сфера-указатель
    const row = a && a.el && e > 0.35 ? a.el.closest("[data-guide]") : null;
    if (row !== guideRow) {
      guideRow?.classList.remove("is-on");
      row?.classList.add("is-on");
      if (row && guideRow) pulse(0.3);
      guideRow = row;
    }

    // Цель. Положение держится за слотом дольше, чем резкость: сфера сначала уезжает вместе с ним, потом растворяется
    const hz = haze(vw, vh, wide);
    const ep = smooth(0, 0.6, e);
    const goal = {
      x: a ? mix(hz.x, a.cx, ep) : hz.x,
      y: a ? mix(hz.y, a.cy, ep) : hz.y,
      d: a ? mix(hz.d, a.d, e) : hz.d,
      focus: smooth(0.45, 0.95, e) * kind.focus,
      alpha: smooth(0.15, 0.6, e) * smooth(0.04, 0.3, kind.focus),
      glow: mix(hz.glow, kind.glow, smooth(0, 0.8, e)),
    };
    // Сменился якорь или место света: остаток пути сфера пролетает сама, а не прыгает
    const key = (a ? a.key : "") + "|" + hz.key;
    if (key !== srcKey) {
      if (srcKey !== null && !still) for (const f of FIELDS) off[f] = cur[f] - goal[f];
      srcKey = key;
    }
    const keep = still ? 0 : Math.exp(-dt / 0.26);
    for (const f of FIELDS) { off[f] *= keep; cur[f] = goal[f] + off[f]; }

    // Блуждание и тяга к курсору у слота, дыхание размера
    const dock = motion ? smooth(0.3, 0.9, e) : 0;   // без движения сфера стоит ровно в слоте
    const sway = look.sway * dock * cur.d;
    const cx = cur.x + (Math.sin(clock * 0.31) * 0.2 + Math.sin(clock * 0.73 + 1.3) * 0.08) * sway + look.pull * dock * pointer.x * 60;
    const cy = cur.y + (Math.cos(clock * 0.23) * 0.16 + Math.sin(clock * 0.57 + 0.4) * 0.07) * sway + look.pull * dock * pointer.y * 44;
    const d = cur.d * (1 + Math.sin(clock * 0.9) * 0.014 * look.pulse * dock + bump * 0.05);
    const focus = clamp(cur.focus), alpha = clamp(cur.alpha);
    const sheet = a && a.el && a.el === paper.el ? paper.fill * e : 0;
    const glow = cur.glow * (1 - sheet * 0.92) * (1 + bump * 0.45);

    // Холст сферы: страница только двигает и масштабирует его
    const side = d * BOX;
    const ox = cx - side / 2, oy = cy - side / 2;
    const covered = sheet >= 1 && paper.stage?.hasAttribute("data-filled");
    const visible = alpha > 0.01 && !covered && ox < vw && oy < vh && ox + side > 0 && oy + side > 0;
    sphereCanvas.style.transform = `translate3d(${ox.toFixed(1)}px, ${oy.toFixed(1)}px, 0) scale(${(side / BASE).toFixed(4)})`;
    sphereCanvas.style.visibility = visible ? "visible" : "hidden";
    if (!gl) sphereCanvas.style.opacity = (alpha * (1 - sheet)).toFixed(3);

    if (gl) {
      const air = atmosphere(vh);
      const unit = clamp(Math.min(vw, vh) * 1.1, 520, 1100);
      const scroll = motion ? sy : 0;
      const shiftX = pointer.x * 18, shiftY = pointer.y * 12;
      const age = clock - wave.t;
      const waveAmp = age < 3.2 ? wave.amp * Math.exp(-age * 1.5) : 0;

      fog.set("uRes", fogCanvas.clientWidth, fogCanvas.clientHeight);
      fog.set("uTime", fogT);
      fog.set("uScroll", scroll);
      fog.set("uUnit", unit);
      fog.set("uDensity", air.density);
      fog.set("uClear", air.clear * smooth(0.2, 0.9, e));
      fog.set("uSphere", cx, cy, d / 2);
      fog.set("uFocus", focus);
      fog.set("uGlow", glow);
      fog.set("uShift", shiftX, shiftY);
      fog.set("uBoil", look.boil);
      fog.set("uSwirl", look.swirl * (0.35 + 0.65 * smooth(0.3, 0.9, e)));
      fog.set("uSpin", spin);
      fog.set("uWave", d / 2 + age * Math.max(vw, vh) * 0.36, 28 + age * 80, waveAmp);
      fog.draw();

      if (visible) {
        orb.set("uTime", fogT);
        orb.set("uClock", clock);
        orb.set("uScroll", scroll);
        orb.set("uUnit", unit);
        orb.set("uDensity", air.density);
        orb.set("uSpin", spin);
        orb.set("uBoil", look.boil);
        orb.set("uFocus", focus);
        orb.set("uTurb", look.turb);
        orb.set("uGlass", look.glass);
        orb.set("uFlat", sheet);
        orb.set("uPulse", look.pulse);
        orb.set("uAlpha", alpha);
        orb.set("uLight", pointer.x * 0.35 + aim.x * 0.5, pointer.y * 0.35 + aim.y * 0.5);
        orb.set("uOrigin", ox, oy);
        orb.set("uSize", side);
        orb.set("uShift", shiftX, shiftY);
        orb.draw();
      }
    }

    if (!still) requestAnimationFrame(frame);
  }

  /* ---------- Сцена: сфера заливает экран светом, из неё проявляется лист ---------- */
  const scene = $("[data-paper-scene]");
  const updateScene = () => {
    if (!scene || !motion) return;
    const head = $(".paper__head", scene);
    const r = scene.getBoundingClientRect();
    const vh = innerHeight;
    const p = clamp(-r.top / Math.max(1, r.height - vh));
    const cover = Math.hypot(innerWidth, vh) / 160 * 1.06;
    const grow = clamp(p / 0.62);
    paper.el.style.setProperty("--s", (1 + (cover - 1) * grow ** 2.4).toFixed(3));
    paper.fill = clamp((p - 0.12) / 0.34);
    head.style.setProperty("--h", clamp((p - 0.6) / 0.24).toFixed(3));
    // Когда свет залил экран, лист держит фон сам, и сфера может уходить
    paper.stage.toggleAttribute("data-filled", p > 0.97);
  };

  /* ---------- Вступление: экраны по прокрутке, доводка до экрана, автолистание ----------
     Прокрутка остаётся обычной. Когда она остановилась между экранами, страница сама доезжает
     до следующего в ту сторону, куда шли. Пока посетитель ничего не трогает, экраны листаются
     сами: у каждого своё время (data-hold), оно видно по полоске. Любое действие это отключает. */
  function setupIntro() {
    const n = slides.length;
    const ui = $("[data-intro-ui]", intro);
    const dots = $$("[data-go]", ui), play = $("[data-play]", ui), next = $("[data-next]", ui);
    const texts = slides.map((s) => $(".slide__text", s));
    let anim = null, auto = scrollY < 4 && !location.hash, autoStep = -1, timer = 0, idle = 0;
    let restY = scrollY, touching = false, step = -1, lastP = -1;

    const stepY = (i) => introTop + i * introH;
    const pos = () => (scrollY - introTop) / introH;

    introRender = () => {
      const p = clamp(pos(), 0, n - 1);
      if (p === lastP) return;
      lastP = p;
      for (let i = 0; i < n; i++) {
        const dist = p - i;
        const o = 1 - smooth(0.14, 0.44, Math.abs(dist));
        texts[i].style.setProperty("--o", o.toFixed(3));
        texts[i].style.setProperty("--d", dist.toFixed(3));
        texts[i].style.filter = o > 0.999 ? "none" : "";     // стоящий текст остаётся резким
        slides[i].classList.toggle("is-on", o > 0.5);
      }
      const i = Math.round(p);
      if (i === step) return;
      if (step >= 0 && slides[i].classList.contains("slide--source")) pulse(0.9);   // сфера собралась
      step = i;
      dots.forEach((dot, k) => {
        if (k === i) dot.setAttribute("aria-current", "true"); else dot.removeAttribute("aria-current");
        dot.toggleAttribute("data-done", k < i);
      });
      next.hidden = i >= n - 1;
    };

    const guard = (e) => {                          // во время доводки жест в ту же сторону уже учтён
      if (!anim || e.ctrlKey) return;
      if (Math.sign(e.deltaY) === anim.dir) e.preventDefault(); else cancel();
    };
    function cancel() {
      if (!anim) return;
      cancelAnimationFrame(anim.raf);
      removeEventListener("wheel", guard);
      root.style.scrollBehavior = "";
      anim = null;
    }
    function animateTo(y, ms, ease) {
      cancel();
      const from = scrollY, dist = y - from;
      if (Math.abs(dist) < 1) { restY = scrollY; schedule(); return; }
      const t0 = performance.now();
      anim = { dir: Math.sign(dist), raf: 0, y: from };
      root.style.scrollBehavior = "auto";
      addEventListener("wheel", guard, { passive: false });
      const tick = (now) => {
        // Страницу сдвинул кто-то ещё (ссылка, клавиша, полоса прокрутки): уступаем
        if (Math.abs(scrollY - anim.y) > 3) { cancel(); return; }
        const k = clamp((now - t0) / ms);
        scrollTo(0, from + dist * ease(k));
        anim.y = scrollY;
        if (k < 1) { anim.raf = requestAnimationFrame(tick); return; }
        cancel();
        restY = scrollY;
        schedule();
      };
      anim.raf = requestAnimationFrame(tick);
    }
    const easeOut = (k) => 1 - (1 - k) ** 3;
    const easeInOut = (k) => (k < 0.5 ? 4 * k * k * k : 1 - (-2 * k + 2) ** 3 / 2);
    function goTo(i, slow) {
      const y = stepY(clamp(i, 0, n));
      const far = Math.min(2, Math.abs(y - scrollY) / introH);
      animateTo(y, slow ? 1500 : 460 + 420 * far, slow ? easeInOut : easeOut);
    }

    // Прокрутка остановилась: если между экранами, доехать до ближайшего по ходу
    function settle() {
      if (anim || touching) return;
      const s = pos();
      if (s <= 0 || s >= n) { restY = scrollY; return; }
      const lo = Math.floor(s), fr = s - lo;
      if (fr < 0.004 || fr > 0.996) { restY = scrollY; return; }
      const down = scrollY > restY;
      goTo(down ? (fr > 0.035 ? lo + 1 : lo) : (fr < 0.965 ? lo : lo + 1));
    }

    function schedule() {
      clearTimeout(timer);
      for (const dot of dots) dot.removeAttribute("data-run");
      const i = Math.round(pos());
      if (auto && (i >= n - 1 || Math.abs(pos() - i) > 0.01)) auto = false;   // дошли до конца или ушли со вступления
      play.toggleAttribute("data-paused", !auto);
      play.setAttribute("aria-label", auto ? "Остановить автолистание" : "Включить автолистание");
      if (!auto || document.hidden) return;
      autoStep = i;
      const hold = Number(slides[i].dataset.hold) || 10;
      dots[i].style.setProperty("--hold", hold + "s");
      void dots[i].offsetWidth;                     // перезапуск заполнения полоски
      dots[i].setAttribute("data-run", "");
      timer = setTimeout(() => goTo(i + 1, true), hold * 1000);
    }
    const stopAuto = () => { if (auto) { auto = false; schedule(); } };

    addEventListener("scroll", () => {
      if (anim) return;
      if (auto && Math.abs(scrollY - stepY(autoStep)) > 2) stopAuto();   // страницу сдвинул не таймер
      clearTimeout(idle);
      idle = setTimeout(settle, 150);
    }, { passive: true });
    addEventListener("wheel", stopAuto, { passive: true });
    addEventListener("keydown", (e) => { if (!["Shift", "Control", "Alt", "Meta"].includes(e.key)) stopAuto(); });
    addEventListener("pointerdown", (e) => { if (!e.target.closest?.("[data-play]")) stopAuto(); }, { passive: true });
    addEventListener("touchstart", () => { touching = true; stopAuto(); cancel(); }, { passive: true });
    const release = () => { touching = false; clearTimeout(idle); idle = setTimeout(settle, 180); };
    addEventListener("touchend", release, { passive: true });
    addEventListener("touchcancel", release, { passive: true });
    document.addEventListener("visibilitychange", schedule);
    // Переход по ссылке важнее доводки
    document.addEventListener("click", (e) => { if (e.target.closest?.("a[href]")) cancel(); }, true);

    dots.forEach((dot, k) => dot.addEventListener("click", () => { stopAuto(); goTo(k); }));
    next.addEventListener("click", () => { stopAuto(); goTo(Math.round(pos()) + 1); });
    play.addEventListener("click", () => {
      if (auto) { stopAuto(); return; }
      auto = true;
      if (Math.round(pos()) >= n - 1) goTo(0, true); else schedule();
    });
    // Фокус с клавиатуры попал в экран, который сейчас не виден: показать его
    slides.forEach((slide, i) => slide.addEventListener("focusin", () => {
      const s = pos();
      if (s < n - 0.5 && Math.abs(s - i) > 0.3) { stopAuto(); goTo(i); }
    }));

    addEventListener("resize", () => { lastP = -1; cancel(); }, { passive: true });
    introRender();
    schedule();
  }
  if (intro && motion) setupIntro();

  /* ---------- Прокрутка и размер окна ---------- */
  const redraw = () => frame(performance.now(), true);
  let queued = false;
  const onScroll = () => {
    if (queued) return;
    queued = true;
    requestAnimationFrame(() => {
      queued = false;
      syncNav(); syncSpy(); updateScene();
      forced = null;                                // под курсором уже другая строка
      if (!motion && backdrop) redraw();            // без движения: один кадр на прокрутку
    });
  };
  addEventListener("scroll", onScroll, { passive: true });
  addEventListener("resize", () => {
    measureIntro(); sizeCanvases(); syncNav(); syncSpy(); updateScene();
    if (!motion && backdrop) redraw();
  }, { passive: true });
  syncNav(); syncSpy();
  if (backdrop) {
    sizeCanvases();
    updateScene();
    if (motion) requestAnimationFrame((n) => { last = n; frame(n); });
    else redraw();
  }

  /* ---------- Строки с указателем: курсор зовёт сферу к своей строке ---------- */
  for (const list of $$(".guide")) {
    list.addEventListener("pointermove", (e) => {
      if (e.pointerType !== "mouse") return;
      forced = e.target.closest("[data-guide]")?.querySelector("[data-anchor]") ?? null;
    }, { passive: true });
    list.addEventListener("pointerleave", () => { forced = null; }, { passive: true });
  }

  /* ---------- Линза: вопрос под курсором поворачивает к себе свет сферы ---------- */
  for (const q of $$("[data-aim]")) {
    const [ax, ay] = q.dataset.aim.split(" ").map(Number);
    q.addEventListener("pointerenter", () => { aim.tx = ax; aim.ty = ay; bump = Math.max(bump, 0.35); });
    q.addEventListener("pointerleave", () => { aim.tx = 0; aim.ty = 0; });
  }

  /* ---------- Ситуации ---------- */
  const checks = $("[data-checks]");
  if (checks) {
    const reading = document.getElementById("reading");
    const empty = $("[data-empty]", reading);
    const cta = $("[data-cta]", reading);
    const bar = $("[data-bar]");
    const count = $("[data-count]", bar);
    const items = new Map($$("[data-for]", reading).map((el) => [el.dataset.for, el]));
    const boxes = $$("input[type=checkbox]", checks);

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
    checks.addEventListener("change", (e) => {
      sync();
      // Свет встаёт за отмеченным пунктом, от него расходится волна
      if (e.target.matches?.("input[type=checkbox]")) { spot.el = e.target; pulse(e.target.checked ? 0.8 : 0.3); }
    });
    sync();

    // Плашка на телефоне видна, только пока список на экране
    if ("IntersectionObserver" in window) {
      new IntersectionObserver(([entry]) => bar.toggleAttribute("data-visible", entry.isIntersecting)).observe(checks);
    }

    // Выбор уезжает в форму заявки
    $("[data-discuss]", cta).addEventListener("click", () => {
      const message = document.getElementById("f-message");
      const chosen = boxes.filter((b) => b.checked).map((b) => b.nextElementSibling.textContent.trim());
      if (message && chosen.length && !message.value.trim()) {
        message.value = "Узнаём у себя:\n" + chosen.map((s) => "• " + s).join("\n");
      }
    });
  }

  /* ---------- Появление частей секций ---------- */
  if (motion) {
    const io = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        entry.target.classList.add("is-in");
        io.unobserve(entry.target);
      }
    }, { rootMargin: "0px 0px -12% 0px" });

    const stagger = (el) => [...el.children].forEach((c, i) => c.style.setProperty("--i", Math.min(i, 6)));
    // Группа: дети поднимаются по очереди
    $$(".head, .checks, .guide, .lens__grid, .steps, .process__terms, .case, .formats__grid, .past__axis, " +
      ".exhibit__text, .exhibit__copy, .faq__aside, .faq__list, .contact__intro, .form, .page-head__text, .closing__text"
    ).forEach((el) => { el.setAttribute("data-reveal", ""); stagger(el); io.observe(el); });
    // Одиночный заголовок
    $$(".lens__title, .formats > .h2, .showcase__all")
      .forEach((el) => { el.setAttribute("data-reveal-self", ""); io.observe(el); });
    // Превью витрины открываются шторкой
    $$(".sheets, .sheet--wide")
      .forEach((el) => { el.setAttribute("data-curtain", ""); stagger(el); io.observe(el); });
  }

  /* ---------- Кнопки форматов выбирают пункт в заявке ---------- */
  $$("[data-format]").forEach((link) => {
    link.addEventListener("click", () => {
      const radio = $(`.form input[name="format"][value="${link.dataset.format}"]`);
      if (radio) radio.checked = true;
    });
  });

  /* ---------- Заявка ---------- */
  const form = $("[data-form]");
  if (form) {
    const status = $(".form__status", form);
    const rules = {
      name: (v) => v.trim().length >= 2 || "Напишите, как к вам обращаться.",
      company: (v) => v.trim().length >= 2 || "Напишите название компании.",
      // Принимаем любой привычный формат: +7 (999) 123-45-67, 89991234567, 8 999 123 45 67
      phone: (v) => { const digits = v.replace(/\D/g, ""); return (digits.length >= 10 && digits.length <= 15) || "Проверьте номер: в нём должно быть не меньше 10 цифр."; },
      consent: (_, el) => el.checked || "Без согласия мы не можем принять заявку.",
    };

    function check(el) {
      const rule = rules[el.name];
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
      const fields = [...form.elements].filter((el) => rules[el.name]);
      const bad = fields.filter((el) => !check(el));
      if (bad.length) { bad[0].focus(); return; }

      const submit = $(".form__submit", form);
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
        pulse(1.2);                                 // маяк отвечает на заявку
      } catch {
        submit.disabled = false;
        status.textContent = "Не получилось отправить. Попробуйте ещё раз или напишите нам на почту.";
      }
    });
  }
})();
