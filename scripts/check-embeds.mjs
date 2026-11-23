// Revisa si cada proyecto de src/data/projects.json se puede mostrar dentro de un iframe.
// Uso: npm run check-embeds
// Lee los encabezados X-Frame-Options y Content-Security-Policy (frame-ancestors).
// No intenta saltear nada: solo te dice qué sitios permiten ser embebidos.
import { readFile } from 'node:fs/promises';

const projects = JSON.parse(await readFile(new URL('../src/data/projects.json', import.meta.url), 'utf8'));
const portfolioOrigin = process.argv[2] || ''; // opcional: tu dominio, ej. https://samotracia.vercel.app

for (const p of projects) {
  if (!p.url) { console.log(`· ${p.title}: falta la URL`); continue; }
  try {
    const res = await fetch(p.url, { redirect: 'follow' });
    const xfo = (res.headers.get('x-frame-options') || '').toLowerCase();
    const csp = res.headers.get('content-security-policy') || '';
    const fa = /frame-ancestors([^;]*)/i.exec(csp)?.[1]?.trim() ?? null;

    let verdict = 'OK, se puede embeber';
    if (xfo.includes('deny') || xfo.includes('sameorigin')) verdict = `BLOQUEADO (X-Frame-Options: ${xfo})`;
    if (fa !== null) {
      const allowsAll = fa.split(/\s+/).includes('*');
      const allowsMe = portfolioOrigin && fa.includes(new URL(portfolioOrigin).host);
      if (fa.includes("'none'") || (!allowsAll && !allowsMe)) verdict = `BLOQUEADO (frame-ancestors ${fa})`;
      else verdict = 'OK, se puede embeber (frame-ancestors lo permite)';
    }
    console.log(`${verdict.startsWith('OK') ? '✓' : '✗'} ${p.title}: ${verdict}`);
    if (!verdict.startsWith('OK')) {
      console.log(`    → Si el sitio es tuyo, permití tu portfolio en frame-ancestors; si no, usá "embed": "local" con una vista propia.`);
    }
  } catch (err) {
    console.log(`? ${p.title}: no se pudo revisar (${err.message})`);
  }
}
