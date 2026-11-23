// El cielo: domo oscuro con degradé y un resplandor hacia la fuente de luz.
// Al cambiar de atmósfera se disuelve con un borde de humo encendido (no un fundido plano).
// Extras por mundo: humo de tinta (Caballo de Guerra) y líneas de visión nocturna (ZURKLIMA).
import { NOISE } from './glsl.js';

export function createCielo(ctx, { track }) {
  const { THREE, root } = ctx;
  const C = () => new THREE.Color();
  const u = {
    uTopA: { value: C() }, uBotA: { value: C() }, uGlowA: { value: C() },
    uTopB: { value: C() }, uBotB: { value: C() }, uGlowB: { value: C() },
    uMix: { value: 1 }, uSunDir: { value: new THREE.Vector3(0, 0.5, 1) }, uEdge: { value: new THREE.Color('#FF9A3C') },
    uScan: { value: 0 }, uInk: { value: 0 }, uTime: { value: 0 },
  };
  const mat = track(new THREE.ShaderMaterial({
    uniforms: u, side: THREE.BackSide, depthWrite: false, fog: false,
    vertexShader: 'varying vec3 vPos; void main(){ vPos = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: /* glsl */`
      uniform vec3 uTopA, uBotA, uGlowA, uTopB, uBotB, uGlowB, uSunDir, uEdge;
      uniform float uMix, uScan, uInk, uTime;
      varying vec3 vPos;
      ${NOISE}
      vec3 sky(vec3 d, vec3 top, vec3 bot, vec3 glow){
        vec3 c = mix(bot, top, smoothstep(-0.25, 0.85, d.y));
        float g = max(dot(d, normalize(uSunDir)), 0.0);
        c += glow * (pow(g, 6.0) * 0.3 + pow(g, 40.0) * 0.9);
        float back = max(dot(d, vec3(0.0, 0.1, -1.0)), 0.0);   // luz suave detrás de la estatua
        c += glow * pow(back, 14.0) * 0.22;
        return c;
      }
      void main(){
        vec3 d = normalize(vPos);
        vec3 a = sky(d, uTopA, uBotA, uGlowA), b = sky(d, uTopB, uBotB, uGlowB);
        // disolución con borde de humo encendido
        float n = fbm(d.xy * 3.0 + d.z * 2.0 + uTime * 0.03);
        float e = uMix * 1.25 - 0.12;
        float m = smoothstep(e - 0.06, e + 0.06, n);
        vec3 col = mix(b, a, m);
        float rim = (1.0 - abs(m * 2.0 - 1.0)) * step(0.001, uMix) * step(uMix, 0.999);
        col += uEdge * rim * 0.25;
        // humo de tinta (tatuajes): volutas oscuras que se mueven
        float ink = fbm(d.xz * 2.2 + vec2(uTime * 0.05, -uTime * 0.03)) ;
        col = mix(col, col * 0.25, smoothstep(0.45, 0.75, ink) * uInk);
        col += vec3(0.25, 0.02, 0.01) * smoothstep(0.7, 0.72, ink) * uInk * 0.4;
        // visión nocturna (cámaras de vigilancia): líneas que bajan + ruido
        float lines = 0.5 + 0.5 * sin(d.y * 420.0 + uTime * 8.0);
        float bar = smoothstep(0.0, 0.02, fract(d.y * 1.6 - uTime * 0.12)) * (1.0 - smoothstep(0.02, 0.09, fract(d.y * 1.6 - uTime * 0.12)));
        col = mix(col, col * (0.7 + 0.3 * lines) + vec3(0.015, 0.06, 0.02) * bar, uScan);
        col += vec3(0.0, 0.012, 0.003) * hash12(d.xy * 900.0 + uTime) * uScan;
        gl_FragColor = vec4(col, 1.0);
        #include <colorspace_fragment>
      }`,
  }));
  const dome = new THREE.Mesh(track(new THREE.SphereGeometry(95, 64, 32)), mat);
  dome.renderOrder = -10;
  root.add(dome);

  let started = false;
  return {
    dome, u,
    /** Arranca una disolución hacia una atmósfera nueva (A = la actual, B = la anterior). */
    dissolve(state, snap) {
      // lo que se ve ahora pasa a ser B
      const k = u.uMix.value;
      u.uTopB.value.lerpColors(u.uTopB.value, u.uTopA.value, k);
      u.uBotB.value.lerpColors(u.uBotB.value, u.uBotA.value, k);
      u.uGlowB.value.lerpColors(u.uGlowB.value, u.uGlowA.value, k);
      u.uTopA.value.copy(state.domeTop); u.uBotA.value.copy(state.domeBot); u.uGlowA.value.copy(state.domeGlow);
      u.uEdge.value.copy(state.sun);
      if (!started || snap) { u.uTopB.value.copy(state.domeTop); u.uBotB.value.copy(state.domeBot); u.uGlowB.value.copy(state.domeGlow); u.uMix.value = 1; started = true; }
      else u.uMix.value = 0;
    },
    update(time, delta, state, sunPos, snap) {
      u.uTime.value = time;
      if (u.uMix.value < 1) u.uMix.value = snap ? 1 : Math.min(1, u.uMix.value + delta / 1.3);
      u.uSunDir.value.copy(sunPos).normalize();
      const k = snap ? 1 : Math.min(1, delta * 2.5);
      u.uScan.value += (state.scan - u.uScan.value) * k;
      u.uInk.value += (state.ink - u.uInk.value) * k;
    },
  };
}
