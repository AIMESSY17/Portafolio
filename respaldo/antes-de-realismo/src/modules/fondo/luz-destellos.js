// Destellos del camino de sol sobre el mar (ref08 y ref10): miles de puntos dorados y plateados que
// titilan; algunos con forma de estrella de 4 puntas. Sprites aditivos en la capa del bloom.
// Todo se calcula en el shader: dónde cae cada destello (en el camino del sol, que sigue al que mira),
// cuándo titila y de qué color es. Cambiar de calidad solo cambia cuántos se dibujan (drawRange).
import { SEA_Y } from './luz-mar.js';

export const COUNT = { high: 4200, medium: 2600, low: 900 };

const VERTEX = /* glsl */`
attribute float aT;
attribute float aW;
attribute float aSeed;
attribute float aKind;
uniform float uTime, uAmount, uScale, uSpread, uNear, uFar, uSeaY;
uniform vec3 uSunDir;
varying float vI;
varying float vKind;
varying float vSeed;
void main(){
  vec3 fwd = normalize(vec3(uSunDir.x, 0.0, uSunDir.z) + vec3(0.0, 0.0, -1e-4));
  vec3 right = vec3(-fwd.z, 0.0, fwd.x);
  float dist = uNear * pow(uFar / uNear, aT);                 // más destellos lejos, como en la foto
  float lat = aW * dist * uSpread * (0.55 + 0.45 * aT);
  vec3 p = vec3(cameraPosition.x, uSeaY, cameraPosition.z) + fwd * dist + right * lat;
  p += right * sin(uTime * 0.21 + aSeed * 40.0) * 0.25;        // derivan apenas con el agua
  float f = 1.4 + 5.0 * fract(aSeed * 7.13);
  float tw = pow(max(0.0, sin(uTime * f + aSeed * 61.0)), 8.0 + 26.0 * fract(aSeed * 3.7));
  float path = exp(-aW * aW * 2.4);                            // más fuerte en el eje del camino
  float on = clamp((uAmount - fract(aSeed * 11.3)) * 5.0, 0.0, 1.0);
  float horizon = 1.0 - smoothstep(0.82, 1.0, aT);             // se pierden en la bruma
  vI = tw * path * on * horizon;
  vKind = aKind;
  vSeed = aSeed;
  vec4 mv = viewMatrix * vec4(p, 1.0);
  gl_Position = projectionMatrix * mv;
  float size = (aKind > 0.5 ? 0.32 : 0.12) * (0.6 + 0.8 * fract(aSeed * 5.1)) * (0.4 + 0.6 * smoothstep(0.0, 0.3, aT));
  gl_PointSize = vI > 0.004 ? clamp(size * uScale / -mv.z, 1.5, 64.0) : 0.0;
}`;

const FRAGMENT = /* glsl */`
uniform vec3 uGold, uSilver;
uniform float uGoldMix;
varying float vI;
varying float vKind;
varying float vSeed;
void main(){
  vec2 c = gl_PointCoord - 0.5;
  float d2 = dot(c, c);
  float a = exp(-d2 * 70.0) + exp(-d2 * 14.0) * 0.3;
  if (vKind > 0.5) {
    // estrella de 4 puntas: dos rayos finos que se apagan hacia la punta
    float sx = exp(-abs(c.y) * 70.0) * (1.0 - smoothstep(0.0, 0.5, abs(c.x)));
    float sy = exp(-abs(c.x) * 70.0) * (1.0 - smoothstep(0.0, 0.5, abs(c.y)));
    a += (sx + sy) * 0.85;
  }
  a *= vI;
  if (a < 0.003) discard;
  vec3 col = mix(uSilver, uGold, step(1.0 - uGoldMix, fract(vSeed * 13.7)));
  gl_FragColor = vec4(col, min(a, 1.0));
  #include <colorspace_fragment>
}`;

export function createDestellos(ctx, { track, tier, sunDir }) {
  const { THREE, root, renderer, camera } = ctx;
  const N = COUNT.high;
  const aT = new Float32Array(N), aW = new Float32Array(N), aSeed = new Float32Array(N), aKind = new Float32Array(N);
  let seed = 4242;
  const rand = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  for (let i = 0; i < N; i++) {
    aT[i] = rand();
    const g = (rand() + rand() + rand()) / 3 - 0.5; // más juntos al centro del camino
    aW[i] = g * 2.4;
    aSeed[i] = rand();
    aKind[i] = rand() < 0.14 ? 1 : 0;              // ~14 % con forma de estrella
  }
  const geo = track(new THREE.BufferGeometry());
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(N * 3), 3)); // la posición la arma el shader
  geo.setAttribute('aT', new THREE.BufferAttribute(aT, 1));
  geo.setAttribute('aW', new THREE.BufferAttribute(aW, 1));
  geo.setAttribute('aSeed', new THREE.BufferAttribute(aSeed, 1));
  geo.setAttribute('aKind', new THREE.BufferAttribute(aKind, 1));
  geo.setDrawRange(0, COUNT[tier] ?? COUNT.medium);

  const uniforms = {
    uTime: { value: 0 }, uAmount: { value: 0 }, uScale: { value: 600 }, uSpread: { value: 0.11 },
    uNear: { value: 3.5 }, uFar: { value: 240 }, uSeaY: { value: SEA_Y + 0.03 }, uSunDir: { value: sunDir },
    uGold: { value: new THREE.Color('#FFE0A2') }, uSilver: { value: new THREE.Color('#F5F3FF') }, uGoldMix: { value: 0.62 },
  };
  const material = track(new THREE.ShaderMaterial({
    uniforms, vertexShader: VERTEX, fragmentShader: FRAGMENT,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false,
  }));
  const points = new THREE.Points(geo, material);
  points.name = 'luz_destellos';
  points.frustumCulled = false;
  points.renderOrder = -30;
  points.layers.enable(1); // bloom
  points.visible = false;
  root.add(points);

  function resize() {
    const h = renderer.getDrawingBufferSize(_size).y;
    uniforms.uScale.value = camera.projectionMatrix.elements[5] * h * 0.5;
  }
  const _size = new THREE.Vector2();
  resize();

  return {
    points,
    uniforms,
    resize,
    setQuality(t) { geo.setDrawRange(0, COUNT[t] ?? COUNT.medium); resize(); },
  };
}
