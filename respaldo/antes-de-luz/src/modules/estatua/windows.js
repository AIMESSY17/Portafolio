import { CSS3DObject } from 'three/examples/jsm/renderers/CSS3DRenderer.js';
import { WINDOWS, SALA } from './config.js';

// Ventanas flotantes con una CAPTURA de cada sitio (imagen en la capa HTML 3D). El sitio real (iframe)
// solo se carga al hacer clic, en el visor (viewer.js), y se destruye al cerrarlo.
// En WebGL cada ventana tiene: un "perforador" (deja ver el iframe a través del canvas),
// un marco grafito con reflejos, un brillo dorado para el hover y una sombra suave.
// Órbita: los proyectos giran solos, siempre, repartidos parejo en uno o dos anillos (ver WINDOWS en
// config.js). La órbita NO depende del giro de la estatua: arrastrar solo gira la estatua.
export function createWindows(ctx, { projects, mode }) {
  const damp = (speed, dt) => 1 - Math.exp(-speed * dt);
  const sala = SALA[mode].window;                       // dónde queda la ventana de la sala (grande y quieta)
  const roomPos = new ctx.THREE.Vector3(...sala.pos);
  const { THREE, camera, htmlRoot, shared } = ctx;
  const vp = WINDOWS.viewport[mode];
  const rings = WINDOWS.rings[mode];
  const omega = (Math.PI * 2) / WINDOWS.period[mode]; // rad/s
  const group = new THREE.Group();
  group.name = 'estatua_ventanas';

  const shadowTex = makeShadowTexture(THREE);
  const disposables = [shadowTex];
  const tmpV = new THREE.Vector3();
  const tmpQ = new THREE.Quaternion();
  const tmpS = new THREE.Vector3();
  const camPos = new THREE.Vector3();
  const camLocal = new THREE.Vector3();
  const tmpDir = new THREE.Vector3();

  const items = projects.map((project, i) => {
    const ring = rings[i % rings.length]; // se alternan los anillos
    const angle = (Math.PI * 2 * i) / projects.length; // repartidos parejo en la vuelta
    const pxToM = ring.width / vp.w;
    const totalPxH = vp.h + WINDOWS.barHeight;
    const w = ring.width, h = totalPxH * pxToM;
    const r = WINDOWS.radius * pxToM;

    const win = new THREE.Group();
    win.name = `ventana_${project.id}`;
    group.add(win);

    // 1) perforador: escribe alpha 0 en el canvas → se ve el iframe que está debajo.
    //    Escribe profundidad, así la estatua lo tapa cuando pasa por delante.
    const holeGeo = roundedRect(THREE, w, h, r);
    const holeMat = new THREE.MeshBasicMaterial({ color: 0x000000, blending: THREE.NoBlending, toneMapped: false, fog: false });
    holeMat.opacity = 0; // con NoBlending el alpha 0 se escribe tal cual
    const hole = new THREE.Mesh(holeGeo, holeMat);
    hole.userData.projectId = project.id;
    win.add(hole);

    // 2) marco grafito (refleja el entorno: brillos plateados)
    const pad = 0.022 * (w / 1.5) + 0.006;
    const frameGeo = roundedRect(THREE, w + pad * 2, h + pad * 2, r + pad);
    const frameMat = new THREE.MeshPhysicalMaterial({ color: WINDOWS.frame.color, metalness: 0.85, roughness: 0.32, clearcoat: 0.6, clearcoatRoughness: 0.25, transparent: true }); // transparent: para fundirse
    const frame = new THREE.Mesh(frameGeo, frameMat);
    frame.position.z = -0.006;
    frame.castShadow = true;
    win.add(frame);

    // 3) brillo dorado (hover)
    const glowGeo = roundedRect(THREE, w + pad * 2 + 0.03, h + pad * 2 + 0.03, r + pad + 0.015);
    const glowMat = new THREE.MeshBasicMaterial({ color: WINDOWS.frame.glow, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, fog: false });
    const glow = new THREE.Mesh(glowGeo, glowMat);
    glow.position.z = -0.012;
    win.add(glow);

    // 4) sombra difusa detrás y abajo
    const shadowGeo = new THREE.PlaneGeometry(w * 1.7, h * 1.7);
    const shadowMat = new THREE.MeshBasicMaterial({ map: shadowTex, transparent: true, opacity: 0.75, depthWrite: false, color: 0x000000 });
    const shadow = new THREE.Mesh(shadowGeo, shadowMat);
    shadow.position.set(0.04 * w, -0.08 * h, -0.35);
    win.add(shadow);

    disposables.push(holeGeo, holeMat, frameGeo, frameMat, glowGeo, glowMat, shadowGeo, shadowMat);

    // ---------- HTML: barra tipo navegador + iframe ----------
    const el = document.createElement('div');
    el.className = `ventana ventana--${mode}`;
    el.style.width = `${vp.w}px`;
    el.style.height = `${totalPxH}px`;
    el.style.setProperty('--radius', `${WINDOWS.radius}px`);
    el.style.setProperty('--bar', `${WINDOWS.barHeight}px`);
    el.style.setProperty('--accent', project.accent || '#C9A227');
    el.innerHTML = `
      <div class="ventana__bar">
        <span class="ventana__dots"><i></i><i></i><i></i></span>
        <span class="ventana__addr">${escapeHtml(displayAddress(project))}</span>
      </div>
      <div class="ventana__body"></div>
      <div class="ventana__glass"></div>`;
    const body = el.querySelector('.ventana__body');
    if (project.captura) {
      // captura de la página (webp, ver `npm run capturas`); si falta el archivo, queda el placeholder
      const img = document.createElement('img');
      img.className = 'ventana__shot';
      img.alt = '';
      img.decoding = 'async';
      img.draggable = false;
      img.addEventListener('error', () => { img.remove(); body.appendChild(placeholder(project)); }, { once: true });
      img.src = project.captura;
      body.appendChild(img);
    } else {
      body.appendChild(placeholder(project));
    }
    const css = new CSS3DObject(el);
    el.style.pointerEvents = 'none'; // CSS3DObject lo pone en 'auto': lo anulamos (el clic lo maneja el raycast)
    htmlRoot.add(css);

    return {
      project, ring, angle, win, hole, frame, glow, frameMat, glowMat, shadowMat, el, css, body,
      w, h, pxToM, index: i,
      roomScale: sala.width / ring.width, // cuánto crece al quedar en la sala
      hover: { value: 0 },
      shownOpacity: 1, glassX: -1, glassY: -1, facing: 0,
      room: 0, // 0..1: cuánto salió de la órbita hacia la sala
      vis: 1,  // 0..1: visibilidad (se funde cuando otra ventana es la de la sala)
    };
  });

  const state = {
    orbit: 0, timeScale: 1, speed: 1, intensity: 1, radiusScale: 1, hoveredId: null, gust: 0,
    featuredId: null, featuredScale: 1, featuredGlow: 0,
    roomId: null, // proyecto de la sala actual (la ventana sale de la órbita y queda grande y quieta)
    hoverMix: 0, // 0..1: sube cuando hay un navegador con hover (frena la órbita y atenúa al resto)
  };
  const angleOf = (it, orbit = state.orbit) => it.angle + orbit;
  const wrap = (a) => ((a % (Math.PI * 2)) + Math.PI * 3) % (Math.PI * 2) - Math.PI;

  function update(time, delta) {
    const motion = shared.reducedMotion ? 0 : state.intensity;
    const hv = WINDOWS.hover;
    // el hover frena la órbita suavemente y al salir retoma
    state.hoverMix += ((state.hoveredId ? 1 : 0) - state.hoverMix) * (1 - Math.exp(-delta / (hv.duration * 0.5)));
    const slow = 1 - state.hoverMix * (1 - hv.slow);
    state.orbit += delta * omega * state.timeScale * state.speed * slow * motion;

    camera.getWorldPosition(camPos);
    // el grupo puede estar corrido por la API o por el seguimiento de la estatua: trabajamos en su espacio local
    group.updateWorldMatrix(true, false);
    camLocal.copy(camPos);
    group.worldToLocal(camLocal);
    const camLen = Math.hypot(camLocal.x, camLocal.z) || 1;

    let frontItem = null, frontFacing = -2;
    const inRoom = state.roomId !== null;
    for (const it of items) {
      const { ring, win } = it;
      // sala: la ventana del proyecto sale de la órbita hacia su lugar; las demás se funden
      const isRoom = it.project.id === state.roomId;
      it.room += ((isRoom ? 1 : 0) - it.room) * damp(isRoom ? 3 : 4, delta);
      const wantVis = !inRoom || isRoom ? 1 : 0;
      it.vis += (wantVis - it.vis) * damp(wantVis ? 4 : 7, delta);
      if (it.vis < 0.004 && !wantVis) it.vis = 0;
      const live = wantVis > 0 || it.vis > 0;
      if (win.visible !== live || it.css.visible !== live) { win.visible = live; it.css.visible = live; }
      if (!live) continue; // fundida del todo: no se calcula nada
      const e = it.room * it.room * (3 - 2 * it.room); // 0 = en la órbita, 1 = en su lugar de la sala
      const target = it.project.id === state.hoveredId ? 1 : 0;
      it.hover.value += (target - it.hover.value) * (1 - Math.exp(-delta / (hv.duration * 0.35)));
      const hover = it.hover.value;

      // posición en el anillo + onda vertical lenta con fase propia
      const th = angleOf(it);
      const rs = state.radiusScale;
      const cx = Math.cos(th), sz = Math.sin(th);
      const wave = Math.sin(time * ring.waveSpeed + it.index * 1.9) * ring.wave * motion * (1 - e);
      const tilt = (ring.tilt || 0) * sz; // celular: el frente baja un poco
      tmpV.set(cx * ring.r * rs, ring.y + wave - tilt, sz * ring.r * rs);
      win.position.copy(tmpV);
      if (e > 0.001) win.position.lerp(roomPos, e); // de la órbita a la sala

      // qué tan de frente a la cámara está (1 = adelante, -1 = atrás)
      const facing = (cx * camLocal.x + sz * camLocal.z) / camLen;
      it.facing = facing;
      if (facing > frontFacing) { frontFacing = facing; frontItem = it; }
      const back = smoothstep(0.15, -0.85, facing); // 0 adelante ... 1 bien atrás

      // mirar siempre a la cámara + leve giro hacia afuera (perspectiva)
      win.lookAt(camPos);
      win.rotateY(-cx * WINDOWS.outwardYaw * 2.2 * (1 - e));
      win.rotateZ((Math.sin(time * 0.31 + it.index) * 0.012 * motion + Math.sin(time * 9 + it.index * 2) * state.gust) * (1 - e));

      // hover: se acerca al visitante y crece; el resto se atenúa
      if (hover > 0.001) {
        const dir = tmpDir.copy(camLocal).sub(win.position).normalize();
        win.position.addScaledVector(dir, hv.forward * hover * (1 - e));
      }
      const feat = it.project.id === state.featuredId ? 1 : 0;
      it.feat = (it.feat ?? 0) + (feat - (it.feat ?? 0)) * (1 - Math.exp(-delta * 4));
      const backScale = (1 - (1 - WINDOWS.back.scale) * back * (1 - hover)) * (1 - e) + e; // en la sala no se achica
      win.scale.setScalar(backScale * (1 + (hv.scale - 1) * hover * (1 - 0.8 * e)) * (1 + (state.featuredScale - 1) * it.feat * (1 - e)) * (1 + (it.roomScale - 1) * e));
      it.glowMat.opacity = (0.05 + Math.max(hover * 0.4, it.feat * state.featuredGlow)) * it.vis;
      it.frameMat.emissive?.setRGB(0.12 * hover, 0.1 * hover, 0.05 * hover);

      // opacidad: atrás se apaga; con hover en otro, se atenúa; el que tiene hover brilla pleno
      const dim = state.hoverMix * (1 - hover) * hv.dim * (1 - e);
      const orbitOpacity = (1 - (1 - WINDOWS.back.opacity) * back) * (1 - dim);
      const opacity = (orbitOpacity * (1 - e) + e) * it.vis;
      if (Math.abs(opacity - it.shownOpacity) > 0.01 || (opacity === 0) !== (it.shownOpacity === 0)) {
        it.el.style.opacity = opacity.toFixed(3);
        it.shadowMat.opacity = 0.75 * opacity;
        it.frameMat.opacity = Math.min(1, opacity * 1.4);
        it.shownOpacity = opacity;
      }

      // reflejo de vidrio: se mueve con el mouse (solo si cambió, para no tocar el DOM de más)
      const gx = Math.round(50 + shared.pointer.x * 40 + Math.sin(time * 0.4 + it.index) * 6);
      const gy = Math.round(30 - shared.pointer.y * 25);
      if (gx !== it.glassX || gy !== it.glassY) {
        it.el.style.setProperty('--gx', gx);
        it.el.style.setProperty('--gy', gy);
        it.glassX = gx; it.glassY = gy;
      }

      // sincronizar la capa HTML con la ventana WebGL
      win.updateMatrixWorld(true);
      win.matrixWorld.decompose(tmpV, tmpQ, tmpS);
      it.css.position.copy(tmpV);
      it.css.quaternion.copy(tmpQ);
      it.css.scale.copy(tmpS).multiplyScalar(it.pxToM);
    }
    // el destacado es el más cercano a la cámara
    state.featuredId = frontItem?.project.id ?? null;
  }

  /** Cuánto hay que correr la órbita para dejar `it` de frente (algo corrido a la derecha, para no tapar la estatua). */
  function orbitDeltaToFront(it, offset = 0) {
    group.updateWorldMatrix(true, false);
    camera.getWorldPosition(camPos);
    camLocal.copy(camPos);
    group.worldToLocal(camLocal);
    const front = Math.atan2(camLocal.z, camLocal.x) - offset;
    return wrap(front - angleOf(it));
  }

  function setVisible(v) {
    group.visible = v;
    items.forEach((it) => { it.css.visible = v; });
  }

  function dispose() {
    items.forEach((it) => {
      htmlRoot.remove(it.css);
      it.el.remove();
    });
    disposables.forEach((d) => d.dispose());
    group.removeFromParent();
  }

  /** Sala: deja la ventana de ese proyecto grande y quieta (id) o la devuelve a la órbita (null). */
  function focus(id) { state.roomId = id; }

  return { group, items, state, update, setVisible, dispose, mode, angleOf, orbitDeltaToFront, focus, roomPos };
}

// ---------- helpers ----------
export function previewSource(project) {
  if (project.embed === 'local' && project.localPath) return project.localPath;
  if (project.embed === 'iframe' && project.url) return project.url;
  return null;
}

function displayAddress(project) {
  if (project.embed === 'local' && project.localPath) return `vista local · ${project.title}`;
  if (!project.url) return project.title;
  try { const u = new URL(project.url); return u.host + (u.pathname === '/' ? '' : u.pathname); } catch { return project.url; }
}

// Sin captura (proyecto sin URL todavía): una ventana sobria con el nombre y el rubro, nada inventado.
function placeholder(project) {
  const d = document.createElement('div');
  d.className = 'ventana__placeholder';
  d.innerHTML = `<h3>${escapeHtml(project.title)}</h3><p class="ventana__kicker">${escapeHtml(project.rubro || '')}</p>`;
  return d;
}

function roundedRect(THREE, w, h, r) {
  const s = new THREE.Shape();
  const x = -w / 2, y = -h / 2;
  r = Math.min(r, w / 2, h / 2);
  s.moveTo(x + r, y);
  s.lineTo(x + w - r, y);
  s.quadraticCurveTo(x + w, y, x + w, y + r);
  s.lineTo(x + w, y + h - r);
  s.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  s.lineTo(x + r, y + h);
  s.quadraticCurveTo(x, y + h, x, y + h - r);
  s.lineTo(x, y + r);
  s.quadraticCurveTo(x, y, x + r, y);
  return new THREE.ShapeGeometry(s, 8);
}

function makeShadowTexture(THREE) {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(64, 64, 8, 64, 64, 64);
  grd.addColorStop(0, 'rgba(255,255,255,0.9)');
  grd.addColorStop(0.5, 'rgba(255,255,255,0.35)');
  grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(c);
  return t;
}

const smoothstep = (a, b, x) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

export function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
