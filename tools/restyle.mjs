// Пересборка документов витрины в стилистике сайта из оригиналов методолога.
// Запуск: node tools/restyle.mjs [id ...]
//
// Оригинал загружается в браузер как есть. Скрипт снимает старое оформление (стили, цвета, рамки),
// оставляет текст и компоновку, добавляет обложку и колонтитулы, переносит не поместившиеся блоки
// на дополнительные листы (операции split в tools/restyle.config.mjs) и сохраняет результат
// в showcase/docs/<id>.html. Оригиналы не меняются. После пересборки — node tools/docs.mjs.
import fs from "node:fs";
import path from "node:path";
import { ROOT, serve, launch } from "./lib.mjs";
import { DOCS } from "./restyle.config.mjs";

const only = process.argv.slice(2);
const srv = await serve();
const browser = await launch();

const HEAD = (title) => `<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title} — HTDC</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,500;0,600;1,500&family=Golos+Text:wght@400;500;600&display=swap" rel="stylesheet">
<link rel="stylesheet" href="doc.css">
<link rel="stylesheet" href="classic.css">
<script src="doc.js"></script>`;

for (const doc of DOCS.filter((d) => !only.length || only.includes(d.id))) {
  const page = await browser.newPage();
  await page.goto(`${srv.url}/showcase/${encodeURIComponent(doc.source)}`, { waitUntil: "domcontentloaded" });

  const html = await page.evaluate((cfg, ops) => {
    // 1. Убрать старое оформление и всё лишнее
    document.querySelectorAll("style, script, link, canvas, noscript").forEach((el) => el.remove());
    const KEEP = /^(display|flex|flex-direction|flex-grow|flex-shrink|flex-basis|flex-wrap|gap|row-gap|column-gap|grid-template-columns|grid-template-rows|grid-column|grid-row|align-items|align-self|justify-content|justify-self|width|text-align|order)$/;
    for (const el of document.querySelectorAll("[style]")) {
      const decls = el.getAttribute("style").split(";").map((d) => d.trim()).filter(Boolean);
      const decorative = decls.some((d) => /^background/.test(d));
      const keep = decls.filter((d) => KEEP.test(d.split(":")[0].trim().toLowerCase()) || /^margin-top\s*:\s*auto/.test(d));
      if (decorative) el.classList.add("blk");
      if (keep.length) el.setAttribute("style", keep.join(";")); else el.removeAttribute("style");
    }

    // Номера страниц из шапок оригинала: нумерация теперь сквозная в колонтитуле
    for (const el of document.querySelectorAll(".header-right *, .header-right")) {
      for (const t of [...el.childNodes].filter((x) => x.nodeType === 3)) t.textContent = t.textContent.replace(/Страница\s+\d+\s+из\s+\d+/g, "").trim();
    }
    document.querySelectorAll(".header-right span, .header-right strong").forEach((el) => { if (!el.textContent.trim()) el.remove(); });

    // 2. Замены в тексте (названия компаний и т. п.)
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    let n;
    while ((n = walker.nextNode())) for (const [a, b] of cfg.replace || []) n.textContent = n.textContent.split(a).join(b);

    // 3. Полоски у показателей: значение берём из текста
    for (const item of document.querySelectorAll(".metric-item")) {
      const head = item.querySelector(".metric-header");
      const val = head.lastElementChild?.textContent.trim() || "";
      const num = parseFloat(val);
      if (!isFinite(num)) continue;
      const bar = document.createElement("i");
      bar.className = "metric-bar" + (/трени|страх|диссонанс/i.test(head.textContent) ? " is-inverse" : "");
      bar.style.setProperty("--v", Math.min(100, num) + "%");
      head.after(bar);
    }

    // 4. Листы: класс .sheet, колонтитул из оригинального подвала
    const pages = [...document.querySelectorAll(cfg.pageSelector || "div.page")];
    for (const p of pages) {
      p.classList.add("page", "sheet");
      const old = p.querySelector(":scope > .footer");
      const label = old ? (old.lastElementChild?.textContent || "").split("·").slice(1).join("·").trim() : "";
      old?.remove();
      const folio = document.createElement("footer");
      folio.className = "folio";
      folio.innerHTML = `<span><b>HTDC</b>${cfg.folio}</span><span data-num></span>`;
      folio.dataset.label = label;
      p.append(folio);
    }

    for (const i of cfg.tight || []) pages[i]?.classList.add("tight");
    for (const i of cfg.airy || []) pages[i]?.classList.add("airy");

    // 5. Перенос блоков на дополнительные листы
    const helpers = {
      // Колонтитул для листов, которые операция собирает с нуля
      folio() {
        const f = document.createElement("footer");
        f.className = "folio";
        f.innerHTML = `<span><b>HTDC</b>${cfg.folio}</span><span data-num></span>`;
        f.dataset.label = "";
        return f;
      },
      // Новый лист после p: та же голова с пометкой «продолжение», пустое тело, колонтитул
      continueAfter(p, { sub, layout } = {}) {
        const np = document.createElement("div");
        np.className = p.className; // тот же вариант листа: плотный или просторный
        const head = p.querySelector(":scope > .header")?.cloneNode(true);
        if (head) {
          const subEl = head.querySelector(".header-left p");
          if (subEl && sub) subEl.textContent = sub;
          np.append(head);
        }
        const body = document.createElement("div");
        if (layout) body.className = layout;
        np.append(body);
        const folio = p.querySelector(":scope > .folio").cloneNode(true);
        np.append(folio);
        p.after(np);
        return { page: np, body };
      },
    };
    for (const op of ops) new Function("pages", "h", op)(pages, helpers);

    // 6. Обложка
    const c = cfg.cover;
    const cover = document.createElement("section");
    cover.className = "sheet cover";
    cover.innerHTML = `<p class="cover__mark">HTDC</p><p class="cover__kind">${c.kind}</p>
      <div class="cover__main"><h1 class="cover__title">${c.title}</h1><p class="cover__who">${c.who}</p>
      <dl class="cover__meta">${c.meta.map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join("")}</dl></div>
      <div class="cover__orb" aria-hidden="true"></div>
      <p class="cover__note">${c.note}</p>`;
    document.body.prepend(cover);

    // Оглавление без пропусков: h1 — только обложка, заголовки листов — h2, подразделы — h3
    const retag = (el, tag) => {
      const n = document.createElement(tag);
      for (const a of el.attributes) n.setAttribute(a.name, a.value);
      n.classList.add("was-" + el.tagName.toLowerCase());
      n.append(...el.childNodes);
      el.replaceWith(n);
    };
    document.querySelectorAll(".sheet:not(.cover) h1").forEach((el) => retag(el, "h2"));
    document.querySelectorAll(".sheet:not(.cover) h2:not(.was-h1)").forEach((el) => retag(el, "h3"));
    document.querySelectorAll(".sheet:not(.cover) h4, .sheet:not(.cover) h5").forEach((el) => retag(el, "h3"));

    // 7. Нумерация
    const all = [...document.querySelectorAll(".sheet")];
    all.forEach((s, i) => {
      const num = s.querySelector("[data-num]");
      if (!num) return;
      const label = s.querySelector(".folio").dataset.label;
      num.textContent = (label ? label + " · " : "") + `${i + 1} / ${all.length}`;
      s.querySelector(".folio").removeAttribute("data-label");
    });

    document.body.removeAttribute("style");
    return document.body.innerHTML.replace(/\n\s*\n\s*\n/g, "\n\n");
  }, doc, (doc.split || []).map((f) => `(${f.toString()})(pages, h)`));

  const out = `<!doctype html>\n<html lang="ru">\n<head>\n${HEAD(doc.title)}\n</head>\n<body${doc.bodyClass ? ` class="${doc.bodyClass}"` : ""}>\n<!-- Собрано tools/restyle.mjs из showcase/${doc.source}. Правки текста — в оригинале, затем пересборка. -->\n${html.trim()}\n</body>\n</html>\n`;
  fs.writeFileSync(path.join(ROOT, "showcase/docs", `${doc.id}.html`), out);
  console.log(`${doc.id}.html ← ${doc.source}`);
  await page.close();
}

await browser.close();
await srv.close();
