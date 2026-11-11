// Плавность на настоящей видеокарте. Запуск: node tools/perf.mjs
// Открывает страницу в браузере с включённым GPU и снятым ограничением частоты кадров,
// и после каждого кадра ждёт видеокарту (readPixels). Поэтому интервал между кадрами здесь —
// полная стоимость кадра вместе с шейдерами. Бюджет при 60 Гц — 16,7 мс.
import { serve, launch } from "./lib.mjs";

const srv = await serve();
const browser = await launch(["--use-angle=d3d11", "--enable-gpu", "--disable-frame-rate-limit"]);
for (const [name, vp] of [["десктоп 1440×900", { width: 1440, height: 900, deviceScaleFactor: 1 }], ["десктоп 1920×1080 ×1.25", { width: 1920, height: 1080, deviceScaleFactor: 1.25 }], ["телефон 375×812 ×3", { width: 375, height: 812, deviceScaleFactor: 3, isMobile: true, hasTouch: true }]]) {
  const page = await browser.newPage();
  await page.setViewport(vp);
  await page.goto(`${srv.url}/index.html`, { waitUntil: "load" });
  await new Promise((r) => setTimeout(r, 1500));
  const res = await page.evaluate(async () => {
    const gl = document.createElement("canvas").getContext("webgl");
    const ext = gl.getExtension("WEBGL_debug_renderer_info");
    const renderer = ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : "неизвестно";
    // readPixels после кадра заставляет дождаться видеокарты: интервал включает и её работу
    const ctxs = [".fog", ".sphere"].map((q) => document.querySelector(q).getContext("webgl"));
    const px = new Uint8Array(4);
    const run = async (step) => {
      const t = []; let y = scrollY;
      await new Promise((res) => { const tick = () => {
        for (const c of ctxs) c.readPixels(0, 0, 1, 1, c.RGBA, c.UNSIGNED_BYTE, px);
        t.push(performance.now()); y += step; scrollTo({ top: y, behavior: "instant" });
        t.length < 300 ? requestAnimationFrame(tick) : res(); }; requestAnimationFrame(tick); });
      const d = t.slice(1).map((v, i) => v - t[i]).sort((a, b) => a - b);
      return { median: d[Math.floor(d.length / 2)], p95: d[Math.floor(d.length * 0.95)], slow: d.filter((v) => v > 25).length };
    };
    const idle = await run(0);     // сфера на первом экране, без прокрутки
    const scroll = await run(14);  // прокрутка через несколько секций
    const f = document.querySelector(".fog"), s = document.querySelector(".sphere");
    return { renderer, idle, scroll, fog: `${f.width}×${f.height}`, sphere: `${s.width}×${s.height}` };
  });
  const fmt = (r) => `медиана ${r.median.toFixed(1)} мс, 95% ${r.p95.toFixed(1)} мс, кадров дольше 25 мс: ${r.slow} из 299`;
  console.log(`${name}\n  видеокарта: ${res.renderer}\n  холсты: туман ${res.fog}, сфера ${res.sphere}\n  покой:     ${fmt(res.idle)}\n  прокрутка: ${fmt(res.scroll)}`);
  await page.close();
}
await browser.close();
await srv.close();
