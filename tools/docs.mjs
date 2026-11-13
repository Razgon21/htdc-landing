// Документы витрины: проверка листов, снимки и PDF. Запуск: node tools/docs.mjs [имя.html ...]
// Без аргументов берёт все документы из showcase/docs/.
// Для каждого листа проверяет: ничего не вылезает за лист и не налезает на колонтитул,
// контраст текста не ниже WCAG AA. Снимки листов — в tools/out/docs/, PDF — рядом с документом.
import fs from "node:fs";
import path from "node:path";
import { ROOT, serve, launch } from "./lib.mjs";

const dir = path.join(ROOT, "showcase/docs");
const names = process.argv.slice(2).length ? process.argv.slice(2) : fs.readdirSync(dir).filter((f) => f.endsWith(".html"));
const out = path.join(ROOT, "tools/out/docs");
fs.mkdirSync(out, { recursive: true });

const srv = await serve();
const browser = await launch();
let problems = 0;

for (const name of names) {
  const page = await browser.newPage();
  await page.setViewport({ width: 1200, height: 900, deviceScaleFactor: 1.5 });
  await page.goto(`${srv.url}/showcase/docs/${name}`, { waitUntil: "networkidle2" });
  await page.evaluate(() => document.fonts.ready);

  const report = await page.evaluate(() => {
    const lum = (c) => { const m = c.match(/[\d.]+/g).map(Number); const [r, g, b] = m.slice(0, 3).map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
    const bgOf = (el) => { while (el) { const c = getComputedStyle(el).backgroundColor; const a = c.match(/[\d.]+/g); if (a && (a.length < 4 || +a[3] > 0.5)) return c; el = el.parentElement; } return "rgb(255,255,255)"; };
    return [...document.querySelectorAll(".sheet")].map((sheet, i) => {
      const s = sheet.getBoundingClientRect();
      const folio = sheet.querySelector(".folio");
      const limit = folio ? folio.getBoundingClientRect().top : s.bottom - 8;
      const issues = [];
      if (folio && folio.getBoundingClientRect().bottom > s.bottom - 2) issues.push(`содержимое не помещается: колонтитул ушёл за край листа на ${Math.round(folio.getBoundingClientRect().bottom - s.bottom + 2)}px`);
      if (!sheet.classList.contains("cover") && sheet.scrollHeight > sheet.clientHeight + 1) issues.push(`содержимое длиннее листа на ${sheet.scrollHeight - sheet.clientHeight}px`);
      for (const el of sheet.querySelectorAll("*")) {
        if (el.closest(".folio") || el.matches(".cover__orb")) continue;
        const r = el.getBoundingClientRect();
        if (!r.width || !r.height) continue;
        if (r.right > s.right + 0.5 || r.left < s.left - 0.5) issues.push(`выходит за край: ${el.className || el.tagName}`);
        if (r.bottom > limit + 0.5 && !sheet.classList.contains("cover")) issues.push(`налезает на колонтитул на ${Math.round(r.bottom - limit)}px: ${(el.className || el.tagName)} «${el.textContent.trim().slice(0, 30)}»`);
        if (el.scrollHeight > el.clientHeight + 1 && getComputedStyle(el).overflow === "hidden" && el !== sheet) issues.push(`текст обрезан: ${el.className}`);
        const own = [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim());
        if (own) {
          const cs = getComputedStyle(el);
          const L1 = lum(cs.color), L2 = lum(bgOf(el));
          const ratio = (Math.max(L1, L2) + 0.05) / (Math.min(L1, L2) + 0.05);
          const large = parseFloat(cs.fontSize) >= 24 || (parseFloat(cs.fontSize) >= 18.66 && +cs.fontWeight >= 700);
          if (ratio < (large ? 3 : 4.5)) issues.push(`контраст ${ratio.toFixed(2)}: «${el.textContent.trim().slice(0, 30)}»`);
        }
      }
      const room = Math.round(limit - Math.max(...[...sheet.querySelectorAll(".sheet__body > *, .sheet__body")].map((e) => e.getBoundingClientRect().bottom)));
      return { i: i + 1, issues: [...new Set(issues)].slice(0, 6), room };
    });
  });

  const sheets = await page.$$(".sheet");
  const base = name.replace(/\.html$/, "");
  for (let i = 0; i < sheets.length; i++) {
    await sheets[i].screenshot({ path: path.join(out, `${base}-${String(i + 1).padStart(2, "0")}.png`) });
  }
  await page.emulateMediaType("print");
  await page.pdf({ path: path.join(dir, `${base}.pdf`), printBackground: true, preferCSSPageSize: true });

  console.log(`\n${name}: ${sheets.length} листов, PDF ${Math.round(fs.statSync(path.join(dir, `${base}.pdf`)).size / 1024)} КБ`);
  for (const r of report) {
    const status = r.issues.length ? "FAIL" : " ok ";
    console.log(`  ${status} лист ${r.i}: свободно снизу ${r.room}px${r.issues.length ? "\n         " + r.issues.join("\n         ") : ""}`);
    problems += r.issues.length;
  }
  await page.close();
}

await browser.close();
await srv.close();
if (problems) { console.log(`\nПроблем: ${problems}`); process.exit(1); }
console.log("\nВсе листы в порядке.");
