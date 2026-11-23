// Captura un HTML local a imagen (carteles de proyectos sin sitio publicado).
//   node scripts/assets/html2img.mjs <entrada.html> <salida.png> [ancho] [alto]
import { chromium } from 'playwright';
import fs from 'node:fs';
const [, , inp, out, W = '1440', H = '900'] = process.argv;
const b = await chromium.launch({ channel: 'chrome', headless: true });
const p = await b.newPage({ viewport: { width: +W, height: +H } });
await p.setContent(fs.readFileSync(inp, 'utf8'), { waitUntil: 'networkidle' });
await p.waitForTimeout(600);
await p.screenshot({ path: out });
await b.close();
