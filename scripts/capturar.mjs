// Genera una captura (1440x900, webp) de cada proyecto que tenga URL en src/data/projects.json
// y la guarda en public/assets/capturas/<id>.webp. Las ventanas del portfolio muestran estas
// capturas; el sitio real (iframe) solo se carga al hacer clic en la ventana.
//
//   npm run capturas              → todos los proyectos con URL
//   npm run capturas -- tinta-negra casa-de-muffin   → solo esos
//
// Usa el Chrome instalado en la máquina (no baja otro navegador). Los proyectos sin URL no
// tienen captura: la ventana muestra un placeholder con el nombre.
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const projects = JSON.parse(fs.readFileSync(path.join(root, 'src/data/projects.json'), 'utf8'));
const outDir = path.join(root, 'public/assets/capturas');
fs.mkdirSync(outDir, { recursive: true });

const only = process.argv.slice(2);
const list = projects.filter((p) => p.url && (!only.length || only.includes(p.id)));
if (!list.length) { console.log('No hay proyectos con URL para capturar.'); process.exit(0); }

const browser = await chromium.launch({ channel: 'chrome' }).catch(async () => chromium.launch());
const MAX_KB = 150; // presupuesto por captura (CLAUDE.md sección 10)

for (const p of list) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1, reducedMotion: 'reduce' });
  const page = await ctx.newPage();
  try {
    await page.goto(p.url, { waitUntil: 'networkidle', timeout: 45000 }).catch(() => page.goto(p.url, { waitUntil: 'load', timeout: 45000 }));
    await page.waitForTimeout(2500); // animaciones de entrada, fuentes, imágenes
    const png = await page.screenshot({ type: 'png' });
    // PNG → webp con el canvas del propio navegador; baja la calidad hasta entrar en el presupuesto
    const converter = await ctx.newPage();
    const b64 = png.toString('base64');
    let webp = null;
    for (const q of [0.82, 0.72, 0.62, 0.5]) {
      const dataUrl = await converter.evaluate(async ({ b64, q }) => {
        const img = new Image();
        await new Promise((res, rej) => { img.onload = res; img.onerror = rej; img.src = `data:image/png;base64,${b64}`; });
        const c = document.createElement('canvas');
        c.width = img.width; c.height = img.height;
        c.getContext('2d').drawImage(img, 0, 0);
        return c.toDataURL('image/webp', q);
      }, { b64, q });
      webp = Buffer.from(dataUrl.split(',')[1], 'base64');
      if (webp.length <= MAX_KB * 1024) break;
    }
    fs.writeFileSync(path.join(outDir, `${p.id}.webp`), webp);
    console.log(`✔ ${p.id}  ${(webp.length / 1024).toFixed(0)} KB  ←  ${p.url}`);
  } catch (e) {
    console.warn(`✘ ${p.id}: ${e.message.split('\n')[0]}`);
  }
  await ctx.close();
}
await browser.close();
