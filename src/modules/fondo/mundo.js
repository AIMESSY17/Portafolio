// Capa de "mundo" de cada sala: lo que el aire cuenta además de la luz y el cielo. Sutil, de galería.
// TODO se crea una vez al cargar (y se precompila); cambiar de sala solo mueve uniforms:
//   · partículas: UN sistema de puntos. Color, cantidad, tamaño, forma (punto → destello en cruz →
//     alargado), titileo y deriva cambian con uniforms (ceniza que sube, arena de costado, polen,
//     harina que cae, lentejuelas...). La deriva se INTEGRA en la CPU (offset += mover * dt): así al
//     cambiar de mundo nada salta.
//   · bruma baja sobre el piso (Mantra Estética)
//   · hilo dorado que se cose con el progress de la sala (Chufas)
//   · viñeta detrás de la ventana del proyecto: baja el brillo de lo que hay atrás un 30 %
// En low: sin partículas ni bruma (solo cambian la luz y el cielo).
import { NOISE } from './glsl.js';
import { FLOOR_Y } from './obsidiana.js';

const COUNT = { high: 1600, medium: 900, low: 0 };
const BOX_LO = [-9, -0.8, -9], BOX_SIZE = [18, 8.8, 15];
const VIG_Z = -6.5; // plano de la viñeta: detrás de todo lo que importa, fuera del cilindro de la estatua

export function createMundo(ctx, { track, tier }) {
  const { THREE, root, camera, renderer } = ctx;
  let curTier = tier;

  // ---------- partículas ----------
  const N = COUNT.high;
  const pos = new Float32Array(N * 3), rnd = new Float32Array(N);
  let seed = 31337;
  const rand = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  for (let i = 0; i < N; i++) {
    pos[i * 3] = BOX_LO[0] + rand() * BOX_SIZE[0];
    pos[i * 3 + 1] = BOX_LO[1] + rand() * BOX_SIZE[1];
    pos[i * 3 + 2] = BOX_LO[2] + rand() * BOX_SIZE[2];
    rnd[i] = rand();
  }
  const pGeo = track(new THREE.BufferGeometry());
  pGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  pGeo.setAttribute('aRand', new THREE.BufferAttribute(rnd, 1));
  pGeo.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 3, -2), 30);
  const pu = {
    uTime: { value: 0 }, uPR: { value: renderer.getPixelRatio() }, uOffset: { value: new THREE.Vector3() },
    uColor: { value: new THREE.Color('#ffffff') }, uAmount: { value: 0 }, uSize: { value: 1 }, uStar: { value: 0 },
    uStretch: { value: 0 }, uTwinkle: { value: 0 },
  };
  const pMat = track(new THREE.ShaderMaterial({
    uniforms: pu, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false,
    vertexShader: /* glsl */`
      attribute float aRand; uniform float uTime, uPR, uAmount, uSize, uTwinkle; uniform vec3 uOffset;
      varying float vA; varying float vRot;
      void main(){
        vec3 lo = vec3(${BOX_LO.map((v) => v.toFixed(1)).join(',')}), size = vec3(${BOX_SIZE.map((v) => v.toFixed(1)).join(',')});
        vec3 p = lo + mod(position - lo + uOffset, size);                       // la deriva se acumula en la CPU
        p.x += sin(uTime * 0.23 + aRand * 40.0) * 0.18;                          // balanceo propio de cada una
        p.y += sin(uTime * 0.17 + aRand * 71.0) * 0.12;
        float on = clamp((uAmount - aRand) * 8.0, 0.0, 1.0);                     // cantidad con fundido, no de golpe
        float tw = 1.0 - uTwinkle * (0.5 + 0.5 * sin(uTime * (1.2 + aRand * 3.0) + aRand * 90.0));
        vA = on * tw * (0.35 + 0.65 * fract(aRand * 7.31));
        vRot = aRand * 6.2831;
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        gl_Position = projectionMatrix * mv;
        gl_PointSize = uSize * (16.0 + 22.0 * fract(aRand * 3.7)) * uPR / -mv.z * step(0.001, on);
      }`,
    fragmentShader: /* glsl */`
      uniform vec3 uColor; uniform float uStar, uStretch; varying float vA; varying float vRot;
      void main(){
        vec2 c = gl_PointCoord - 0.5;
        float cs = cos(vRot), sn = sin(vRot);
        c = vec2(cs * c.x - sn * c.y, sn * c.x + cs * c.y);
        c.y *= 1.0 + uStretch * 2.2;                                             // alargado (hojuelas, semillas)
        float d = length(c);
        float dotA = smoothstep(0.5, 0.0, d);
        float star = max(smoothstep(0.045, 0.0, abs(c.x)) * smoothstep(0.5, 0.0, abs(c.y)), smoothstep(0.045, 0.0, abs(c.y)) * smoothstep(0.5, 0.0, abs(c.x)));
        float a = mix(dotA, max(star, dotA * 0.35), uStar) * vA;
        gl_FragColor = vec4(uColor, a);
        #include <colorspace_fragment>
      }`,
  }));
  const points = new THREE.Points(pGeo, pMat);
  points.frustumCulled = false;
  points.visible = false;
  root.add(points);

  // ---------- bruma baja ----------
  const mu = { uTime: { value: 0 }, uMist: { value: 0 }, uColor: { value: new THREE.Color('#d9cbee') } };
  const mistMat = track(new THREE.ShaderMaterial({
    uniforms: mu, transparent: true, depthWrite: false, toneMapped: false,
    vertexShader: 'varying vec2 vW; void main(){ vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xz; gl_Position = projectionMatrix * viewMatrix * w; }',
    fragmentShader: /* glsl */`
      uniform float uTime, uMist; uniform vec3 uColor; varying vec2 vW;
      ${NOISE}
      void main(){
        float n = fbm2(vW * 0.16 + vec2(uTime * 0.012, -uTime * 0.008));
        float band = smoothstep(0.32, 0.78, n);
        float edge = 1.0 - smoothstep(9.0, 21.0, length(vW - vec2(0.0, -6.0)));
        float a = band * edge * uMist * 0.38;
        gl_FragColor = vec4(uColor, a);
        #include <colorspace_fragment>
      }`,
  }));
  const mist = new THREE.Mesh(track(new THREE.PlaneGeometry(52, 40)), mistMat);
  mist.rotation.x = -Math.PI / 2; mist.position.set(0, FLOOR_Y + 0.35, -6);
  mist.renderOrder = -4;
  mist.visible = false;
  root.add(mist);

  // ---------- hilo dorado ----------
  const TN = 260;
  const tp = new Float32Array(TN * 3), tt = new Float32Array(TN);
  for (let i = 0; i < TN; i++) {
    const t = i / (TN - 1), x = -13 + 26 * t;
    tp[i * 3] = x;
    tp[i * 3 + 1] = 2.6 + 2.2 * Math.sin(x * 0.33 + 0.6) + 0.7 * Math.sin(x * 0.95);
    tp[i * 3 + 2] = -7.5 + 0.6 * Math.sin(x * 0.5);
    tt[i] = t;
  }
  const tGeo = track(new THREE.BufferGeometry());
  tGeo.setAttribute('position', new THREE.BufferAttribute(tp, 3));
  tGeo.setAttribute('aT', new THREE.BufferAttribute(tt, 1));
  const tu = { uStitch: { value: 0 }, uOpacity: { value: 0 }, uGold: { value: new THREE.Color('#E0B84A') }, uHi: { value: new THREE.Color('#FFE9A8') } };
  const tMat = track(new THREE.ShaderMaterial({
    uniforms: tu, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false,
    vertexShader: 'attribute float aT; varying float vT; void main(){ vT = aT; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: /* glsl */`
      uniform float uStitch, uOpacity; uniform vec3 uGold, uHi; varying float vT;
      void main(){
        if (vT > uStitch) discard;                                            // lo que todavía no se cosió
        if (fract(vT * 150.0) > 0.62) discard;                                // puntadas
        float tip = 1.0 - smoothstep(0.0, 0.05, uStitch - vT);                // la aguja: brilla en la punta
        vec3 col = mix(uGold, uHi, tip);
        float a = (0.55 + tip * 0.6) * uOpacity;
        gl_FragColor = vec4(col, a);
        #include <colorspace_fragment>
      }`,
  }));
  const thread = new THREE.Line(tGeo, tMat);
  thread.frustumCulled = false;
  thread.visible = false;
  root.add(thread);

  // ---------- viñeta detrás de la ventana ----------
  const vc = document.createElement('canvas');
  vc.width = vc.height = 256;
  const vg = vc.getContext('2d');
  const grad = vg.createRadialGradient(128, 128, 20, 128, 128, 128);
  grad.addColorStop(0, 'rgba(0,0,0,1)'); grad.addColorStop(0.45, 'rgba(0,0,0,0.92)'); grad.addColorStop(1, 'rgba(0,0,0,0)');
  vg.fillStyle = grad; vg.fillRect(0, 0, 256, 256);
  const vTex = track(new THREE.CanvasTexture(vc));
  const vig = new THREE.Sprite(track(new THREE.SpriteMaterial({ map: vTex, color: 0x000000, transparent: true, opacity: 0, depthWrite: false, toneMapped: false, fog: false })));
  vig.renderOrder = 6; // después del haz de luz y las partículas: les baja el brillo
  vig.visible = false;
  root.add(vig);

  // ---------- estado ----------
  const winPos = new THREE.Vector3(1.9, 1.7, 1.0), camPos = new THREE.Vector3();
  let win = null, winSize = 4; // winSize = lado mayor de la ventana en su propio espacio (m, sin escala)
  const sc = new THREE.Vector3();

  return {
    /** Ventana (grupo `ventana_<id>` de la estatua) detrás de la cual se baja el brillo. null = ninguna. */
    setWindow(obj) {
      win = obj;
      const hole = obj && obj.children[0]; // el "perforador": tiene el tamaño real de la ventana
      if (!hole?.geometry) return;
      hole.geometry.computeBoundingBox();
      const b = hole.geometry.boundingBox;
      winSize = Math.max(b.max.x - b.min.x, b.max.y - b.min.y);
    },
    setQuality(t) { curTier = t; pu.uPR.value = renderer.getPixelRatio(); pGeo.setDrawRange(0, COUNT[t]); },
    resize() { pu.uPR.value = renderer.getPixelRatio(); },
    update(time, dt, st, progress, reduced) {
      const parts = curTier !== 'low';
      // partículas
      pu.uTime.value = time;
      pu.uColor.value.copy(st.pColor);
      pu.uAmount.value = parts ? st.pAmount : 0;
      pu.uSize.value = st.pSize; pu.uStar.value = st.pStar; pu.uStretch.value = st.pStretch; pu.uTwinkle.value = st.pTwinkle;
      if (!reduced) pu.uOffset.value.set(pu.uOffset.value.x + st.pMoveX * dt, pu.uOffset.value.y + st.pMoveY * dt, pu.uOffset.value.z + st.pMoveZ * dt);
      const pShow = parts && st.pAmount > 0.004;
      if (points.visible !== pShow) points.visible = pShow; // ya está en cero (se fundió antes de esconderse)
      if (pShow && pGeo.drawRange.count !== COUNT[curTier]) pGeo.setDrawRange(0, COUNT[curTier]);

      // bruma
      mu.uTime.value = time;
      mu.uMist.value = parts ? st.mist : 0;
      mu.uColor.value.copy(st.pColor);
      const mShow = parts && st.mist > 0.004;
      if (mist.visible !== mShow) mist.visible = mShow;

      // hilo: el progress de la sala lo va cosiendo
      tu.uStitch.value = progress;
      tu.uOpacity.value = st.thread;
      const tShow = st.thread > 0.004;
      if (thread.visible !== tShow) thread.visible = tShow;

      // viñeta: sobre el rayo cámara → ventana, en el plano de fondo
      const vShow = st.vig > 0.004;
      if (vig.visible !== vShow) vig.visible = vShow;
      if (vShow) {
        let ws = 4;
        if (win) { win.getWorldPosition(winPos); win.getWorldScale(sc); ws = winSize * sc.x; }
        camera.getWorldPosition(camPos);
        const k = (camPos.z - VIG_Z) / Math.max(0.5, camPos.z - winPos.z); // cuánto más lejos está el plano de la viñeta
        vig.position.set(camPos.x + (winPos.x - camPos.x) * k, camPos.y + (winPos.y - camPos.y) * k, VIG_Z);
        vig.scale.setScalar(ws * k * 1.9);
        vig.material.opacity = st.vig;
      }
    },
    dispose() { [points, mist, thread, vig].forEach((o) => o.removeFromParent()); },
  };
}
