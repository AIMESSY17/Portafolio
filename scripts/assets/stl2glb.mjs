// STL de escaneo → GLB liviano (malla soldada, simplificada con meshoptimizer, cuantizada y comprimida con meshopt).
// Sin normales ni UV: el runtime las recalcula (y el worker de la estatua las suaviza).
//   node scripts/assets/stl2glb.mjs <entrada.stl> <salida.glb> <triángulos>
import fs from 'node:fs';
import { Document, NodeIO } from '@gltf-transform/core';
import { weld, simplify, quantize, meshopt, prune, dedup } from '@gltf-transform/functions';
import { MeshoptSimplifier, MeshoptEncoder } from 'meshoptimizer';
import { EXTMeshoptCompression, KHRMeshQuantization } from '@gltf-transform/extensions';

const [, , inp, out, targetArg] = process.argv;
const target = Number(targetArg || 250000);
const buf = fs.readFileSync(inp);
const n = buf.readUInt32LE(80);
const pos = new Float32Array(n * 9);
for (let i = 0; i < n; i++) {
  const o = 84 + i * 50 + 12;
  for (let k = 0; k < 9; k++) pos[i * 9 + k] = buf.readFloatLE(o + k * 4);
}
const doc = new Document();
const b = doc.createBuffer();
const acc = doc.createAccessor().setType('VEC3').setArray(pos).setBuffer(b);
const prim = doc.createPrimitive().setAttribute('POSITION', acc);
const mesh = doc.createMesh('victoria').addPrimitive(prim);
const node = doc.createNode('victoria').setMesh(mesh);
doc.createScene().addChild(node);
await MeshoptSimplifier.ready;
await MeshoptEncoder.ready;
await doc.transform(
  weld({ tolerance: 0.00001 }),
  simplify({ simplifier: MeshoptSimplifier, ratio: Math.min(1, target / n), error: 0.0008, lockBorder: false }),
  dedup(), prune(),
  quantize({ quantizePosition: 16 }),
);
doc.createExtension(EXTMeshoptCompression).setRequired(true).setEncoderOptions({ method: EXTMeshoptCompression.EncoderMethod.QUANTIZE });
await doc.transform(meshopt({ encoder: MeshoptEncoder, level: 'high' }));
const io = new NodeIO().registerExtensions([EXTMeshoptCompression, KHRMeshQuantization]).registerDependencies({ 'meshopt.encoder': MeshoptEncoder });
await io.write(out, doc);
const tri = doc.getRoot().listMeshes()[0].listPrimitives()[0].getIndices().getCount() / 3;
console.log(`${inp.split(/[\\/]/).pop()}: ${n} → ${tri} triángulos, ${(fs.statSync(out).size / 1024).toFixed(0)} KB`);
