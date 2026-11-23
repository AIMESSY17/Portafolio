import { smooth, clamp01 } from './models.js';

const TAU = Math.PI * 2;

// Sobre nosotros: la cámara se acerca a la cabeza dorada y aparece un dibujo de "detección"
// (círculos, regla angular, corchetes, ejes y un barrido) que se traza solo. Todo líneas doradas.
// `hud` queda siempre de frente a la cámara, apenas delante de la cabeza.
export function createAbout(ctx) {
  const { THREE, camera, root, cameraRig } = ctx;
  const GOLD = new THREE.Color('#C9A227');
  const GOLD_HI = new THREE.Color('#F1D27A');

  // ---------- el dibujo (coordenadas planas, se escala a la cabeza) ----------
  const P = [], T = [], K = [];
  // t0..t1 = cuándo se traza (del reveal) · kind: 0 fuerte, 1 medio, 2 suave, 3 trama
  function line(pts, t0, t1, kind) {
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i], b = pts[i + 1];
      P.push(a[0], a[1], 0, b[0], b[1], 0);
      T.push(t0 + ((t1 - t0) * i) / (pts.length - 1), t0 + ((t1 - t0) * (i + 1)) / (pts.length - 1));
      K.push(kind, kind);
    }
  }
  const arc = (r, a0, a1, n = 96) => {
    const out = [];
    for (let i = 0; i <= n; i++) {
      const a = a0 + ((a1 - a0) * i) / n;
      out.push([Math.cos(a) * r, Math.sin(a) * r]);
    }
    return out;
  };
  line(arc(1.32, Math.PI / 2, Math.PI / 2 + TAU), 0, 0.34, 0);                // círculo principal
  line(arc(1.36, Math.PI / 2 + 0.4, Math.PI / 2 + TAU - 0.2, 90), 0.06, 0.4, 1); // trazo doble, como boceto
  line(arc(1.72, -0.7, Math.PI + 0.7, 80), 0.18, 0.5, 1);                      // arco exterior
  for (let a = -0.7, i = 0; a <= Math.PI + 0.71; a += Math.PI / 18, i++) {     // regla angular
    const L = i % 3 ? 0.06 : 0.13;
    line([[Math.cos(a) * 1.72, Math.sin(a) * 1.72], [Math.cos(a) * (1.72 + L), Math.sin(a) * (1.72 + L)]], 0.24 + i * 0.008, 0.25 + i * 0.008, 1);
  }
  const B = 1.56, BL = 0.34;                                                    // corchetes de detección
  [[-1, -1], [1, -1], [1, 1], [-1, 1]].forEach(([sx, sy], i) => {
    line([[sx * B, sy * (B - BL)], [sx * B, sy * B], [sx * (B - BL), sy * B]], 0.3 + i * 0.03, 0.36 + i * 0.03, 0);
  });
  line([[0, -2.05], [0, 2.05]], 0.36, 0.6, 0);                                  // eje que parte la cabeza a la mitad
  line([[-2.05, 0], [2.05, 0]], 0.42, 0.62, 2);
  for (let y = -1.8, i = 0; y <= 1.81; y += 0.2, i++) {
    const L = i % 5 ? 0.05 : 0.11;
    line([[-L, y], [L, y]], 0.5 + i * 0.006, 0.51 + i * 0.006, 1);
  }
  for (let y = -1.2, i = 0; y <= 1.21; y += 0.1, i++) {                         // tramado sobre media cabeza
    const x = Math.sqrt(Math.max(0, 1.32 * 1.32 - y * y));
    line([[0.02, y], [x, y]], 0.55 + i * 0.012, 0.6 + i * 0.012, 3);
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
  geo.setAttribute('aT', new THREE.Float32BufferAttribute(T, 1));
  geo.setAttribute('aKind', new THREE.Float32BufferAttribute(K, 1));
  const uniforms = {
    uReveal: { value: 0 }, uTime: { value: 0 }, uOpacity: { value: 1 }, uScan: { value: 0 },
    uColor: { value: GOLD.clone() }, uTip: { value: GOLD_HI.clone() },
  };
  const material = new THREE.ShaderMaterial({
    uniforms,
    transparent: true,
    depthWrite: false,
    depthTest: false,
    blending: THREE.AdditiveBlending,
    vertexShader: /* glsl */ `
      attribute float aT; attribute float aKind;
      varying float vT; varying float vKind; varying vec2 vP;
      void main(){ vT=aT; vKind=aKind; vP=position.xy; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
    fragmentShader: /* glsl */ `
      uniform float uReveal,uTime,uOpacity,uScan;
      uniform vec3 uColor,uTip;
      varying float vT; varying float vKind; varying vec2 vP;
      void main(){
        if(vT>uReveal) discard;
        float tip=1.0-smoothstep(0.0,0.03,uReveal-vT);
        float base = vKind<0.5?0.75:(vKind<1.5?0.38:(vKind<2.5?0.22:0.16));
        float scan = vKind>2.5 ? smoothstep(0.18,0.0,abs(vP.y-uScan))*1.6 : 0.0; // barrido que recorre la mitad
        float sh=0.85+0.15*sin(vT*90.0-uTime*2.2);
        gl_FragColor=vec4(mix(uColor,uTip,max(tip,scan*0.6))*(base*sh+tip*0.9+scan),1.0)*uOpacity;
      }`,
  });
  const lines = new THREE.LineSegments(geo, material);
  lines.frustumCulled = false;
  lines.renderOrder = 20;

  // línea de escaneo que sube y baja sobre la mitad de la cabeza
  const scanGeo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]);
  const scanMat = new THREE.LineBasicMaterial({ color: GOLD_HI, transparent: true, opacity: 0, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending });
  const scanLine = new THREE.Line(scanGeo, scanMat);
  scanLine.frustumCulled = false;
  scanLine.renderOrder = 21;

  const hud = new THREE.Group();
  hud.name = 'sobre_nosotros_escaneo';
  hud.add(lines, scanLine);
  hud.visible = false;
  root.add(hud);

  // ---------- la cabeza ----------
  let head = null;
  const headLocalC = new THREE.Vector3();
  let headLocalR = 0.2;
  const wp = new THREE.Vector3(), ws = new THREE.Vector3(), hc = new THREE.Vector3();
  const camDir = new THREE.Vector3(), shotPos = new THREE.Vector3(), shotTgt = new THREE.Vector3(), tmp = new THREE.Vector3();

  // Busca la pieza "pieza_cabeza" (la crea parts.js) y mide su centro y radio, aunque esté oculta.
  function findHead() {
    const piece = root.getObjectByName('pieza_cabeza');
    if (!piece) return;
    const saved = [];
    for (let o = piece; o; o = o.parent) { saved.push([o, o.visible]); o.visible = true; }
    piece.updateWorldMatrix(true, true);
    const box = new THREE.Box3().setFromObject(piece);
    saved.forEach(([o, v]) => (o.visible = v));
    if (box.isEmpty()) return;
    const c = box.getCenter(new THREE.Vector3());
    const s = box.getSize(new THREE.Vector3());
    piece.getWorldScale(ws);
    headLocalC.copy(piece.worldToLocal(c.clone()));
    headLocalR = (Math.max(s.x, s.y, s.z) * 0.5) / ws.x;
    head = piece;
  }

  // La cámara no se mueve sola: usa cameraRig.focus()/release() (excepción del contrato, igual
  // que al abrir un proyecto). Entra cuando el peso pasa de 0.5 y vuelve al bajar de 0.5.
  const SHOT_IN = 0.5;
  let shotOn = false;
  let refreshIn = 0;
  const shotMs = { in: 1.5, out: 1.2 };
  function shotPose(portrait) {
    head.updateWorldMatrix(true, false);
    hc.copy(headLocalC);
    head.localToWorld(hc);
    head.getWorldScale(ws);
    const R = headLocalR * ws.x;
    const tanH = Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2);
    const visH = portrait ? R * 7.5 : R * 5.2; // alto visible alrededor de la cabeza
    const dist = visH / 2 / tanH;
    camDir.set(0.18, 0.05, 1).normalize();
    shotTgt.copy(hc);
    if (portrait) shotTgt.y -= visH * 0.12;
    else shotTgt.x -= visH * camera.aspect * 0.17; // la cabeza queda a la derecha, el texto a la izquierda
    shotPos.copy(shotTgt).addScaledVector(camDir, dist);
    return { R };
  }

  let reveal = 0;
  let shotW = 0;
  let acc = 0;
  return {
    /** Peso actual del zoom (0..1): las ventanas lo usan para apartarse. */
    get shotWeight() { return shotW; },
    /** aboutW = peso de la sección Sobre nosotros (0..1) · busy = hay un proyecto abierto. */
    update(time, dt, aboutW, portrait, busy) {
      acc += dt;
      shotW += (aboutW - shotW) * Math.min(1, dt * 3);
      if (!head) findHead();

      if (head && shotW > 0.001) {
        const { R } = shotPose(portrait);
        // HUD: siempre de frente a la cámara, apenas delante de la cabeza
        camera.getWorldPosition(wp);
        tmp.copy(wp).sub(hc).normalize();
        hud.position.copy(hc).addScaledVector(tmp, R * 1.15);
        hud.quaternion.copy(camera.quaternion);
        hud.scale.setScalar(R * (1 - (R * 1.15) / Math.max(0.01, wp.distanceTo(hc))));

        if (!busy && !shotOn && shotW > SHOT_IN) {
          shotOn = true;
          refreshIn = acc + shotMs.in;
          cameraRig.focus({ position: shotPos.clone(), target: shotTgt.clone(), duration: shotMs.in });
        } else if (shotOn && !busy && acc > refreshIn) {
          // la cabeza se mueve (flota y gira con el mouse): se actualiza la pose cada tanto
          refreshIn = acc + 0.2;
          cameraRig.focus({ position: shotPos.clone(), target: shotTgt.clone(), duration: 0.25 });
        }
      }
      if (shotOn && (shotW < SHOT_IN || busy)) {
        shotOn = false;
        if (!busy) cameraRig.release({ duration: shotMs.out });
      }

      const target = clamp01((aboutW - 0.55) / 0.45);
      reveal += Math.max(-dt * 1.2, Math.min(dt * 0.55, target - reveal));
      uniforms.uReveal.value = reveal * 1.02;
      uniforms.uTime.value = time;
      uniforms.uOpacity.value = smooth(0, 0.15, reveal);
      const sy = Math.sin(acc * 1.1) * 1.15;
      uniforms.uScan.value = sy;
      const sx = Math.sqrt(Math.max(0, 1.32 * 1.32 - sy * sy));
      const sp = scanGeo.attributes.position;
      sp.setXYZ(0, 0, sy, 0);
      sp.setXYZ(1, sx, sy, 0);
      sp.needsUpdate = true;
      scanMat.opacity = smooth(0.55, 0.75, reveal) * 0.9;
      hud.visible = !!head && reveal > 0.002;
    },
    dispose() {
      if (shotOn) cameraRig.release({ duration: 0.6 });
      geo.dispose();
      material.dispose();
      scanGeo.dispose();
      scanMat.dispose();
      hud.removeFromParent();
    },
  };
}
