// Скриншоты страницы для просмотра глазами.
// Запуск: node tools/shots.mjs [desktop|phone] [страница.html] [цель...]
// Цель: селектор блока или intro:N (экран вступления с номером N, от 0).
// Без целей снимает ключевые места страницы. Результат лежит в tools/out/.
import fs from "node:fs";
import path from "node:path";
import { ROOT, serve, launch } from "./lib.mjs";

const args = process.argv.slice(2);
const phone = args.includes("phone");
const file = args.find((a) => a.endsWith(".html")) ?? "index.html";
const targets = args.filter((a) => a !== "phone" && a !== "desktop" && a !== file);
const DEFAULT = {
  "index.html": ["intro:0", "intro:1", "intro:2", "intro:3", "#situations", "#approach", "#lens .lens__stage", "#process",
    "#formats", "#showcase", "#history", "#faq", "#contact", ".footer"],
  "tools.html": [".page-head", "#instructions", "#plasma", "#avatar", ".closing"],
  "history.html": [".page-head", "#y2003", "#y2011", "#y2023", ".closing"],
};

const out = path.join(ROOT, "tools/out");
fs.mkdirSync(out, { recursive: true });
const srv = await serve();
const browser = await launch();
const page = await browser.newPage();
await page.setViewport(phone ? { width: 375, height: 812, deviceScaleFactor: 2, isMobile: true, hasTouch: true }
  : { width: 1440, height: 900, deviceScaleFactor: 1 });
page.on("console", (m) => { if (m.type() === "error" || m.type() === "warning") console.log("console:", m.text()); });
page.on("pageerror", (e) => console.log("pageerror:", e.message));
await page.goto(`${srv.url}/${file}`, { waitUntil: "networkidle2" });
await new Promise((r) => setTimeout(r, 1500));

const base = file.replace(/\.html$/, "") === "index" ? "" : file.replace(/\.html$/, "") + "-";
let i = 0;
for (const sel of targets.length ? targets : DEFAULT[file] ?? ["body"]) {
  // Плавная прокрутка шагами, чтобы сработали появления и сфера успела перестроиться
  const y = await page.evaluate((s) => {
    if (s.startsWith("intro:")) return Number(s.slice(6)) * document.querySelector(".intro__stage").offsetHeight;
    const el = document.querySelector(s);
    const r = el.getBoundingClientRect();
    const center = r.height < innerHeight * 0.9;
    return Math.max(0, Math.round(r.top + scrollY - (center ? (innerHeight - r.height) / 2 : 90)));
  }, sel);
  await page.evaluate(async (target) => {
    const start = scrollY, steps = 24;
    for (let k = 1; k <= steps; k++) {
      scrollTo({ top: start + (target - start) * k / steps, behavior: "instant" });
      await new Promise((r) => requestAnimationFrame(r));
    }
  }, y);
  await new Promise((r) => setTimeout(r, 1900));
  const name = `${base}${phone ? "phone" : "desktop"}-${String(i++).padStart(2, "0")}.png`;
  await page.screenshot({ path: path.join(out, name) });
  console.log(name, "<-", sel);
}
await browser.close();
await srv.close();
