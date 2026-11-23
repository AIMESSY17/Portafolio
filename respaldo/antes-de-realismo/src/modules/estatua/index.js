// Módulo ESTATUA — "HECHA DE LUZ".
// La Victoria de Samotracia baja del cielo al mar. Este módulo maneja:
//   · la estatua (statue.js): mármol blanco iluminado en dorado, flota ±4 cm cada 6 s, se gira arrastrando
//   · las alas de luz (alas.js): partículas doradas e iridiscentes que se lleva el viento
//   · el tótem de obras (totem.js): las 7 pantallas con la captura de cada sitio
//   · el visor (viewer.js): el sitio real en un iframe, solo al hacer clic
//   · la coreografía con el scroll (config/historia.js): encuadres del hero, el mar, cada sala y Contacto
// La cámara la mueve el core: acá solo se le pide la pose con cameraRig.set() (contrato 5 y 6).
import { gsap } from 'gsap';
import projects from '../../data/projects.json';
import { STATUE, ESCENA, ROTATE, VIEWER, TOTEM, ESTATUA_V6 } from './config.js';
import { createStatue } from './statue.js';
import { createAlas } from './alas.js';
import { createTotem } from './totem.js';
import { createViewer } from './viewer.js';
import { posicion, TRAMOS, ramp, START, NIVEL_MAR } from '../../config/historia.js';
import { sala as salaLayout, modo as layoutModo } from '../../config/layout.js';
import './estatua.css';

export default async function createEstatua(ctx) {
  if (ESTATUA_V6) return (await import('./index-v6.js')).default(ctx);
  const { THREE, root, camera, bus, shared, overlay, cameraRig, scroll } = ctx;
  const reduced = ctx.reducedMotion;

  const statue = createStatue(ctx);
  root.add(statue.group);
  const alas = createAlas(ctx, { statue });
  const totem = createTotem(ctx, { projects, mode: 'desktop' });
  statue.ready.then(() => alas.buildEmitters(statue.lod0Geometry));

  const viewer = createViewer({ container: overlay, reducedMotion: reduced, onClose: () => onViewerClose() });

  // accesos de teclado (invisibles hasta recibir foco)
  const a11yNav = document.createElement('nav');
  a11yNav.className = 'estatua-a11y';
  a11yNav.setAttribute('aria-label', 'Proyectos');
  projects.forEach((p) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = `Abrir ${p.title}`;
    b.addEventListener('click', () => openProject(p.id));
    a11yNav.appendChild(b);
  });
  overlay.append(a11yNav);

  // ---------- encuadres ----------
  const v = () => new THREE.Vector3();
  const C = v(), f = v(), rgt = v(), upv = v(), UP = new THREE.Vector3(0, 1, 0);
  const poseH = { p: v(), t: v() }, poseM = { p: v(), t: v() }, poseR = { p: v(), t: v() }, poseK = { p: v(), t: v() };
  const camPos = v(), camTgt = v();
  const camSet = { position: camPos, target: camTgt, minWidth: 0.01 };
  /** Arma una pose para que la estatua (centro `center`) quede en (sx, sy) de la pantalla con alto hFrac. */
  function frame(out, center, sx, sy, hFrac, az, alt, zoom = 1) {
    const t = Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2);
    const d = (ESCENA.bodyH / (hFrac * 2 * t)) * zoom;
    const horiz = Math.sqrt(Math.max(0.01, d * d - alt * alt));
    out.p.set(center.x + Math.sin(az) * horiz, center.y + alt, center.z + Math.cos(az) * horiz);
    f.copy(center).sub(out.p).normalize();
    rgt.crossVectors(f, UP).normalize();
    upv.crossVectors(rgt, f);
    const visH = 2 * d * t, visW = visH * cameraRig.aspect;
    out.t.copy(center).addScaledVector(rgt, (0.5 - sx) * visW).addScaledVector(upv, (sy - 0.5) * visH);
    return out;
  }

  // ---------- salas ----------
  let roomId = null;
  const roomK = { v: 0 };                                  // 0 = sobre el mar / 1 = en las salas
  const roomCam = { az: ESCENA.salas[0].az, alt: ESCENA.salas[0].alt, zoom: ESCENA.salas[0].zoom };
  const yaw = { room: 0 };
  const dur = () => (reduced ? 0.25 : ESCENA.saleDur);
  const offSala = bus.on('sala:change', ({ id }) => {
    if (id === roomId) return;
    const prev = roomId;
    roomId = id;
    totem.state.roomId = id;
    for (const it of totem.items) {
      const want = it.project.id === id ? 1 : 0;
      if (it.k.target === want) continue;
      it.k.target = want;
      gsap.to(it.k, { v: want, duration: dur(), ease: 'none', overwrite: true }); // la curva la pone el tótem (power3.inOut)
    }
    if (id) {
      const i = projects.findIndex((p) => p.id === id);
      const pr = ESCENA.salas[(i < 0 ? 0 : i) % ESCENA.salas.length];
      if (prev === null) { roomCam.az = pr.az; roomCam.alt = pr.alt; roomCam.zoom = pr.zoom; }
      else gsap.to(roomCam, { az: pr.az, alt: pr.alt, zoom: pr.zoom, duration: dur(), ease: 'power3.inOut', overwrite: true });
    }
    gsap.to(roomK, { v: id ? 1 : 0, duration: dur(), ease: 'power3.inOut', overwrite: true });
    gsap.to(yaw, { room: id ? ESCENA.yawSala : 0, duration: dur() * 1.2, ease: 'power3.inOut', overwrite: true });
    if (!id) setHover(null);
  });

  // ---------- interacción: hover / clic con raycast ----------
  const raycaster = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  const pickList = [];
  let down = null;
  function pick(e) {
    ndc.set((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1);
    raycaster.setFromCamera(ndc, camera);
    totem.pickables(pickList);
    if (!pickList.length) return null;
    pickList.push(statue.blocker); // las que pasan por detrás de la estatua no se clickean
    const hit = raycaster.intersectObjects(pickList, false)[0];
    return hit?.object?.userData?.projectId ?? null;
  }
  const interactiveTarget = (e) => e.target.closest?.('a, button, input, textarea, select, .visor, [data-no-3d]');
  function setHover(id) {
    if (totem.state.hoveredId === id) return;
    totem.state.hoveredId = id;
    shared.focusProjectId = id;
    document.documentElement.classList.toggle('is-pointing-project', !!id);
    bus.emit('project:hover', HOVER_PAYLOAD(id));
  }
  const hoverPayload = { id: null };
  const HOVER_PAYLOAD = (id) => { hoverPayload.id = id; return hoverPayload; };

  // ---------- girar la estatua arrastrando (mouse o dedo) ----------
  // Gira SOLO la estatua, con inercia y sin "snap". Arrastrando salen más alas de luz.
  const spin = { angle: 0, velocity: 0, dragging: false, lastX: 0, lastT: 0 };
  const spinPerPixel = () => (Math.PI * 2) / Math.max(600, innerWidth * ROTATE.fullTurnScreens);
  function onPointerMove(e) {
    if (viewer.isOpen) return;
    if (down && ROTATE.enabled) {
      const dx = e.clientX - spin.lastX;
      const totalX = Math.abs(e.clientX - down.x), totalY = Math.abs(e.clientY - down.y);
      if (!spin.dragging && totalX > 6 && totalX > totalY) {
        spin.dragging = true;
        setHover(null);
        document.documentElement.classList.add('is-spinning');
      }
      if (spin.dragging) {
        const now = performance.now();
        const step = dx * spinPerPixel();
        spin.angle += step;
        const dt = Math.max(1, now - spin.lastT) / 1000;
        spin.velocity = spin.velocity * 0.6 + (step / dt) * 0.4;
        spin.lastX = e.clientX;
        spin.lastT = now;
        return;
      }
      spin.lastX = e.clientX;
    }
    if (e.pointerType === 'touch') return;
    if (interactiveTarget(e)) { setHover(null); return; }
    setHover(pick(e));
  }
  function onPointerDown(e) {
    if (viewer.isOpen || interactiveTarget(e) || (e.pointerType === 'mouse' && e.button !== 0)) return;
    down = { x: e.clientX, y: e.clientY, t: performance.now() };
    gsap.killTweensOf(spin);
    spin.lastX = e.clientX;
    spin.lastT = down.t;
    spin.velocity = 0;
  }
  function endSpin() {
    if (spin.dragging) document.documentElement.classList.remove('is-spinning');
    spin.dragging = false;
    if (performance.now() - spin.lastT > 80) spin.velocity = 0; // soltó quieto: sin inercia
  }
  function onPointerUp(e) {
    if (!down || viewer.isOpen) { endSpin(); down = null; return; }
    const was = spin.dragging;
    endSpin();
    if (was) { down = null; return; }
    const moved = Math.hypot(e.clientX - down.x, e.clientY - down.y);
    const quick = performance.now() - down.t < 600;
    down = null;
    if (moved > 10 || !quick || interactiveTarget(e)) return;
    const id = pick(e);
    if (!id) return;
    if (id === roomId) openProject(id); // la ventana de la sala abre el sitio real
    else goToRoom(id);                  // una del tótem lleva a su sala
  }
  function onPointerCancel() { endSpin(); down = null; }
  addEventListener('pointermove', onPointerMove, { passive: true });
  addEventListener('pointerdown', onPointerDown, { passive: true });
  addEventListener('pointerup', onPointerUp);
  addEventListener('pointercancel', onPointerCancel);

  /** Lleva el scroll a la sala del proyecto. */
  function goToRoom(id) {
    const i = projects.findIndex((p) => p.id === id);
    const el = document.querySelector('[data-section="obras"]');
    if (i < 0 || !el) return;
    const y = el.offsetTop + (el.offsetHeight / projects.length) * i + 2;
    scroll.scrollTo(y, { duration: reduced ? 0 : 1.6 });
  }

  // ---------- abrir / cerrar (el sitio real, solo al hacer clic) ----------
  const rectOf = () => {
    const r = salaLayout().win;
    return { left: r.x, top: r.y, width: r.w, height: r.h };
  };
  function openProject(id) {
    const p = projects.find((x) => x.id === id);
    if (!p || viewer.isOpen) return;
    if (roomId !== id) { goToRoom(id); setTimeout(() => openProject(id), reduced ? 50 : 1700); return; }
    scroll.lock();
    document.documentElement.classList.add('is-project-open');
    viewer.show(p, { fromRect: rectOf(), getReturnRect: rectOf });
    bus.emit('project:open', { id });
  }
  function onViewerClose() {
    scroll.unlock();
    document.documentElement.classList.remove('is-project-open');
    setHover(null);
    bus.emit('project:close', {});
  }

  // ---------- reacciones ----------
  const gust = { v: 0 };
  const offGust = bus.on('wind:gust', ({ strength = 0.5 } = {}) => {
    if (reduced) return;
    gsap.fromTo(gust, { v: strength }, { v: 0, duration: 2.4, ease: 'power3.inOut', overwrite: true });
  });

  // ---------- API pública ----------
  const api = {
    /** Giro de la ESTATUA sola (radianes). Ej: setRotation(Math.PI, { duration: 1.5 }) */
    setRotation(angle, opts) {
      spin.velocity = 0;
      if (opts?.duration) gsap.to(spin, { angle, duration: opts.duration, ease: opts.ease ?? 'power3.inOut' }); else spin.angle = angle;
    },
    /** Velocidad de giro del tótem (1 = normal, 0 = quieto). */
    setOrbitSpeed(value) { turnSpeed = value; },
    /** Intensidad de los movimientos propios (0 = quieto, 1 = normal). */
    setIntensity(value) { statue.setIntensity(value); intensity = value; },
    /** Muestra u oculta todo el módulo. */
    setVisible(vis) { root.visible = vis; },
    /** Lleva el scroll a la sala de un proyecto. */
    focusProject: goToRoom,
    open: openProject,
    close: () => viewer.close(),
    getState() {
      return { rotation: spin.angle, roomId, openProjectId: viewer.current?.id ?? null, hoveredProjectId: totem.state.hoveredId };
    },
    ready: statue.ready,
    /** Se resuelve cuando está el modelo detallado (o falló) y las capturas del tótem. */
    fullReady: Promise.all([statue.fullReady, totem.ready]),
  };
  if (import.meta.env.DEV) window.estatua = api;
  let turnSpeed = 1, intensity = 1;

  // ---------- cada cuadro ----------
  const sizePx = { w: innerWidth, h: innerHeight };
  const tmpC = new THREE.Color();
  const totemSala = new THREE.Vector3(), totemMar = new THREE.Vector3();
  return {
    api,
    update(time, delta, st) {
      const dt = Math.min(delta, 1 / 30);
      const P = posicion(st);
      const mode = layoutModo(sizePx.w, sizePx.h);
      const L = salaLayout(sizePx.w, sizePx.h);
      const motion = reduced ? 0 : intensity;

      // ---- guion ----
      const arrive = ramp(P, TRAMOS.llegada);
      const night = ramp(P, TRAMOS.noche);
      const assemble = ramp(P, TRAMOS.totem);
      const descentYaw = 0.55 * ramp(P, [TRAMOS.derretir[0], START.obras]);

      // ---- giro con inercia ----
      if (!spin.dragging && Math.abs(spin.velocity) > 0.0005) {
        spin.angle += spin.velocity * dt;
        spin.velocity *= Math.exp(-dt * ROTATE.friction);
      }
      statue.spin.rotation.y += (spin.angle - statue.spin.rotation.y) * (1 - Math.exp(-dt * ROTATE.smoothing));

      // ---- pose de la estatua: flota en el cielo, gira hacia la ventana en las salas, se posa en la orilla ----
      const baseY = STATUE.position.y + (ESCENA.landY - STATUE.position.y) * night;
      statue.group.position.set(0, baseY, 0);
      statue.group.rotation.y = descentYaw + yaw.room * (1 - night) + ESCENA.yawContacto * night;
      statue.update(time, dt);
      statue.setLight(ramp(P, [TRAMOS.noche[0] + 0.1, TRAMOS.noche[1]]), NIVEL_MAR, time);
      if (shared.sol) {
        tmpC.copy(shared.sol.color);
        statue.setRimColor(tmpC);
        statue.setRimScale((0.55 + 0.65 * arrive) * (1 - night));
        statue.setGoldGlow(0.14 + 0.36 * arrive);
      }

      // ---- cámara: hero → mar → sala → orilla ----
      C.set(0, baseY + ESCENA.center, 0);
      const h = ESCENA.hero[mode], m = ESCENA.mar[mode], k = ESCENA.contacto[mode];
      frame(poseH, C, h.screen[0], h.screen[1], h.h, h.az, h.alt);
      frame(poseM, C, m.screen[0], m.screen[1], m.h, m.az, m.alt);
      frame(poseR, C, L.statue.x, L.statue.y, L.statue.h, roomCam.az, roomCam.alt, roomCam.zoom);
      frame(poseK, C, k.screen[0], k.screen[1], k.h, k.az, k.alt);
      camPos.copy(poseH.p).lerp(poseM.p, arrive).lerp(poseR.p, roomK.v).lerp(poseK.p, night);
      camTgt.copy(poseH.t).lerp(poseM.t, arrive).lerp(poseR.t, roomK.v).lerp(poseK.t, night);
      cameraRig.set(camSet);

      // ---- tótem: se arma al llegar al mar al lado de la estatua; en las salas se corre atrás de ella,
      //      del otro lado de la ventana (sigue girando, sin tapar el texto); se va a la noche ----
      const pl = TOTEM.place[mode];
      const ms = mode === 'mobile' ? TOTEM.width.mobile / TOTEM.width.desktop : 1;
      const ts = pl.sala;
      const tt = Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2);
      const vh = 2 * ts.dist * tt, vw = vh * cameraRig.aspect;
      totemSala.set((ts.screen[0] - 0.5) * vw, (0.5 - ts.screen[1]) * vh, -ts.dist).applyMatrix4(camera.matrixWorld);
      totemMar.set(pl.mar[0], pl.mar[1], pl.mar[2]);
      totem.group.position.lerpVectors(totemMar, totemSala, roomK.v);
      totem.group.scale.setScalar(ms * (1 + (ts.scale - 1) * roomK.v));
      totem.update(time, dt, { assemble, visible: 1 - night, rect: L.win, w: sizePx.w, h: sizePx.h, motion: motion * turnSpeed, turnBoost: gust.v });

      // ---- alas de luz ----
      // de día se pintan encima (si no, la luz sobre un cielo blanco no se ve); al atardecer y de noche se suman
      const sunsetK = ramp(P, TRAMOS.atardecer);
      const over = 0.85 * (1 - sunsetK) + 0.25 * (1 - night) * sunsetK;
      const glow = ((1 - sunsetK) + sunsetK * (0.32 + 0.4 * night)) * (1 - 0.35 * roomK.v);
      // en las salas salen menos: el protagonista es el trabajo
      alas.update(time, dt, { spinVel: spin.dragging || Math.abs(spin.velocity) > 0.01 ? spin.velocity : 0, dragging: spin.dragging, amount: 1 - 0.45 * roomK.v, reduced, over, glow });
    },
    resize(w, h) {
      sizePx.w = w; sizePx.h = h;
      alas.resize();
      cameraRig.snap();
    },
    setQuality(tier) {
      statue.setQuality(tier);
      alas.setQuality(tier);
    },
    dispose() {
      offSala(); offGust();
      removeEventListener('pointermove', onPointerMove);
      removeEventListener('pointerdown', onPointerDown);
      removeEventListener('pointerup', onPointerUp);
      removeEventListener('pointercancel', onPointerCancel);
      document.documentElement.classList.remove('is-spinning', 'is-pointing-project', 'is-project-open');
      gsap.killTweensOf([roomK, roomCam, yaw, gust, spin]);
      totem.items.forEach((it) => gsap.killTweensOf(it.k));
      viewer.dispose();
      totem.dispose();
      alas.dispose();
      statue.dispose();
      statue.group.removeFromParent();
      a11yNav.remove();
      if (window.estatua === api) delete window.estatua;
    },
  };
}
