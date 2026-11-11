// Превью и PDF для витрины. Запуск: npm run previews
// Читает showcase/examples.js, снимает верх каждого документа в showcase/previews/<id>.webp
// и печатает документы с pdf: true в showcase/pdf/<id>.pdf.
import fs from "node:fs";
import path from "node:path";
import { ROOT, serve, launch } from "./lib.mjs";

const win = {};
new Function("window", fs.readFileSync(path.join(ROOT, "showcase/examples.js"), "utf8"))(win);
const examples = win.HTDC_EXAMPLES;

const previews = path.join(ROOT, "showcase/previews");
const pdfs = path.join(ROOT, "showcase/pdf");
fs.mkdirSync(previews, { recursive: true });
fs.mkdirSync(pdfs, { recursive: true });

const srv = await serve();
const browser = await launch();
const WIDTH = 1280;

for (const ex of examples) {
  const page = await browser.newPage();
  await page.setViewport({ width: WIDTH, height: 1000, deviceScaleFactor: 1 });
  await page.goto(`${srv.url}/showcase/${encodeURIComponent(ex.file)}`, { waitUntil: "networkidle2" });
  await new Promise((r) => setTimeout(r, 1200)); // шрифты и canvas-анимации

  let clip;
  if (ex.clip.selector) {
    const box = await (await page.$(ex.clip.selector)).boundingBox();
    clip = { x: Math.round(box.x), y: Math.round(box.y), width: Math.round(box.width),
      height: Math.min(Math.round(box.height), ex.clip.height ?? Infinity) };
  } else {
    clip = { x: 0, y: 0, width: WIDTH, height: ex.clip.height };
  }
  const img = path.join(previews, `${ex.id}.webp`);
  await page.screenshot({ path: img, type: "webp", quality: 82, clip });
  let line = `${ex.id}: превью ${clip.width}×${clip.height}, ${Math.round(fs.statSync(img).size / 1024)} КБ`;

  if (ex.pdf) {
    const file = path.join(pdfs, `${ex.id}.pdf`);
    await page.pdf({ path: file, printBackground: true, preferCSSPageSize: true });
    line += `; PDF ${Math.round(fs.statSync(file).size / 1024)} КБ`;
  }
  console.log(line);
  await page.close();
}

await browser.close();
await srv.close();
