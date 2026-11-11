/* HTDC — туман и сфера (WebGL), ситуации, сцена раскрытия, заявка. Без зависимостей. */

// Куда уходит заявка. Пока null — отправка имитируется.
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

  /* ---------- Навигация: прозрачная только над первым экраном ---------- */
  const nav = document.querySelector(".nav");
  const syncNav = () => nav.toggleAttribute("data-top", scrollY < 8);
  syncNav();
  addEventListener("scroll", syncNav, { passive: true });

  /* =====================================================================
     Туман и сфера
     ---------------------------------------------------------------------
     Два WebGL-холста. Туман — на весь экран, в треть разрешения: он размыт,
     разницы не видно, а пикселей в девять раз меньше. Сфера — отдельный
     небольшой холст в полном разрешении; страница двигает и масштабирует
     его через transform.

     Сфера одна на всю страницу. У якорей ([data-anchor]) она крупная и
     резкая и стоит точно в слоте; между ними уменьшается, расфокусируется
     и уходит в туман мягким светом на осевой линии страницы. Состояние
     считается от прокрутки, поэтому обратный скролл проигрывает переход
     обратно. У каждого якоря свой характер сферы (KINDS).

     Объём дают три вещи: слои тумана на разной глубине (при прокрутке
     ближний едет быстрее дальнего), свет сферы, который рассеивается в
     тумане, и ближний слой, который проходит поверх самой сферы — он
     считается одной и той же функцией в обоих шейдерах, поэтому шва нет.
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
    // Ближний слой тумана. Общий для фона и для сферы: p — экранные CSS-пиксели
    float nearFog(vec2 p, float t, float scroll, float unit) {
      vec2 q = (p + vec2(0.0, scroll * 0.5)) / unit;
      return smoothstep(0.42, 0.9, fbm(q * 2.4 + vec2(t * 0.035, -t * 0.012)));
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
    uniform float uTime, uScroll, uUnit;
    uniform float uDensity;   // плотность тумана в текущей части страницы
    uniform float uClear;     // насколько туман расступается вокруг сферы
    uniform vec3 uSphere;     // центр (x, y) и радиус сферы, CSS-пиксели
    uniform float uFocus;     // 1 — сфера резкая (её рисует второй холст), 0 — мягкий свет
    uniform float uGlow;      // сила света
    uniform vec2 uShift;      // параллакс от курсора, пиксели
    ${NOISE}
    void main() {
      vec2 p = vec2(vUv.x, 1.0 - vUv.y) * uRes;
      vec2 pp = p + uShift;
      float t = uTime;

      // Три слоя на разной глубине: дальний почти стоит, ближний едет за прокруткой
      vec2 qf = (pp * 0.6 + vec2(0.0, uScroll * 0.10)) / uUnit;
      float far = fbm(qf * 0.9 + vec2(t * 0.010, 0.0));
      vec2 qm = (pp * 0.8 + vec2(0.0, uScroll * 0.25)) / uUnit;
      float mid = fbm(qm * 1.7 + vec2(-t * 0.020, t * 0.008) + far * 0.6);
      float near = nearFog(pp, t, uScroll, uUnit);

      float body = smoothstep(0.32, 0.74, far * 0.55 + mid * 0.45);
      float y = p.y / uRes.y;
      float dens = (0.16 + body * 0.8 + near * 0.5) * uDensity * mix(0.7, 1.25, y * y); // лёгкая дымка везде, гуще понизу

      vec2 sv = p - uSphere.xy;
      float dist = length(sv) / max(uSphere.z, 1.0);
      dens *= mix(1.0, smoothstep(0.9, 3.4, dist), uClear);
      dens = min(dens, 1.2);

      vec3 col = vec3(0.0235, 0.0314, 0.051);
      col += vec3(0.135, 0.180, 0.265) * dens;

      // Свет сферы: широкое рассеяние в тумане, лучи, плотный ореол у края, мягкое ядро без фокуса
      vec2 dir = sv / max(length(sv), 1.0);
      float rays = smoothstep(0.25, 0.85, fbm(dir * 2.6 + vec2(t * 0.012, -t * 0.008)));
      float fall = 1.0 / (1.0 + dist * dist * 0.5);
      float halo = exp(-max(dist - 1.0, 0.0) * 2.4);
      float core = exp(-dist * dist * 1.25) * (1.0 - uFocus);
      vec3 lightCol = vec3(0.78, 0.88, 1.0);
      float lit = fall * (0.05 + dens * 0.30) * (0.5 + 1.0 * rays)
                + halo * 0.30 * uFocus * (0.65 + 0.35 * rays)
                + core * 0.85;
      col += lightCol * uGlow * lit;

      vec2 c = vUv - 0.5;
      col *= 1.0 - dot(c, c) * 0.5;                                  // виньетка
      col += (hash(gl_FragCoord.xy + fract(t) * 61.0) - 0.5) / 255.0 * 1.6; // дизеринг против полос
      gl_FragColor = vec4(col, 1.0);
    }
  `;

  const SPHERE_FRAG = PRECISION + `
    varying vec2 vUv;
    uniform float uTime, uScroll, uUnit, uDensity;
    uniform float uFocus;     // резкость края
    uniform float uTurb;      // насколько видны внутренние слои
    uniform float uGlass;     // «стекло»: ярче кромка, свет проходит насквозь
    uniform float uFlat;      // 1 — сфера стала ровным светлым листом
    uniform float uPulse;     // дыхание ядра
    uniform float uAlpha;
    uniform vec2 uLight;      // сдвиг источника света от курсора
    uniform vec2 uOrigin;     // левый верхний угол холста на экране, CSS-пиксели
    uniform float uSize;      // сторона холста на экране, CSS-пиксели
    uniform vec2 uShift;
    ${NOISE}
    mat2 rot(float a) { float c = cos(a), s = sin(a); return mat2(c, -s, s, c); }
    void main() {
      vec2 st = vec2(vUv.x, 1.0 - vUv.y);          // 0..1, y вниз
      vec2 uv = (st * 2.0 - 1.0) / 0.8;            // радиус сферы = 1, поле вокруг — под ореол
      float r = length(uv);
      float soft = mix(0.5, 0.012, uFocus);
      float mask = 1.0 - smoothstep(1.0 - soft, 1.0 + soft * 0.3, r);
      float z = sqrt(max(1.0 - min(r * r, 1.0), 0.0));
      vec3 n = normalize(vec3(uv, z + 0.0001));
      float t = uTime;

      vec3 L = normalize(vec3(-0.50 + uLight.x, -0.62 + uLight.y, 0.62));
      float ndl = dot(n, L);
      float wrap = clamp((ndl + 0.45) / 1.45, 0.0, 1.0);

      // Два внутренних слоя: поверхность медленно вращается, глубина — навстречу и крупнее
      vec3 s1 = n; s1.xz = rot(t * 0.045) * s1.xz;
      float c1 = fbm(s1.xy * 1.9 + s1.z * 1.3 + vec2(0.0, t * 0.012));
      vec2 iu = uv * 0.62;
      vec3 s2 = vec3(iu, sqrt(max(1.0 - dot(iu, iu), 0.0))); s2.xz = rot(-t * 0.03) * s2.xz;
      float c2 = fbm(s2.xy * 3.1 + s2.z * 2.0 + 7.3);
      float clouds = (c1 - 0.5) + (c2 - 0.5) * 0.7;

      vec3 deep = vec3(0.19, 0.28, 0.46), midc = vec3(0.50, 0.64, 0.83), pale = vec3(0.85, 0.92, 0.99);
      vec3 col = mix(deep, midc, smoothstep(0.0, 0.55, wrap));
      col = mix(col, pale, smoothstep(0.42, 0.96, wrap));
      col += clouds * uTurb * vec3(0.26, 0.28, 0.30) * (0.35 + wrap);

      // Стекло: тело темнеет и становится прозрачным, внутри видны светящиеся волокна и своё ядро
      float fil = smoothstep(-0.22, 0.42, clouds);
      vec3 glass = mix(vec3(0.06, 0.10, 0.19), vec3(0.46, 0.62, 0.86), fil * (0.55 + 0.45 * wrap));
      glass += vec3(0.9, 0.95, 1.0) * exp(-dot(uv, uv) * 5.5) * 0.75;
      col = mix(col, glass, uGlass * 0.62);

      // Светящееся ядро, смещено к источнику света
      vec2 cu = uv - L.xy * 0.28;
      float core = exp(-dot(cu, cu) * mix(3.0, 4.6, uGlass)) * (1.0 + sin(t * 0.7) * 0.06 * uPulse);
      col = mix(col, vec3(1.0), clamp(core * mix(0.8, 0.5, uGlass), 0.0, 1.0));

      // Объём: тень на дальней стороне, кромка-атмосфера, блик
      col *= mix(0.70, 1.0, smoothstep(-0.55, 0.35, ndl));
      float fres = pow(1.0 - z, 2.6);
      col += vec3(0.60, 0.77, 1.0) * fres * (0.26 + 0.5 * uGlass) * (0.5 + 0.5 * wrap);
      float through = pow(max(dot(n.xy, -L.xy), 0.0), 3.0) * fres;   // свет, прошедший сквозь стекло
      col += vec3(0.75, 0.87, 1.0) * through * uGlass * 0.9;
      vec3 hv = normalize(L + vec3(0.0, 0.0, 1.0));
      col += pow(max(dot(n, hv), 0.0), 56.0) * 0.32;

      // Ближний слой тумана проходит поверх сферы
      vec2 screen = uOrigin + st * uSize + uShift;
      float veil = nearFog(screen, t, uScroll, uUnit) * uDensity * (1.0 - uFlat);
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

  const fogCanvas = document.querySelector(".fog");
  const sphereCanvas = document.querySelector(".sphere");
  let fog = null, orb = null;
  try {
    fog = program(fogCanvas, FOG_FRAG, false);
    orb = program(sphereCanvas, SPHERE_FRAG, true);
  } catch (err) {
    console.warn("HTDC: шейдеры не собрались, включён простой фон.", err);
    fog = orb = null;
  }
  const gl = Boolean(fog && orb);
  root.classList.toggle("no-gl", !gl);
  // Потерянный контекст проще всего вернуть перезагрузкой холстов
  for (const c of [fogCanvas, sphereCanvas]) {
    c.addEventListener("webglcontextlost", (e) => e.preventDefault());
    c.addEventListener("webglcontextrestored", () => location.reload());
  }

  const BASE = 600;                 // размер холста сферы в CSS
  const BOX = gl ? 1.25 : 1;        // холст шире сферы: место под размытый край и атмосферу

  // Характер сферы у каждого якоря
  const KINDS = {
    pearl:  { turb: 0.8,  glass: 0.24, glow: 1.0,  pulse: 0.4 },   // первый экран: спокойная, цельная
    lens:   { turb: 1.0,  glass: 1.0,  glow: 1.15, pulse: 0.3 },   // «что смотрим»: стекло, слои видны
    sheet:  { turb: 0.5,  glass: 0.25, glow: 0.9,  pulse: 0.3 },   // перед листом: ровнеет и растёт
    beacon: { turb: 0.8,  glass: 0.55, glow: 0.8,  pulse: 1.0 },   // у формы: небольшая, дышит
  };
  const look = { ...KINDS.pearl };

  const sections = [...document.querySelectorAll("main > section, .footer")].map((el) => ({
    el, fog: Number(el.dataset.fog ?? 0.2), clear: Number(el.dataset.clear ?? 0),
  }));
  const anchors = [...document.querySelectorAll("[data-anchor]")];
  const pointer = { x: 0, y: 0, tx: 0, ty: 0 };
  const paper = { el: document.querySelector(".paper__orb"), stage: document.querySelector(".paper__stage"), fill: 0 };
  let last = 0;

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
    const biggest = Math.max(160, ...anchors.map((el) => el.offsetWidth));
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
      fogSum += s.fog * seen; clearSum += s.clear * seen; total += seen;
    }
    return total ? { density: fogSum / total, clear: clearSum / total } : { density: 0.5, clear: 0 };
  }

  // Ближайший якорь и насколько сфера «собрана» у него: 1 — слот у середины экрана
  function pickAnchor(vh) {
    let best = null, bestE = 0;
    for (const el of anchors) {
      if (!el.offsetWidth) continue;
      const r = el.getBoundingClientRect();
      const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
      const e = motion
        ? 1 - smooth(vh * 0.14, vh * 0.85, Math.abs(cy - vh / 2))
        : (r.bottom > -r.height && r.top < vh + r.height ? 1 : 0);   // без движения сфера просто стоит в слоте
      if (e > bestE) { bestE = e; best = { el, cx, cy, d: r.width, e }; }
    }
    return best;
  }

  function frame(now, once) {
    const still = once === true || !motion;
    const t = motion ? now * 0.001 : 12;
    const vw = innerWidth, vh = innerHeight;
    const wide = vw >= 860;

    pointer.x += (pointer.tx - pointer.x) * 0.04;
    pointer.y += (pointer.ty - pointer.y) * 0.04;

    // Мягкий свет держится осевой линии страницы — там нет текста. На телефоне уходит в угол под шапку
    const hazeX = wide ? vw / 2 + Math.sin(t * 0.21) * 5 : vw * 0.86;
    const hazeY = wide ? vh * (0.42 + Math.sin(t * 0.13) * 0.05) : 104 + Math.sin(t * 0.13) * 8;
    const hazeD = wide ? clamp(vw * 0.045, 44, 68) : 36;
    const hazeGlow = wide ? 0.5 : 0.26;

    const a = pickAnchor(vh);
    const e = a ? a.e : 0;
    const kind = KINDS[a?.el.dataset.anchor] ?? KINDS.pearl;
    const k = still ? 1 : 0.06;
    for (const key in look) look[key] += (kind[key] - look[key]) * k;

    // Положение держится за слотом дольше, чем резкость: сфера сначала уезжает вместе с ним, потом растворяется
    const ep = smooth(0, 0.6, e);
    const cx = a ? mix(hazeX, a.cx, ep) : hazeX;
    const cy = a ? mix(hazeY, a.cy, ep) : hazeY;
    const d = a ? mix(hazeD, a.d, e) : hazeD;
    const focus = smooth(0.45, 0.95, e);
    const sheet = a && a.el === paper.el ? paper.fill * e : 0;
    const glow = mix(hazeGlow, look.glow, smooth(0, 0.8, e)) * (1 - sheet * 0.92);
    const alpha = smooth(0.15, 0.6, e);

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
      const scroll = motion ? scrollY : 0;
      const shiftX = pointer.x * 18, shiftY = pointer.y * 12;

      fog.set("uRes", fogCanvas.clientWidth, fogCanvas.clientHeight);
      fog.set("uTime", t);
      fog.set("uScroll", scroll);
      fog.set("uUnit", unit);
      fog.set("uDensity", air.density);
      fog.set("uClear", air.clear * smooth(0.2, 0.9, e));
      fog.set("uSphere", cx, cy, d / 2);
      fog.set("uFocus", focus);
      fog.set("uGlow", glow);
      fog.set("uShift", shiftX, shiftY);
      fog.draw();

      if (visible) {
        orb.set("uTime", t);
        orb.set("uScroll", scroll);
        orb.set("uUnit", unit);
        orb.set("uDensity", air.density);
        orb.set("uFocus", focus);
        orb.set("uTurb", look.turb);
        orb.set("uGlass", look.glass);
        orb.set("uFlat", sheet);
        orb.set("uPulse", look.pulse);
        orb.set("uAlpha", alpha);
        orb.set("uLight", pointer.x * 0.35, pointer.y * 0.35);
        orb.set("uOrigin", ox, oy);
        orb.set("uSize", side);
        orb.set("uShift", shiftX, shiftY);
        orb.draw();
      }
    }

    last = now;
    if (!still) requestAnimationFrame(frame);
  }

  /* ---------- Сцена: сфера заливает экран светом, из неё проявляется лист ---------- */
  const scene = document.querySelector("[data-paper-scene]");
  const updateScene = () => {
    if (!scene || !motion) return;
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
    paper.stage.toggleAttribute("data-filled", p > 0.97);
  };

  const redraw = () => frame(performance.now(), true);
  addEventListener("resize", () => { sizeCanvases(); updateScene(); if (!motion) redraw(); }, { passive: true });
  sizeCanvases();
  updateScene();
  if (motion) {
    addEventListener("scroll", updateScene, { passive: true });
    requestAnimationFrame((n) => { last = n; frame(n); });
  } else {
    // Без движения: один кадр, пересчёт только при прокрутке
    redraw();
    let queued = false;
    addEventListener("scroll", () => {
      if (queued) return;
      queued = true;
      requestAnimationFrame(() => { queued = false; redraw(); });
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
    const items = new Map([...reading.querySelectorAll("[data-for]")].map((el) => [el.dataset.for, el]));
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
    new IntersectionObserver(([entry]) => bar.toggleAttribute("data-visible", entry.isIntersecting))
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
    const io = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        entry.target.classList.add("is-in");
        io.unobserve(entry.target);
      }
    }, { rootMargin: "0px 0px -12% 0px" });

    const stagger = (el) => [...el.children].forEach((c, i) => c.style.setProperty("--i", Math.min(i, 6)));
    // Группа: дети поднимаются по очереди
    document.querySelectorAll(
      ".hero__text, .head, .checks, .not__rows, .lens__grid, .steps, .process__terms, .case, " +
      ".formats__grid, .exhibit__text, .exhibit__copy, .faq__aside, .faq__list, .contact__intro, .form"
    ).forEach((el) => { el.setAttribute("data-reveal", ""); stagger(el); io.observe(el); });
    // Одиночный заголовок
    document.querySelectorAll(".lens__title, .formats > .h2")
      .forEach((el) => { el.setAttribute("data-reveal-self", ""); io.observe(el); });
    // Превью витрины открываются шторкой
    document.querySelectorAll(".sheets, .sheet--wide")
      .forEach((el) => { el.setAttribute("data-curtain", ""); stagger(el); io.observe(el); });
  }

  /* ---------- Кнопки форматов выбирают пункт в заявке ---------- */
  document.querySelectorAll("[data-format]").forEach((link) => {
    link.addEventListener("click", () => {
      const radio = document.querySelector(`.form input[name="format"][value="${link.dataset.format}"]`);
      if (radio) radio.checked = true;
    });
  });

  /* ---------- Заявка ---------- */
  const form = document.querySelector("[data-form]");
  if (form) {
    const status = form.querySelector(".form__status");
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
