// Tótem de obras (ref07): las 7 pantallas encastradas en ángulos distintos alrededor de un eje de luz,
// girando juntas como una sola escultura. Cada pantalla muestra la CAPTURA del sitio (textura WebGL); el
// sitio real (iframe) se carga solo al hacer clic, en el visor, y se descarga al cerrarlo.
// En cada sala la pantalla de ese proyecto se suelta del tótem y pasa al frente, grande y quieta,
// exactamente sobre el rectángulo que reserva config/layout.js (ahí mismo la ui pone su texto).
// Todo se crea y se sube a la placa de video al cargar; al scrollear solo se mueven matrices y uniforms.
import { TOTEM } from './config.js';
import { ASPECTO } from '../../config/layout.js';

const SCREEN_VERTEX = /* glsl */`
varying vec2 vUv; varying vec3 vN; varying vec3 vV;
void main(){
  vUv = uv;
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vN = normalize(mat3(modelMatrix) * normal);
  vV = normalize(cameraPosition - wp.xyz);
  gl_Position = projectionMatrix * viewMatrix * wp;
}`;
const SCREEN_FRAGMENT = /* glsl */`
uniform sampler2D uMap;
uniform vec3 uSheen;
uniform float uOpacity, uDim, uRadius, uAspect, uHover, uBloomPass, uSheenI;
varying vec2 vUv; varying vec3 vN; varying vec3 vV;
float sdRound(vec2 p, vec2 b, float r){ vec2 q = abs(p) - b + r; return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r; }
void main(){
  vec2 p = (vUv - 0.5) * vec2(uAspect, 1.0);
  float d = sdRound(p, vec2(uAspect * 0.5, 0.5), uRadius);
  float aa = fwidth(d) * 1.2;
  float mask = 1.0 - smoothstep(-aa, aa, d);
  if (mask < 0.004) discard;
  if (uBloomPass > 0.5) { gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0); return; } // tapa el halo de lo que está atrás
  // de los dos lados se ve el sitio (del revés se da vuelta la imagen, así no queda espejada)
  vec2 uv = vUv;
  if (!gl_FrontFacing) uv.x = 1.0 - uv.x;
  vec3 col = texture2D(uMap, uv).rgb * uDim;
  // vidrio: un reflejo muy suave del cielo según el ángulo, y una veladura al hacer hover
  vec3 nrm = gl_FrontFacing ? vN : -vN;
  float fres = pow(1.0 - max(dot(normalize(nrm), normalize(vV)), 0.0), 3.0);
  col = mix(col, uSheen, fres * uSheenI);
  col += uSheen * uHover * 0.05;
  gl_FragColor = vec4(col, mask * uOpacity);
  #include <colorspace_fragment>
}`;

export function createTotem(ctx, { projects, mode }) {
  const { THREE, root, camera, renderer } = ctx;
  const W = TOTEM.width[mode] ?? TOTEM.width.desktop;
  const H = W / ASPECTO;
  const B = TOTEM.bezel * (W / 1.3);
  const maxAniso = Math.min(8, renderer.capabilities.getMaxAnisotropy());

  const group = new THREE.Group();   // dónde está parado el tótem
  group.name = 'estatua_totem';
  const spinner = new THREE.Group(); // lo que gira
  group.add(spinner);
  root.add(group);
  const windows = new THREE.Group(); // las pantallas viven acá (en el mundo): así pueden ir y venir del frente
  windows.name = 'estatua_totem_pantallas';
  root.add(windows);

  const disposables = [];
  const keep = (x) => (disposables.push(x), x);

  // eje y brazos: hilos de luz dorada (brillan en el bloom)
  const n = projects.length;
  const span = (n - 1) * TOTEM.spacing;
  const base = -span / 2 - 0.4;
  const lightMat = keep(new THREE.MeshBasicMaterial({ color: '#F1D27A', toneMapped: false, transparent: true, opacity: 0, depthWrite: false }));
  const pole = new THREE.Mesh(keep(new THREE.CylinderGeometry(0.009, 0.009, span + 1.4, 6, 1, true)), lightMat);
  pole.position.y = 0;
  pole.layers.enable(1);
  spinner.add(pole);
  const armGeo = keep(new THREE.CylinderGeometry(0.006, 0.006, 1, 5, 1, true));
  armGeo.translate(0, 0.5, 0);
  armGeo.rotateX(Math.PI / 2); // de 0 a +z

  const screenGeo = keep(new THREE.PlaneGeometry(W, H));
  // marco: un hilo de luz champán apenas por fuera de la pantalla (no un marco de cartón)
  const gap = B * 0.35;
  const frameGeo = keep(roundedRing(THREE, W + (gap + B) * 2, H + (gap + B) * 2, H * TOTEM.radius + gap + B, B));
  const frameMat = keep(new THREE.MeshBasicMaterial({ color: TOTEM.frame.color, toneMapped: false, side: THREE.DoubleSide, transparent: true, opacity: 0, depthWrite: false }));
  const loader = new THREE.TextureLoader();
  const loads = [];
  const placeholders = [];

  const items = projects.map((project, i) => {
    // lugar en el tótem: a distintas alturas, dando la vuelta al eje en espiral (ángulo de oro) y apenas inclinadas
    const slot = new THREE.Group();
    const yaw = i * 2.39996 + 0.4;
    slot.position.set(Math.sin(yaw) * TOTEM.reach, base + 0.4 + i * TOTEM.spacing, Math.cos(yaw) * TOTEM.reach);
    slot.rotation.set(Math.sin(i * 1.7) * 0.09, yaw, Math.cos(i * 2.3) * 0.07, 'YXZ');
    spinner.add(slot);
    const arm = new THREE.Mesh(armGeo, lightMat);
    arm.position.set(0, slot.position.y, 0);
    arm.rotation.y = yaw;
    arm.scale.set(1, 1, TOTEM.reach - 0.02);
    arm.layers.enable(1);
    spinner.add(arm);

    // la pantalla: captura + marco de metal champán (de atrás se ve la placa)
    const uniforms = {
      uMap: { value: null }, uSheen: { value: new THREE.Color('#FFE9C8') },
      uOpacity: { value: 0 }, uDim: { value: 1 }, uRadius: { value: TOTEM.radius }, uAspect: { value: ASPECTO },
      uHover: { value: 0 }, uBloomPass: { value: 0 }, uSheenI: { value: 0.22 },
    };
    const mat = keep(new THREE.ShaderMaterial({ uniforms, vertexShader: SCREEN_VERTEX, fragmentShader: SCREEN_FRAGMENT, transparent: true, toneMapped: false, side: THREE.DoubleSide }));
    mat.userData.bloomUniform = uniforms.uBloomPass;
    const screen = new THREE.Mesh(screenGeo, mat);
    screen.userData.projectId = project.id;
    screen.layers.enable(1); // entra a la pasada del bloom, en negro (no deja pasar el halo de atrás)
    const frame = new THREE.Mesh(frameGeo, frameMat); // hilo de luz fino (sin bloom: no un halo de neón)
    const win = new THREE.Group();
    win.name = `ventana_${project.id}`;
    win.add(frame, screen);
    win.visible = false;
    windows.add(win);

    // textura: la captura (o un cartel con el nombre, si el proyecto no tiene o si no carga)
    let tex = null;
    if (project.captura) {
      loads.push(new Promise((done) => {
        tex = loader.load(project.captura, () => done(), undefined, () => { item.tex = null; placeholders.push(item); done(); });
      }));
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.anisotropy = maxAniso;
      uniforms.uMap.value = keep(tex);
    }
    const item = {
      project, index: i, slot, arm, win, screen, frame, uniforms, tex,
      k: { v: 0 },       // 0 = en el tótem, 1 = al frente (sala)
      hover: 0,
    };
    if (!tex) placeholders.push(item);
    return item;
  });

  // carteles para los que no tienen captura (cuando la tipografía ya cargó y terminaron las capturas)
  const fontsReady = Promise.race([
    Promise.all([document.fonts?.load?.('400 120px "Instrument Serif"'), document.fonts?.load?.('italic 400 48px "Instrument Serif"'), document.fonts?.load?.('300 22px "Inter Tight"')]),
    new Promise((r) => setTimeout(r, 2500)),
  ]).catch(() => {});
  const ready = Promise.all([fontsReady, ...loads]).then(() => {
    for (const it of placeholders) {
      const t = keep(new THREE.CanvasTexture(drawPlaceholder(it.project)));
      t.colorSpace = THREE.SRGBColorSpace;
      t.anisotropy = maxAniso;
      it.uniforms.uMap.value = t;
    }
  });

  // ---------- poses ----------
  const tmpP = new THREE.Vector3(), tmpQ = new THREE.Quaternion(), tmpS = new THREE.Vector3();
  const frontP = new THREE.Vector3(), frontQ = new THREE.Quaternion();
  const startP = new THREE.Vector3();
  const state = { spin: 0, opacity: 0, frontScale: 1, hoveredId: null, roomId: null, dimOthers: 1 };

  /** Pose "al frente": el centro y el ancho de `rect` (px) a TOTEM.frontDist de la cámara, de cara a ella. */
  function computeFront(rect, w, h) {
    const d = TOTEM.frontDist;
    const vh = 2 * d * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2);
    const k = vh / h; // metros por píxel a esa distancia
    frontP.set((rect.x + rect.w / 2 - w / 2) * k, (h / 2 - (rect.y + rect.h / 2)) * k, -d);
    frontP.applyMatrix4(camera.matrixWorld);
    frontQ.copy(camera.quaternion);
    state.frontScale = (rect.w * k) / W;
  }

  /**
   * assemble: 0..1 (el tótem se arma bajando del cielo) · visible: 0..1 (fundido general)
   * rect: rectángulo de la ventana de la sala (layout) · motion: 0 con movimiento reducido
   */
  function update(time, dt, { assemble, visible, rect, w, h, motion, turnBoost = 0 }) {
    state.spin += dt * TOTEM.turn * motion * (1 + turnBoost);
    spinner.rotation.y = state.spin;
    group.updateMatrixWorld(true);
    computeFront(rect, w, h);
    const inRoom = state.roomId !== null;
    state.dimOthers += ((inRoom ? TOTEM.dimOthers : 1) - state.dimOthers) * (1 - Math.exp(-dt * 5));
    lightMat.opacity = 0.55 * assemble * visible;
    frameMat.opacity = 0.75 * Math.min(1, assemble * visible * 1.2);
    const lineOn = lightMat.opacity > 0.003;
    if (pole.visible !== lineOn) { pole.visible = lineOn; items.forEach((it) => (it.arm.visible = lineOn)); }

    for (const it of items) {
      // armado escalonado: cada pantalla baja del cielo a su lugar
      const a = clamp01((assemble - it.index * 0.06) / 0.64);
      const ae = a * a * (3 - 2 * a);
      const e = easeInOut3(it.k.v); // salida al frente (0,8 s, power3.inOut)
      const op = Math.max(ae * visible, e);
      const on = op > 0.003;
      if (it.win.visible !== on) it.win.visible = on;
      if (!on) continue;
      it.slot.matrixWorld.decompose(tmpP, tmpQ, tmpS);
      if (ae < 1) {
        // viene desde arriba y algo de costado, girando apenas
        startP.set(tmpP.x + Math.sin(it.index * 2.1) * 1.4, tmpP.y + 5 + it.index * 0.6, tmpP.z - 1.5);
        tmpP.lerpVectors(startP, tmpP, ae);
      }
      if (e > 0) {
        tmpP.lerp(frontP, e);
        tmpQ.slerp(frontQ, e);
      }
      it.win.position.copy(tmpP);
      it.win.quaternion.copy(tmpQ);
      it.win.scale.setScalar((0.35 + 0.65 * ae) * (1 - e) + state.frontScale * e);
      // hover
      const hv = state.hoveredId === it.project.id ? 1 : 0;
      it.hover += (hv - it.hover) * (1 - Math.exp(-dt * 8));
      const u = it.uniforms;
      u.uOpacity.value = op;
      u.uHover.value = it.hover;
      u.uDim.value = inRoom && it.project.id !== state.roomId ? state.dimOthers : 1;
      u.uSheenI.value = 0.22 * (1 - e) + 0.06 * e; // al frente casi sin reflejo: el trabajo se ve claro
    }
  }

  /** Pantallas que se pueden clickear (las que se ven bien). */
  function pickables(out) {
    out.length = 0;
    for (const it of items) if (it.win.visible && it.uniforms.uOpacity.value > 0.6) out.push(it.screen);
    return out;
  }

  return {
    group, windows, items, state, ready,
    update, pickables, computeFront,
    dispose() {
      disposables.forEach((d) => d.dispose());
      group.removeFromParent();
      windows.removeFromParent();
    },
  };
}

const clamp01 = (x) => Math.min(1, Math.max(0, x));
const easeInOut3 = (x) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);

function roundedPath(path, w, h, r) {
  const x = -w / 2, y = -h / 2;
  r = Math.min(r, w / 2, h / 2);
  path.moveTo(x + r, y);
  path.lineTo(x + w - r, y);
  path.quadraticCurveTo(x + w, y, x + w, y + r);
  path.lineTo(x + w, y + h - r);
  path.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  path.lineTo(x + r, y + h);
  path.quadraticCurveTo(x, y + h, x, y + h - r);
  path.lineTo(x, y + r);
  path.quadraticCurveTo(x, y, x + r, y);
  return path;
}
/** Anillo de esquinas redondeadas (ancho w × alto h, grosor t). */
function roundedRing(THREE, w, h, r, t) {
  const s = roundedPath(new THREE.Shape(), w, h, r);
  s.holes.push(roundedPath(new THREE.Path(), w - t * 2, h - t * 2, Math.max(0.001, r - t)));
  return new THREE.ShapeGeometry(s, 10);
}

// Cartel elegante para los proyectos sin captura: el nombre y el rubro, sin inventar nada.
function drawPlaceholder(project) {
  const c = document.createElement('canvas');
  c.width = 1440; c.height = 900;
  const g = c.getContext('2d');
  const bg = g.createLinearGradient(0, 0, 1440, 900);
  bg.addColorStop(0, '#2A241E');
  bg.addColorStop(0.55, '#1A1612');
  bg.addColorStop(1, '#3A2E22');
  g.fillStyle = bg;
  g.fillRect(0, 0, 1440, 900);
  const glow = g.createRadialGradient(1080, 220, 10, 1080, 220, 760);
  glow.addColorStop(0, 'rgba(241,210,122,0.20)');
  glow.addColorStop(1, 'rgba(241,210,122,0)');
  g.fillStyle = glow;
  g.fillRect(0, 0, 1440, 900);
  g.fillStyle = 'rgba(241,210,122,0.55)';
  g.fillRect(120, 300, 64, 1.5);
  g.fillStyle = '#F4EEE2';
  g.textBaseline = 'alphabetic';
  let size = 150;
  g.font = `400 ${size}px "Instrument Serif", Georgia, serif`;
  while (g.measureText(project.title).width > 1200 && size > 70) { size -= 6; g.font = `400 ${size}px "Instrument Serif", Georgia, serif`; }
  g.fillText(project.title, 116, 300 + size * 0.95);
  g.font = 'italic 400 54px "Instrument Serif", Georgia, serif';
  g.fillStyle = '#E9C987';
  g.fillText(project.rubro || '', 120, 300 + size * 0.95 + 84);
  g.font = '300 22px "Inter Tight", Arial, sans-serif';
  g.fillStyle = 'rgba(244,238,226,0.55)';
  if ('letterSpacing' in g) g.letterSpacing = '3px';
  g.fillText('Sitio en preparación', 122, 780);
  return c;
}
