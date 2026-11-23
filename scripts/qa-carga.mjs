// Cuánto tarda cada parte de la carga (para encontrar qué demora el velo).
//   node scripts/qa-carga.mjs <base>
import { chromium } from 'playwright';
const [, , base = 'http://localhost:5173'] = process.argv;
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--ignore-gpu-blocklist', '--use-angle=d3d11'] });
const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
const t0 = Date.now();
page.on('console', (m) => console.log(`${((Date.now() - t0) / 1000).toFixed(2)}s  ${m.text().slice(0, 160)}`));
await page.addInitScript(() => {
  const t = performance.now();
  const iv = setInterval(() => {
    const e = window.estatua;
    if (!e || window.__hooked) return;
    window.__hooked = true; clearInterval(iv);
    e.ready.then(() => console.log('[carga] estatua liviana', Math.round(performance.now() - t)));
    e.fullReady.then(() => console.log('[carga] fullReady', Math.round(performance.now() - t)));
  }, 20);
});
await page.goto(`${base}/?nointro`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => document.documentElement.classList.contains('is-ready'), null, { timeout: 90000 });
console.log(`listo: ${((Date.now() - t0) / 1000).toFixed(2)} s`);
await browser.close();
