// Abre la página con la GPU real, espera is-ready y evalúa expresiones. uso: node evaluar.mjs <url> "<expr>" ...
import { chromium } from 'playwright';
const [, , url, ...exprs] = process.argv;
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--ignore-gpu-blocklist', '--enable-gpu-rasterization', '--use-angle=d3d11'] });
const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
const logs = [];
page.on('console', (m) => logs.push(`${m.type()}: ${m.text().slice(0, 400)}`));
page.on('pageerror', (e) => logs.push(`pageerror: ${e.message}`));
await page.goto(url, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => document.documentElement.classList.contains('is-ready'), null, { timeout: 60000 }).catch(() => logs.push('sin is-ready'));
await page.waitForTimeout(Number(process.env.WAIT || 2500));
for (const e of exprs) {
  try { console.log('>', e.slice(0, 80), '\n ', JSON.stringify(await page.evaluate(e))); } catch (err) { console.log('ERR', err.message.split('\n')[0]); }
}
if (process.env.SHOT) { await page.waitForTimeout(Number(process.env.SHOT_WAIT || 600)); await page.screenshot({ path: process.env.SHOT }); console.log('captura:', process.env.SHOT); }
console.log('--- consola'); logs.slice(0, 30).forEach((l) => console.log(' ', l));
await browser.close();
