// Sonda de rendimiento: abre un punto del guion con parámetros y mide fps / peor cuadro / resolución dinámica.
//   node scripts/qa-sonda.mjs <base> "<query>" [segundos] [W] [H]
import { chromium } from 'playwright';
const [, , base, q, secs = '5', W = '1920', H = '1080'] = process.argv;
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--ignore-gpu-blocklist', '--use-angle=d3d11', '--hide-scrollbars'] });
const page = await browser.newPage({ viewport: { width: +W, height: +H } });
const logs = [];
page.on('console', (m) => { const t = m.text(); if (/calidad|error|resol/i.test(t) || m.type() === 'error') logs.push(t.slice(0, 200)); });
page.on('pageerror', (e) => logs.push('pageerror ' + e.message));
await page.goto(`${base}/?stats&nointro&${q}`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => document.documentElement.classList.contains('is-ready') && window.__fondoStats, null, { timeout: 90000 });
await page.waitForTimeout(3000);
await page.evaluate(() => window.__fondoStats.mark());
const samples = [];
for (let i = 0; i < +secs; i++) {
  await page.waitForTimeout(1000);
  samples.push(await page.evaluate(() => ({ ...window.core.resolucion })));
}
const r = await page.evaluate(() => ({ ...window.__fondoStats.read() }));
console.log(JSON.stringify({ q, fps: +r.fps.toFixed(1), peor: +r.worst.toFixed(1), p95: r.p95, calls: Math.round(r.calls), tris: Math.round(r.tris) }));
console.log('  resolución:', samples.map((s) => `${s.pr}${s.timer ? ` gpu ${s.gpuMs.toFixed(1)}ms` : ` frame ${s.frameMs.toFixed(1)}ms`}`).join(' | '));
logs.slice(0, 8).forEach((l) => console.log('  ' + l));
await browser.close();
