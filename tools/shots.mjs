// Скриншоты страницы для просмотра глазами. Запуск: node tools/shots.mjs [desktop|phone] [selector...]
// Без селекторов снимает ключевые места страницы. Результат — в tools/out/.
import fs from "node:fs";
import path from "node:path";
import { ROOT, serve, launch } from "./lib.mjs";

const args = process.argv.slice(2);
const phone = args[0] === "phone";
const targets = args.filter((a) => a !== "phone" && a !== "desktop");
const DEFAULT = ["#top", "#situations", "#approach", "#lens .lens__stage", "#process", "#formats", "#showcase",
  "#showcase .exhibit--screen", "#showcase .exhibit--model", "#faq", "#contact", ".footer"];

const out = path.join(ROOT, "tools/out");
fs.mkdirSync(out, { recursive: true });
const srv = await serve();
const browser = await launch();
const page = await browser.newPage();
await page.setViewport(phone ? { width: 375, height: 812, deviceScaleFactor: 2, isMobile: true, hasTouch: true }
  : { width: 1440, height: 900, deviceScaleFactor: 1 });
page.on("console", (m) => { if (m.type() === "error" || m.type() === "warning") console.log("console:", m.text()); });
page.on("pageerror", (e) => console.log("pageerror:", e.message));
await page.goto(`${srv.url}/index.html`, { waitUntil: "networkidle2" });
await new Promise((r) => setTimeout(r, 1500));

let i = 0;
for (const sel of targets.length ? targets : DEFAULT) {
  // Плавная прокрутка шагами, чтобы сработали появления и сфера успела перестроиться
  const y = await page.evaluate((s) => {
    const el = document.querySelector(s);
    const r = el.getBoundingClientRect();
    const center = r.height < innerHeight * 0.9;
    return Math.max(0, Math.round(r.top + scrollY - (center ? (innerHeight - r.height) / 2 : 70)));
  }, sel);
  await page.evaluate(async (target) => {
    const start = scrollY, steps = 24;
    for (let k = 1; k <= steps; k++) {
      scrollTo({ top: start + (target - start) * k / steps, behavior: "instant" });
      await new Promise((r) => requestAnimationFrame(r));
    }
  }, y);
  await new Promise((r) => setTimeout(r, 1700));
  const name = `${phone ? "phone" : "desktop"}-${String(i++).padStart(2, "0")}.png`;
  await page.screenshot({ path: path.join(out, name) });
  console.log(name, "<-", sel);
}
await browser.close();
await srv.close();
