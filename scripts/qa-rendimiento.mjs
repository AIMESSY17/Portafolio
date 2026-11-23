// Mide fps y "peor frame" (ms) en cada calidad, con la placa de video real.
//   node scripts/qa-rendimiento.mjs <base> [salida.json] [calidades]   (calidades: high,medium,low)
// Fases: hero quieto · scroll completo de arriba a abajo (pasa por la caída, todas las salas y Contacto)
//        · hover sobre la ventana de una sala · cambios de sala seguidos.
// Usa el medidor de desarrollo (?stats, src/modules/fondo/stats.js): cuenta TODAS las pasadas del cuadro.
// Requiere el servidor de desarrollo corriendo (npm run dev).
// Variables: DPR=2 (pantalla de alta densidad) · tier 'auto' = sin forzar calidad (dice si la calidad bajó sola).
import { chromium } from 'playwright';
import fs from 'node:fs';

const [, , base = 'http://localhost:5199', out = '', tiersArg = 'high,medium,low'] = process.argv;
const tiers = tiersArg.split(',');
const N = JSON.parse(fs.readFileSync(new URL('../src/data/projects.json', import.meta.url), 'utf8')).length;
const DPR = Number(process.env.DPR || 1);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const browser = await chromium.launch({
  channel: 'chrome', headless: true,
  args: ['--ignore-gpu-blocklist', '--enable-gpu-rasterization', '--use-angle=d3d11', '--hide-scrollbars'],
});
const results = [];
for (const tier of tiers) {
  const mobile = tier === 'low' && process.env.LOW_AS_PHONE;
  const ctx = await browser.newContext(mobile
    ? { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true }
    : { viewport: { width: 1440, height: 900 }, deviceScaleFactor: DPR });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  const changes = [];
  page.on('console', (m) => { if (/\[calidad\]/.test(m.text())) changes.push(m.text()); });
  await page.goto(`${base}/?stats&nointro${tier === 'auto' ? '' : `&quality=${tier}`}`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => document.documentElement.classList.contains('is-ready') && window.__fondoStats, null, { timeout: 90000 });
  await sleep(2500);
  const phase = async (name, script, ms) => {
    await page.evaluate(() => window.__fondoStats.mark());
    if (script) await page.evaluate(script);
    await sleep(ms);
    const r = await page.evaluate(() => ({ ...window.__fondoStats.read() }));
    const row = { tier, fase: name, fps: +r.fps.toFixed(1), peor: +r.worst.toFixed(1), p95: r.p95, calls: Math.round(r.calls), tris: Math.round(r.tris), puntos: Math.round(r.points) };
    console.log(JSON.stringify(row));
    results.push(row);
  };
  await phase('hero quieto', null, 6000);
  // scroll completo, suave, como lo haría una persona con la rueda (14 s de arriba a abajo)
  await phase('scroll completo', `(() => { const L = window.core.scroll.lenis; const max = document.documentElement.scrollHeight - innerHeight; L.scrollTo(max, { duration: 14, easing: (t) => t }); })()`, 15000);
  // a la sala 3 y hover de ida y vuelta sobre su ventana y fuera de ella
  await page.evaluate((n) => { const el = document.querySelector('[data-section="obras"]'); window.core.scroll.lenis.scrollTo(el.offsetTop + el.offsetHeight * (2.5 / n), { immediate: true, force: true }); }, N);
  await sleep(2500);
  await phase('hover ventana', `(() => { let i = 0; const pts = [[0.72, 0.3], [0.2, 0.5], [0.75, 0.35], [0.5, 0.85], [0.8, 0.25]]; window.__hv = setInterval(() => { const p = pts[i++ % pts.length]; window.dispatchEvent(new PointerEvent('pointermove', { clientX: p[0] * innerWidth, clientY: p[1] * innerHeight, pointerType: 'mouse', pointerId: 1 })); }, 350); setTimeout(() => clearInterval(window.__hv), 6000); })()`, 6500);
  // cambios de sala seguidos (una cada 1,2 s)
  await phase('cambio de sala', `(() => { const el = document.querySelector('[data-section="obras"]'); const h = el.offsetHeight / ${N}; let i = 0; window.__sx = setInterval(() => { window.core.scroll.lenis.scrollTo(el.offsetTop + h * ((i++ % ${N}) + 0.5), { duration: 0.9 }); }, 1200); setTimeout(() => clearInterval(window.__sx), 8400); })()`, 9000);
  const final = await page.evaluate(() => document.documentElement.dataset.quality);
  console.log(`  calidad al final: ${final}${changes.length ? ' · cambios: ' + changes.join(' | ') : ' · sin cambios automáticos'}`);
  results.push({ tier, fase: 'calidad final', final, cambios: changes });
  if (errors.length) console.log('  errores:', errors.slice(0, 5));
  await ctx.close();
}
await browser.close();
if (out) fs.writeFileSync(out, JSON.stringify(results, null, 2));
