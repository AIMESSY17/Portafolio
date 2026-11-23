import { STATUE, GOLD } from './config.js';
import { bakeGildingAttributes, gildingUniforms, GILDING_VERTEX_PARS, GILDING_VERTEX, GILDING_FRAGMENT_PARS, GILDING_COLOR, GILDING_PBR } from './gilding.js';

// La Victoria de Samotracia: carga progresiva, material de mármol, flotación y reacción al cursor.
export function createStatue(ctx) {
  const { THREE, loader, assetsPath, shared } = ctx;

  // statueRoot: lo controla la API (posición/rotación/escala desde afuera)
  // floatGroup: movimiento propio (flotar, balanceo, mirar al cursor)
  const statueRoot = new THREE.Group();
  statueRoot.name = 'estatua_root';
  statueRoot.position.set(STATUE.position.x, STATUE.position.y, STATUE.position.z);
  statueRoot.scale.setScalar(STATUE.scale);
  const floatGroup = new THREE.Group();
  statueRoot.add(floatGroup);

  const material = createMarble(THREE, STATUE.material, GOLD);
  let current = null;       // modelo visible
  let tier = ctx.quality;
  const state = { intensity: 1, loaded: false, appear: 0 };

  // "Bloqueador" invisible para el raycast: evita clics en ventanas que están detrás.
  const blocker = new THREE.Mesh(
    new THREE.CylinderGeometry(0.62, 0.75, STATUE.height * 0.92, 12),
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

  function prepare(gltf) {
    const model = gltf.scene;
    let mesh = null;
    model.traverse((o) => {
      if (!o.isMesh) return;
      mesh = o;
      if (!o.geometry.attributes.normal) o.geometry.computeVertexNormals();
      o.material = material;
      o.castShadow = true;
      o.receiveShadow = true;
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

  // En la vista previa de un solo archivo (npm run preview:file) los modelos vienen embebidos
  // en base64 y SIN compresión meshopt: se leen directo, sin fetch ni WebAssembly.
  const embedded = window.__SAMOTRACIA_ASSETS__ || {};
  const load = (file) => {
    if (embedded[file]) {
      const bin = atob(embedded[file]);
      const buf = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
      return loader.parseAsync(buf.buffer, '').then(prepare);
    }
    return loader.loadAsync(assetsPath + file).then(prepare);
  };

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
    floatGroup,
    blocker,
    ready,
    state,
    setIntensity(v) { state.intensity = v; },
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
      if (current) current.mesh.castShadow = tier !== 'low';
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
  mat.userData.setVeins = (v) => (uniforms.uVeins.value = v);
  mat.userData.setKintsugi = (v) => (uniforms.uKintsugi.value = v);
  if (new URLSearchParams(location.search).get('gold') === 'debug') uniforms.uGoldDebug.value = 1;
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\n' + GILDING_VERTEX_PARS)
      .replace('#include <begin_vertex>', '#include <begin_vertex>\n' + GILDING_VERTEX);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
uniform float uVeins;
uniform vec3 uShadowTint, uVeinColor;
float mHash(vec3 p){ p = fract(p*0.3183099+.1); p*=17.0; return fract(p.x*p.y*p.z*(p.x+p.y+p.z)); }
float mNoise(vec3 x){ vec3 i=floor(x); vec3 f=fract(x); f=f*f*(3.0-2.0*f);
  return mix(mix(mix(mHash(i),mHash(i+vec3(1,0,0)),f.x),mix(mHash(i+vec3(0,1,0)),mHash(i+vec3(1,1,0)),f.x),f.y),
             mix(mix(mHash(i+vec3(0,0,1)),mHash(i+vec3(1,0,1)),f.x),mix(mHash(i+vec3(0,1,1)),mHash(i+vec3(1,1,1)),f.x),f.y),f.z); }
float mFbm(vec3 p){ float a=0.5, s=0.0; for(int i=0;i<4;i++){ s+=a*mNoise(p); p*=2.03; a*=0.5; } return s; }
` + GILDING_FRAGMENT_PARS)
      .replace('#include <color_fragment>', `#include <color_fragment>
{
  // mármol marfil: nubes suaves + vetas grises finas (como el mármol pulido de las referencias)
  vec3 q = vS * 2.4;
  float n = mFbm(q);
  float vein = 1.0 - smoothstep(0.0, 0.06, abs(sin(q.y * 2.1 + q.x * 1.3 + q.z * 0.7 + n * 8.0)));
  vein *= smoothstep(0.35, 0.6, mFbm(q * 0.7 + 7.0)); // las vetas aparecen y se cortan, no rayas parejas
  float fine = 1.0 - smoothstep(0.0, 0.035, abs(sin(q.x * 6.0 - q.y * 3.5 + mFbm(q * 2.7) * 10.0)));
  fine *= smoothstep(0.4, 0.65, mFbm(q * 1.3 - 2.0));
  float cloud = mFbm(q * 0.55 + 4.0);
  diffuseColor.rgb = mix(diffuseColor.rgb, uShadowTint, cloud * 0.35 * uVeins);
  diffuseColor.rgb = mix(diffuseColor.rgb, uVeinColor, (vein * 0.7 + fine * 0.35) * uVeins);
  // los huecos profundos un poco más oscuros: da volumen a los pliegues
  diffuseColor.rgb *= 0.9 - smoothstep(0.08, 0.45, vCurv) * 0.25; // marfil, no blanco puro
}
` + GILDING_COLOR)
      .replace('#include <metalnessmap_fragment>', '#include <metalnessmap_fragment>\n' + GILDING_PBR);
  };
  return mat;
}
