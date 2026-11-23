// Prueba la caída automática (cielo → mar) con la placa de video real: scrollea con la rueda hasta el final del
// hero, deja correr la toma y saca capturas cada medio segundo + el peor cuadro. Después prueba subir (la toma
// al revés) y saltarla con un clic.
//   node scripts/qa-caida.mjs <base> <salida> [escritorio|celular] [calidad]
// Requiere el servidor de desarrollo corriendo (npm run dev).
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

const [, , base = 'http://localhost:5173', outDir = 'referencias/resultado/caida', dev = 'escritorio', tier = 'high'] = process.argv;
fs.mkdirSync(outDir, { recursive: true });
const D = {
  escritorio: { viewport: { width: Number(process.env.W || 1920), height: Number(process.env.H || 1080) }, deviceScaleFactor: 1 },
  celular: { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
}[dev];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--ignore-gpu-blocklist', '--enable-gpu-rasterization', '--use-angle=d3d11', '--hide-scrollbars'] });
const ctx = await browser.newContext({ ...D, reducedMotion: process.env.QA_REDUCED ? 'reduce' : 'no-preference' });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text().slice(0, 300)); });
await page.goto(`${base}/?stats&nointro&quality=${tier}${process.env.EXTRA ? "&" + process.env.EXTRA : ""}`, { waitUntil: "domcontentloaded" });
await page.waitForFunction(() => document.documentElement.classList.contains('is-ready') && window.__fondoStats, null, { timeout: 120000 });
await sleep(2500);
const read = () => page.evaluate(() => ({ y: Math.round(window.core.scroll.lenis.animatedScroll), P: +((window.core.scroll.lenis.animatedScroll + innerHeight / 2) / innerHeight).toFixed(3), on: window.core.shared.caida.on, dir: window.core.shared.caida.dir, q: +window.core.shared.caida.q.toFixed(3), cam: +window.core.camera.position.y.toFixed(1) }));
const shot = (name) => process.env.QA_NOSHOT ? null : page.screenshot({ path: path.join(outDir, `${dev}-${name}.png`) });

await shot('00-hero');
console.log('inicio', JSON.stringify(await read()));
await page.evaluate(() => { window.__slow = []; let l = performance.now(); const f = (t) => { const d = t - l; l = t; if (d > 25) window.__slow.push([Math.round(d), +window.core.shared.caida.q.toFixed(3), window.core.shared.caida.on]); requestAnimationFrame(f); }; requestAnimationFrame(f); });
await page.evaluate(() => window.__fondoStats.mark());
// rueda hasta que llegue al final del hero (cada tanto, como una persona)
const t0 = Date.now();
for (let i = 0; i < 20; i++) {
  await page.mouse.move(D.viewport.width / 2, D.viewport.height / 2);
  await page.mouse.wheel(0, 90);
  await sleep(120);
  const r = await read();
  if (r.on) { console.log('disparó con la rueda a los', Date.now() - t0, 'ms', JSON.stringify(r)); break; }
}
const tFall = Date.now();
const log = [];
for (let k = 0; k <= 10; k++) {
  const target = tFall + k * 500;
  await sleep(Math.max(0, target - Date.now()));
  const r = await read();
  log.push({ t: Date.now() - tFall, ...r });
  await shot(`caida-${String(k).padStart(2, '0')}`);
}
console.log(log.map((x) => JSON.stringify(x)).join('\n'));
const st = await page.evaluate(() => ({ ...window.__fondoStats.read() }));
console.log('cuadros lentos [ms, q, caída]:', JSON.stringify(await page.evaluate(() => window.__slow)));
console.log('durante la caída: fps', st.fps.toFixed(1), 'peor', st.worst.toFixed(1), 'ms · p95', st.p95);
await sleep(800);
console.log('al terminar', JSON.stringify(await read()));
await shot('20-llegada');

// la rueda con la caída andando no la salta si es suave; una rueda fuerte sí. Ahora: subir = toma al revés
await page.evaluate(() => window.__fondoStats.mark());
for (let i = 0; i < 6; i++) { await page.mouse.wheel(0, -90); await sleep(100); if ((await read()).on) break; }
console.log('subiendo', JSON.stringify(await read()));
await sleep(1200);
await shot('30-subiendo');
// saltarla con un clic
await page.mouse.click(D.viewport.width / 2, D.viewport.height / 2);
await sleep(700);
console.log('después del clic', JSON.stringify(await read()));
await sleep(2200);
console.log('reposo', JSON.stringify(await read()));
const st2 = await page.evaluate(() => ({ ...window.__fondoStats.read() }));
console.log('subida: fps', st2.fps.toFixed(1), 'peor', st2.worst.toFixed(1));
await shot('40-final');
if (errors.length) console.log('errores:', errors.slice(0, 6));
await browser.close();
