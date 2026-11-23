// Ventanas de las obras en WebGL, formando una CORONA arriba de la cabeza de la estatua (Niké coronaba a los
// ganadores: estos son los trabajos):
//   · un aro parejo y chico, inclinado (~20°) para verse en perspectiva, que gira una vuelta cada 40 s
//   · las de adelante más grandes y brillantes, las de atrás más chicas y tenues; nunca amontonadas
//   · en pantallas angostas la corona es más cerrada y las ventanas, un poco más grandes
//   · el hover frena la corona y agranda esa ventana (su nombre lo escribe index.js en una etiqueta)
//   · cada ventana muestra la CAPTURA del sitio (textura); el sitio real se abre solo al hacer clic
//   · marco: VIDRIO grueso biselado (extruido con chaflán): transparente de frente y espejado en los cantos,
//     donde refleja el cielo del panorama (Fresnel en el shader, sin pasada de refracción)
//   · la ventana de la sala marca su píxel en el canal alfa: el post la deja con su color real (sin tono ni LUT)
//   · en cada sala, la ventana de ese proyecto sale de la órbita y pasa al frente, grande y quieta, exacta
//     sobre el rectángulo de config/layout.js; al salir de la sala vuelve a su lugar en la órbita
// Todo se crea y se sube a la placa de video al cargar; al scrollear solo cambian matrices y uniforms.
import { WINDOWS, ORBITA, CORONA } from './config.js';
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
  vec2 uv = vUv;
  if (!gl_FrontFacing) uv.x = 1.0 - uv.x; // del revés no queda espejada
  vec3 col = texture2D(uMap, uv).rgb * uDim;
  vec3 nrm = gl_FrontFacing ? vN : -vN;
  float fres = pow(1.0 - max(dot(normalize(nrm), normalize(vV)), 0.0), 3.0);
  col = mix(col, uSheen, fres * uSheenI);       // vidrio: reflejo suave según el ángulo
  col += uSheen * uHover * 0.05;
  gl_FragColor = vec4(col, mask * uOpacity);
  #include <colorspace_fragment>
}`;

export function createOrbita(ctx, { projects, mode }) {
  const { THREE, root, camera, renderer, shared } = ctx;
  const crown = CORONA[mode];
  const omega = (Math.PI * 2) / CORONA.period;
  const maxAniso = renderer.capabilities.getMaxAnisotropy();

  const group = new THREE.Group();      // la órbita (sigue a la estatua, no gira con ella)
  group.name = 'estatua_orbita';
  root.add(group);
  const disposables = [];
  const keep = (x) => (disposables.push(x), x);

  // vidrio grueso: dieléctrico pulido; el shader sube la opacidad en los cantos (Fresnel), así de frente se ve a
  // través y en los biseles brilla el reflejo del cielo
  const glassU = { uGlassA: { value: 0.16 } };
  const chrome = keep(new THREE.MeshStandardMaterial({
    color: '#f2f6ff', metalness: 0, roughness: 0.04, envMapIntensity: 2.4,
    transparent: true, opacity: 0, depthWrite: false,
  }));
  chrome.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, glassU);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform float uGlassA;')
      .replace('#include <opaque_fragment>', `#include <opaque_fragment>
  {
    float fr = pow(1.0 - abs(dot(normalize(vViewPosition), normalize(normal))), 2.2);
    gl_FragColor.rgb *= 1.0 + fr * 0.8;
    gl_FragColor.a = clamp(mix(uGlassA, 1.0, fr), 0.0, 1.0) * opacity;
  }`);
  };
  chrome.customProgramCacheKey = () => 'orbita-vidrio';
  const loader = new THREE.TextureLoader();
  const loads = [], placeholders = [];
  const geos = new Map();
  function geosFor(width) {
    if (geos.has(width)) return geos.get(width);
    const W = width, H = W / ASPECTO;
    const B = ORBITA.bezel * (W / 1.4);
    const r = H * ORBITA.radius;
    const screen = keep(new THREE.PlaneGeometry(W, H));
    // bisel: un marco extruido de sección mínima, con chaflán (así el cromo tiene curvas que reflejar)
    const outer = roundedPath(new THREE.Shape(), W + B * 2.6, H + B * 2.6, r + B * 1.3);
    outer.holes.push(roundedPath(new THREE.Path(), W + B * 0.2, H + B * 0.2, r + B * 0.1));
    const bezel = keep(new THREE.ExtrudeGeometry(outer, {
      depth: B * 0.6, bevelEnabled: true, bevelThickness: B * 0.55, bevelSize: B * 0.55, bevelSegments: 3, curveSegments: 8,
    }));
    bezel.translate(0, 0, -B * 0.9);
    const out = { screen, bezel, W, H };
    geos.set(width, out);
    return out;
  }

  const items = projects.map((project, i) => {
    const ring = { r: crown.r, y: crown.y, width: crown.width, wave: 0.025, waveSpeed: 0.3 };
    const angle = (Math.PI * 2 * i) / projects.length;
    const g = geosFor(ring.width);
    const uniforms = {
      uMap: { value: null }, uSheen: { value: new THREE.Color('#FFF1DC') },
      uOpacity: { value: 0 }, uDim: { value: 1 }, uRadius: { value: ORBITA.radius }, uAspect: { value: ASPECTO },
      uHover: { value: 0 }, uBloomPass: { value: 0 }, uSheenI: { value: 0.2 },
    };
    const mat = keep(new THREE.ShaderMaterial({
      uniforms, vertexShader: SCREEN_VERTEX, fragmentShader: SCREEN_FRAGMENT, transparent: true, toneMapped: false, side: THREE.DoubleSide,
      // color normal; en el alfa del buffer: srcA × constante + destino × (1 − srcA). Con constante 0 (ventana de la
      // sala, al frente) el píxel queda en alfa 0 y el post lo muestra con su color real
      blending: THREE.CustomBlending, blendEquation: THREE.AddEquation, blendEquationAlpha: THREE.AddEquation,
      blendSrc: THREE.SrcAlphaFactor, blendDst: THREE.OneMinusSrcAlphaFactor,
      blendSrcAlpha: THREE.ConstantAlphaFactor, blendDstAlpha: THREE.OneMinusSrcAlphaFactor,
    }));
    mat.blendAlpha = 1;
    mat.userData.bloomUniform = uniforms.uBloomPass;
    const screen = new THREE.Mesh(g.screen, mat);
    screen.userData.projectId = project.id;
    screen.layers.enable(1); // entra al bloom en negro (no deja pasar el halo de atrás)
    const frame = new THREE.Mesh(g.bezel, chrome);
    const win = new THREE.Group();
    win.name = `ventana_${project.id}`;
    win.add(frame, screen);
    win.visible = false;
    group.add(win);

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
      project, index: i, ring, angle, win, screen, frame, uniforms, tex, W: g.W,
      k: { v: 0, target: 0 }, // 0 = en la órbita, 1 = al frente (sala)
      hover: 0, facing: 0,
    };
    if (!tex) placeholders.push(item);
    return item;
  });

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

  // ---------- estado ----------
  const state = {
    orbit: 0, timeScale: 1, speed: 1, hoveredId: null, roomId: null, hoverMix: 0, opacity: 0,
    radiusScale: 1, dimOthers: 1, frontScale: 1,
    freeze: false, frontW: 1, // freeze: al abrir un proyecto la ventana deja de seguir a la cámara
  };
  const tmpP = new THREE.Vector3(), tmpQ = new THREE.Quaternion(), frontP = new THREE.Vector3(), frontQ = new THREE.Quaternion();
  const camLocal = new THREE.Vector3(), camWorld = new THREE.Vector3(), tmpM = new THREE.Matrix4(), UP = new THREE.Vector3(0, 1, 0);
  const lookQ = new THREE.Quaternion(), yawQ = new THREE.Quaternion();
  const AX = new THREE.Vector3(1, 0, 0), centerL = new THREE.Vector3(), camDir = new THREE.Vector3();
  const invParent = new THREE.Matrix4(), parentQ = new THREE.Quaternion(), frontL = new THREE.Vector3();

  /** Pose "al frente": el centro y el ancho de `rect` (px) a ORBITA.frontDist de la cámara, de cara a ella. */
  function computeFront(rect, w, h) {
    const d = ORBITA.frontDist;
    const vh = 2 * d * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2);
    const k = vh / h;
    frontP.set((rect.x + rect.w / 2 - w / 2) * k, (h / 2 - (rect.y + rect.h / 2)) * k, -d).applyMatrix4(camera.matrixWorld);
    frontQ.copy(camera.quaternion);
    return (rect.w * k);
  }

  /**
   * visible 0..1 (fundido general) · rect = ventana grande de la sala (layout) · motion 0 con movimiento reducido
   */
  const ndcP = new THREE.Vector3(), edgeP = new THREE.Vector3(), camRight = new THREE.Vector3();
  function update(time, dt, { visible, rect, w, h, motion, gust = 0, avoid = null }) {
    const hv = WINDOWS.hover;
    state.hoverMix += ((state.hoveredId ? 1 : 0) - state.hoverMix) * (1 - Math.exp(-dt / (hv.duration * 0.5)));
    const slow = 1 - state.hoverMix * (1 - hv.slow);
    state.orbit += dt * omega * state.timeScale * state.speed * slow * motion;
    const inRoom = state.roomId !== null;
    state.dimOthers += ((inRoom ? ORBITA.dimOthers : 1) - state.dimOthers) * (1 - Math.exp(-dt * 5));
    chrome.opacity = visible;

    group.updateWorldMatrix(true, false);
    invParent.copy(group.matrixWorld).invert();
    group.getWorldQuaternion(parentQ).invert();
    camera.getWorldPosition(camWorld);
    camLocal.copy(camWorld).applyMatrix4(invParent);
    centerL.set(0, crown.y, 0);
    camDir.copy(camLocal).sub(centerL).normalize();
    if (!state.freeze) state.frontW = computeFront(rect, w, h);
    const frontW = state.frontW;

    for (const it of items) {
      const e = easeInOut3(it.k.v);
      const isRoom = it.project.id === state.roomId;
      const op = Math.max(visible * (inRoom && !isRoom ? 0.22 : 1), e); // menos es más: en la sala, las otras casi se van
      const on = op > 0.003;
      if (it.win.visible !== on) it.win.visible = on;
      if (!on) continue;
      const { ring } = it;
      const th = it.angle + state.orbit;
      const cx = Math.cos(th), sz = Math.sin(th);
      const wave = Math.sin(time * ring.waveSpeed + it.index * 1.9) * ring.wave * motion;
      const rs = state.radiusScale;
      // sobre el aro de la corona (tumbado e inclinado), arriba de la cabeza
      tmpP.set(cx * ring.r * rs, 0, sz * ring.r * rs).applyAxisAngle(AX, CORONA.tilt);
      const facing = (tmpP.dot(camDir)) / (ring.r * rs);   // 1 = justo adelante, −1 = atrás
      tmpP.y += ring.y + wave;
      // de cara a la cámara + leve giro hacia afuera
      tmpM.lookAt(camLocal, tmpP, UP);
      lookQ.setFromRotationMatrix(tmpM);
      yawQ.setFromAxisAngle(UP, -cx * WINDOWS.outwardYaw * 1.4);
      tmpQ.copy(lookQ).multiply(yawQ);
      // hover: se acerca un poco a la cámara y crece
      const hvT = state.hoveredId === it.project.id ? 1 : 0;
      it.hover += (hvT - it.hover) * (1 - Math.exp(-dt / (hv.duration * 0.35)));
      if (it.hover > 0.001) tmpP.lerp(camLocal, 0.05 * it.hover);
      it.facing = facing;
      const back = smoothstep(0.45, -0.75, facing);
      let scale = (CORONA.front.scale + (CORONA.back.scale - CORONA.front.scale) * back) * (1 + (CORONA.hoverScale - 1) * it.hover);
      scale *= 1 + Math.sin(time * 9 + it.index * 2) * gust * 0.01;
      // sala: de la corona al frente (en el espacio del grupo)
      if (e > 0) {
        frontL.copy(frontP).applyMatrix4(invParent);
        tmpP.lerp(frontL, e);
        tmpQ.slerp(lookQ.copy(parentQ).multiply(frontQ), e);
        scale = scale * (1 - e) + (frontW / it.W) * e;
      }
      it.win.position.copy(tmpP);
      it.win.quaternion.copy(tmpQ);
      it.win.scale.setScalar(scale);
      const clear = 1;
      it.clear = (it.clear ?? 1) + (clear - (it.clear ?? 1)) * (1 - Math.exp(-dt * 6));
      // brillo / opacidad
      const dim = state.hoverMix * (1 - it.hover) * hv.dim * (1 - e);
      const u = it.uniforms;
      u.uOpacity.value = op * (1 - (1 - CORONA.back.opacity) * back * (1 - e)) * (1 - dim * 0.6) * it.clear;
      u.uHover.value = it.hover;
      u.uDim.value = inRoom && !isRoom ? state.dimOthers : 1;
      u.uSheenI.value = 0.2 * (1 - e) + 0.04 * e; // al frente casi sin reflejo: el trabajo se ve claro
      // al frente: color real del sitio (máscara de alfa para el post). Nunca 0 exacto: three r170 pone su caché del
      // color de mezcla en 0 al dibujar materiales normales sin avisarle a la GPU, y un 0 pedido no se mandaría
      it.screen.material.blendAlpha = Math.max(0.0001, 1 - e);
    }
  }

  /** Dónde queda (en píxeles) el borde de arriba de la ventana: ahí va la etiqueta con su nombre. */
  function anchor(it, out) {
    it.win.updateWorldMatrix(true, false);
    out.set(0, it.W / ASPECTO / 2 + 0.03, 0);
    it.win.localToWorld(out).project(camera);
    out.x = (out.x * 0.5 + 0.5) * innerWidth;
    out.y = (0.5 - out.y * 0.5) * innerHeight - 8;
    return out;
  }

  function pickables(out) {
    out.length = 0;
    for (const it of items) if (it.win.visible && it.uniforms.uOpacity.value > 0.5) out.push(it.screen);
    return out;
  }

  return {
    group, items, state, ready, mode,
    update, pickables, computeFront, anchor,
    dispose() {
      disposables.forEach((d) => d.dispose());
      group.removeFromParent();
    },
  };
}

const easeInOut3 = (x) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);
const smoothstep = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

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

// Cartel sobrio para los proyectos sin captura: el nombre y el rubro, sin inventar nada.
function drawPlaceholder(project) {
  const c = document.createElement('canvas');
  c.width = 1440; c.height = 900;
  const g = c.getContext('2d');
  const bg = g.createLinearGradient(0, 0, 1440, 900);
  bg.addColorStop(0, '#2A241E'); bg.addColorStop(0.55, '#1A1612'); bg.addColorStop(1, '#3A2E22');
  g.fillStyle = bg;
  g.fillRect(0, 0, 1440, 900);
  g.fillStyle = 'rgba(241,210,122,0.55)';
  g.fillRect(120, 300, 64, 1.5);
  g.fillStyle = '#F4EEE2';
  let size = 150;
  g.font = `400 ${size}px "Instrument Serif", Georgia, serif`;
  while (g.measureText(project.title).width > 1200 && size > 70) { size -= 6; g.font = `400 ${size}px "Instrument Serif", Georgia, serif`; }
  g.fillText(project.title, 116, 300 + size * 0.95);
  g.font = 'italic 400 54px "Instrument Serif", Georgia, serif';
  g.fillStyle = '#E9C987';
  g.fillText(project.rubro || '', 120, 300 + size * 0.95 + 84);
  g.font = '300 22px "Inter Tight", Arial, sans-serif';
  g.fillStyle = 'rgba(244,238,226,0.55)';
  g.fillText('Sitio en preparación', 122, 780);
  return c;
}
