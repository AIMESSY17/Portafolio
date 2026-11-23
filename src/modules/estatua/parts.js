import { STATUE, PARTS } from './config.js';
import { loadGlb } from './models.js';

// Partes de oro: la cabeza y los brazos de la "segunda figura" (modelo partes-oro.glb), flotando
// separados del cuerpo. Se dibujan primero como anillos de contorno (lines) y después se rellenan
// de oro macizo (fill), siguiendo al scroll. Cada pieza tiene una línea guía punteada al lugar
// donde engancha y un anillo que marca ese lugar.
export function createParts(ctx, { parent }) {
  const { THREE } = ctx;

  const uniforms = {
    uLines: { value: 0 },
    uFill: { value: 0 },
    uRings: { value: PARTS.rings },
    uGlow: { value: new THREE.Color(PARTS.glow) },
    uTime: { value: 0 },
    uBloomPass: { value: 0 }, uBloomK: { value: 0.18 },
  };
  // estándar (no físico): metal puro, la laca no se nota y el shader compila mucho más rápido
  const material = new THREE.MeshStandardMaterial({
    color: PARTS.color,
    metalness: 1,
    roughness: PARTS.roughness,
    envMapIntensity: PARTS.envMapIntensity,
    side: THREE.DoubleSide,
  });
  material.userData.bloomUniform = uniforms.uBloomPass;
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>
attribute float _grow;
varying float vGrow;
`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
vGrow = _grow;
`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
varying float vGrow;
uniform float uLines, uFill, uRings, uTime, uBloomPass, uBloomK;
uniform vec3 uGlow;
float gRing = 0.0;
`)
      .replace('#include <dithering_fragment>', `#include <dithering_fragment>
if (uBloomPass > 0.5) gl_FragColor.rgb *= uBloomK; // en el resplandor, apenas`)
      .replace('#include <clipping_planes_fragment>', `#include <clipping_planes_fragment>
{
  if (vGrow > uLines + 0.0001) discard;                       // todavía no se dibujó
  float t = vGrow * uRings;
  float d = min(fract(t), 1.0 - fract(t)) / max(fwidth(t), 1e-4);
  gRing = 1.0 - clamp(d - 0.6, 0.0, 1.0);                     // anillo fino de ~1px
  bool solid = vGrow < uFill;
  if (!solid && gRing < 0.5) discard;                         // zona solo "boceto": quedan los anillos
}`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
{
  float lineZone = step(uFill, vGrow);                        // donde todavía es solo dibujo
  float pen = 1.0 - smoothstep(0.0, 0.035, uLines - vGrow);   // punta del lápiz
  float edge = 1.0 - smoothstep(0.0, 0.05, abs(vGrow - uFill)); // filo del relleno
  float shimmer = 0.75 + 0.25 * sin(vGrow * 60.0 - uTime * 2.0);
  totalEmissiveRadiance += uGlow * (lineZone * 0.55 * shimmer + pen * 0.9 + edge * 0.6 * step(0.001, uFill) * (1.0 - step(0.999, uFill)));
}`);
  };

  const outer = new THREE.Group();
  outer.name = 'estatua_partes_oro';
  outer.rotation.y = STATUE.rotationY;
  const inner = new THREE.Group();
  inner.position.set(...PARTS.position);
  inner.rotation.set(...PARTS.rotation);
  inner.scale.setScalar(PARTS.scale);
  outer.add(inner);
  outer.visible = false;
  parent.add(outer);

  const meshes = [];
  const pieces = [];
  const guideMat = new THREE.LineDashedMaterial({ color: PARTS.glow, dashSize: 0.018, gapSize: 0.014, transparent: true, opacity: 0, depthWrite: false });
  const ringMat = new THREE.LineBasicMaterial({ color: PARTS.glow, transparent: true, opacity: 0, depthWrite: false });
  const ringGeometry = (r) => {
    const pts = [];
    for (let i = 0; i <= 48; i++) {
      const a = (i / 48) * Math.PI * 2;
      pts.push(new THREE.Vector3(Math.cos(a) * r, 0, Math.sin(a) * r));
    }
    return new THREE.BufferGeometry().setFromPoints(pts);
  };
  const tmp = new THREE.Vector3();

  // Separa cada mesh del modelo en una "pieza" con su pivote en el punto de enganche.
  function explode(scene) {
    scene.updateMatrixWorld(true);
    const found = [];
    scene.traverse((o) => { if (o.isMesh) found.push(o); });
    for (const mesh of found) {
      const cfg = PARTS.explode[mesh.name] || PARTS.explode[mesh.parent?.name];
      if (!cfg) continue;
      const pos = mesh.geometry.attributes.position;
      const toInner = mesh.matrixWorld.clone().premultiply(new THREE.Matrix4().copy(inner.matrixWorld).invert());
      let minY = Infinity, maxY = -Infinity;
      const pts = [];
      for (let i = 0; i < pos.count; i += 3) {
        tmp.fromBufferAttribute(pos, i).applyMatrix4(toInner);
        pts.push(tmp.clone());
        minY = Math.min(minY, tmp.y);
        maxY = Math.max(maxY, tmp.y);
      }
      // punto de enganche = centro de los vértices del borde de arriba o de abajo
      const top = cfg.attachAt === 'top';
      const edge = pts.filter((p) => (top ? p.y > maxY - 0.02 : p.y < minY + 0.02));
      const hook = edge.reduce((a, p) => a.add(p), new THREE.Vector3()).multiplyScalar(1 / Math.max(1, edge.length));
      const attach = hook.clone().add(new THREE.Vector3(...(cfg.shift || [0, 0, 0])));

      const pivot = new THREE.Group();
      pivot.name = `pieza_${mesh.name}`;
      pivot.position.copy(attach);
      pivot.scale.setScalar(cfg.scale || 1);
      inner.add(pivot);
      toInner.decompose(mesh.position, mesh.quaternion, mesh.scale);
      mesh.position.sub(hook);
      pivot.add(mesh);

      const guideGeo = new THREE.BufferGeometry().setFromPoints([attach.clone(), attach.clone()]);
      const guide = new THREE.Line(guideGeo, guideMat);
      guide.frustumCulled = false;
      const ringSocket = new THREE.LineLoop(ringGeometry(cfg.ring), ringMat); // marca el lugar de enganche
      ringSocket.position.copy(attach);
      const ringPiece = new THREE.LineLoop(ringGeometry(cfg.ring), ringMat);  // anillo que viaja con la pieza
      pivot.add(ringPiece);
      inner.add(guide, ringSocket);
      pieces.push({ name: mesh.name, pivot, attach, cfg, guide, ringSocket, ringPiece, phase: pieces.length * 2.1 });
    }
  }

  const ready = loadGlb(ctx, PARTS.model)
    .then((gltf) => {
      gltf.scene.traverse((o) => {
        if (!o.isMesh) return;
        o.geometry.computeVertexNormals();
        o.material = material;
        o.castShadow = true;
        o.frustumCulled = false;
        o.layers.enable(1);
        meshes.push(o);
      });
      inner.add(gltf.scene);
      inner.updateMatrixWorld(true);
      explode(gltf.scene);
    })
    .catch((e) => console.warn('[estatua] no se pudieron cargar la cabeza y los brazos dorados', e));

  const state = { lines: 0, fill: 0, enabled: true };
  let bright = 1, chromeK = 0;
  const GOLD_C = new THREE.Color(PARTS.color), CHROME_C = new THREE.Color('#F4F5F7'), GLOW_C = new THREE.Color(PARTS.glow);
  function applyLook() {
    material.color.copy(GOLD_C).lerp(CHROME_C, chromeK).multiplyScalar(bright);
    material.roughness = PARTS.roughness + (0.05 - PARTS.roughness) * chromeK;
    uniforms.uGlow.value.copy(GLOW_C).multiplyScalar(bright * (1 - chromeK));
  }
  return {
    ready,
    state,
    /** Las mallas de oro (cabeza y brazos) ya cargadas: los fragmentos de cromo usan sus geometrías. */
    get meshes() { return meshes; },
    /** lines = cuánto del contorno está dibujado (0..1), fill = cuánto está relleno de oro (0..1). */
    set(lines, fill) { state.lines = lines; state.fill = fill; },
    update(time) {
      const closeness = 1 - PARTS.closeIn * state.fill; // al rellenarse, las piezas se acercan al cuerpo
      const motion = ctx.shared.reducedMotion ? 0 : 1;
      for (const p of pieces) {
        const { offset, rot } = p.cfg;
        const bob = Math.sin(time * 0.7 + p.phase) * PARTS.float * motion;
        p.pivot.position.set(p.attach.x + offset[0] * closeness, p.attach.y + offset[1] * closeness + bob, p.attach.z + offset[2] * closeness);
        p.pivot.rotation.set(
          rot[0] * closeness + Math.sin(time * 0.5 + p.phase) * 0.02 * motion,
          rot[1] * closeness + Math.sin(time * 0.37 + p.phase) * 0.03 * motion,
          rot[2] * closeness,
        );
        const g = p.guide.geometry.attributes.position;
        g.setXYZ(0, p.attach.x, p.attach.y, p.attach.z);
        g.setXYZ(1, p.pivot.position.x, p.pivot.position.y, p.pivot.position.z);
        g.needsUpdate = true;
        p.guide.computeLineDistances();
      }
      const fade = Math.min(1, state.lines * 4);
      guideMat.opacity = 0.75 * fade * (1 - chromeK);
      ringMat.opacity = 0.9 * fade * (1 - chromeK);
      uniforms.uLines.value = state.lines;
      uniforms.uFill.value = state.fill;
      uniforms.uTime.value = time;
      outer.visible = state.enabled && state.lines > 0.001 && meshes.length > 0;
    },
    setVisible(v) { state.enabled = v; },
    /** Brillo de las piezas de oro (1 = normal). Lo bajan las salas junto con el mármol. */
    setBright(v) { bright = v; applyLook(); },
    /** 0..1: el oro de las piezas se vuelve cromo líquido (cuando el cromo de la estatua llega a la cabeza). */
    setChrome(v) { chromeK = v; applyLook(); },
    /** Cuánto entran al resplandor (lo baja la niebla de la nube). */
    setBloom(v) { uniforms.uBloomK.value = v; },
    setQuality(tier) { meshes.forEach((m) => (m.castShadow = tier === 'high')); },
    dispose() {
      meshes.forEach((m) => m.geometry.dispose());
      pieces.forEach((p) => { p.guide.geometry.dispose(); p.ringSocket.geometry.dispose(); p.ringPiece.geometry.dispose(); });
      guideMat.dispose();
      ringMat.dispose();
      material.dispose();
      outer.removeFromParent();
    },
  };
}
