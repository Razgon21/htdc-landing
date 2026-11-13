// Проверка полноты: весь текст оригинала есть в пересобранном документе.
// Запуск: node tools/docs-text.mjs
// Сравнивает слова (с учётом повторов) всех текстовых узлов оригинала и документа без обложки и колонтитулов.
// Выводит слова, которых в документе стало меньше, чем в оригинале.
import { serve, launch } from "./lib.mjs";
import { DOCS } from "./restyle.config.mjs";

const srv = await serve();
const browser = await launch();
const words = (t) => (t.toLowerCase().match(/[\p{L}\p{N}]+/gu) || []);
let bad = 0;

for (const doc of DOCS) {
  const page = await browser.newPage();
  const grab = async (url, strip) => {
    await page.goto(url, { waitUntil: "domcontentloaded" });
    return page.evaluate((strip) => {
      document.querySelectorAll("style, script, noscript, " + strip).forEach((el) => el.remove());
      const parts = [];
      const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
      for (let n; (n = w.nextNode());) parts.push(n.textContent);
      return parts.join(" ");
    }, strip);
  };
  // В оригинале не считаем то, что заменено колонтитулами и обложкой: подвалы, навигацию, номера страниц
  let src = await grab(`${srv.url}/showcase/${encodeURIComponent(doc.source)}`, ".footer, footer, nav, .layer-badge, .tb-v7-item-icon");
  src = src.replace(/Страница\s+\d+\s+из\s+\d+/g, "");
  for (const [a, b] of doc.replace || []) src = src.split(a).join(b);
  const out = await grab(`${srv.url}/showcase/docs/${doc.id}.html`, ".cover, .folio");

  const have = new Map();
  for (const w of words(out)) have.set(w, (have.get(w) || 0) + 1);
  const lost = new Map();
  for (const w of words(src)) {
    const n = have.get(w) || 0;
    if (n > 0) have.set(w, n - 1); else lost.set(w, (lost.get(w) || 0) + 1);
  }
  const list = [...lost].map(([w, n]) => (n > 1 ? `${w}×${n}` : w));
  console.log(`${doc.id}: ${words(src).length} слов в оригинале, потеряно ${list.length ? list.length + ": " + list.join(", ") : "0"}`);
  bad += list.length;
  await page.close();
}

await browser.close();
await srv.close();
process.exit(bad ? 1 : 0);
