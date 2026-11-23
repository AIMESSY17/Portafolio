// Prueba la interacción: hover sobre la ventana de una sala, clic (abre el sitio real en el visor, con
// iframe), Escape (cierra y destruye el iframe), clic en una pantalla del tótem (lleva a su sala) y
// arrastrar la estatua (gira y salen más alas de luz).
//   node scripts/qa-interaccion.mjs <base> <carpeta capturas>
import { chromium } from 'playwright';
import path from 'node:path';
import fs from 'node:fs';
const [, , base = 'http://localhost:5199', outDir = 'referencias/resultado'] = process.argv;
fs.mkdirSync(outDir, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--ignore-gpu-blocklist', '--enable-gpu-rasterization', '--use-angle=d3d11', '--hide-scrollbars'] });
const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
const ok = (cond, msg) => console.log(`${cond ? '✔' : '✘'} ${msg}`);

await page.goto(`${base}/?p=3.1`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => document.documentElement.classList.contains('is-ready'), null, { timeout: 90000 });
await page.waitForTimeout(3000);
// la ventana grande de la sala está en el rectángulo de la ficha (layout)
const rect = await page.evaluate(() => { const s = document.getElementById('sala'); const cs = getComputedStyle(s); return { x: parseFloat(cs.left), y: parseFloat(cs.top), w: parseFloat(cs.width) }; });
const cx = rect.x + rect.w / 2, cy = rect.y - (rect.w / 1.6) / 2 - 20;
await page.mouse.move(cx - 40, cy);
await page.mouse.move(cx, cy, { steps: 4 });
await page.waitForTimeout(400);
ok(await page.evaluate(() => document.documentElement.classList.contains('is-pointing-project')), 'hover sobre la ventana de la sala: cursor de mano');
await page.mouse.click(cx, cy);
await page.waitForTimeout(1600);
const iframe = await page.evaluate(() => { const f = document.querySelector('.visor iframe'); return f ? f.src : null; });
ok(!!iframe, `clic: se abre el visor con el sitio real (${iframe})`);
ok(await page.evaluate(() => document.documentElement.classList.contains('scroll-locked')), 'con el visor abierto el scroll queda bloqueado');
await page.waitForTimeout(1500);
await page.screenshot({ path: path.join(outDir, 'visor-escritorio.png') });
await page.keyboard.press('Escape');
await page.waitForTimeout(1300);
ok(await page.evaluate(() => !document.querySelector('.visor iframe') && !document.querySelector('.visor')), 'Escape: se cierra y el iframe se destruye');
// clic en una pantalla del tótem (atrás a la izquierda) → va a su sala
const before = await page.evaluate(() => window.estatua.getState().roomId);
// buscar una pantalla visible del tótem proyectando su posición
const pt = await page.evaluate(() => {
  const s = window.core.scene, cam = window.core.camera;
  const v = new cam.position.constructor();
  let best = null;
  s.traverse((o) => { if (o.name?.startsWith('ventana_') && o.visible && o.name !== 'ventana_tinta-negra') { o.getWorldPosition(v); v.project(cam); if (Math.abs(v.x) < 0.98 && Math.abs(v.y) < 0.98 && (!best || v.x < best.x)) best = { x: v.x, y: v.y, id: o.name.slice(8) }; } });
  return best && { x: (best.x + 1) / 2 * innerWidth, y: (1 - best.y) / 2 * innerHeight, id: best.id };
});
if (pt) {
  await page.mouse.click(pt.x, pt.y);
  await page.waitForTimeout(2600);
  const after = await page.evaluate(() => window.estatua.getState().roomId);
  ok(after !== before, `clic en el tótem (${pt.id}): lleva a su sala (antes ${before}, ahora ${after})`);
}
// arrastrar la estatua: gira y salen más partículas
await page.evaluate(() => window.core.scroll.lenis.scrollTo(0, { immediate: true, force: true }));
await page.waitForTimeout(2500);
const count = () => page.evaluate(() => { const p = window.core.scene.getObjectByName('estatua_alas_de_luz'); const t = p.material.uniforms.uTime.value; const b = p.geometry.attributes.aBirth.array; let n = 0; for (let i = 0; i < p.geometry.drawRange.count; i++) if (t - b[i] < 1.0) n++; return n; });
const rest = await count();
const rot0 = await page.evaluate(() => window.estatua.getState().rotation);
await page.mouse.move(560, 450);
await page.mouse.down();
for (let i = 0; i < 30; i++) { await page.mouse.move(560 + i * 16, 450); await page.waitForTimeout(33); }
const dragging = await count();
await page.screenshot({ path: path.join(outDir, 'arrastrando-escritorio.png') });
await page.mouse.up();
const rot1 = await page.evaluate(() => window.estatua.getState().rotation);
ok(Math.abs(rot1 - rot0) > 0.5, `arrastrar gira la estatua (${rot0.toFixed(2)} → ${rot1.toFixed(2)} rad)`);
ok(dragging > rest * 1.4, `arrastrando salen más alas de luz (último segundo: ${rest} en reposo → ${dragging} arrastrando)`);
ok(errors.length === 0, `sin errores de consola${errors.length ? ': ' + errors.slice(0, 3).join(' | ') : ''}`);
await browser.close();
