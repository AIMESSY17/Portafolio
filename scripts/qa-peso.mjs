// Peso real de la página (lo que se descarga hasta que se puede usar) y cuánto tarda en estar lista.
//   npm run build && npx vite preview --port 4199   y después   node scripts/qa-peso.mjs http://localhost:4199
import { chromium } from 'playwright';
const base = process.argv[2];
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--ignore-gpu-blocklist', '--use-angle=d3d11'] });
for (const [name, opt] of [['escritorio (alta)', { viewport: { width: 1920, height: 1080 } }], ['celular (baja)', { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true }]]) {
  const ctx = await browser.newContext(opt);
  const page = await ctx.newPage();
  const cdp = await ctx.newCDPSession(page);
  await cdp.send('Network.enable');
  const sizes = new Map();
  cdp.on('Network.loadingFinished', (e) => sizes.set(e.requestId, e.encodedDataLength));
  const urls = new Map();
  cdp.on('Network.responseReceived', (e) => urls.set(e.requestId, e.response.url));
  const t0 = Date.now();
  await page.goto(base + '/', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => document.documentElement.classList.contains('is-ready'), null, { timeout: 90000 });
  const tReady = Date.now() - t0;
  await page.waitForTimeout(1500);
  let total = 0; const groups = {};
  for (const [id, b] of sizes) {
    const u = urls.get(id) || ''; total += b;
    const g = /fonts\.(g|gstatic)/.test(u) ? 'fuentes' : /\/cielo\/.*\.hdr/.test(u) ? 'HDR (luz)' : /\/cielo\//.test(u) ? 'panoramas y nubes' : /estatua\//.test(u) ? 'modelos 3D' : /capturas/.test(u) ? 'capturas' : /\.js/.test(u) ? 'código' : 'otros';
    groups[g] = (groups[g] || 0) + b;
  }
  console.log(`${name}: ${(total / 1048576).toFixed(2)} MB transferidos · listo en ${(tReady / 1000).toFixed(1)} s`);
  for (const [g, b] of Object.entries(groups).sort((a, b) => b[1] - a[1])) console.log(`   ${g.padEnd(18)} ${(b / 1048576).toFixed(2)} MB`);
  await ctx.close();
}
await browser.close();
