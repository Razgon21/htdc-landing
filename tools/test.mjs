// Тесты лендинга. Запуск: npm test
// Статические проверки файлов и проверки в настоящем браузере (системный Chrome или Edge).
// Контраст меряется по пикселям: текст прячется, снимается то, что реально под ним (туман, сфера, плашки).
import fs from "node:fs";
import path from "node:path";
import { ROOT, serve, launch } from "./lib.mjs";

const results = [];
const ok = (name, pass, detail = "") => { results.push({ name, pass, detail }); console.log(`${pass ? "  ok  " : " FAIL "} ${name}${detail ? " — " + detail : ""}`); };
const note = (text) => console.log(`  ··   ${text}`);
const read = (f) => fs.readFileSync(path.join(ROOT, f), "utf8");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* ================= Статика ================= */
console.log("\nСтатика");
const PAGES = ["index.html", "tools.html", "history.html"];
const html = read("index.html");
const pages = Object.fromEntries([...PAGES, "example.html", "policy.html"].map((f) => [f, read(f)]));
const idsOf = (src) => [...src.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]);
const textOf = (src) => src.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>|<!--[\s\S]*?-->/g, "").replace(/<[^>]+>/g, " ");

{
  const dup = [], dead = [], missing = [];
  for (const [file, src] of Object.entries(pages)) {
    const ids = idsOf(src);
    dup.push(...ids.filter((id, i) => ids.indexOf(id) !== i).map((id) => file + "#" + id));
    // Якоря на этой странице и на соседних: и файл, и блок должны существовать
    for (const [, target, hash] of src.matchAll(/href="([a-z]+\.html)?#([^"]+)"/g)) {
      const where = target ?? file;
      if (!pages[where] || !idsOf(pages[where]).includes(hash)) dead.push(file + " → " + where + "#" + hash);
    }
    const local = [...src.matchAll(/(?:href|src)="([^"#:?]+\.[a-z0-9]+)(?:[?#][^"]*)?"/gi)].map((m) => m[1]);
    missing.push(...local.filter((f) => !fs.existsSync(path.join(ROOT, decodeURIComponent(f)))).map((f) => file + " → " + f));
  }
  ok("id на страницах не повторяются", dup.length === 0, dup.join(", "));
  ok("все якорные ссылки ведут на существующие блоки, в том числе на соседних страницах", dead.length === 0, [...new Set(dead)].join(", "));
  ok("все локальные файлы из разметки существуют", missing.length === 0, [...new Set(missing)].join(", "));
}

{
  // Клиентский текст без внутреннего жаргона методологии (ограничение брифа)
  const banned = [/\bV7\b/i, /индекс/i, /\bИРК\b/, /\bИФ\b/, /\bКС\b/, /шлюз/i, /\bЛПР\b/, /энтроп/i, /диссонанс/i];
  const promises = [/рост(а|у)? (выручки|прибыли) на/i, /гарантир/i, /увелич\w+ (выручк|прибыл)/i];
  const hits = [], p = [], dashes = [];
  for (const file of PAGES) {
    const text = textOf(pages[file]);
    hits.push(...banned.filter((re) => re.test(text)).map((re) => file + " " + re));
    p.push(...promises.filter((re) => re.test(text)).map((re) => file + " " + re));
  }
  const DASH = /.{0,24}—.{0,12}/g;
  for (const [file, src] of Object.entries(pages)) {
    const shown = src.replace(/<!--[\s\S]*?-->/g, "").replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
    dashes.push(...(shown.match(DASH) || []).slice(0, 2).map((t) => file + ": «" + t.trim() + "»"));
  }
  // Тексты, которые страница показывает из скрипта
  const js = read("main.js").replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
  dashes.push(...(js.match(DASH) || []).slice(0, 2).map((t) => "main.js: «" + t.trim() + "»"));
  ok("в клиентских текстах нет жаргона методологии", hits.length === 0, hits.join(", "));
  ok("нет обещаний финансового результата", p.length === 0, p.join(", "));
  ok("в текстах сайта нет длинных тире", dashes.length === 0, dashes.join(" | "));

  ok("форма: согласие по 152-ФЗ и ссылка на политику",
    /name="consent"[^>]*required/.test(html) && /href="policy\.html"/.test(html) && !/name="consent"[^>]*checked/.test(html));
  ok("адрес отправки формы задан одной константой", (read("main.js").match(/FORM_ENDPOINT/g) || []).length >= 2 && /const FORM_ENDPOINT = /.test(read("main.js")));
}

const win = {};
new Function("window", read("showcase/examples.js"))(win);
const examples = win.HTDC_EXAMPLES;
{
  const bad = [];
  for (const ex of examples) {
    if (!fs.existsSync(path.join(ROOT, "showcase", ex.file))) bad.push(ex.id + ": нет документа");
    if (!fs.existsSync(path.join(ROOT, "showcase/previews", ex.id + ".webp"))) bad.push(ex.id + ": нет превью");
    if (!ex.pdf || !fs.existsSync(path.join(ROOT, "showcase", ex.pdf))) bad.push(ex.id + ": нет PDF");
    else if (fs.statSync(path.join(ROOT, "showcase", ex.pdf)).mtimeMs + 60000 < fs.statSync(path.join(ROOT, "showcase", ex.file)).mtimeMs) bad.push(ex.id + ": PDF старше документа");
  }
  ok("витрина: у каждого из " + examples.length + " примеров есть оформленный документ, превью и свежий PDF", bad.length === 0, bad.join("; "));
  const linked = [...pages["tools.html"].matchAll(/example\.html\?doc=([a-z-]+)/g)].map((m) => m[1]);
  const unknown = linked.filter((id) => !examples.some((e) => e.id === id));
  ok("витрина: страница инструментов ссылается на все примеры из реестра", unknown.length === 0 && linked.length === examples.length, unknown.join(", "));
  const old = examples.filter((ex) => !ex.file.startsWith("docs/")).map((ex) => ex.id);
  ok("витрина: открываются только обновлённые документы из showcase/docs", old.length === 0, old.join(", "));
}

/* ================= Браузер ================= */
const srv = await serve();
const browser = await launch();
const helper = await browser.newPage(); // страница-помощник для разбора скриншотов

const VIEWS = {
  desktop: { width: 1440, height: 900, deviceScaleFactor: 1 },
  tablet: { width: 820, height: 1180, deviceScaleFactor: 1, hasTouch: true },
  phone: { width: 375, height: 812, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
};

async function open(view, { reduced = false, file = "index.html" } = {}) {
  const page = await browser.newPage();
  await page.setViewport(VIEWS[view]);
  if (reduced) await page.emulateMediaFeatures([{ name: "prefers-reduced-motion", value: "reduce" }]);
  const errors = [];
  page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("requestfailed", (r) => errors.push("не загрузилось: " + r.url()));
  page.on("response", (r) => { if (r.status() >= 400) errors.push(`${r.status()}: ${r.url()}`); });
  await page.goto(`${srv.url}/${file}`, { waitUntil: "networkidle2" });
  await page.evaluate(() => document.fonts.ready);
  await sleep(600);
  return { page, errors };
}

const scrollTo = (page, y) => page.evaluate(async (target) => {
  const start = scrollY, steps = 12;
  for (let k = 1; k <= steps; k++) {
    scrollTo({ top: start + (target - start) * k / steps, behavior: "instant" });
    await new Promise((r) => requestAnimationFrame(r));
  }
}, y);

// Худший контраст по пикселям: прячем текст, снимаем экран, под каждым текстовым блоком берём самый светлый
// (для тёмного текста — самый тёмный) пиксель фона и считаем контраст с цветом текста.
async function pixelContrast(page) {
  const height = await page.evaluate(() => document.documentElement.scrollHeight);
  const vh = page.viewport().height;
  const dpr = page.viewport().deviceScaleFactor || 1;
  const worst = [];
  for (let y = 0; y < height - vh * 0.2; y += Math.round(vh * 0.8)) {
    await scrollTo(page, y);
    await sleep(1500); // появления должны закончиться
    await page.evaluate(() => {
      const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
      let node;
      while ((node = walker.nextNode())) if (node.textContent.trim()) node.parentElement.__color = getComputedStyle(node.parentElement).color;
    });
    const handle = await page.addStyleTag({ content: "*{color:transparent!important;text-decoration-color:transparent!important} input,textarea{caret-color:transparent!important}" });
    await sleep(500); // переходы цвета
    const boxes = await page.evaluate(() => {
      const lum = (c) => { const [r, g, b] = c.match(/[\d.]+/g).map(Number).map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
      const out = [];
      const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
      let node;
      while ((node = walker.nextNode())) {
        if (!node.textContent.trim()) continue;
        const el = node.parentElement;
        const cs = getComputedStyle(el);
        if (cs.visibility === "hidden" || cs.display === "none" || +cs.opacity < 0.99 || el.closest("[aria-hidden=true], .sr-only, [hidden]")) continue;
        // Пропускаем то, что ещё не появилось (родитель прозрачен)
        let p = el, faded = false;
        while (p && p !== document.body) { if (+getComputedStyle(p).opacity < 0.99) { faded = true; break; } p = p.parentElement; }
        if (faded) continue;
        const range = document.createRange();
        range.selectNodeContents(node);
        for (const r of range.getClientRects()) {
          if (r.width < 4 || r.top < 0 || r.bottom > innerHeight || r.left < 0 || r.right > innerWidth) continue;
          // Текст, перекрытый другим слоем (шапкой, плашкой), не виден и не меряется
          const own = (x, y) => { const t = document.elementFromPoint(x, y); return t && (el.contains(t) || t.contains(el)); };
          const mx = r.left + r.width / 2;
          if (!own(mx, r.top + 1) || !own(mx, r.top + r.height / 2) || !own(mx, r.bottom - 1)) continue;
          out.push({ x: r.left, y: r.top, w: r.width, h: r.height, lum: lum(el.__color), size: parseFloat(cs.fontSize), weight: +cs.fontWeight,
            text: node.textContent.trim().slice(0, 28), cls: el.className || el.tagName });
        }
      }
      return out;
    });
    {
        const shot = await page.screenshot({ encoding: "base64" });
        await handle.evaluate((el) => el.remove());
        const measured = await helper.evaluate(async (b64, rects, k) => {
          const img = new Image();
          img.src = "data:image/png;base64," + b64;
          await img.decode();
          const c = document.createElement("canvas");
          c.width = img.width; c.height = img.height;
          const g = c.getContext("2d", { willReadFrequently: true });
          g.drawImage(img, 0, 0);
          const lin = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
          return rects.map((r) => {
            const x = Math.max(0, Math.floor(r.x * k)), y = Math.max(0, Math.floor(r.y * k));
            const w = Math.min(c.width - x, Math.ceil(r.w * k)), h = Math.min(c.height - y, Math.ceil(r.h * k));
            if (w <= 0 || h <= 0) return null;
            const d = g.getImageData(x, y, w, h).data;
            let lo = 1, hi = 0;
            for (let i = 0; i < d.length; i += 4 * 3) {
              const L = 0.2126 * lin(d[i]) + 0.7152 * lin(d[i + 1]) + 0.0722 * lin(d[i + 2]);
              if (L < lo) lo = L; if (L > hi) hi = L;
            }
            // Худший случай: фон, ближайший по светлоте к тексту
            const bg = Math.abs(hi - r.lum) < Math.abs(lo - r.lum) ? hi : lo;
            const ratio = (Math.max(bg, r.lum) + 0.05) / (Math.min(bg, r.lum) + 0.05);
            return { ...r, ratio };
          });
        }, shot, boxes, dpr);
        for (const m of measured) {
          if (!m) continue;
          const large = m.size >= 24 || (m.size >= 18.66 && m.weight >= 700);
          if (m.ratio < (large ? 3 : 4.5)) worst.push(`${m.ratio.toFixed(2)} «${m.text}» (${m.cls}, y=${Math.round(y + m.y)})`);
        }
    }
  }
  return [...new Set(worst)];
}

async function checkPage(view, file) {
  console.log("\nБраузер · " + file + " · " + view + " " + VIEWS[view].width + "×" + VIEWS[view].height);
  const { page, errors } = await open(view, { file });

  ok("WebGL работает: туман и сфера на шейдерах", await page.evaluate(() => !document.documentElement.classList.contains("no-gl")));
  const round = await page.evaluate(() => { const r = document.querySelector(".sphere").getBoundingClientRect(); return r.width / r.height; });
  ok("сфера круглая, а не овал", Math.abs(round - 1) < 0.01, "ширина к высоте " + round.toFixed(3));

  if (file === "index.html") {
    // Вступление: каждый экран помещается целиком, текст не уходит под шапку и под полоски
    const fit = [];
    const n = await page.$$eval("[data-slide]", (els) => els.length);
    for (let i = 0; i < n; i++) {
      await page.evaluate((k) => scrollTo({ top: k * document.querySelector(".intro__stage").offsetHeight, behavior: "instant" }), i);
      await sleep(700);
      const r = await page.evaluate((k) => {
        const t = document.querySelectorAll(".slide__text")[k].getBoundingClientRect();
        const ui = document.querySelector(".intro__ui").getBoundingClientRect();
        const nav = document.querySelector(".nav").getBoundingClientRect();
        const o = +getComputedStyle(document.querySelectorAll(".slide__text")[k]).opacity;
        return { top: t.top - nav.bottom, bottom: ui.top - t.bottom, o };
      }, i);
      if (r.top < 0 || r.bottom < 4 || r.o < 0.99) fit.push("экран " + (i + 1) + ": до шапки " + Math.round(r.top) + ", до полосок " + Math.round(r.bottom) + ", видимость " + r.o);
    }
    ok("вступление: текст каждого экрана помещается между шапкой и полосками", fit.length === 0, fit.join("; "));
    await page.evaluate(() => scrollTo({ top: 0, behavior: "instant" }));
  }

  // Пройти страницу до конца, чтобы сработали все появления и подгрузились картинки
  const height = await page.evaluate(() => document.documentElement.scrollHeight);
  for (let y = 0; y < height; y += VIEWS[view].height * 0.7) { await scrollTo(page, y); await sleep(160); }
  await sleep(500);

  ok("нет ошибок в консоли и сбоев загрузки", errors.length === 0, errors.slice(0, 3).join(" | "));
  const over = await page.evaluate((w) => Math.max(document.documentElement.scrollWidth, innerWidth) - w, VIEWS[view].width);
  const wide = over > 0 ? await page.evaluate(() => [...document.querySelectorAll("body *")].filter((el) => el.getBoundingClientRect().right > innerWidth + 0.5 && !el.closest(".sheets"))
    .slice(0, 4).map((el) => (el.className || el.tagName) + " " + Math.round(el.getBoundingClientRect().right)).join(", ")) : "";
  ok("нет горизонтальной прокрутки", over <= 0, over > 0 ? "лишние " + over + "px: " + wide : "");

  // Заголовки экранов вступления и внутренних страниц длиннее обычных: это целые фразы
  const lines = await page.evaluate(() => [...document.querySelectorAll("h1, h2")].map((h) => {
    const lh = parseFloat(getComputedStyle(h).lineHeight);
    return { text: h.textContent.trim().slice(0, 30), lines: Math.round(h.getBoundingClientRect().height / lh), slide: h.matches(".slide__title, .page-head__title, .chron__title, .exhibit__title") };
  }));
  const limit = view === "phone" ? 3 : 2;
  const long = lines.filter((l) => l.lines > limit + (l.slide ? 2 : 0));
  ok("заголовки не длиннее " + limit + " строк (фразы вступления: " + (limit + 2) + ")", long.length === 0, long.map((l) => "«" + l.text + "»: " + l.lines).join("; "));

  const imgs = await page.evaluate(() => [...document.images].filter((i) => !i.complete || i.naturalWidth === 0).map((i) => i.getAttribute("src")));
  ok("все картинки загрузились", imgs.length === 0, imgs.join(", "));

  const hidden = await page.evaluate(() => [...document.querySelectorAll("[data-reveal] > *, [data-reveal-self]")]
    .filter((el) => +getComputedStyle(el).opacity < 0.99 && el.getBoundingClientRect().height > 0).length);
  ok("после прокрутки не осталось скрытого содержимого", hidden === 0, hidden ? hidden + " элементов" : "");

  const small = await page.evaluate(() => [...document.querySelectorAll("a, button, input, summary")].filter((el) => {
    if (el.closest("[hidden]") || el.matches(".skip")) return false;
    if (el.matches("a") && el.parentElement.textContent.trim().length > el.textContent.trim().length + 8) return false; // ссылка внутри предложения
    const r = (el.matches("input[type=checkbox], input[type=radio]") ? el.closest("label") : el).getBoundingClientRect();
    return r.width > 0 && (r.height < 24 || r.width < 24);
  }).map((el) => el.textContent.trim().slice(0, 20) || el.name || el.className));
  ok("элементы управления не меньше 24 px", small.length === 0, small.join(", "));

  const bad = await pixelContrast(page);
  ok("контраст текста по пикселям не ниже WCAG AA", bad.length === 0, bad.slice(0, 5).join(" | ") + (bad.length > 5 ? " … ещё " + (bad.length - 5) : ""));
  await page.close();
}

for (const view of ["desktop", "tablet", "phone"]) await checkPage(view, "index.html");
for (const file of ["tools.html", "history.html"]) for (const view of ["desktop", "phone"]) await checkPage(view, file);

/* ---------- Поведение (десктоп) ---------- */
console.log("\nПоведение");
{
  const { page } = await open("desktop");

  // Клавиатура: Tab проходит все элементы управления по порядку, фокус виден
  const expected = await page.evaluate(() => [...document.querySelectorAll("a[href], button, input, textarea, summary")]
    .filter((el) => !el.closest("[hidden]") && getComputedStyle(el).visibility !== "hidden" && el.getClientRects().length).length);
  let reached = 0, invisible = 0, first = "";
  for (let i = 0; i < expected + 5; i++) {
    await page.keyboard.press("Tab");
    const info = await page.evaluate(() => {
      const el = document.activeElement;
      if (!el || el === document.body) return null;
      const cs = getComputedStyle(el);
      const ring = cs.outlineStyle !== "none" && parseFloat(cs.outlineWidth) > 0 || cs.boxShadow !== "none";
      return { text: el.textContent.trim().slice(0, 24), ring, tag: el.tagName, type: el.type };
    });
    if (!info) break;
    if (i === 0) first = info.text;
    reached++;
    if (!info.ring) invisible++;
  }
  // Радиокнопки одной группы — одна остановка Tab
  ok("клавиатура: Tab доходит до всех элементов управления", reached >= expected - 3, `${reached} из ${expected}`);
  ok("клавиатура: первый фокус — ссылка «К содержанию»", first === "К содержанию", first);
  ok("клавиатура: фокус всегда виден", invisible === 0, invisible ? `${invisible} без обводки` : "");

  // Ситуации: отметил — появился разбор; выбор уезжает в заявку
  await page.evaluate(() => document.querySelector("#situations").scrollIntoView({ behavior: "instant" }));
  await page.click('.check input[value="s2"]');
  await page.click('.check input[value="s5"]');
  const shown = await page.evaluate(() => [...document.querySelectorAll(".reading__item")].filter((el) => getComputedStyle(el).display !== "none").map((el) => el.dataset.for).join(","));
  ok("ситуации: разбор появляется для отмеченных пунктов", shown === "s2,s5", shown);
  await page.evaluate(() => document.querySelector("[data-discuss]").click());
  const msg = await page.$eval("#f-message", (el) => el.value);
  ok("ситуации: выбор переносится в сообщение заявки", msg.includes("На совещании все согласны") && msg.includes("Без вас ничего не решается"));

  // Форма
  await page.evaluate(() => document.querySelector("[data-form]").requestSubmit());
  await sleep(100);
  const errs = await page.$$eval(".form__err:not([hidden])", (els) => els.length);
  const focus = await page.evaluate(() => document.activeElement.id);
  ok("форма: пустая отправка показывает 4 ошибки и ставит фокус в первое поле", errs === 4 && focus === "f-name", `ошибок ${errs}, фокус ${focus}`);
  await page.type("#f-name", "Андрей");
  await page.type("#f-company", "Тест");
  await page.type("#f-phone", "8 (999) 123-45-67");
  await page.click('input[name="consent"]');
  await page.evaluate(() => document.querySelector("[data-form]").requestSubmit());
  await sleep(1300);
  const done = await page.evaluate(() => document.activeElement.className + ": " + document.activeElement.textContent.slice(0, 22));
  ok("форма: после отправки появляется подтверждение, фокус на нём", done.startsWith("form__done"), done);

  // Сфера: за туманом на первом экране, резкая на третьем, мягкий свет между якорями, снова резкая при прокрутке назад
  const sphere = () => page.evaluate(() => {
    const el = document.querySelector(".sphere");
    const r = el.getBoundingClientRect();
    return { visible: getComputedStyle(el).visibility === "visible", w: r.width, x: r.left + r.width / 2, y: r.top + r.height / 2 };
  });
  const H = await page.evaluate(() => document.querySelector(".intro__stage").offsetHeight);
  await scrollTo(page, 0); await sleep(900);
  const s0 = await sphere();
  await scrollTo(page, 2 * H); await sleep(1200);
  const s1 = await sphere();
  const mid = await page.evaluate(() => document.querySelector("#situations").getBoundingClientRect().top + scrollY + 200);
  await scrollTo(page, mid); await sleep(900);
  const s2 = await sphere();
  await scrollTo(page, 2 * H); await sleep(1200);
  const s3 = await sphere();
  ok("сфера: свет за туманом на первом экране, резкая на третьем, уходит в свет между якорями и возвращается",
    !s0.visible && s1.visible && s1.w > 400 && !s2.visible && s3.visible && Math.abs(s3.w - s1.w) < 12,
    (s0.visible ? "видна" : "свет") + " → " + Math.round(s1.w) + " → " + (s2.visible ? Math.round(s2.w) : "свет") + " → " + Math.round(s3.w));

  // Сфера ходит не только по середине страницы: справа во вступлении, слева у принципов
  await page.evaluate(() => document.querySelector("#approach .guide__row").scrollIntoView({ block: "center", behavior: "instant" }));
  await sleep(1400);
  const s4 = await sphere();
  const lit = await page.evaluate(() => [...document.querySelectorAll("#approach .guide__row")].map((r) => r.classList.contains("is-on") ? 1 : 0).join(""));
  ok("сфера: во вступлении стоит справа, у принципов слева и подсвечивает одну строку",
    s1.x > 1440 * 0.6 && s4.visible && s4.x < 1440 * 0.2 && s4.w < 120 && lit.split("1").length === 2, "x " + Math.round(s1.x) + " → " + Math.round(s4.x) + ", строки " + lit);

  // Мягкий свет встаёт за отмеченный пункт
  await page.evaluate(() => document.querySelector("#situations").scrollIntoView({ behavior: "instant" }));
  await sleep(600);
  await page.click('.check input[value="s4"]');
  await sleep(1500);
  const spot = await page.evaluate(() => {
    const b = document.querySelector('.check input[value="s4"]').getBoundingClientRect();
    const s = document.querySelector(".sphere").getBoundingClientRect();
    return Math.hypot(b.left + b.width / 2 - (s.left + s.width / 2), b.top + b.height / 2 - (s.top + s.height / 2));
  });
  ok("свет: встаёт за отмеченным пунктом", spot < 6, "смещение " + spot.toFixed(1) + "px");
  await page.click('.check input[value="s4"]');

  // Шапка: отмечает текущий раздел
  await page.evaluate(() => document.querySelector("#process").scrollIntoView({ behavior: "instant" }));
  await sleep(400);
  const current = await page.evaluate(() => [...document.querySelectorAll(".nav__links a[aria-current]")].map((a) => a.textContent).join(","));
  ok("шапка: отмечает раздел, который сейчас на экране", current === "Как проходит", current);

  // Плавность: интервалы между кадрами при прокрутке. В headless шейдеры считает процессор, поэтому это только справка
  const frames = await page.evaluate(async () => {
    const t = [];
    let y = 0;
    await new Promise((res) => {
      const tick = (now) => { t.push(now); y += 12; scrollTo({ top: y, behavior: "instant" }); t.length < 120 ? requestAnimationFrame(tick) : res(); };
      requestAnimationFrame(tick);
    });
    const d = t.slice(1).map((v, i) => v - t[i]).sort((a, b) => a - b);
    return { median: d[Math.floor(d.length / 2)], p95: d[Math.floor(d.length * 0.95)] };
  });
  note(`кадр при прокрутке (без видеокарты): медиана ${frames.median.toFixed(1)} мс, 95-й перцентиль ${frames.p95.toFixed(1)} мс`);
  await page.close();
}

/* ---------- Вступление: доводка и автолистание ---------- */
{
  const { page } = await open("desktop");
  const H = await page.evaluate(() => document.querySelector(".intro__stage").offsetHeight);
  const at = () => page.evaluate(() => scrollY);
  const near = (y, target) => Math.abs(y - target) < 3;

  // Автолистание: пока посетитель ничего не трогает, экран сменяется сам. Время ожидания сокращено для проверки
  await page.evaluate(() => {
    for (const s of document.querySelectorAll("[data-slide]")) if (s.dataset.hold) s.dataset.hold = "0.4";
    const play = document.querySelector("[data-play]");
    if (play.hasAttribute("data-paused")) play.click(); else { play.click(); play.click(); }
  });
  await sleep(2600);
  const a1 = await at();
  ok("вступление: без действий посетителя экраны листаются сами", a1 >= H - 3, "прокрутка " + Math.round(a1) + " при высоте экрана " + H);
  await sleep(6500);
  const a2 = await at();
  const paused = await page.$eval("[data-play]", (el) => el.hasAttribute("data-paused"));
  ok("вступление: автолистание доходит до последнего экрана и останавливается", near(a2, 3 * H) && paused, "прокрутка " + Math.round(a2) + ", пауза " + paused);

  // Доводка: небольшая прокрутка довозит до следующего экрана, в обе стороны
  await page.evaluate(() => scrollTo({ top: 0, behavior: "instant" }));
  await sleep(500);
  await page.mouse.move(700, 450);
  await page.mouse.wheel({ deltaY: 160 });
  await sleep(1800);
  const w1 = await at();
  await page.mouse.wheel({ deltaY: -160 });
  await sleep(1800);
  const w2 = await at();
  ok("вступление: прокрутка сама доезжает до соседнего экрана, вперёд и назад", near(w1, H) && near(w2, 0), Math.round(w1) + " → " + Math.round(w2));

  // Любое действие отключает автолистание
  const stopped = await page.$eval("[data-play]", (el) => el.hasAttribute("data-paused"));
  ok("вступление: действие посетителя отключает автолистание", stopped);

  // «Дальше» и полоски
  await page.click("[data-next]");
  await sleep(1300);
  const n1 = await at();
  await page.click('[data-go="3"]');
  await sleep(1600);
  const n2 = await at();
  const lastNext = await page.$eval("[data-next]", (el) => el.hidden);
  ok("вступление: «Дальше» и полоски переключают экраны", near(n1, H) && near(n2, 3 * H) && lastNext, Math.round(n1) + " → " + Math.round(n2));

  // Ссылка из шапки не спорит с доводкой
  await page.evaluate(() => scrollTo({ top: 0, behavior: "instant" }));
  await sleep(400);
  await page.mouse.wheel({ deltaY: 160 });
  await sleep(250);
  await page.click('.nav__links a[href="#formats"]');
  await sleep(2500);
  const gap = await page.evaluate(() => Math.abs(document.querySelector("#formats").getBoundingClientRect().top - 96));
  ok("вступление: переход по ссылке шапки во время доводки доходит до раздела", gap < 4, "мимо на " + Math.round(gap) + "px");
  await page.close();
}

/* ---------- Меню на телефоне и внутренние страницы ---------- */
{
  const { page } = await open("phone");
  const shown = () => page.evaluate(() => getComputedStyle(document.querySelector(".nav__links")).visibility === "visible");
  const before = await shown();
  await page.click(".nav__toggle");
  await sleep(600);
  const opened = await shown();
  await page.keyboard.press("Escape");
  await sleep(600);
  const closed = !(await shown());
  await page.click(".nav__toggle");
  await sleep(500);
  await page.evaluate(() => document.querySelector('.nav__links a[href="#faq"]').click());
  await sleep(2200);
  const arrived = await page.evaluate(() => Math.abs(document.querySelector("#faq").getBoundingClientRect().top) < innerHeight * 0.5);
  ok("меню на телефоне: открывается кнопкой, закрывается по Escape, ссылка ведёт к разделу", !before && opened && closed && arrived && !(await shown()),
    [before, opened, closed, arrived].join(","));
  await page.close();

  // С внутренних страниц шапка ведёт на главную и на соседнюю страницу
  const sub = await open("desktop", { file: "tools.html" });
  const hrefs = await sub.page.$$eval(".nav__links a", (els) => els.map((a) => a.getAttribute("href") + (a.getAttribute("aria-current") ? "*" : "")).join(" "));
  ok("внутренние страницы: шапка ведёт к разделам главной, текущая страница отмечена",
    hrefs.includes("index.html#situations") && hrefs.includes("tools.html*") && hrefs.includes("history.html"), hrefs);
  await sub.page.goto(srv.url + "/index.html#history", { waitUntil: "networkidle2" });
  await sleep(1200);
  const landed = await sub.page.evaluate(() => { const r = document.querySelector("#history").getBoundingClientRect(); return r.top > -5 && r.top < innerHeight * 0.5; });
  ok("ссылка на раздел главной с внутренней страницы открывает главную сразу на этом разделе", landed);
  await sub.page.close();
}

/* ---------- Просмотр примеров ---------- */
{
  const page = await browser.newPage();
  await page.setViewport(VIEWS.desktop);
  const bad = [];
  for (const ex of examples) {
    await page.goto(`${srv.url}/example.html?doc=${ex.id}`, { waitUntil: "networkidle2" });
    const state = await page.evaluate(() => {
      const f = document.querySelector("[data-frame]");
      const pdf = document.querySelector("[data-pdf]");
      return { title: document.querySelector("[data-title]").textContent, loaded: !f.hidden && f.contentDocument?.body?.textContent.length > 200, pdf: pdf.hidden ? null : pdf.getAttribute("href") };
    });
    if (!state.loaded) bad.push(`${ex.id}: документ не открылся`);
    const fill = await page.evaluate(() => { const f = document.querySelector("[data-frame]").getBoundingClientRect(); return (f.bottom - f.top) / (innerHeight - f.top); });
    if (fill < 0.98) bad.push(`${ex.id}: рамка занимает ${Math.round(fill * 100)}% высоты`);
    if (state.title !== ex.title) bad.push(`${ex.id}: заголовок`);
    if (ex.pdf) {
      const res = await page.evaluate((u) => fetch(u).then((r) => r.status), state.pdf);
      if (res !== 200) bad.push(`${ex.id}: PDF ${res}`);
      if (!String(state.pdf).startsWith("showcase/docs/")) bad.push(`${ex.id}: PDF не из showcase/docs`);
    }
  }
  ok(`примеры: все ${examples.length} открываются в рамке, PDF скачиваются`, bad.length === 0, bad.join("; "));
  await page.goto(`${srv.url}/example.html?doc=nope`, { waitUntil: "networkidle2" });
  const listed = await page.$$eval("[data-list] a", (els) => els.length);
  ok("примеры: неизвестная ссылка показывает список всех примеров", listed === examples.length, String(listed));
  await page.close();
}

/* ---------- Без анимации ---------- */
console.log("\nprefers-reduced-motion: reduce");
{
  const { page, errors } = await open("desktop", { reduced: true });
  const st = await page.evaluate(() => ({
    motion: document.documentElement.classList.contains("motion"),
    hidden: [...document.querySelectorAll("main *")].filter((el) => +getComputedStyle(el).opacity < 0.99 && el.getClientRects().length).length,
    scene: document.querySelector(".paper__scene").getBoundingClientRect().height / innerHeight,
    orbit: getComputedStyle(document.querySelector(".lens__orb"), "::after").animationDuration,
  }));
  ok("анимации появления выключены, всё содержимое видно сразу", !st.motion && st.hidden === 0, `скрыто ${st.hidden}`);
  ok("сцена раскрытия заменена обычным светлым листом", st.scene < 1.2, `высота ${st.scene.toFixed(2)} экрана`);
  const stacked = await page.evaluate(() => getComputedStyle(document.querySelector(".slide")).position !== "absolute" && getComputedStyle(document.querySelector(".intro__ui")).display === "none");
  ok("вступление без анимации: четыре обычных экрана подряд, без автолистания", stacked);
  await page.evaluate(() => document.querySelector(".slide--source").scrollIntoView({ behavior: "instant" }));
  await sleep(500);
  const a = await page.evaluate(() => { const s = document.querySelector(".sphere").getBoundingClientRect(), o = document.querySelector(".slide--source .slide__orb").getBoundingClientRect(); return Math.abs((s.left + s.width / 2) - (o.left + o.width / 2)) + Math.abs((s.top + s.height / 2) - (o.top + o.height / 2)); });
  ok("сфера стоит в своём слоте и не плавает", a < 2, `смещение ${a.toFixed(1)}px`);
  // Кадры не идут сами по себе: холст не перерисовывается без прокрутки
  const idle = await page.evaluate(async () => {
    const c = document.querySelector(".fog");
    const a1 = c.toDataURL(); await new Promise((r) => setTimeout(r, 700)); return a1 === c.toDataURL();
  });
  ok("фон не анимируется без действий пользователя", idle);
  ok("нет ошибок в консоли", errors.length === 0, errors.slice(0, 2).join(" | "));
  await page.close();
}

await browser.close();
await srv.close();

const failed = results.filter((r) => !r.pass);
console.log(`\nИтог: ${results.length - failed.length} из ${results.length} проверок пройдено.`);
if (failed.length) { console.log("Не прошли:\n" + failed.map((f) => `  — ${f.name}${f.detail ? ": " + f.detail : ""}`).join("\n")); process.exit(1); }
