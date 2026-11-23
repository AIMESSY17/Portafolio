// Control de calidad de la película: apertura (visita nueva), título de capítulo y créditos finales.
//   node scripts/qa-pelicula.mjs <base> <salida_dir> [apertura,capitulo,creditos]
// Escritorio 1920×1080 y celular 390×844. Requiere npm run dev.
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

const [, , base = 'http://localhost:5199', out = 'referencias/resultado/pelicula/qa', partes = 'apertura,capitulo,creditos'] = process.argv;
fs.mkdirSync(out, { recursive: true });
const DEV = {
  escritorio: { viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 },
  celular: { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
};
const only = process.env.QA_DEVICES ? process.env.QA_DEVICES.split(',') : Object.keys(DEV);
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--ignore-gpu-blocklist', '--use-angle=d3d11', '--hide-scrollbars'] });
const want = new Set(partes.split(','));
for (const d of only) {
  const errors = [];
  const shot = async (page, name) => { await page.screenshot({ path: path.join(out, `${name}-${d}.png`) }); console.log(`${d} ${name}`); };
  if (want.has('apertura')) {
    const ctx = await browser.newContext(DEV[d]);
    const page = await ctx.newPage();
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(`${base}/`, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => document.getAnimations().some((a) => a.animationName === 'iris'), null, { timeout: 30000 });
    // reloj propio: todas las animaciones de la apertura congeladas en el mismo instante (como en producción)
    for (const t of [900, 1700, 2600, 3600, 4700]) {
      await page.evaluate((ms) => document.getAnimations().forEach((a) => { a.pause(); a.currentTime = ms; }), t);
      await page.waitForTimeout(120);
      await shot(page, `apertura-${String(t).padStart(4, '0')}`);
    }
    await ctx.close();
  }
  if (want.has('capitulo')) {
    const ctx = await browser.newContext(DEV[d]);
    const page = await ctx.newPage();
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(`${base}/?p=0.5&sincaida`, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => document.querySelector('.capitulo.is-on'), null, { timeout: 90000 });
    await page.waitForTimeout(650);
    await shot(page, 'capitulo-I');
    await ctx.close();
  }
  if (want.has('creditos')) {
    const ctx = await browser.newContext(DEV[d]);
    const page = await ctx.newPage();
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(`${base}/?p=11.1`, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => document.querySelector('.creditos.rodando, .creditos.fin'), null, { timeout: 90000 });
    await page.waitForTimeout(4200);
    await shot(page, 'creditos-rodando');
    await page.waitForFunction(() => document.querySelector('.creditos.fin'), null, { timeout: 30000 });
    await page.waitForTimeout(2200);
    await shot(page, 'creditos-fin');
    await ctx.close();
  }
  if (errors.length) console.log('  errores:', errors.slice(0, 5));
}
await browser.close();
