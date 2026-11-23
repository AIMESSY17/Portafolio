// EXR (cualquier compresión que soporte three, incluida DWA) → float32 RGB crudo, para el pipeline de Python.
//   node scripts/assets/exr2raw.mjs <entrada.exr> <salida.f32>   → imprime "ancho alto"
import fs from 'node:fs';
import * as THREE from 'three';
import { EXRLoader } from 'three/examples/jsm/loaders/EXRLoader.js';

const [, , inp, out] = process.argv;
const loader = new EXRLoader();
loader.setDataType(THREE.FloatType);
const buf = fs.readFileSync(inp);
const r = loader.parse(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
const { width: w, height: h, data } = r;
const ch = data.length / (w * h);
const rgb = new Float32Array(w * h * 3);
// EXRLoader devuelve las filas de abajo hacia arriba (convención de textura): se dan vuelta acá
for (let y = 0; y < h; y++) {
  const src = (h - 1 - y) * w, dst = y * w;
  for (let x = 0; x < w; x++) {
    const s = (src + x) * ch, d = (dst + x) * 3;
    rgb[d] = data[s]; rgb[d + 1] = data[s + 1]; rgb[d + 2] = data[s + 2];
  }
}
fs.writeFileSync(out, Buffer.from(rgb.buffer));
console.log(`${w} ${h}`);
