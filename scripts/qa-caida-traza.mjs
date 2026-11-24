// Caída medida "desde adentro" (requestAnimationFrame de la página), disparada con un scroll suave como el de un
// dedo. Sirve para el celular, donde el script con la rueda (qa-caida.mjs) mete pausas propias de la emulación táctil.
//   node scripts/qa-caida-traza.mjs <base> [escritorio|celular] [calidad]
import { chromium } from 'playwright';
const [, , base = 'http://localhost:5199', dev = 'celular', tier = 'low'] = process.argv;
const D = dev === 'celular'
  ? { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true }
  : { viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 };
const b = await chromium.launch({ channel: 'chrome', headless: true, args: ['--ignore-gpu-blocklist', '--use-angle=d3d11', '--hide-scrollbars'] });
const p = await (await b.newContext(D)).newPage();
await p.goto(`${base}/?nointro&quality=${tier}`, { waitUntil: 'domcontentloaded' });
await p.waitForFunction(() => document.documentElement.classList.contains('is-ready'), null, { timeout: 90000 });
await p.waitForTimeout(2500);
const medir = (haciaAbajo) => p.evaluate((abajo) => new Promise((done) => {
  const dts = []; let last = performance.now(), t0 = last, inicio = 0, fin = 0;
  const offA = window.core.bus.on('caida:inicio', () => { inicio = performance.now(); });
  const offB = window.core.bus.on('caida:fin', () => { fin = performance.now(); });
  const loop = () => {
    const now = performance.now(); const dt = now - last; last = now;
    if (inicio && !fin) dts.push(dt);
    if (now - t0 < 7000 && !(fin && now - fin > 300)) requestAnimationFrame(loop);
    else { offA(); offB(); const tot = dts.reduce((a, x) => a + x, 0); dts.sort((a, x) => a - x); done({ fps: +(dts.length * 1000 / tot).toFixed(1), peor: +dts[dts.length - 1].toFixed(1), p95: +dts[Math.floor(dts.length * 0.95)].toFixed(1), duracion: +((fin - inicio) / 1000).toFixed(2) }); }
  };
  requestAnimationFrame(loop);
  const L = window.core.scroll.lenis;
  L.scrollTo(abajo ? L.animatedScroll + innerHeight * 0.4 : L.animatedScroll - innerHeight * 0.4, { duration: 0.6 });
}), haciaAbajo);
console.log(`${dev} ${tier} bajando`, JSON.stringify(await medir(true)));
await p.waitForTimeout(1500);
console.log(`${dev} ${tier} subiendo`, JSON.stringify(await medir(false)));
await b.close();
