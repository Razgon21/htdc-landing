// Снимок сферы с первого экрана сайта для обложек документов. Запуск: node tools/sphere-asset.mjs
// Текст страницы прячется, туман остаётся: он даёт сфере ореол. Края кадра гасятся маской в doc.css.
import path from "node:path";
import { ROOT, serve, launch } from "./lib.mjs";

const srv = await serve();
const browser = await launch(["--use-angle=d3d11", "--enable-gpu"]);
const page = await browser.newPage();
await page.setViewport({ width: 1600, height: 1000, deviceScaleFactor: 2 });
await page.goto(`${srv.url}/index.html`, { waitUntil: "networkidle2" });
await page.addStyleTag({ content: ".nav, main > *:not(.hero), .hero__text, .footer { visibility: hidden !important; }" });
await new Promise((r) => setTimeout(r, 2500));
const box = await page.evaluate(() => {
  const r = document.querySelector(".hero__orb").getBoundingClientRect();
  const side = r.width * 1.7;
  return { x: r.left + r.width / 2 - side / 2, y: r.top + r.height / 2 - side / 2, width: side, height: side };
});
const out = path.join(ROOT, "showcase/docs/assets/sphere.webp");
await page.screenshot({ path: out, type: "webp", quality: 88, clip: box });
console.log("сфера:", out, Math.round(box.width), "px");
await browser.close();
await srv.close();
