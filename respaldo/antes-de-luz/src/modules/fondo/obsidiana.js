// Obsidiana líquida: un piso negro brillante que refleja la luz y el entorno, y se funde con el
// negro hacia atrás. Es UN solo MeshPhysicalMaterial (roughness ~0.25, clearcoat 1): no hay
// espejo en tiempo real (el Reflector dibujaba la escena dos veces). Refleja solo el environment
// y el brillo del sol (la luz de la escena le pega como a cualquier material).
// Las ondas del cursor siguen, pero baratas: se suman a la normal del mismo material
// (4 ondas, sin texturas extra) y se apagan en calidad baja.
import { loadTex } from './texturas.js';
import { damp } from './ritmo.js';

export const FLOOR_Y = -1.05;   // debajo del cilindro reservado (y ≥ -1)
const MAX_RIPPLES = 4;

export function createObsidiana(ctx, { track, tier }) {
  const { THREE, root, camera, scene, assetsPath: A } = ctx;
  const normalTex = track(loadTex(THREE, A + 'claroscuro/agua-normales.webp'));
  normalTex.wrapS = normalTex.wrapT = THREE.RepeatWrapping;
  normalTex.repeat.set(6, 6);
  const rip = Array.from({ length: MAX_RIPPLES }, () => new THREE.Vector4(0, 0, -100, 0)); // x, z, tiempo de inicio, fuerza
  let ripIdx = 0;
  const u = {
    uTime: { value: 0 }, uRip: { value: rip }, uScan: { value: 0 }, uRipOn: { value: tier === 'low' ? 0 : 1 },
    uCalm: { value: 0 },                                  // ondas lentas y anchas, como agua quieta (sala de Mantra)
    uGlint: { value: 0 }, uGlintCol: { value: new THREE.Color('#ffd2a8') }, // destellos de sol sobre el mar (sala de Aura Aika)
  };

  const mat = track(new THREE.MeshPhysicalMaterial({
    color: '#070605', roughness: 0.25, metalness: 0.3, clearcoat: 1, clearcoatRoughness: 0.12,
    envMap: scene.environment, envMapIntensity: 0.3,           // refleja solo el environment
    normalMap: normalTex, normalScale: new THREE.Vector2(0.15, 0.15),
  }));
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, u);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec2 vFW;')
      .replace('#include <project_vertex>', '#include <project_vertex>\nvFW = (modelMatrix * vec4(transformed, 1.0)).xz;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
varying vec2 vFW;
uniform float uTime, uScan, uRipOn, uCalm, uGlint;
uniform vec3 uGlintCol;
uniform vec4 uRip[${MAX_RIPPLES}];
vec2 ripple(vec2 p){
  vec2 g = vec2(0.0);
  for (int i = 0; i < ${MAX_RIPPLES}; i++){
    vec4 r = uRip[i]; float age = uTime - r.z;
    if (age < 0.0 || age > 7.0 || r.w <= 0.0) continue;
    vec2 d = p - r.xy; float dist = length(d); float front = age * 2.1;
    float w = sin((dist - front) * 5.5) * exp(-pow(dist - front, 2.0) * 0.9) * exp(-age * 0.55) * r.w;
    g += (d / (dist + 1e-3)) * w;
  }
  return g;
}`)
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
if (uRipOn > 0.5) {
  vec2 rp = ripple(vFW);
  normal = normalize(normal + (viewMatrix * vec4(-rp.x, 0.0, -rp.y, 0.0)).xyz * 0.55);
}
if (uCalm > 0.01) {
  float w = sin(vFW.x * 0.55 + vFW.y * 0.35 - uTime * 0.45) + sin(vFW.x * 0.3 - vFW.y * 0.6 + uTime * 0.33);
  normal = normalize(normal + (viewMatrix * vec4(w * 0.06 * uCalm, 0.0, w * 0.04 * uCalm, 0.0)).xyz);
}`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
if (uGlint > 0.01) {
  vec2 gc = floor(vFW * 2.6);
  float h = fract(sin(dot(gc, vec2(12.9898, 78.233))) * 43758.5453);
  float d = length(fract(vFW * 2.6) - 0.5);
  float tw = pow(max(0.0, sin(uTime * (1.6 + h * 4.0) + h * 60.0)), 18.0);
  float far = smoothstep(14.0, 30.0, length(vFW - vec2(0.0, -5.0)));
  totalEmissiveRadiance += uGlintCol * step(0.8, h) * tw * smoothstep(0.1, 0.0, d) * uGlint * 1.8 * (1.0 - far);
}`)
      .replace('#include <opaque_fragment>', `#include <opaque_fragment>
// se funde con el negro hacia atrás y toma el verde de la visión nocturna (ZURKLIMA)
float far = smoothstep(12.0, 32.0, length(vFW - vec2(0.0, -5.0)));
gl_FragColor.rgb = mix(gl_FragColor.rgb, vec3(0.006, 0.005, 0.004), far);
gl_FragColor.rgb = mix(gl_FragColor.rgb, gl_FragColor.rgb * vec3(0.82, 1.0, 0.82), uScan);`);
  };
  const floor = new THREE.Mesh(track(new THREE.PlaneGeometry(70, 60)), mat);
  floor.rotation.x = -Math.PI / 2; floor.position.set(0, FLOOR_Y, -8);
  floor.renderOrder = -5;
  root.add(floor);

  const ray = new THREE.Vector3(), hit = new THREE.Vector3(), last = new THREE.Vector3(1e9, 0, 0);
  let lastTime = 0;
  function drop(x, z, s, time) { rip[ripIdx].set(x, z, time, s); ripIdx = (ripIdx + 1) % MAX_RIPPLES; }

  return {
    drop,
    setQuality(t) { u.uRipOn.value = t === 'low' ? 0 : 1; },
    resize() {},
    update(time, dt, state, pointer, hasPointer, snap) {
      u.uTime.value = time;
      u.uScan.value += (state.scan - u.uScan.value) * (snap ? 1 : damp(4, dt));
      u.uCalm.value = state.calm; u.uGlint.value = state.glint; u.uGlintCol.value.copy(state.sun);
      // ondas del cursor: dónde cruza su rayo el piso
      if (!hasPointer || u.uRipOn.value < 0.5) return;
      ray.set(pointer.x, pointer.y, 0.5).unproject(camera).sub(camera.position).normalize();
      if (ray.y > -0.01) return;
      const t = (FLOOR_Y - camera.position.y) / ray.y;
      hit.copy(camera.position).addScaledVector(ray, t);
      if (hit.z < -30 || hit.z > 8) return;
      if (hit.distanceTo(last) > 0.9 && time - lastTime > 0.12) { drop(hit.x, hit.z, 1, time); last.copy(hit); lastTime = time; }
    },
  };
}
