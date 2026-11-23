// Brasas que suben (como de una fragua) y motas de polvo que solo se ven cuando cruzan el haz de luz.
// Todo el movimiento está en el shader: la CPU no toca nada por frame.

export function createBrasas(ctx, { track, tier, counts }) {
  const { THREE, root, renderer, assetsPath: A } = ctx;
  const spark = track(new THREE.TextureLoader().load(A + 'claroscuro/chispa.png'));
  let seed = 4242;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;

  const common = {
    uTime: { value: 0 }, uWind: { value: 0.2 }, uPR: { value: renderer.getPixelRatio() },
    uSun: { value: new THREE.Vector3() }, uTarget: { value: new THREE.Vector3(0, 1.6, 0) },
  };

  // ---- brasas ----
  const NE = counts.high.embers;
  const eGeo = track(new THREE.BufferGeometry());
  const ep = new Float32Array(NE * 3), er = new Float32Array(NE * 4);
  for (let i = 0; i < NE; i++) {
    ep[i * 3] = (rnd() - 0.5) * 22; ep[i * 3 + 1] = rnd() * 11; ep[i * 3 + 2] = -12 + rnd() * 15;
    er[i * 4] = rnd(); er[i * 4 + 1] = 0.35 + rnd() * 0.9; er[i * 4 + 2] = rnd(); er[i * 4 + 3] = rnd();
  }
  eGeo.setAttribute('position', new THREE.BufferAttribute(ep, 3));
  eGeo.setAttribute('aR', new THREE.BufferAttribute(er, 4));
  eGeo.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 4, -4), 30);
  const eU = { ...common, uColor: { value: new THREE.Color('#FF9A3C') }, uAmount: { value: 0.6 }, uMap: { value: spark } };
  const eMat = track(new THREE.ShaderMaterial({
    uniforms: eU, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false,
    vertexShader: /* glsl */`
      attribute vec4 aR; uniform float uTime, uWind, uPR, uAmount;
      varying float vA; varying float vHeat;
      void main(){
        float H = 11.0;
        float life = fract(aR.x + uTime * 0.045 * aR.y);
        vec3 p = position;
        p.y = -1.2 + life * H;
        p.x += sin(uTime * (0.6 + aR.z) + aR.w * 30.0) * 0.45 + uWind * life * 3.5;
        p.z += cos(uTime * (0.5 + aR.w) + aR.z * 20.0) * 0.35;
        vHeat = 1.0 - life;
        float on = step(aR.w, uAmount);                     // cuántas brasas están encendidas
        vA = on * smoothstep(0.0, 0.08, life) * (1.0 - smoothstep(0.65, 1.0, life)) * (0.6 + 0.4 * sin(uTime * 9.0 * aR.y + aR.z * 50.0));
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        gl_Position = projectionMatrix * mv;
        gl_PointSize = (14.0 + 26.0 * aR.z) * uPR / -mv.z * (0.6 + vHeat * 0.6);
      }`,
    fragmentShader: /* glsl */`
      uniform sampler2D uMap; uniform vec3 uColor; varying float vA; varying float vHeat;
      void main(){
        vec4 t = texture2D(uMap, gl_PointCoord);
        vec3 c = mix(uColor, vec3(1.0, 0.92, 0.75), vHeat * 0.55);
        gl_FragColor = vec4(c * t.a * vA * 1.6, t.a * vA);
        #include <colorspace_fragment>
      }`,
  }));
  const embers = new THREE.Points(eGeo, eMat);
  embers.frustumCulled = false;
  root.add(embers);

  // ---- motas en el haz ----
  const NM = counts.high.motes;
  const mGeo = track(new THREE.BufferGeometry());
  const mp = new Float32Array(NM * 3), mr = new Float32Array(NM);
  for (let i = 0; i < NM; i++) {
    mp[i * 3] = (rnd() - 0.5) * 20; mp[i * 3 + 1] = -1 + rnd() * 12; mp[i * 3 + 2] = -10 + rnd() * 16;
    mr[i] = rnd();
  }
  mGeo.setAttribute('position', new THREE.BufferAttribute(mp, 3));
  mGeo.setAttribute('aR', new THREE.BufferAttribute(mr, 1));
  mGeo.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 4, -2), 30);
  const mU = { ...common, uColor: { value: new THREE.Color('#FFB15A') }, uBeam: { value: 1 } };
  const mMat = track(new THREE.ShaderMaterial({
    uniforms: mU, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false,
    vertexShader: /* glsl */`
      attribute float aR; uniform float uTime, uWind, uPR; uniform vec3 uSun, uTarget;
      varying float vA;
      void main(){
        vec3 p = position;
        p.x += sin(uTime * 0.13 + aR * 40.0) * 0.6 + uWind * 0.8 * sin(uTime * 0.2 + aR * 9.0);
        p.y += sin(uTime * 0.11 + aR * 70.0) * 0.5;
        p.z += cos(uTime * 0.09 + aR * 25.0) * 0.5;
        // ¿está dentro del haz? distancia al eje sol → estatua, comparada con el radio del cono
        vec3 ax = normalize(uTarget - uSun);
        float along = dot(p - uSun, ax);
        float len = length(uTarget - uSun);
        vec3 closest = uSun + ax * along;
        float r = mix(0.2, 2.4, clamp(along / (len * 1.35), 0.0, 1.0));
        float inside = (1.0 - smoothstep(r * 0.55, r, distance(p, closest))) * step(0.0, along);
        vA = inside * (0.35 + 0.65 * fract(aR * 13.0)) * (0.55 + 0.45 * sin(uTime * 2.0 + aR * 60.0));
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        gl_Position = projectionMatrix * mv;
        gl_PointSize = (5.0 + 7.0 * fract(aR * 7.0)) * uPR / -mv.z * 6.0;
      }`,
    fragmentShader: /* glsl */`
      uniform vec3 uColor; uniform float uBeam; varying float vA;
      void main(){
        vec2 c = gl_PointCoord - 0.5; float d = dot(c, c); if (d > 0.25) discard;
        float a = smoothstep(0.25, 0.0, d) * vA * uBeam * 0.9;
        gl_FragColor = vec4(mix(uColor, vec3(1.0), 0.35) * a, a);
        #include <colorspace_fragment>
      }`,
  }));
  const motes = new THREE.Points(mGeo, mMat);
  motes.frustumCulled = false;
  root.add(motes);

  function setQuality(t) {
    eGeo.setDrawRange(0, counts[t].embers);
    mGeo.setDrawRange(0, counts[t].motes);
    common.uPR.value = renderer.getPixelRatio();
  }
  setQuality(tier);

  return {
    setQuality,
    update(time, delta, state, sunPos, wind, snap, reduced) {
      common.uTime.value = reduced ? 0 : time;
      common.uWind.value = wind;
      common.uSun.value.copy(sunPos);
      const k = snap ? 1 : Math.min(1, delta * 2);
      eU.uColor.value.lerp(state.ember, k);
      eU.uAmount.value += (state.embers - eU.uAmount.value) * k;
      mU.uColor.value.lerp(state.sun, k);
      mU.uBeam.value += (state.beam - mU.uBeam.value) * k;
    },
    resize() { common.uPR.value = renderer.getPixelRatio(); },
  };
}
