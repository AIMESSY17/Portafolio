// Módulo FONDO — "POLVO DE ORO". Dueño: [NOMBRE_1].
// Todo el fondo es una sola cosa: miles de partículas de oro que se arman y se desarman formando imágenes.
//   hero          → la cúpula de Florencia, girando lenta como una galaxia
//   proyectos     → La Creación de Adán (las manos casi tocándose, detrás de la Victoria)
//   hover         → el emblema del proyecto que tiene el mouse encima (tatuaje, olas, cámaras, huevos…)
//   sobre-nosotros→ el ala de la máquina voladora de Leonardo
//   contacto      → el polvo cae y se vuelve un mar de oro líquido
// El mouse sopla el polvo (viento de proa) y el scroll rápido lo agita. La cámara no se mueve (CLAUDE.md 6).
// Todo vive detrás (z ≈ -11) o abajo (el mar): nada sólido entra en el cilindro de la estatua.
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';

const TIERS = {
  high:   { count: 140000, size: 46, shadows: true },
  medium: { count: 70000,  size: 50, shadows: true },
  low:    { count: 24000,  size: 70, shadows: false },
};
const PLANE_Z = -11;          // plano donde se dibujan las figuras
const DESIGN_WIDTH = 23;      // ancho (m) que ocupan las figuras en escritorio

// Figuras: máscara (blanco = más polvo y más brillo), ancho en metros, centro vertical, relieve
const SHAPES = {
  cupula:   { img: 'polvo/cupula.png',   w: 12.5, y: 2.5, depth: 1.4, spin: 1 },
  creacion: { img: 'polvo/creacion.png', w: 25,   y: 2.6, x: 4.2, depth: 1.0 }, // corrida: el "casi toque" queda al lado de la estatua
  ala:      { img: 'polvo/ala.png',      w: 21,   y: 2.3, depth: 0.8 },
  mar:      { sea: true },
  'caballo-de-guerra': { img: 'polvo/p-caballo-de-guerra.png', w: 17, y: 2.9, depth: 0.5 },
  'mantra-estetica':   { img: 'polvo/p-mantra-estetica.png',   w: 17, y: 2.9, depth: 0.5 },
  'aura-aika':         { img: 'polvo/p-aura-aika.png',         w: 17, y: 2.9, depth: 0.5 },
  'zurklima':          { img: 'polvo/p-zurklima.png',          w: 17, y: 2.9, depth: 0.5 },
  'la-pastoril':       { img: 'polvo/p-la-pastoril.png',       w: 17, y: 2.9, depth: 0.5 },
  'chufas':            { img: 'polvo/p-chufas.png',            w: 17, y: 2.9, depth: 0.5 },
  'casa-de-muffin':    { img: 'polvo/p-casa-de-muffin.png',    w: 17, y: 2.9, depth: 0.5 },
};
const SECTION_SHAPES = ['cupula', 'creacion', 'ala', 'mar'];

export default async function createFondo(ctx) {
  const { THREE, scene, renderer, root, shared, bus, camera, assetsPath: A } = ctx;
  const disposables = [];
  const track = (x) => (disposables.push(x), x);
  let tier = ctx.quality;
  const reduced = ctx.reducedMotion;

  // ---------- cielo de noche con un resplandor dorado detrás de la estatua ----------
  const domeMat = track(new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uGlow: { value: 1 }, uSea: { value: 0 } },
    side: THREE.BackSide, depthWrite: false, fog: false,
    vertexShader: 'varying vec3 vPos; void main(){ vPos = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: /* glsl */`
      uniform float uTime, uGlow, uSea; varying vec3 vPos;
      void main(){
        vec3 d = normalize(vPos);
        vec3 base = mix(vec3(0.020, 0.016, 0.012), vec3(0.010, 0.014, 0.030), smoothstep(-0.2, 0.9, d.y)); // #14100B → azul noche
        float g = max(dot(d, normalize(vec3(0.0, 0.12 - uSea*0.18, -1.0))), 0.0);
        vec3 gold = vec3(0.79, 0.55, 0.13);
        base += gold * (pow(g, 14.0)*0.035 + pow(g, 70.0)*0.07) * uGlow;
        base += vec3(0.45, 0.16, 0.05) * pow(max(1.0 - abs(d.y + 0.05) * 6.0, 0.0), 2.0) * uSea * 0.35; // horizonte de atardecer sobre el mar
        gl_FragColor = vec4(base, 1.0);
        #include <colorspace_fragment>
      }`,
  }));
  const dome = new THREE.Mesh(track(new THREE.SphereGeometry(90, 48, 24)), domeMat);
  dome.renderOrder = -10;
  root.add(dome);
  scene.background = null;
  scene.fog = null;

  // entorno: el mismo con el que se calibró el oro de la estatua (no tocar sin revisar juntos)
  const pmrem = new THREE.PMREMGenerator(renderer);
  const envTex = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  pmrem.dispose();
  scene.environment = envTex;
  scene.environmentIntensity = 0.32;

  // ---------- luces (las que ya iluminan bien la estatua) + el reflejo del polvo ----------
  const hemi = new THREE.HemisphereLight('#F1D27A', '#14100B', 0.25);
  const key = new THREE.DirectionalLight('#F3DFB8', 2.6);
  key.position.set(4.5, 7, 4);
  key.target.position.set(0, 1.5, 0);
  key.castShadow = true;
  key.shadow.mapSize.set(1024, 1024);
  Object.assign(key.shadow.camera, { left: -4, right: 4, top: 5, bottom: -2 });
  key.shadow.bias = -0.0005; key.shadow.normalBias = 0.02;
  const fill = new THREE.DirectionalLight('#AFC0D6', 0.55);
  fill.position.set(-5, 2.5, 3);
  const dustGlow = new THREE.PointLight('#F1D27A', 10, 12, 1.6); // el polvo ilumina la espalda de la estatua
  dustGlow.position.set(0, 2.6, -4);
  const candle = new THREE.PointLight('#FFC58A', 6, 9, 1.6);   // la vela que sigue al cursor
  candle.position.set(0, 2, 3.2);
  root.add(hemi, key, key.target, fill, dustGlow, candle);

  // ---------- muestreo de figuras: de imagen a nube de puntos ----------
  let seed = 12345;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const loadImage = (src) => new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = src; });

  const N = TIERS.high.count; // se reservan para el máximo; la calidad decide cuántos se dibujan
  async function buildShape(def) {
    const pos = new Float32Array(N * 3), lum = new Float32Array(N);
    if (def.sea) {
      for (let i = 0; i < N; i++) {
        const z = -3 - Math.pow(rnd(), 1.5) * 30;
        pos[i * 3] = (rnd() - 0.5) * (30 + (-z) * 1.4);
        pos[i * 3 + 1] = -2.5;
        pos[i * 3 + 2] = z;
        lum[i] = 0.35 + rnd() * 0.4;
      }
      return { pos, lum };
    }
    const img = await loadImage(A + def.img);
    const cw = 640, ch = Math.round(cw * img.height / img.width);
    const c = document.createElement('canvas'); c.width = cw; c.height = ch;
    const g = c.getContext('2d', { willReadFrequently: true });
    g.drawImage(img, 0, 0, cw, ch);
    const px = g.getImageData(0, 0, cw, ch).data;
    // pesos: brillo de la máscara, con los bordes del lienzo apagados
    const cdf = new Float32Array(cw * ch);
    let acc = 0;
    for (let y = 0; y < ch; y++) for (let x = 0; x < cw; x++) {
      const k = y * cw + x;
      const v = px[k * 4] / 255;
      const edge = Math.min(1, x / (cw * 0.03), (cw - x) / (cw * 0.03), y / (ch * 0.03), (ch - y) / (ch * 0.03));
      acc += v > 0.04 ? Math.pow(v, 1.1) * edge : 0;
      cdf[k] = acc;
    }
    const h = def.w * ch / cw;
    for (let i = 0; i < N; i++) {
      const r = rnd() * acc;
      let lo = 0, hi = cdf.length - 1;
      while (lo < hi) { const mid = (lo + hi) >> 1; if (cdf[mid] < r) lo = mid + 1; else hi = mid; }
      const x = lo % cw, y = (lo / cw) | 0;
      const v = px[lo * 4] / 255;
      pos[i * 3] = ((x + rnd()) / cw - 0.5) * def.w + (def.x || 0);
      pos[i * 3 + 1] = (0.5 - (y + rnd()) / ch) * h + def.y;
      pos[i * 3 + 2] = PLANE_Z + (v - 0.5) * def.depth + (rnd() - 0.5) * 0.35;
      lum[i] = v;
    }
    return { pos, lum };
  }

  // estado inicial: una nube de polvo suelta (de ahí nace la cúpula)
  const start = { pos: new Float32Array(N * 3), lum: new Float32Array(N) };
  for (let i = 0; i < N; i++) {
    const a = rnd() * Math.PI * 2, r = 4 + Math.pow(rnd(), 0.6) * 16;
    start.pos[i * 3] = Math.cos(a) * r; start.pos[i * 3 + 1] = 2.5 + (rnd() - 0.5) * 14; start.pos[i * 3 + 2] = PLANE_Z - rnd() * 8;
    start.lum[i] = rnd() * 0.5;
  }

  // ---------- las partículas ----------
  const geo = track(new THREE.BufferGeometry());
  const aFrom = new THREE.BufferAttribute(start.pos.slice(), 3);
  const aTo = new THREE.BufferAttribute(start.pos.slice(), 3);
  const aLumFrom = new THREE.BufferAttribute(start.lum.slice(), 1);
  const aLumTo = new THREE.BufferAttribute(start.lum.slice(), 1);
  const rands = new Float32Array(N); for (let i = 0; i < N; i++) rands[i] = rnd();
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(N * 3), 3)); // requerido por three (no se usa)
  geo.setAttribute('aFrom', aFrom); geo.setAttribute('aTo', aTo);
  geo.setAttribute('aLumFrom', aLumFrom); geo.setAttribute('aLumTo', aLumTo);
  geo.setAttribute('aRand', new THREE.BufferAttribute(rands, 1));
  geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0, -12), 60);

  const uniforms = {
    uT: { value: 1 }, uBurst: { value: 0 }, uTime: { value: 0 }, uSize: { value: TIERS[tier].size },
    uPR: { value: renderer.getPixelRatio() }, uSpin: { value: 0 }, uSpinCenter: { value: new THREE.Vector2(0, SHAPES.cupula.y) },
    uWave: { value: 0 }, uTurb: { value: 0 }, uMouse: { value: new THREE.Vector3(0, -100, -100) }, uMouseR: { value: 2.6 },
    uAlpha: { value: 1 },
    uC0: { value: new THREE.Color('#5B3A1E') }, uC1: { value: new THREE.Color('#C9A227') },
    uC2: { value: new THREE.Color('#F1D27A') }, uC3: { value: new THREE.Color('#FFF6DC') },
  };
  const mat = track(new THREE.ShaderMaterial({
    uniforms, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false,
    vertexShader: /* glsl */`
      attribute vec3 aFrom, aTo; attribute float aLumFrom, aLumTo, aRand;
      uniform float uT, uBurst, uTime, uSize, uPR, uSpin, uWave, uTurb, uMouseR;
      uniform vec2 uSpinCenter; uniform vec3 uMouse;
      varying float vLum; varying float vTw;
      void main(){
        vec3 p = mix(aFrom, aTo, uT);
        float r1 = aRand * 6.2831, r2 = fract(aRand * 7.31) * 6.2831, r3 = fract(aRand * 13.7) * 6.2831;
        vec3 n = vec3(sin(r1 + uTime*0.7), cos(r2 + uTime*0.6), sin(r3 + uTime*0.5));
        // explosión en el medio de la transición: el polvo se dispersa y se vuelve a juntar
        p += n * uBurst * (1.2 + fract(aRand*3.7) * 3.2);
        // la cúpula gira como una galaxia (más rápido en el centro)
        vec2 q = p.xy - uSpinCenter; float rr = length(q);
        float ang = uSpin * uTime * 0.12 / (0.6 + rr * 0.35);
        float cs = cos(ang), sn = sin(ang);
        p.xy = mix(p.xy, uSpinCenter + vec2(q.x*cs - q.y*sn, q.x*sn + q.y*cs), uSpin);
        // titileo permanente + agitación por scroll rápido
        p += n * (0.025 + uTurb * 0.35);
        // mar de oro: olas y onda alrededor del cursor
        float d0 = length(p.xz - uMouse.xz);
        float wave = sin(p.x*0.35 + uTime*0.9)*0.42 + sin(p.z*0.5 - uTime*0.7)*0.32 + sin((p.x + p.z)*1.1 + uTime*1.6)*0.12;
        wave += sin(d0*2.2 - uTime*4.0) * 0.35 * exp(-d0*0.35);
        p.y += wave * uWave;
        // viento del cursor: empuja el polvo en el plano de las figuras
        vec2 dm = p.xy - uMouse.xy; float dist = length(dm);
        float push = smoothstep(uMouseR, 0.0, dist) * (1.0 - uWave);
        p.xy += normalize(dm + 1e-4) * push * 1.4;
        p.z += push * 0.8;
        vLum = mix(aLumFrom, aLumTo, uT) + wave * uWave * 0.35 + push * 0.4;
        vTw = 0.7 + 0.3 * sin(uTime * (2.0 + aRand * 3.0) + aRand * 40.0);
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        gl_Position = projectionMatrix * mv;
        gl_PointSize = uSize * uPR * (0.5 + clamp(vLum, 0.0, 1.2) * 0.9) / -mv.z;
      }`,
    fragmentShader: /* glsl */`
      uniform float uAlpha; uniform vec3 uC0, uC1, uC2, uC3;
      varying float vLum; varying float vTw;
      void main(){
        vec2 c = gl_PointCoord - 0.5; float d = dot(c, c);
        if (d > 0.25) discard;
        float soft = smoothstep(0.25, 0.0, d);
        float l = clamp(vLum * vTw, 0.0, 1.0);
        vec3 col = l < 0.45 ? mix(uC0, uC1, l / 0.45) : l < 0.8 ? mix(uC1, uC2, (l - 0.45) / 0.35) : mix(uC2, uC3, (l - 0.8) / 0.2);
        gl_FragColor = vec4(col, soft * (0.3 + 0.7 * l) * uAlpha);
        #include <colorspace_fragment>
      }`,
  }));
  const dust = new THREE.Points(geo, mat);
  dust.frustumCulled = false;
  const group = new THREE.Group();
  group.name = 'fondo_polvo';
  group.add(dust);
  root.add(group);
  geo.setDrawRange(0, TIERS[tier].count);

  // ---------- figuras (se cargan sin trabar el arranque) ----------
  const shapes = {};
  const ready = Promise.all(Object.entries(SHAPES).map(async ([k, def]) => { shapes[k] = await buildShape(def); }));

  // ---------- transiciones ----------
  const morph = { t: 1, dur: 2.4, current: null, wanted: 'cupula', spinTo: 0, waveTo: 0 };
  const ease = (x) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);
  function morphTo(key) {
    morph.wanted = key;
    const s = shapes[key];
    if (!s || morph.current === key) return;
    // la posición actual pasa a ser el punto de partida
    const e = ease(morph.t), f = aFrom.array, t = aTo.array, lf = aLumFrom.array, lt = aLumTo.array;
    for (let i = 0; i < N * 3; i++) f[i] = f[i] + (t[i] - f[i]) * e;
    for (let i = 0; i < N; i++) lf[i] = lf[i] + (lt[i] - lf[i]) * e;
    t.set(s.pos); lt.set(s.lum);
    aFrom.needsUpdate = aTo.needsUpdate = aLumFrom.needsUpdate = aLumTo.needsUpdate = true;
    morph.t = 0;
    morph.dur = reduced ? 0.6 : key === 'mar' ? 3 : 2.4;
    morph.current = key;
    morph.spinTo = SHAPES[key].spin ? 1 : 0;
    morph.waveTo = SHAPES[key].sea ? 1 : 0;
  }
  ready.then(() => morphTo(morph.wanted));

  // ---------- eventos ----------
  let section = 0, hoverId = null, dim = 0;
  const pick = () => morphTo(hoverId && SHAPES[hoverId] ? hoverId : SECTION_SHAPES[section] || 'cupula');
  const offs = [
    bus.on('section:change', ({ index }) => { section = index; pick(); }),
    bus.on('project:hover', ({ id }) => { hoverId = id; pick(); }),
    bus.on('project:open', () => { dim = 1; }),
    bus.on('project:close', () => { dim = 0; }),
  ];

  // ---------- loop ----------
  const ray = new THREE.Vector3(), hit = new THREE.Vector3();
  let gustTimer = 7, gust = 0, wind = 0.25, turb = 0, exposure = 1;

  // solo desarrollo: ?snap → transiciones instantáneas (para capturas en máquinas lentas)
  const SNAP = import.meta.env.DEV && new URLSearchParams(location.search).has('snap');

  function setQuality(next) {
    tier = next;
    key.castShadow = TIERS[tier].shadows;
    geo.setDrawRange(0, TIERS[tier].count);
    uniforms.uSize.value = TIERS[tier].size;
    uniforms.uPR.value = renderer.getPixelRatio();
  }

  return {
    update(time, delta, s) {
      uniforms.uTime.value = reduced ? 0 : time;
      domeMat.uniforms.uTime.value = time;

      // transición
      if (morph.t < 1) morph.t = SNAP ? 1 : Math.min(1, morph.t + delta / morph.dur);
      const e = ease(morph.t);
      uniforms.uT.value = e;
      uniforms.uBurst.value = reduced ? 0 : Math.sin(Math.PI * e) * 1.0;
      uniforms.uSpin.value += (morph.spinTo - uniforms.uSpin.value) * (SNAP ? 1 : Math.min(1, delta * 1.5));
      uniforms.uWave.value += (morph.waveTo - uniforms.uWave.value) * (SNAP ? 1 : Math.min(1, delta * 1.2));
      domeMat.uniforms.uSea.value = uniforms.uWave.value;

      // tamaño según pantalla: en celular las figuras se achican para entrar enteras
      const dist = camera.position.z - PLANE_Z;
      const visH = 2 * dist * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
      const scale = Math.min(1, Math.max(0.38, (visH * camera.aspect * 0.96) / DESIGN_WIDTH));
      group.scale.setScalar(scale);
      group.position.y = (1 - scale) * 1.6;          // mantiene el centro a la altura de la estatua
      group.position.z = (1 - scale) * PLANE_Z;      // y el plano sigue en z = PLANE_Z (detrás)

      // viento: base + scroll rápido + ráfagas (lo lee la estatua para sacudir las ventanas)
      gustTimer -= delta;
      if (gustTimer <= 0) { gustTimer = 9 + Math.random() * 6; gust = 1; bus.emit('wind:gust', { strength: 0.8 }); }
      gust = Math.max(0, gust - delta * 0.6);
      const sv = Math.min(1, Math.abs(s.velocity) * 0.03);
      wind += (0.2 + sv + gust * 0.5 - wind) * Math.min(1, delta * 2);
      shared.wind.strength = Math.min(1, wind);
      turb += (sv * 0.8 + gust * 0.15 - turb) * Math.min(1, delta * 3);
      uniforms.uTurb.value = reduced ? 0 : turb;

      // el cursor: punto donde su rayo cruza el plano de las figuras (o el mar)
      const px = shared.pointer.x + shared.tilt.x, py = shared.pointer.y + shared.tilt.y;
      ray.set(px, py, 0.5).unproject(camera).sub(camera.position).normalize();
      const seaY = -2.5 * scale + group.position.y;
      const tPlane = ray.y < -0.02 && uniforms.uWave.value > 0.5
        ? (seaY - camera.position.y) / ray.y
        : (PLANE_Z * scale + group.position.z - camera.position.z) / ray.z;
      hit.copy(camera.position).addScaledVector(ray, tPlane);
      group.worldToLocal(hit);
      if (shared.pointer.x === 0 && shared.pointer.y === 0 && shared.tilt.x === 0) hit.set(0, -100, -100);
      uniforms.uMouse.value.lerp(hit, Math.min(1, delta * 6));

      const k = Math.min(1, delta * 3);
      candle.position.x += (px * 3.2 - candle.position.x) * k;
      candle.position.y += (1.6 + py * 1.8 - candle.position.y) * k;
      candle.intensity = 6 + Math.sin(time * 7.3) * 0.25 + Math.sin(time * 3.1) * 0.35;
      dustGlow.intensity = 10 * (0.6 + 0.4 * (1 - uniforms.uBurst.value)) * (1 - dim * 0.6);

      // proyecto abierto: el polvo se apaga y la sala baja la luz
      uniforms.uAlpha.value += ((1 - dim * 0.65) - uniforms.uAlpha.value) * Math.min(1, delta * 3);
      exposure += ((1 - dim * 0.25) - exposure) * Math.min(1, delta * 3);
      renderer.toneMappingExposure = exposure;
    },
    resize() { uniforms.uPR.value = renderer.getPixelRatio(); },
    setQuality,
    dispose() {
      offs.forEach((off) => off?.());
      disposables.forEach((d) => d.dispose?.());
      envTex.dispose();
      renderer.toneMappingExposure = 1;
      scene.environment = null;
      scene.background = null;
    },
    api: {
      /** Forzar una figura (para pruebas o para el futuro sistema de scroll). */
      show: (key) => morphTo(key),
      ready,
    },
  };
}
