// Captura la comparación de estatuas (comparar-estatuas.html) en varias vistas.
//   node scripts/qa-comparar-estatuas.mjs <base> <salida_dir> "<query1>" "<query2>" ...
import { chromium } from 'playwright';
import path from 'node:path';
const [, , base, out, ...queries] = process.argv;
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--ignore-gpu-blocklist', '--use-angle=d3d11'] });
const page = await browser.newPage({ viewport: { width: 1800, height: 1000 } });
for (const [i, q] of queries.entries()) {
  await page.goto(`${base}/comparar-estatuas.html?${q}`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => document.title === 'listo', null, { timeout: 180000 });
  const tris = await page.evaluate(() => window.__tris);
  await page.screenshot({ path: path.join(out, `comparar-${i}.png`) });
  console.log(i, q, 'triángulos:', tris.map((t) => Math.round(t)).join(' / '));
}
await browser.close();
