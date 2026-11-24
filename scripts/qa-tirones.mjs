// Busca los tirones: graba cada cuadro (duración y posición P del guion) mientras se scrollea de arriba a
// abajo, y lista los cuadros lentos con en qué parte del recorrido pasaron.
//   node scripts/qa-tirones.mjs <base> [calidad] [umbral ms]
import { chromium } from 'playwright';
import fs from 'node:fs';
const N = JSON.parse(fs.readFileSync(new URL('../src/data/projects.json', import.meta.url), 'utf8')).length;
const [, , base = 'http://localhost:5199', tier = 'high', limit = '22'] = process.argv;
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--ignore-gpu-blocklist', '--enable-gpu-rasterization', '--use-angle=d3d11', '--hide-scrollbars'] });
const page = await (await browser.newContext({ viewport: { width: Number(process.env.W || 1920), height: Number(process.env.H || 1080) } })).newPage();
const logs = [];
page.on('console', (m) => logs.push(`${(performance.now() / 1000).toFixed(1)}s ${m.type()}: ${m.text().slice(0, 200)}`));
await page.goto(`${base}/?nointro${tier === "auto" ? "" : `&quality=${tier}`}`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => document.documentElement.classList.contains('is-ready'), null, { timeout: 90000 });
const rec = (ms, script) => page.evaluate(([ms, script]) => new Promise((done) => {
  const out = []; let last = performance.now(); const t0 = last;
  const loop = () => {
    const now = performance.now(); const dt = now - last; last = now;
    out.push([+now.toFixed(0), +dt.toFixed(1), +((scrollY + innerHeight * 0.5) / innerHeight).toFixed(2)]);
    if (now - t0 < ms) requestAnimationFrame(loop); else done(out);
  };
  requestAnimationFrame(loop);
  if (script) (0, eval)(script);
}), [ms, script]);
await page.evaluate(() => { window.__ev = []; const t = () => performance.now(); ['caida:inicio', 'caida:fin', 'sala:change', 'section:change', 'quality:change'].forEach((n) => window.core.bus.on(n, (d) => { if (n !== 'sala:change' || !window.__ev.length || window.__ev[window.__ev.length - 1][1] !== d?.id) window.__ev.push([+t().toFixed(0), n === 'sala:change' ? d?.id : n]); })); });
const quiet = await rec(7000, null);
const sc = await rec(16000, `(() => { const L = window.core.scroll.lenis; const max = document.documentElement.scrollHeight - innerHeight; L.scrollTo(max, { duration: 14, easing: (t) => t }); })()`);
const show = (name, arr) => {
  const slow = arr.filter((f) => f[1] > +limit);
  const worst = Math.max(...arr.map((f) => f[1]));
  console.log(`== ${name}: ${arr.length} cuadros, peor ${worst} ms, lentos (>${limit} ms): ${slow.length}`);
  slow.slice(0, 40).forEach((f) => console.log(`   t=${f[0]}ms  dt=${f[1]}ms  P=${f[2]}`));
};
await page.evaluate(() => { const el = document.querySelector('[data-section="obras"]'); window.core.scroll.lenis.scrollTo(el.offsetTop + 10, { immediate: true, force: true }); });
await page.waitForTimeout(2000);
const rooms = await rec(10000, `(() => { const el = document.querySelector('[data-section="obras"]'); const h = el.offsetHeight / ${N}; let i = 1; window.__sx = setInterval(() => { window.core.scroll.lenis.scrollTo(el.offsetTop + h * ((i++ % ${N}) + 0.5), { duration: 0.9 }); }, 1300); setTimeout(() => clearInterval(window.__sx), 9200); })()`);
console.log('eventos (ms de página):', JSON.stringify(await page.evaluate(() => window.__ev.slice(0, 30))));
show('quieto', quiet);
show('scroll', sc);
show('salas', rooms);
console.log('--- consola'); logs.slice(-25).forEach((l) => console.log('  ' + l));
await browser.close();
