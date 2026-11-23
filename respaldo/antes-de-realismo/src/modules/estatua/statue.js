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
    new THREE.CylinderGeometry(0.6, 0.6, STATUE.height * 0.95, 14), // el cuerpo (no todo el ancho de las alas)
    new THREE.MeshBasicMaterial({ visible: false }),
  );
  blocker.position.y = STATUE.height * 0.48;
  floatGroup.add(blocker);

  // Luces de contorno propias (permitidas por contrato). Si se arranca en calidad baja (celular) no se
  // crean. Después NUNCA se prenden/apagan con visible: cambiar la cantidad de luces obliga a Three.js a
  // recompilar todos los shaders (tirón de ~0,5 s). Se atenúan por intensidad (low = 0).
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

  // Reflejo de la figura de luz en la arena mojada (Contacto): el modelo liviano, espejado y estirado
  // hacia abajo, con un material de luz que se funde con la profundidad. Solo se dibuja de noche.
  const reflU = {
    uColor: { value: new THREE.Color(STATUE.light.color) }, uAmount: { value: 0 }, uSandY: { value: 0 }, uTime: { value: 0 },
  };
  const reflMat = new THREE.ShaderMaterial({
    uniforms: reflU,
    transparent: true, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending, toneMapped: false,
    vertexShader: /* glsl */`
      uniform float uTime, uSandY;
      varying float vDepth;
      varying vec3 vN; varying vec3 vV;
      void main(){
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vDepth = max(0.0, uSandY - wp.y);
        wp.x += sin(wp.y * 7.0 + uTime * 1.6) * 0.035 * vDepth;   // el agua la ondula
        vN = normalize(mat3(modelMatrix) * normal);
        vV = normalize(cameraPosition - wp.xyz);
        gl_Position = projectionMatrix * viewMatrix * wp;
      }`,
    fragmentShader: /* glsl */`
      uniform vec3 uColor; uniform float uAmount;
      varying float vDepth; varying vec3 vN; varying vec3 vV;
      void main(){
        float rim = pow(1.0 - abs(dot(normalize(vN), normalize(vV))), 1.6);
        float fade = exp(-vDepth * 1.05);
        float a = (0.35 + rim * 0.65) * fade * uAmount;
        if (a < 0.003) discard;
        gl_FragColor = vec4(uColor, a);
        #include <colorspace_fragment>
      }`,
  });
  let reflection = null;           // se arma con el modelo liviano
  const lod0Local = new THREE.Matrix4();
  const mirror = new THREE.Matrix4();
  const tmpM = new THREE.Matrix4();

  // columna de luz sobre la arena mojada, debajo de la figura (el reflejo largo de ref05)
  const streakU = { uColor: { value: new THREE.Color(STATUE.light.color) }, uAmount: { value: 0 } };
  const streak = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.ShaderMaterial({
    uniforms: streakU,
    transparent: true, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending, toneMapped: false,
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: /* glsl */`
      uniform vec3 uColor; uniform float uAmount; varying vec2 vUv;
      void main(){
        float x = (vUv.x - 0.5) * 2.0;
        float core = exp(-x * x * 9.0), wide = exp(-x * x * 2.2) * 0.35;
        float along = pow(vUv.y, 1.6) * (0.55 + 0.45 * sin(vUv.y * 40.0 + x * 3.0) * 0.5 + 0.25);
        float a = (core + wide) * along * uAmount;
        if (a < 0.003) discard;
        gl_FragColor = vec4(uColor, a);
        #include <colorspace_fragment>
      }`,
  }));
  streak.name = 'estatua_columna_de_luz';
  streak.renderOrder = -21;
  streak.frustumCulled = false;
  streak.visible = false;
  streak.layers.enable(1);
  ctx.root.add(streak);
  // halo suave detrás de la figura de luz (también en calidad baja, que no tiene bloom)
  const haloU = { uColor: { value: new THREE.Color(STATUE.light.color) }, uAmount: { value: 0 } };
  const halo = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.ShaderMaterial({
    uniforms: haloU,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false,
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: /* glsl */`
      uniform vec3 uColor; uniform float uAmount; varying vec2 vUv;
      void main(){
        vec2 p = (vUv - 0.5) * vec2(1.0, 1.35);
        float d = dot(p, p);
        float edge = 1.0 - smoothstep(0.3, 0.5, max(abs(vUv.x - 0.5), abs(vUv.y - 0.5))); // llega a 0 en el borde
        float a = (exp(-d * 9.0) * 0.55 + exp(-d * 3.0) * 0.25) * edge * uAmount;
        if (a < 0.003) discard;
        gl_FragColor = vec4(uColor, a);
        #include <colorspace_fragment>
      }`,
  }));
  halo.name = 'estatua_halo_de_luz';
  halo.renderOrder = -22;
  halo.frustumCulled = false;
  halo.visible = false;
  ctx.root.add(halo);
  const tmpV3 = new THREE.Vector3();

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

  let lod0 = null; // el liviano queda en memoria: lo usan el reflejo y las alas de luz
  function swap(next) {
    if (current) {
      floatGroup.remove(current.model);
      if (current !== lod0) current.mesh.geometry.dispose();
    }
    current = next;
    floatGroup.add(next.model);
  }

  const load = (file) => loadGlb(ctx, file).then(prepare);

  // Carga progresiva: liviano primero; el detallado después. `fullReady` avisa cuando está el detallado
  // (main.js espera un rato por él antes de mostrar la página, así el cambio no se ve).
  let fullDone;
  const fullReady = new Promise((r) => (fullDone = r));
  const ready = load(STATUE.models.preview).then((first) => {
    lod0 = first;
    first.model.updateMatrixWorld(true);
    lod0Local.copy(first.mesh.matrixWorld); // malla → floatGroup
    reflection = new THREE.Mesh(first.mesh.geometry, reflMat);
    reflection.name = 'estatua_reflejo_luz';
    reflection.matrixAutoUpdate = false;
    reflection.frustumCulled = false;
    reflection.renderOrder = -20;
    reflection.visible = false;
    reflection.layers.enable(1); // el reflejo también brilla
    ctx.root.add(reflection);
    swap(first);
    state.loaded = true;
    ctx.bus.emit('estatua:ready', {});
    return load(STATUE.models.full).then(swap).catch((e) => console.warn('[estatua] no se pudo cargar el modelo detallado, sigue el liviano', e)).finally(() => fullDone());
  }).catch((err) => {
    console.error('[estatua] no se pudo cargar el modelo', err);
    showLoadError(ctx.overlay, err);
    fullDone();
  });

  return {
    group: statueRoot,
    spin,
    floatGroup,
    blocker,
    ready,
    fullReady,
    state,
    material,
    /** Geometría del modelo liviano con aStatue (para las alas de luz). */
    get lod0Geometry() { return lod0?.mesh.geometry ?? null; },
    setIntensity(v) { state.intensity = v; },
    /** Brillo general de la estatua (1 = normal). Lo bajan las salas. */
    setBright(v) { material.userData.uniforms.uBright.value = v; },
    /** Escala de las luces de contorno (0..1) sin cambiar cuántas luces hay en la escena. */
    setRimScale(v) { rimScale = v; applyRims(); },
    /** Color de las luces de contorno (el del sol del fondo, por ejemplo). */
    setRimColor(c0, c1) { if (rims[0]) rims[0].color.copy(c0); if (rims[1] && c1) rims[1].color.copy(c1); },
    /** 0..1: figura de luz (Contacto). Prende el reflejo en la arena en `sandY`. */
    setLight(v, sandY, time) {
      const u = material.userData.uniforms;
      u.uLightBody.value = v;
      reflU.uAmount.value = v * STATUE.light.reflection;
      reflU.uSandY.value = sandY;
      reflU.uTime.value = time;
      streakU.uAmount.value = v * STATUE.light.streak;
      haloU.uAmount.value = v * (tier === 'low' ? STATUE.light.halo : STATUE.light.halo * 0.5); // con bloom hace falta menos
      if (!reflection) return;
      const on = v > 0.002;
      if (reflection.visible !== on) { reflection.visible = on; streak.visible = on; halo.visible = on; }
      if (!on) return;
      // el halo: detrás de la figura, de cara a la cámara
      statueRoot.getWorldPosition(tmpV3);
      halo.position.set(tmpV3.x - 0.3, tmpV3.y + 1.65, tmpV3.z - 0.6);
      halo.scale.set(3.6, 4.4, 1);
      halo.rotation.y = Math.atan2(ctx.camera.position.x - halo.position.x, ctx.camera.position.z - halo.position.z);
      // la columna: debajo de los pies, de cara a la cámara, angosta y larga
      statueRoot.getWorldPosition(tmpV3);
      streak.position.set(tmpV3.x - 0.36, sandY - 1.45, tmpV3.z + 0.3);
      streak.scale.set(1.15, 2.9, 1);
      streak.rotation.y = Math.atan2(ctx.camera.position.x - streak.position.x, ctx.camera.position.z - streak.position.z);
      // espejo respecto de la arena, estirado hacia abajo (los reflejos en la arena mojada se alargan)
      const k = STATUE.light.stretch;
      mirror.makeTranslation(0, sandY, 0).multiply(tmpM.makeScale(1, -k, 1)).multiply(tmpM.makeTranslation(0, -sandY, 0));
      floatGroup.updateWorldMatrix(true, false);
      reflection.matrix.copy(mirror).multiply(floatGroup.matrixWorld).multiply(lod0Local);
      reflection.matrixWorld.copy(reflection.matrix);
    },
    /** Cuánto brilla el oro en el bloom (1 = normal). */
    setGoldGlow(v) { material.userData.uniforms.uGoldGlow.value = v; },
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

      // flota: sube y baja ±4 cm cada 6 s
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
    },
    dispose() {
      if (current) current.mesh.geometry.dispose();
      if (lod0 && lod0 !== current) lod0.mesh.geometry.dispose();
      reflection?.removeFromParent();
      reflMat.dispose();
      streak.removeFromParent();
      streak.geometry.dispose();
      streak.material.dispose();
      halo.removeFromParent();
      halo.geometry.dispose();
      halo.material.dispose();
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
    // SIEMPRE opaco: pasar de transparente a opaco cambia el programa y recompila el shader del mármol
    // (en una RX 550 eran 2,7 s congelados). La aparición la tapa el velo de carga.
    transparent: false,
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
