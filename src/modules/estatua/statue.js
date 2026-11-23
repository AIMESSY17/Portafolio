import { STATUE, GOLD } from './config.js';
import { loadGlb } from './models.js';
import { bake } from './gilding-bake.js';
import {
  gildingUniforms, GILDING_VERTEX_PARS, GILDING_VERTEX, GILDING_FRAGMENT_PARS,
  GILDING_COLOR, GILDING_PBR, GILDING_EMISSIVE, GILDING_DIM, GILDING_BLOOM, GILDING_NORMAL,
} from './gilding.js';

// La Victoria de Samotracia (v6): carga progresiva, mármol con oro que se dibuja con el scroll, cromo líquido
// al tocar el mar, flotación y reacción al cursor. Además, su reflejo en el agua.
// Los cálculos por vértice (normales suavizadas, espacio estatua, curvatura) van en un worker.
export function createStatue(ctx) {
  const { THREE, shared } = ctx;

  // statueRoot: lo controla la API (posición/rotación/escala desde afuera)
  // floatGroup: movimiento propio (flotar, balanceo, mirar al cursor)
  const statueRoot = new THREE.Group();
  statueRoot.name = 'estatua_root';
  statueRoot.position.set(STATUE.position.x, STATUE.position.y, STATUE.position.z);
  statueRoot.scale.setScalar(STATUE.scale);
  const spin = new THREE.Group();
  spin.name = 'estatua_giro';
  statueRoot.add(spin);
  const floatGroup = new THREE.Group();
  spin.add(floatGroup);

  const material = createMarble(THREE, STATUE.material, GOLD);
  const reflMaterial = createMarble(THREE, STATUE.material, GOLD, { reflection: material.userData.uniforms });
  let current = null;
  let tier = ctx.quality;
  const state = { intensity: 1, loaded: false, appear: 0 };

  // "Bloqueador" invisible para el raycast: evita clics en ventanas que están detrás.
  const blocker = new THREE.Mesh(
    new THREE.CylinderGeometry(0.6, 0.6, STATUE.height * 0.95, 14),
    new THREE.MeshBasicMaterial({ visible: false }),
  );
  blocker.position.y = STATUE.height * 0.48;
  floatGroup.add(blocker);

  // Luces de contorno (contrato: estatua_rim_*). No se crean en calidad baja; después solo cambia su intensidad.
  const rims = tier === 'low' ? [] : STATUE.rim.map((r, i) => {
    const l = new THREE.PointLight(r.color, r.intensity, r.distance, 1.8);
    l.name = `estatua_rim_${i}`;
    l.position.set(...r.position);
    statueRoot.add(l);
    return l;
  });
  const rimBase = STATUE.rim.map((r) => r.intensity);
  let rimScale = 1, rimTier = tier === 'low' ? 0 : 1;
  const applyRims = () => rims.forEach((l, i) => (l.intensity = rimBase[i] * rimScale * rimTier));

  // ---------- reflejo en el agua: copia espejada respecto del mar, con las olas en el shader ----------
  let reflection = null;
  const lod0Local = new THREE.Matrix4();
  const mirror = new THREE.Matrix4();
  const tmpM = new THREE.Matrix4();

  // ---------- worker para los cálculos por vértice ----------
  let worker = null, jobId = 0;
  const jobs = new Map();
  try {
    worker = new Worker(new URL('./gilding.worker.js', import.meta.url), { type: 'module' });
    worker.onmessage = (e) => { const j = jobs.get(e.data.id); jobs.delete(e.data.id); j?.(e.data); };
    worker.onerror = () => { worker = null; };
  } catch { worker = null; }
  function bakeAsync(payload) {
    if (!worker) return Promise.resolve(bake(payload));
    return new Promise((resolve) => {
      const id = ++jobId;
      jobs.set(id, resolve);
      worker.postMessage({ id, ...payload }, [payload.pos.buffer]);
    });
  }

  async function prepare(gltf, smoothPasses) {
    const model = gltf.scene;
    let mesh = null;
    model.traverse((o) => { if (o.isMesh) mesh = o; });
    mesh.material = material;
    mesh.castShadow = false;
    mesh.receiveShadow = false;
    mesh.layers.enable(1); // capa 1 = bloom selectivo del core (solo brilla el oro, ver GILDING_BLOOM)
    // el escaneo viene "acostado": se endereza y se gira para que mire a cámara (+Z)
    model.rotation.set(STATUE.orientationFix.x, STATUE.orientationFix.y + STATUE.rotationY, STATUE.orientationFix.z, 'YXZ');
    model.updateMatrixWorld(true);
    // normalizar: altura = STATUE.height, centrado en X/Z y apoyado en y = 0
    const box = new THREE.Box3().setFromObject(model);
    const size = box.getSize(new THREE.Vector3());
    model.scale.multiplyScalar(STATUE.height / size.y);
    model.updateMatrixWorld(true);
    box.setFromObject(model);
    const c = box.getCenter(new THREE.Vector3());
    model.position.x -= c.x;
    model.position.z -= c.z;
    model.position.y -= box.min.y;
    model.updateMatrixWorld(true);

    // datos al worker: posiciones de la malla (en float), índices y la matriz malla → espacio estatua
    const g = mesh.geometry;
    const P = g.attributes.position, n = P.count;
    const pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { pos[i * 3] = P.getX(i); pos[i * 3 + 1] = P.getY(i); pos[i * 3 + 2] = P.getZ(i); }
    const toStatue = new THREE.Matrix4().makeRotationY(-STATUE.rotationY).multiply(mesh.matrixWorld);
    const index = g.index ? g.index.array.slice() : null;
    const out = await bakeAsync({ pos, index, toStatue: toStatue.elements.slice(), smooth: { passes: smoothPasses, sigma: 0.075 } });
    g.setAttribute('normal', new THREE.BufferAttribute(out.normal, 3));
    g.setAttribute('aStatue', new THREE.BufferAttribute(out.aStatue, 3));
    g.setAttribute('aCurv', new THREE.BufferAttribute(out.aCurv, 1));
    // normal de la malla → espacio estatua (el triplanar del mármol usa ejes de la estatua, no de la malla)
    U.uToStatueN.value.getNormalMatrix(toStatue);
    // película: la punta deformada del escaneo debajo del pedestal se saca (triángulos con los tres vértices abajo)
    const idx = g.index?.array;
    if (idx && STATUE.cutBelow > 0) {
      const S = out.aStatue, keep = [];
      for (let t = 0; t < idx.length; t += 3) {
        const a = idx[t], b = idx[t + 1], c = idx[t + 2];
        if (S[a * 3 + 1] < STATUE.cutBelow && S[b * 3 + 1] < STATUE.cutBelow && S[c * 3 + 1] < STATUE.cutBelow) continue;
        keep.push(a, b, c);
      }
      g.setIndex(keep);
    }
    return { model, mesh };
  }

  let lod0 = null; // el liviano queda en memoria: lo usa el reflejo en el agua
  function swap(next) {
    if (current) {
      floatGroup.remove(current.model);
      if (current !== lod0) current.mesh.geometry.dispose();
    }
    current = next;
    floatGroup.add(next.model);
  }

  // Carga progresiva: liviano primero; el detallado después (con el suavizado de normales del escaneo).
  let fullDone;
  const fullReady = new Promise((r) => (fullDone = r));
  const ready = loadGlb(ctx, STATUE.models.preview).then((g) => prepare(g, 1)).then((first) => {
    lod0 = first;
    first.model.updateMatrixWorld(true);
    lod0Local.copy(first.mesh.matrixWorld); // malla → floatGroup
    reflection = new THREE.Mesh(first.mesh.geometry, reflMaterial);
    reflection.name = 'estatua_reflejo_agua';
    reflection.matrixAutoUpdate = false;
    reflection.frustumCulled = false;
    reflection.renderOrder = -35; // después del mar
    reflection.visible = false;
    ctx.root.add(reflection);
    swap(first);
    state.loaded = true;
    ctx.bus.emit('estatua:ready', {});
    return loadGlb(ctx, STATUE.models.full).then((g) => prepare(g, STATUE.smoothNormals)).then(swap)
      .catch((e) => console.warn('[estatua] no se pudo cargar el modelo detallado, sigue el liviano', e))
      .finally(() => fullDone());
  }).catch((err) => {
    console.error('[estatua] no se pudo cargar el modelo', err);
    showLoadError(ctx.overlay, err);
    fullDone();
  });

  const U = material.userData.uniforms;
  // mármol real (2K; 1K en low) y huellas del oro: triplanar en el shader. Hasta que llegan, mármol procedural.
  {
    const tl = new THREE.TextureLoader();
    const A = ctx.assetsPath;
    const prep = (t) => { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.NoColorSpace; t.anisotropy = Math.min(8, ctx.renderer.capabilities.getMaxAnisotropy()); return t; };
    const m = tl.load(`${A}marmol-${tier === 'low' ? '1k' : '2k'}.webp`, () => { U.uMarbleK.value = 1; });
    const h = tl.load(`${A}oro-huellas-1k.webp`);
    U.uMarble.value = prep(m); U.uHuellas.value = prep(h);
  }
  U.uAlqSym.value = tier === 'low' ? 0 : tier === 'medium' ? 0.8 : 1;
  U.uTrans.value = tier === 'low' ? 0.25 : 0.5;
  U.uAO.value = tier === 'low' ? 0.4 : 0.7;
  return {
    group: statueRoot,
    spin,
    floatGroup,
    blocker,
    ready,
    fullReady,
    state,
    material,
    /** Geometría del modelo liviano (con aStatue): la usan los fragmentos y el reflejo. */
    get lod0Geometry() { return lod0?.mesh.geometry ?? null; },
    /** Geometría del modelo visible (detallado si ya cargó). */
    get geometry() { return current?.mesh.geometry ?? null; },
    setIntensity(v) { state.intensity = v; },
    setBright(v) { U.uBright.value = v; },
    setRimScale(v) { rimScale = v; applyRims(); },
    setRimColor(c0, c1) { if (rims[0]) rims[0].color.copy(c0); if (rims[1] && c1) rims[1].color.copy(c1); },
    setGoldGlow(v) { U.uGoldGlow.value = v; },
    setLegs(v) { U.uLegs.value = v; },
    setWingPaint(lines, fill) { U.uWingLines.value = lines; U.uWingFill.value = fill; },
    /** 0..1: el oro se derrite en cromo de abajo hacia arriba. (Ya no se usa: la caída transmuta en oro, ver setAlquimia.) */
    setChrome(v) { U.uChrome.value = v; },
    /** ALQUIMIA 0..1: el mármol se transmuta en oro pulido de abajo hacia arriba, con símbolos que se dibujan. */
    setAlquimia(v) { U.uAlq.value = v; },
    /** Cáusticas en la base: 0..1 según lo cerca del agua que está. */
    setCaustics(v) { U.uCaust.value = v; },
    /** El sol en espacio de vista (para la luz que atraviesa el mármol fino). */
    setSun(dirView, color) { U.uSunV.value.copy(dirView); if (color) U.uSunCol.value.copy(color); },
    /** Intro: k = 0..1 (negro con la silueta de oro) y draw = 0..1 (cuánto está dibujado). */
    setIntro(k, draw) { U.uIntro.value = k; U.uIntroDraw.value = draw; },
    /**
     * Reflejo en el agua. amount 0..1 · seaY = altura del mar (y del mundo).
     * Espejo respecto del plano del mar; las olas lo ondulan en el shader.
     */
    setReflection(amount, seaY, time) {
      if (!reflection) return;
      const on = amount > 0.003;
      if (reflection.visible !== on) reflection.visible = on;
      U.uReflAmount.value = amount;
      U.uSeaY.value = seaY;
      if (!on) return;
      mirror.makeTranslation(0, seaY, 0).multiply(tmpM.makeScale(1, -1, 1)).multiply(tmpM.makeTranslation(0, -seaY, 0));
      floatGroup.updateWorldMatrix(true, false);
      reflection.matrix.copy(mirror).multiply(floatGroup.matrixWorld).multiply(lod0Local);
      reflection.matrixWorld.copy(reflection.matrix);
    },
    update(time, delta) {
      U.uTime.value = time;
      if (!state.loaded) return;
      state.appear = Math.min(1, state.appear + delta * 0.6);
      const a = easeOutCubic(state.appear);
      const motion = shared.reducedMotion ? 0 : state.intensity;
      const p = shared.pointer, t = shared.tilt;
      floatGroup.position.y = Math.sin((time * Math.PI * 2) / STATUE.float.period) * STATUE.float.amplitude * motion + (1 - a) * -0.25;
      const swayY = Math.sin(time * STATUE.sway.speed * Math.PI * 2) * STATUE.sway.amount * motion;
      const lookYaw = (p.x + t.x) * STATUE.pointerReaction.yaw * motion;
      const lookPitch = -(p.y + t.y) * STATUE.pointerReaction.pitch * motion;
      const k = 1 - Math.exp(-delta * 2.5);
      floatGroup.rotation.y += (swayY + lookYaw - floatGroup.rotation.y) * k;
      floatGroup.rotation.x += (lookPitch - floatGroup.rotation.x) * k;
      floatGroup.rotation.z = Math.sin(time * 0.17) * 0.006 * motion;
    },
    setQuality(next) {
      tier = next;
      rimTier = tier === 'low' ? 0 : 1;
      applyRims();
      material.userData.setVeins?.(tier === 'low' ? STATUE.material.veins * 0.6 : STATUE.material.veins);
      material.userData.setKintsugi?.(tier === 'low' ? 0 : GOLD.kintsugi);
      U.uAlqSym.value = tier === 'low' ? 0 : tier === 'medium' ? 0.8 : 1; // low: sin símbolos, solo el frente de oro
      U.uTrans.value = tier === 'low' ? 0.25 : 0.5;
      U.uAO.value = tier === 'low' ? 0.4 : 0.7;
    },
    dispose() {
      worker?.terminate();
      if (current) current.mesh.geometry.dispose();
      if (lod0 && lod0 !== current) lod0.mesh.geometry.dispose();
      reflection?.removeFromParent();
      reflMaterial.dispose();
      U.uMarble.value?.dispose(); U.uHuellas.value?.dispose();
      material.dispose();
      blocker.geometry.dispose();
      blocker.material.dispose();
      rims.forEach((l) => l.dispose());
    },
  };
}

const easeOutCubic = (x) => 1 - Math.pow(1 - x, 3);

function showLoadError(overlay, err) {
  if (!overlay) return;
  const d = document.createElement('div');
  d.className = 'estatua-error';
  d.setAttribute('role', 'status');
  d.textContent = `No se pudo cargar la estatua (${err?.message || err}). Probá abrir la página en Chrome o Edge.`;
  overlay.appendChild(d);
}

// Mármol marfil pulido + dorado + cromo líquido: MeshPhysicalMaterial (lo ilumina la luz del fondo).
// Vetas, oro y cromo se calculan en el shader: cero texturas para descargar.
// Con `reflection` (los uniforms de la estatua) arma la versión para el reflejo en el agua: misma figura,
// ondulada por las olas, más oscura y que se pierde con la profundidad.
function createMarble(THREE, m, gold, { reflection = null } = {}) {
  // el reflejo usa material estándar (sin laca ni terciopelo): en el agua no se notan y compila mucho más rápido
  const Mat = reflection ? THREE.MeshStandardMaterial : THREE.MeshPhysicalMaterial;
  const extra = reflection ? {} : { clearcoat: m.clearcoat, clearcoatRoughness: m.clearcoatRoughness, sheen: m.sheen, sheenColor: new THREE.Color(m.sheenColor), sheenRoughness: 0.6 };
  const mat = new Mat({
    color: m.color,
    roughness: m.roughness,
    metalness: 0,
    ...extra,
    envMapIntensity: m.envMapIntensity,
    side: THREE.FrontSide,
    // la estatua es SIEMPRE opaca y el reflejo SIEMPRE transparente: nunca cambian (cambiar recompila)
    transparent: !!reflection,
    depthWrite: !reflection,
    depthTest: !reflection,
  });
  const uniforms = reflection || {
    uVeins: { value: m.veins },
    uShadowTint: { value: new THREE.Color(m.shadowTint) },
    uVeinColor: { value: new THREE.Color(m.veinColor) },
    uReflAmount: { value: 0 },
    uSeaY: { value: -1.15 },
    ...gildingUniforms(THREE, gold),
  };
  mat.userData.uniforms = uniforms;
  if (!reflection) {
    mat.userData.bloomUniform = uniforms.uBloomPass; // el core lo prende solo durante la pasada de bloom
    mat.userData.setVeins = (v) => (uniforms.uVeins.value = v);
    mat.userData.setKintsugi = (v) => (uniforms.uKintsugi.value = v);
    if (new URLSearchParams(location.search).get('gold') === 'debug') uniforms.uGoldDebug.value = 1;
  }
  const R = reflection ? '#define ESTATUA_REFLEJO\n' : '';
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = R + shader.vertexShader
      .replace('#include <common>', `#include <common>
uniform float uSeaY, uTime;
varying float vDepth;
${GILDING_VERTEX_PARS}`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
${GILDING_VERTEX}`)
      .replace('#include <project_vertex>', `
#ifdef ESTATUA_REFLEJO
  // el reflejo: las olas lo ondulan más cuanto más lejos del agua (la imagen se rompe hacia abajo)
  vec4 rw = modelMatrix * vec4(transformed, 1.0);
  vDepth = max(0.0, uSeaY - rw.y);
  rw.x += sin(rw.y * 6.0 + uTime * 1.7) * 0.03 * vDepth + sin(rw.z * 9.0 - uTime * 2.3) * 0.012 * vDepth;
  rw.z += sin(rw.y * 4.0 - uTime * 1.2) * 0.02 * vDepth;
  vec4 mvPosition = viewMatrix * rw;
  gl_Position = projectionMatrix * mvPosition;
#else
  vDepth = 0.0;
  #include <project_vertex>
#endif`);
    shader.fragmentShader = R + shader.fragmentShader
      .replace('#include <common>', `#include <common>
uniform float uVeins, uReflAmount;
uniform vec3 uShadowTint, uVeinColor;
varying float vDepth;
` + GILDING_FRAGMENT_PARS)
      .replace('#include <color_fragment>', `#include <color_fragment>
{
  // mármol marfil: nubes suaves + vetas grises finas (el ruido viene calculado por vértice en vNA / vNB)
  vec3 q = vS * 2.4;
  float vein = 1.0 - smoothstep(0.0, 0.06, abs(sin(q.y * 2.1 + q.x * 1.3 + q.z * 0.7 + vNA.x * 8.0)));
  vein *= smoothstep(0.35, 0.6, vNA.z);
  float fine = 1.0 - smoothstep(0.0, 0.035, abs(sin(q.x * 6.0 - q.y * 3.5 + vNA.y * 10.0)));
  fine *= smoothstep(0.4, 0.65, vNA.w);
  float cloud = vNB.x;
  diffuseColor.rgb = mix(diffuseColor.rgb, uShadowTint, cloud * 0.35 * uVeins);
  diffuseColor.rgb = mix(diffuseColor.rgb, uVeinColor, (vein * 0.7 + fine * 0.35) * uVeins);
  diffuseColor.rgb *= 0.9 - smoothstep(0.08, 0.45, vCurv) * 0.25; // los huecos profundos, un poco más oscuros
}
` + GILDING_COLOR)
      .replace('#include <metalnessmap_fragment>', `#include <metalnessmap_fragment>
${GILDING_PBR}`)
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
${GILDING_NORMAL}`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
${GILDING_EMISSIVE}`)
      .replace('#include <aomap_fragment>', `#include <aomap_fragment>
{
  // oclusión ambiental: los huecos y pliegues reciben menos luz del panorama (curvatura del escaneo)
  float occ = 1.0 - smoothstep(0.02, 0.38, vCurv) * uAO;
  reflectedLight.indirectDiffuse *= occ;
  reflectedLight.indirectSpecular *= mix(1.0, occ, 0.65);
}`)
      .replace('#include <opaque_fragment>', `#include <opaque_fragment>
${GILDING_DIM}
#ifdef ESTATUA_REFLEJO
  // el agua devuelve poco y se pierde con la profundidad
  gl_FragColor.rgb *= 0.62;
  gl_FragColor.a = uReflAmount * exp(-vDepth * 0.42) * 0.75;
#endif`)
      .replace('#include <dithering_fragment>', `#include <dithering_fragment>
${GILDING_BLOOM}`);
  };
  if (reflection) mat.customProgramCacheKey = () => 'estatua-reflejo';
  return mat;
}
