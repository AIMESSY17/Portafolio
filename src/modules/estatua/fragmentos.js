// Fragmentos de cromo: los torsos y los brazos de oro de la v6, en cromo (reflejan el panorama), flotando
// alrededor de la estatua durante la caída y girando lento. Al llegar al mar caen al agua uno por uno y dejan
// ondas (evento `fragmento:agua`, lo dibuja el fondo). Todo depende del scroll: si se vuelve para arriba,
// salen del agua y vuelven a su lugar. En calidad baja, 2 fragmentos.
//   · torso de la Victoria: se recorta del modelo liviano de la estatua (zona del pecho)
//   · torso de la segunda figura: torso-2.glb
//   · brazos: las piezas de partes-oro.glb (ya las carga parts.js)
import { loadGlb, smooth } from './models.js';
import { FRAGMENTOS, TORSOS } from './config.js';

export function createFragmentos(ctx, { statue, parts }) {
  const { THREE, root, bus, shared } = ctx;
  const group = new THREE.Group();
  group.name = 'estatua_fragmentos';
  group.visible = false;
  root.add(group);
  const material = new THREE.MeshStandardMaterial({ color: '#f2f3f5', metalness: 1, roughness: 0.06, envMapIntensity: 1.3 });
  const owned = [];
  const items = [];
  let tier = ctx.quality;

  function addPiece(geo, cfg) {
    geo.computeBoundingBox();
    const c = geo.boundingBox.getCenter(new THREE.Vector3());
    const s = geo.boundingBox.getSize(new THREE.Vector3());
    const g = geo.clone();
    g.translate(-c.x, -c.y, -c.z);
    g.scale(cfg.size / Math.max(s.x, s.y, s.z), cfg.size / Math.max(s.x, s.y, s.z), cfg.size / Math.max(s.x, s.y, s.z));
    g.deleteAttribute('aStatue'); g.deleteAttribute('aCurv'); g.deleteAttribute('_grow');
    if (!g.attributes.normal) g.computeVertexNormals();
    owned.push(g);
    const mesh = new THREE.Mesh(g, material);
    mesh.name = `fragmento_${items.length}`;
    group.add(mesh);
    items.push({ mesh, cfg, splashed: false });
  }

  // torso de la Victoria (triángulos del pecho del modelo liviano)
  function victoriaTorso() {
    const g = statue.lod0Geometry;
    if (!g?.attributes.aStatue) return null;
    const cfg = TORSOS.victoria.cut;
    const S = g.attributes.aStatue, idx = g.index ? g.index.array : null;
    const tris = idx ? idx.length / 3 : S.count / 3;
    const remap = new Int32Array(S.count).fill(-1), pos = [], keep = [];
    for (let t = 0; t < tris; t++) {
      const a = idx ? idx[t * 3] : t * 3, b = idx ? idx[t * 3 + 1] : t * 3 + 1, c = idx ? idx[t * 3 + 2] : t * 3 + 2;
      const y = (S.getY(a) + S.getY(b) + S.getY(c)) / 3;
      if (y < cfg.y[0] || y > cfg.y[1]) continue;
      const x = (S.getX(a) + S.getX(b) + S.getX(c)) / 3 - cfg.axis[0], z = (S.getZ(a) + S.getZ(b) + S.getZ(c)) / 3 - cfg.axis[1];
      const rr = cfg.radius * (1 + 0.14 * smooth(2.15, 2.4, y) - 0.45 * smooth(2.48, 2.6, y));
      if (x * x + z * z > rr * rr) continue;
      for (const v of [a, b, c]) {
        if (remap[v] < 0) { remap[v] = pos.length / 3; pos.push(S.getX(v), S.getY(v), S.getZ(v)); }
        keep.push(remap[v]);
      }
    }
    if (keep.length < 300) return null;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setIndex(keep);
    geo.computeVertexNormals();
    return geo;
  }

  const ready = Promise.all([
    statue.ready,
    parts.ready,
    loadGlb(ctx, TORSOS.figura.model).catch(() => null),
  ]).then(([, , gltf]) => {
    const torsoV = victoriaTorso();
    let torso2 = null;
    gltf?.scene.traverse((o) => { if (o.isMesh && !torso2) torso2 = o.geometry; });
    const arms = parts.meshes.filter((m) => /brazo/.test(m.name) || /brazo/.test(m.parent?.name || ''));
    const pool = [torsoV, torso2, arms[0]?.geometry, arms[1]?.geometry].filter(Boolean);
    if (!pool.length) return;
    FRAGMENTOS.items.forEach((cfg, i) => addPiece(pool[cfg.from % pool.length], cfg));
    if (torsoV) owned.push(torsoV);
    applyTier();
  }).catch((e) => console.warn('[estatua] no se pudieron armar los fragmentos', e));

  function applyTier() {
    const n = tier === 'low' ? FRAGMENTOS.low : items.length;
    items.forEach((it, i) => { it.on = i < n; it.mesh.visible = it.on; });
  }

  const payload = { x: 0, z: 0, s: 1 };
  const tmp = new THREE.Vector3();
  return {
    ready,
    group,
    /**
     * show 0..1 (aparecen al empezar la caída) · drop 0..1 (caen al agua) · seaY = altura del mar en el mundo
     * spin = giro propio extra (arrastrando en Contacto no se usa)
     */
    update(time, dt, { show, drop, seaY, motion }) {
      const on = show > 0.003 && items.length > 0;
      if (group.visible !== on) group.visible = on;
      if (!on) return;
      for (let i = 0; i < items.length; i++) {
        const it = items[i];
        if (!it.on) continue;
        const c = it.cfg;
        const a = c.angle + time * c.orbit * motion;
        const r = c.radius * (0.7 + 0.3 * show);
        let x = Math.sin(a) * r, z = Math.cos(a) * r - 0.4;
        let y = c.y + Math.sin(time * 0.5 + i * 1.7) * 0.08 * motion + (1 - show) * 4;
        // caída al agua: cada uno con su retraso, acelerando (como una piedra)
        const k = smooth(c.delay, c.delay + 0.5, drop);
        const fall = k * k;
        const yWater = seaY - 1.2;
        y = y + (yWater - y) * fall;
        it.mesh.position.set(x, y, z);
        it.mesh.rotation.set(time * c.spin[0] * motion + i, time * c.spin[1] * motion + i * 2.1, time * c.spin[2] * motion);
        it.mesh.scale.setScalar(Math.max(0.0001, show));
        // tocó el agua: ondas (una sola vez; si vuelve a subir, se rearma)
        const under = y < seaY;
        if (under && !it.splashed && drop > 0) {
          it.splashed = true;
          it.mesh.getWorldPosition(tmp);
          payload.x = tmp.x; payload.z = tmp.z; payload.s = c.size / 0.9;
          bus.emit('fragmento:agua', payload);
        } else if (!under && it.splashed && y > seaY + 0.3) it.splashed = false;
        it.mesh.visible = y > seaY - 1.0; // ya se hundió
      }
    },
    setQuality(t) { tier = t; applyTier(); },
    dispose() {
      owned.forEach((g) => g.dispose());
      material.dispose();
      group.removeFromParent();
    },
  };
}
