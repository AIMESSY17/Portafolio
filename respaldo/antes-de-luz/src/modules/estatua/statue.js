import { STATUE, GOLD } from './config.js';
import { loadGlb } from './models.js';
import {
  bakeGildingAttributes, gildingUniforms, GILDING_VERTEX_PARS, GILDING_VERTEX, GILDING_FRAGMENT_PARS,
  GILDING_COLOR, GILDING_PBR, GILDING_EMISSIVE, GILDING_DIM, GILDING_BLOOM,
} from './gilding.js';

// La Victoria de Samotracia: carga progresiva, material de mármol, flotación y reacción al cursor.
export function createStatue(ctx) {
  const { THREE, shared } = ctx;

  // statueRoot: lo controla la API (posición/rotación/escala desde afuera)
  // floatGroup: movimiento propio (flotar, balanceo, mirar al cursor)
  const statueRoot = new THREE.Group();
  statueRoot.name = 'estatua_root';
  statueRoot.position.set(STATUE.position.x, STATUE.position.y, STATUE.position.z);
  statueRoot.scale.setScalar(STATUE.scale);
  // spin: el giro con el mouse/dedo (gira SOLO la estatua, no las luces de contorno ni los proyectos)
  const spin = new THREE.Group();
  spin.name = 'estatua_giro';
  statueRoot.add(spin);
  const floatGroup = new THREE.Group();
  spin.add(floatGroup);

  const material = createMarble(THREE, STATUE.material, GOLD);
  let current = null;       // modelo visible
  let tier = ctx.quality;
  const state = { intensity: 1, loaded: false, appear: 0 };

  // "Bloqueador" invisible para el raycast: evita clics en ventanas que están detrás.
  const blocker = new THREE.Mesh(
    new THREE.CylinderGeometry(1.0, 1.0, STATUE.height * 0.95, 14), // ancho como las alas
    new THREE.MeshBasicMaterial({ visible: false }),
  );
  blocker.position.y = STATUE.height * 0.48;
  floatGroup.add(blocker);

  // Luces de contorno propias (permitidas por contrato), apagadas en low.
  const rims = STATUE.rim.map((r, i) => {
    const l = new THREE.PointLight(r.color, r.intensity, r.distance, 1.8);
    l.name = `estatua_rim_${i}`;
    l.position.set(...r.position);
    statueRoot.add(l);
    return l;
  });
  // Calidad low: sin luces de contorno (también al arrancar con ?quality=low).
  rims.forEach((l) => (l.visible = tier !== 'low'));
  // Las luces NUNCA se prenden/apagan con visible durante el scroll: cambiar la cantidad de luces
  // obliga a Three.js a recompilar todos los shaders (tirón de ~0,5 s). Se atenúan por intensidad.
  const rimBase = STATUE.rim.map((r) => r.intensity);

  function prepare(gltf) {
    const model = gltf.scene;
    let mesh = null;
    model.traverse((o) => {
      if (!o.isMesh) return;
      mesh = o;
      if (!o.geometry.attributes.normal) o.geometry.computeVertexNormals();
      o.material = material;
      o.castShadow = tier === 'high';
      o.receiveShadow = tier === 'high';
      o.layers.enable(1); // capa 1 = bloom selectivo del core (solo brilla el oro, ver GILDING_BLOOM)
    });
    // el escaneo viene "acostado": se endereza y se gira para que mire a cámara (+Z)
    model.rotation.set(STATUE.orientationFix.x, STATUE.orientationFix.y + STATUE.rotationY, STATUE.orientationFix.z, 'YXZ');
    // normalizar: altura = STATUE.height, centrado en X/Z y apoyado en y = 0
    model.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(model);
    const size = box.getSize(new THREE.Vector3());
    const s = STATUE.height / size.y;
    model.scale.multiplyScalar(s);
    model.updateMatrixWorld(true);
    box.setFromObject(model);
    const c = box.getCenter(new THREE.Vector3());
    model.position.x -= c.x;
    model.position.z -= c.z;
    model.position.y -= box.min.y;

    // datos para el dorado: posición en "espacio estatua" (sin el giro de presentación) + curvatura
    model.updateMatrixWorld(true);
    const toStatue = new THREE.Matrix4().makeRotationY(-STATUE.rotationY).multiply(mesh.matrixWorld);
    bakeGildingAttributes(THREE, mesh.geometry, toStatue);
    return { model, mesh };
  }

  function swap(next) {
    if (current) {
      floatGroup.remove(current.model);
      current.mesh.geometry.dispose();
    }
    current = next;
    floatGroup.add(next.model);
  }

  const load = (file) => loadGlb(ctx, file).then(prepare);

  // Carga progresiva: liviano primero; el detallado después.
  const ready = load(STATUE.models.preview).then((lod0) => {
    swap(lod0);
    state.loaded = true;
    ctx.bus.emit('estatua:ready', {});
    return load(STATUE.models.full).then(swap).catch((e) => console.warn('[estatua] no se pudo cargar el modelo detallado, sigue el liviano', e));
  }).catch((err) => {
    console.error('[estatua] no se pudo cargar el modelo', err);
    showLoadError(ctx.overlay, err);
  });

  return {
    group: statueRoot,
    spin,
    floatGroup,
    blocker,
    ready,
    state,
    setIntensity(v) { state.intensity = v; },
    /** Brillo general de la estatua (1 = normal). Lo bajan las salas. */
    setBright(v) { material.userData.uniforms.uBright.value = v; },
    /** Escala de las luces de contorno (0..1) sin cambiar cuántas luces hay en la escena. */
    setRimScale(v) { rims.forEach((l, i) => (l.intensity = rimBase[i] * v)); },
    /** Oro que sube por las piernas (0..1). */
    setLegs(v) { material.userData.uniforms.uLegs.value = v; },
    /** Alas pintadas desde la punta: líneas (0..1) y relleno macizo (0..1). */
    setWingPaint(lines, fill) {
      material.userData.uniforms.uWingLines.value = lines;
      material.userData.uniforms.uWingFill.value = fill;
    },
    update(time, delta) {
      if (!state.loaded) return;
      state.appear = Math.min(1, state.appear + delta * 0.6);
      const a = easeOutCubic(state.appear);
      const motion = shared.reducedMotion ? 0 : state.intensity;
      const p = shared.pointer, t = shared.tilt;

      floatGroup.position.y = Math.sin(time * STATUE.float.speed * Math.PI * 2 * 0.25) * STATUE.float.amplitude * motion + (1 - a) * -0.25;
      const swayY = Math.sin(time * STATUE.sway.speed * Math.PI * 2) * STATUE.sway.amount * motion;
      const lookYaw = (p.x + t.x) * STATUE.pointerReaction.yaw * motion;
      const lookPitch = -(p.y + t.y) * STATUE.pointerReaction.pitch * motion;
      const k = 1 - Math.exp(-delta * 2.5);
      floatGroup.rotation.y += (swayY + lookYaw - floatGroup.rotation.y) * k;
      floatGroup.rotation.x += (lookPitch - floatGroup.rotation.x) * k;
      floatGroup.rotation.z = Math.sin(time * 0.17) * 0.006 * motion;
      if (material.transparent) {
        material.opacity = a;
        if (a >= 1) { material.transparent = false; material.needsUpdate = true; }
      }
    },
    setQuality(next) {
      tier = next;
      rims.forEach((l) => (l.visible = tier !== 'low'));
      material.userData.setVeins?.(tier === 'low' ? STATUE.material.veins * 0.6 : STATUE.material.veins);
      material.userData.setKintsugi?.(tier === 'low' ? 0 : GOLD.kintsugi);
      if (current) { current.mesh.castShadow = tier === 'high'; current.mesh.receiveShadow = tier === 'high'; }
    },
    dispose() {
      if (current) current.mesh.geometry.dispose();
      material.dispose();
      blocker.geometry.dispose();
      blocker.material.dispose();
      rims.forEach((l) => l.dispose());
    },
  };
}

const easeOutCubic = (x) => 1 - Math.pow(1 - x, 3);

// Aviso visible si la estatua no carga (así no queda una escena "vacía" sin explicación).
function showLoadError(overlay, err) {
  if (!overlay) return;
  const d = document.createElement('div');
  d.className = 'estatua-error';
  d.setAttribute('role', 'status');
  d.textContent = `No se pudo cargar la estatua (${err?.message || err}). Probá abrir la página en Chrome o Edge.`;
  overlay.appendChild(d);
}

// Mármol marfil pulido + dorado: MeshPhysicalMaterial (lo ilumina la luz del fondo).
// Vetas y oro se calculan en el shader: cero texturas para descargar.
function createMarble(THREE, m, gold) {
  const mat = new THREE.MeshPhysicalMaterial({
    color: m.color,
    roughness: m.roughness,
    metalness: 0,
    clearcoat: m.clearcoat,
    clearcoatRoughness: m.clearcoatRoughness,
    sheen: m.sheen,
    sheenColor: new THREE.Color(m.sheenColor),
    sheenRoughness: 0.6,
    envMapIntensity: m.envMapIntensity,
    side: THREE.FrontSide,
    transparent: true, // solo durante la aparición; después pasa a opaco
    opacity: 0,
  });
  const uniforms = {
    uVeins: { value: m.veins },
    uShadowTint: { value: new THREE.Color(m.shadowTint) },
    uVeinColor: { value: new THREE.Color(m.veinColor) },
    ...gildingUniforms(THREE, gold),
  };
  mat.userData.uniforms = uniforms;
  mat.userData.bloomUniform = uniforms.uBloomPass; // el core lo prende solo durante la pasada de bloom
  mat.userData.setVeins = (v) => (uniforms.uVeins.value = v);
  mat.userData.setKintsugi = (v) => (uniforms.uKintsugi.value = v);
  if (new URLSearchParams(location.search).get('gold') === 'debug') uniforms.uGoldDebug.value = 1;
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>
${GILDING_VERTEX_PARS}`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
${GILDING_VERTEX}`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
uniform float uVeins;
uniform vec3 uShadowTint, uVeinColor;
` + GILDING_FRAGMENT_PARS)
      .replace('#include <color_fragment>', `#include <color_fragment>
{
  // mármol marfil: nubes suaves + vetas grises finas (como el mármol pulido de las referencias)
  // (el ruido viene calculado por vértice en vNA / vNB)
  vec3 q = vS * 2.4;
  float vein = 1.0 - smoothstep(0.0, 0.06, abs(sin(q.y * 2.1 + q.x * 1.3 + q.z * 0.7 + vNA.x * 8.0)));
  vein *= smoothstep(0.35, 0.6, vNA.z); // las vetas aparecen y se cortan, no rayas parejas
  float fine = 1.0 - smoothstep(0.0, 0.035, abs(sin(q.x * 6.0 - q.y * 3.5 + vNA.y * 10.0)));
  fine *= smoothstep(0.4, 0.65, vNA.w);
  float cloud = vNB.x;
  diffuseColor.rgb = mix(diffuseColor.rgb, uShadowTint, cloud * 0.35 * uVeins);
  diffuseColor.rgb = mix(diffuseColor.rgb, uVeinColor, (vein * 0.7 + fine * 0.35) * uVeins);
  // los huecos profundos un poco más oscuros: da volumen a los pliegues
  diffuseColor.rgb *= 0.9 - smoothstep(0.08, 0.45, vCurv) * 0.25; // marfil, no blanco puro
}
` + GILDING_COLOR)
      .replace('#include <metalnessmap_fragment>', `#include <metalnessmap_fragment>
${GILDING_PBR}`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
${GILDING_EMISSIVE}`)
      .replace('#include <opaque_fragment>', `#include <opaque_fragment>
${GILDING_DIM}`)
      .replace('#include <dithering_fragment>', `#include <dithering_fragment>
${GILDING_BLOOM}`);
  };
  return mat;
}
