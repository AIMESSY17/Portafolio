// Obsidiana líquida: un piso negro espejado que refleja la estatua, las letras y la luz.
// El cursor deja ondas reales que se expanden y se cruzan; las ráfagas de viento sueltan gotas.
// En calidad baja no hay reflejo en tiempo real: queda un piso negro brillante (mucho más liviano).
import { Reflector } from 'three/examples/jsm/objects/Reflector.js';

export const FLOOR_Y = -1.05;   // debajo del cilindro reservado (y ≥ -1)
const MAX_RIPPLES = 10;

const ObsidianShader = {
  name: 'ObsidianShader',
  uniforms: {
    color: { value: null }, tDiffuse: { value: null }, textureMatrix: { value: null },
    tNormal: { value: null }, uTime: { value: 0 }, uRip: { value: [] }, uSun: { value: null }, uSunPos: { value: null }, uScan: { value: 0 },
  },
  vertexShader: /* glsl */`
    uniform mat4 textureMatrix; varying vec4 vUv; varying vec3 vW;
    void main(){
      vUv = textureMatrix * vec4(position, 1.0);
      vW = (modelMatrix * vec4(position, 1.0)).xyz;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }`,
  fragmentShader: /* glsl */`
    uniform vec3 color, uSun, uSunPos; uniform sampler2D tDiffuse, tNormal; uniform float uTime, uScan;
    uniform vec4 uRip[${MAX_RIPPLES}];
    varying vec4 vUv; varying vec3 vW;
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
    }
    void main(){
      vec2 nUv = vW.xz * 0.11;
      vec3 n1 = texture2D(tNormal, nUv + vec2(uTime * 0.010, uTime * 0.006)).rgb * 2.0 - 1.0;
      vec3 n2 = texture2D(tNormal, nUv * 1.7 - vec2(uTime * 0.008, -uTime * 0.011)).rgb * 2.0 - 1.0;
      vec2 slow = (n1.xy + n2.xy) * 0.025;
      vec2 rp = ripple(vW.xz);
      vec2 off = slow + rp * 0.09;
      vec4 uv = vUv; uv.xy += off * uv.w;
      vec3 refl = texture2DProj(tDiffuse, uv).rgb;
      vec3 V = normalize(cameraPosition - vW);
      float fres = 0.22 + 0.78 * pow(1.0 - max(V.y, 0.0), 3.0);
      vec3 col = refl * fres * color;
      vec3 N = normalize(vec3(-off.x * 7.0, 1.0, -off.y * 7.0));
      vec3 L = normalize(uSunPos - vW); vec3 H = normalize(L + V);
      col += uSun * pow(max(dot(N, H), 0.0), 220.0) * 2.2;
      col += uSun * length(rp) * 0.06;                                  // las ondas atrapan la luz
      float far = smoothstep(12.0, 32.0, length(vW.xz - vec2(0.0, -5.0)));
      col = mix(col, vec3(0.006, 0.005, 0.004), far);
      col = mix(col, col * vec3(0.55, 1.25, 0.6) * (0.8 + 0.2 * sin(vW.z * 60.0 + uTime * 6.0)), uScan);
      gl_FragColor = vec4(col, 1.0);
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
    }`,
};

export function createObsidiana(ctx, { track, tier }) {
  const { THREE, root, renderer, camera, assetsPath: A } = ctx;
  const normalTex = track(new THREE.TextureLoader().load(A + 'claroscuro/agua-normales.webp'));
  normalTex.wrapS = normalTex.wrapT = THREE.RepeatWrapping;
  const rip = Array.from({ length: MAX_RIPPLES }, () => new THREE.Vector4(0, 0, -100, 0));
  let ripIdx = 0;
  const sunColor = new THREE.Color('#FFB15A');
  const sunPos = new THREE.Vector3();
  const geo = track(new THREE.PlaneGeometry(70, 60));

  let mirror = null, simple = null;
  function build(t) {
    if (mirror) { root.remove(mirror); mirror.dispose(); mirror = null; }
    if (simple) { root.remove(simple); simple.material.dispose(); simple = null; }
    if (t === 'low') {
      const m = new THREE.MeshPhysicalMaterial({ color: '#050404', roughness: 0.12, metalness: 0.3, clearcoat: 1, normalMap: normalTex, normalScale: new THREE.Vector2(0.15, 0.15) });
      normalTex.repeat.set(6, 6);
      simple = new THREE.Mesh(geo, m);
      simple.rotation.x = -Math.PI / 2; simple.position.set(0, FLOOR_Y, -8); simple.receiveShadow = true;
      root.add(simple);
      return;
    }
    const scale = t === 'high' ? 0.6 : 0.4;
    mirror = new Reflector(geo, {
      shader: ObsidianShader, clipBias: 0.003, color: new THREE.Color('#77706A'),
      textureWidth: Math.round(innerWidth * scale * renderer.getPixelRatio()), textureHeight: Math.round(innerHeight * scale * renderer.getPixelRatio()),
    });
    const u = mirror.material.uniforms;
    u.tNormal.value = normalTex; u.uRip.value = rip; u.uSun.value = sunColor; u.uSunPos.value = sunPos;
    mirror.rotation.x = -Math.PI / 2; mirror.position.set(0, FLOOR_Y, -8);
    mirror.renderOrder = -5;
    root.add(mirror);
  }
  build(tier);

  const ray = new THREE.Vector3(), hit = new THREE.Vector3(), last = new THREE.Vector3(1e9, 0, 0);
  let lastTime = 0;
  function drop(x, z, s, time) { rip[ripIdx].set(x, z, time, s); ripIdx = (ripIdx + 1) % MAX_RIPPLES; }

  return {
    setQuality: build,
    drop,
    resize() { if (mirror) { const s = (tier === 'high' ? 0.6 : 0.4) * renderer.getPixelRatio(); mirror.getRenderTarget().setSize(Math.round(innerWidth * s), Math.round(innerHeight * s)); } },
    update(time, delta, state, sun, pointer, hasPointer, snap) {
      sunColor.lerp(state.sun, snap ? 1 : Math.min(1, delta * 2));
      sunPos.copy(sun);
      if (mirror) {
        const u = mirror.material.uniforms;
        u.uTime.value = time;
        u.uScan.value += (state.scan - u.uScan.value) * (snap ? 1 : Math.min(1, delta * 2.5));
      }
      // ondas del cursor: dónde cruza su rayo el piso
      if (!hasPointer) return;
      ray.set(pointer.x, pointer.y, 0.5).unproject(camera).sub(camera.position).normalize();
      if (ray.y > -0.01) return;
      const t = (FLOOR_Y - camera.position.y) / ray.y;
      hit.copy(camera.position).addScaledVector(ray, t);
      if (hit.z < -30 || hit.z > 8) return;
      if (hit.distanceTo(last) > 0.9 && time - lastTime > 0.12) { drop(hit.x, hit.z, 1, time); last.copy(hit); lastTime = time; }
    },
  };
}
