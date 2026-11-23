// Control de la "segunda capa de impacto": intro, caída con fragmentos, sala con profundidad de campo y la
// entrada a un proyecto (clic real en la ventana). Capturas con la placa de video real.
//   node scripts/qa-impacto.mjs <base> <salida> [escritorio|celular]
// Requiere el servidor de desarrollo corriendo (npm run dev).
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

const [, , base = 'http://localhost:5173', outDir = 'referencias/resultado/impacto', dev = 'escritorio'] = process.argv;
fs.mkdirSync(outDir, { recursive: true });
const DEVICES = {
  escritorio: { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 },
  celular: { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
};
const browser = await chromium.launch({
  channel: 'chrome', headless: true,
  args: ['--ignore-gpu-blocklist', '--enable-gpu-rasterization', '--use-angle=d3d11', '--enable-zero-copy', '--hide-scrollbars'],
});
const errors = [];
async function open(url) {
  const ctx = await browser.newContext({ ...DEVICES[dev] });
  const page = await ctx.newPage();
  page.on('console', (m) => { if (m.type() === 'error') errors.push(`${url}: ${m.text().slice(0, 240)}`); });
  page.on('pageerror', (e) => errors.push(`${url}: ${e.message.slice(0, 240)}`));
  await page.goto(`${base}${url}`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForFunction(() => document.documentElement.classList.contains('is-ready'), null, { timeout: 90000 });
  return { ctx, page };
}
const shot = (page, name) => page.screenshot({ path: path.join(outDir, `${name}-${dev}.png`) });

// 1) intro (forzada con ?intro)
{
  const { ctx, page } = await open('/?intro');
  await page.waitForTimeout(200); await shot(page, 'intro-1-negro');
  await page.waitForTimeout(1000); await shot(page, 'intro-2-dibujo');
  await page.waitForTimeout(1100); await shot(page, 'intro-3-destello');
  await page.waitForTimeout(1600); await shot(page, 'intro-4-cielo');
  await ctx.close();
}
// 2) caída con fragmentos y fragmentos cayendo al agua
for (const [name, p] of [['caida-fragmentos', 1.15], ['fragmentos-agua', 2.72]]) {
  const { ctx, page } = await open(`/?p=${p}`);
  await page.waitForTimeout(3200); await shot(page, name);
  await ctx.close();
}
// 3) sala con profundidad de campo y 4) entrar al proyecto (clic en la ventana grande)
{
  const { ctx, page } = await open('/?p=3.5');
  await page.waitForTimeout(3200); await shot(page, 'sala-dof');
  const r = await page.evaluate(async () => (await import('/src/config/layout.js')).sala().win);
  const cx = r.x + r.w / 2, cy = r.y + r.h / 2;
  if (dev === 'celular') await page.touchscreen.tap(cx, cy); else { await page.mouse.move(cx, cy); await page.waitForTimeout(300); await page.mouse.down(); await page.mouse.up(); }
  await page.waitForTimeout(450); await shot(page, 'entrar-1-vuelo');
  await page.waitForTimeout(2600); await shot(page, 'entrar-2-sitio');
  const back = await page.$('.visor__volver');
  if (back) { await back.click(); await page.waitForTimeout(1500); await shot(page, 'entrar-3-volver'); }
  else errors.push('no apareció el botón Volver');
  await ctx.close();
}
await browser.close();
console.log(errors.length ? errors.join('\n') : 'sin errores');
