// Превью для витрины. Запуск: npm run previews
// Читает showcase/examples.js и снимает указанный лист каждого документа в showcase/previews/<id>.webp.
// PDF здесь не печатаются: их собирает tools/docs.mjs рядом с документами в showcase/docs/.
import fs from "node:fs";
import path from "node:path";
import { ROOT, serve, launch } from "./lib.mjs";

const win = {};
new Function("window", fs.readFileSync(path.join(ROOT, "showcase/examples.js"), "utf8"))(win);
const examples = win.HTDC_EXAMPLES;

const previews = path.join(ROOT, "showcase/previews");
fs.mkdirSync(previews, { recursive: true });

const srv = await serve();
const browser = await launch();

for (const ex of examples) {
  const page = await browser.newPage();
  await page.setViewport({ width: 1200, height: 900, deviceScaleFactor: 1 });
  await page.goto(`${srv.url}/showcase/${ex.file}`, { waitUntil: "networkidle2" });
  await page.evaluate(() => document.fonts.ready);
  await new Promise((r) => setTimeout(r, 600));

  const sheets = await page.$$(".sheet");
  const sheet = sheets[(ex.sheet ?? 1) - 1] ?? sheets[0];
  const img = path.join(previews, `${ex.id}.webp`);
  await sheet.screenshot({ path: img, type: "webp", quality: 84 });
  const box = await sheet.boundingBox();
  console.log(`${ex.id}: лист ${ex.sheet ?? 1} из ${sheets.length}, ${Math.round(box.width)}×${Math.round(box.height)}, ${Math.round(fs.statSync(img).size / 1024)} КБ`);
  await page.close();
}

await browser.close();
await srv.close();
