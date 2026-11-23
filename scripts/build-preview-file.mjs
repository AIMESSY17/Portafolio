// Genera preview/index.html: todo adentro (código, estilos y modelos de la estatua).
// Los modelos se guardan SIN compresión meshopt para que no necesiten WebAssembly
// (algunos visores de archivos lo bloquean y la estatua no aparecía).
import { execSync } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { MeshoptDecoder } from 'meshoptimizer';

execSync('npx vite build --config vite.preview-file.config.js', { stdio: 'inherit' });

await MeshoptDecoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MeshoptDecoder });
const files = ['victoria-lod0.glb', 'victoria.glb'];
const assets = {};
for (const f of files) {
  const doc = await io.read(new URL(`../public/assets/estatua/${f}`, import.meta.url).pathname);
  doc.getRoot().listExtensionsUsed()
    .filter((e) => e.extensionName === 'EXT_meshopt_compression')
    .forEach((e) => e.dispose());
  const glb = await io.writeBinary(doc);
  assets[f] = Buffer.from(glb).toString('base64');
}
const out = new URL('../preview/index.html', import.meta.url);
let html = await readFile(out, 'utf8');
html = html.replace(/<link rel="preload"[^>]*glb[^>]*>\s*/g, ''); // el preload no sirve sin servidor
const inject = `<script>window.__SAMOTRACIA_ASSETS__=${JSON.stringify(assets)};</script>`;
html = html.replace('<script type="module"', `${inject}\n<script type="module"`);
await writeFile(out, html);
console.log(`preview/index.html listo (${(html.length / 1024 / 1024).toFixed(1)} MB)`);
