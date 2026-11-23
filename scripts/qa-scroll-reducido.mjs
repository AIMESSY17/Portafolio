// Verifica que con movimiento reducido el scroll llega donde tiene que llegar (?p=) y que la sala es la correcta.
import { chromium } from 'playwright';
const [, , base = 'http://localhost:5199', P = '5.1'] = process.argv;
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--ignore-gpu-blocklist', '--use-angle=d3d11'] });
for (const reduced of [false, true]) {
  const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: reduced ? 'reduce' : 'no-preference' })).newPage();
  await page.goto(`${base}/?p=${P}`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => document.documentElement.classList.contains('is-ready'), null, { timeout: 90000 });
  await page.waitForTimeout(2500);
  const r = await page.evaluate(() => ({
    scrollY, lenis: window.core.scroll.lenis.scroll, limit: window.core.scroll.lenis.limit, height: document.documentElement.scrollHeight,
    state: { ...window.core.scroll.state }, room: window.estatua.getState().roomId, nombre: document.querySelector('.sala__nombre').textContent,
  }));
  console.log(reduced ? 'reducido' : 'normal  ', JSON.stringify(r));
  await page.close();
}
await browser.close();
