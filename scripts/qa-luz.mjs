// Control de calidad de "Hecha de luz": capturas en escritorio (1440x900) y celular (390x844) en puntos
// del guion, con la placa de video real, y errores de consola.
//   node scripts/qa-luz.mjs <base> <salida> <escena...>
//   escena = nombre:P[:extra]   (P = posición en pantallas, ver config/historia.js)
//   extra  = parámetros sueltos para la URL, ej. quality=low o sala=zurklima
// Ejemplo: node scripts/qa-luz.mjs http://localhost:5199 referencias/resultado hero:0.5 mar:2.3
// Requiere el servidor de desarrollo corriendo (npm run dev).
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

const [, , base = 'http://localhost:5199', outDir = 'referencias/resultado', ...scenes] = process.argv;
fs.mkdirSync(outDir, { recursive: true });
const DEVICES = {
  escritorio: { viewport: { width: Number(process.env.W || 1920), height: Number(process.env.H || 1080) }, deviceScaleFactor: 1, isMobile: false, hasTouch: false },
  celular: { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
};
const only = process.env.QA_DEVICES ? process.env.QA_DEVICES.split(',') : Object.keys(DEVICES);
const browser = await chromium.launch({
  channel: 'chrome',
  headless: true,
  args: ['--ignore-gpu-blocklist', '--enable-gpu-rasterization', '--use-angle=d3d11', '--enable-zero-copy', '--hide-scrollbars'],
});

const report = [];
for (const dev of only) {
  const ctx = await browser.newContext({ ...DEVICES[dev], reducedMotion: process.env.QA_REDUCED ? 'reduce' : 'no-preference' });
  for (const scene of scenes) {
    const [name, P, extra = ''] = scene.split(':');
    const page = await ctx.newPage();
    const errors = [];
    page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errors.push(`${m.type()}: ${m.text().slice(0, 300)}`); });
    page.on('pageerror', (e) => errors.push(`pageerror: ${e.message.slice(0, 300)}`));
    const q = new URLSearchParams(extra.replace(/,/g, '&'));
    q.set('p', P);
    const url = `${base}/?${q.toString()}`;
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForFunction(() => document.documentElement.classList.contains('is-ready'), null, { timeout: 60000 }).catch(() => errors.push('no llegó a is-ready'));
    // dejar que el scroll suave y las transiciones se asienten
    await page.waitForTimeout(Number(process.env.QA_WAIT || 3200));
    if (process.env.QA_DRAG && name.includes('arrastr')) {
      // arrastrar la estatua en horizontal durante 1,2 s
      const { width, height } = DEVICES[dev].viewport;
      await page.mouse.move(width * 0.45, height * 0.5);
      await page.mouse.down();
      for (let i = 0; i < 24; i++) { await page.mouse.move(width * 0.45 + i * 14, height * 0.5); await page.waitForTimeout(40); }
      await page.waitForTimeout(250);
    }
    const gpu = await page.evaluate(() => {
      const gl = window.core?.renderer?.getContext();
      const ext = gl?.getExtension('WEBGL_debug_renderer_info');
      return ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : 'sin datos';
    });
    const file = path.join(outDir, `${name}-${dev}.png`);
    await page.screenshot({ path: file });
    if (process.env.QA_DRAG && name.includes('arrastr')) await page.mouse.up();
    report.push({ dev, name, P, file, gpu, errors });
    console.log(`${dev.padEnd(10)} ${name.padEnd(14)} P=${P}  ${errors.length ? errors.length + ' avisos' : 'ok'}  ${gpu.slice(0, 60)}`);
    errors.slice(0, 6).forEach((e) => console.log('    ' + e));
    await page.close();
  }
  await ctx.close();
}
await browser.close();
fs.writeFileSync(path.join(outDir, 'qa.json'), JSON.stringify(report, null, 2));
