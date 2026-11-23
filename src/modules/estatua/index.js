// Módulo ESTATUA — versión 3 (fotográfica).
// La Victoria v6 cae del cielo al mar. Este módulo maneja:
//   · la estatua (statue.js): mármol con oro que se DIBUJA con el scroll durante la caída (boceto sketch.js,
//     cabeza y brazos de oro parts.js, alas y piernas en el shader); al tocar el mar el oro se derrite en
//     CROMO LÍQUIDO de abajo hacia arriba; su reflejo en el agua
//   · las ventanas en órbita (orbita.js): dos anillos, una vuelta por minuto, marco de cromo; en cada sala la
//     ventana de ese proyecto pasa al frente, grande
//   · los fragmentos de cromo (fragmentos.js) que flotan en la caída y caen al agua
//   · la intro de la primera visita (intro.js)
//   · el visor (viewer.js): al hacer clic la cámara vuela a la ventana y el sitio real se abre a pantalla completa
// La cámara la mueve el core: acá solo se le pide la pose con cameraRig.set() / focus() (contrato 5 y 6).
import { gsap } from 'gsap';
import projects from '../../data/projects.json';
import { STATUE, ESCENA, ROTATE, ORBITA, REVEAL, ESTATUA_V6 } from './config.js';
import { createStatue } from './statue.js';
import { createSketch } from './sketch.js';
import { createParts } from './parts.js';
import { createOrbita } from './orbita.js';
import { createAlquimia } from './alquimia.js';
import { createIntro } from './intro.js';
import { createViewer } from './viewer.js';
import { range } from './models.js';
import { posicion, TRAMOS, ramp, bump, START, NIVEL_MAR, altura, P_CRUCE } from '../../config/historia.js';
import { sala as salaLayout, modo as layoutModo } from '../../config/layout.js';
import './estatua.css';

export default async function createEstatua(ctx) {
  if (ESTATUA_V6) return (await import('./index-v6.js')).default(ctx);
  const { THREE, root, camera, bus, shared, overlay, cameraRig, scroll, renderer, scene } = ctx;
  const reduced = ctx.reducedMotion;

  const statue = createStatue(ctx);
  root.add(statue.group);
  const alquimia = createAlquimia(ctx, { statue });
  const sketch = createSketch(ctx, { parent: statue.floatGroup });
  const parts = createParts(ctx, { parent: statue.floatGroup });
  const intro = createIntro(ctx, { statue, sketch });
  let orbita = createOrbita(ctx, { projects, mode: layoutModo() });
  const viewer = createViewer({ container: overlay, reducedMotion: reduced, onClose: () => onViewerClose() });

  // nombre del proyecto sobre la ventana de la corona con el mouse encima (Instrument Serif)
  const label = document.createElement('div');
  label.className = 'corona-nombre';
  label.setAttribute('aria-hidden', 'true');
  overlay.append(label);
  const labelPos = new THREE.Vector3();
  let labelId = null;

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

  // ---------- el dibujo dorado (v6): sigue a la caída con retraso suave ----------
  const reveal = { value: 0, target: 0, override: null };
  function stepReveal(dt) {
    const goal = reveal.override ?? reveal.target;
    const k = dt * REVEAL.speed * 1.6;
    reveal.value += Math.max(-k * 2, Math.min(k, goal - reveal.value));
    const w = reveal.value;
    if (intro.done) sketch.setOverride(range(w, REVEAL.frame));
    parts.set(range(w, REVEAL.partsLines), range(w, REVEAL.partsFill));
    statue.setWingPaint(range(w, REVEAL.wingLines), range(w, REVEAL.wingFill));
    statue.setLegs(range(w, REVEAL.legs));
  }

  // ---------- encuadres ----------
  const v = () => new THREE.Vector3();
  const C = v(), f = v(), rgt = v(), upv = v(), UP = new THREE.Vector3(0, 1, 0);
  const poseH = { p: v(), t: v() }, poseM = { p: v(), t: v() }, poseR = { p: v(), t: v() }, poseK = { p: v(), t: v() };
  const camPos = v(), camTgt = v();
  const camSet = { position: camPos, target: camTgt, minWidth: 0.01, fov: undefined };
  const baseFov = camera.fov;
  /** Pose para que la estatua (centro `center`) quede en (sx, sy) de la pantalla con alto hFrac. */
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
  const roomK = { v: 0 };
  const roomCam = { az: ESCENA.salas[0].az, alt: ESCENA.salas[0].alt, zoom: ESCENA.salas[0].zoom };
  const yaw = { room: 0 };
  const dur = () => (reduced ? 0.25 : ESCENA.saleDur);
  function setRoom(id) {
    if (id === roomId) return;
    const prev = roomId;
    roomId = id;
    orbita.state.roomId = id;
    for (const it of orbita.items) {
      const want = it.project.id === id ? 1 : 0;
      if (it.k.target === want) continue;
      it.k.target = want;
      gsap.to(it.k, { v: want, duration: dur() * 1.25, ease: 'none', overwrite: true }); // la curva la pone la órbita
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
  }
  const offSala = bus.on('sala:change', ({ id }) => setRoom(id));

  // ---------- interacción: hover / clic con raycast ----------
  const raycaster = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  const pickList = [];
  let down = null;
  function pick(e) {
    ndc.set((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1);
    raycaster.setFromCamera(ndc, camera);
    orbita.pickables(pickList);
    if (!pickList.length) return null;
    pickList.push(statue.blocker); // las que pasan por detrás de la estatua no se clickean
    const hit = raycaster.intersectObjects(pickList, false)[0];
    return hit?.object?.userData?.projectId ?? null;
  }
  const interactiveTarget = (e) => e.target.closest?.('a, button, input, textarea, select, .visor, [data-no-3d]');
  const hoverPayload = { id: null };
  function setHover(id) {
    if (orbita.state.hoveredId === id) return;
    orbita.state.hoveredId = id;
    shared.focusProjectId = id;
    document.documentElement.classList.toggle('is-pointing-project', !!id);
    hoverPayload.id = id;
    bus.emit('project:hover', hoverPayload);
  }

  // ---------- girar la estatua arrastrando (gira SOLO la estatua, con inercia) ----------
  const spin = { angle: 0, velocity: 0, dragging: false, lastX: 0, lastT: 0 };
  const spinPerPixel = () => (Math.PI * 2) / Math.max(600, innerWidth * ROTATE.fullTurnScreens);
  function onPointerMove(e) {
    if (viewer.isOpen || flying || !intro.done) return;
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
    if (viewer.isOpen || flying || !intro.done || interactiveTarget(e) || (e.pointerType === 'mouse' && e.button !== 0)) return;
    down = { x: e.clientX, y: e.clientY, t: performance.now() };
    gsap.killTweensOf(spin);
    spin.lastX = e.clientX;
    spin.lastT = down.t;
    spin.velocity = 0;
  }
  function endSpin() {
    if (spin.dragging) document.documentElement.classList.remove('is-spinning');
    spin.dragging = false;
    if (performance.now() - spin.lastT > 80) spin.velocity = 0;
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
    if (id) openProject(id);
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

  // ---------- entrar a un proyecto: la cámara vuela a la ventana y se abre el sitio a pantalla completa ----------
  let flying = false;
  const winPos = v(), winNrm = v(), flyPos = v();
  const winQ = new THREE.Quaternion(), winS = v();
  function windowScreenRect(it) {
    // rectángulo en pantalla de la ventana (sus 4 esquinas proyectadas)
    const W = it.W / 2, H = it.W / 2 / (1440 / 900);
    let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
    for (const [sx, sy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
      winS.set(sx * W, sy * H, 0);
      it.screen.localToWorld(winS).project(camera);
      const px = (winS.x * 0.5 + 0.5) * innerWidth, py = (0.5 - winS.y * 0.5) * innerHeight;
      x0 = Math.min(x0, px); y0 = Math.min(y0, py); x1 = Math.max(x1, px); y1 = Math.max(y1, py);
    }
    return { left: x0, top: y0, width: x1 - x0, height: y1 - y0 };
  }
  function openProject(id) {
    const p = projects.find((x) => x.id === id);
    const it = orbita.items.find((x) => x.project.id === id);
    if (!p || !it || viewer.isOpen || flying) return;
    setHover(id);
    scroll.lock();
    document.documentElement.classList.add('is-project-open');
    orbita.state.freeze = true;           // la ventana deja de seguir a la cámara: la cámara va hacia ella
    gsap.to(orbita.state, { timeScale: 0, duration: 0.4, ease: 'power3.inOut', overwrite: 'auto' });
    bus.emit('project:open', { id });
    // a qué distancia la ventana entra justo en la pantalla
    it.screen.updateWorldMatrix(true, false);
    it.screen.matrixWorld.decompose(winPos, winQ, winS);
    winNrm.set(0, 0, 1).applyQuaternion(winQ);
    if (winNrm.dot(flyPos.copy(camera.position).sub(winPos)) < 0) winNrm.negate();
    const t = Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2);
    const Ww = it.W * winS.x, Hw = Ww / (1440 / 900);
    const dist = Math.max(Hw / (2 * t), Ww / (2 * t * camera.aspect)) * 1.02;
    flyPos.copy(winPos).addScaledVector(winNrm, dist);
    const show = () => {
      flying = false;
      viewer.show(p, { full: true, fromRect: windowScreenRect(it), getReturnRect: () => windowScreenRect(it) });
    };
    if (reduced) { show(); return; }
    flying = true;
    cameraRig.focus({ position: flyPos, target: winPos, duration: ORBITA.enter, ease: 'power3.inOut' }).eventCallback('onComplete', show);
  }
  function onViewerClose() {
    cameraRig.release({ duration: ORBITA.enter, ease: 'power3.inOut' });
    gsap.to(orbita.state, { timeScale: 1, duration: 1.4, ease: 'power3.inOut', overwrite: 'auto' });
    setTimeout(() => { orbita.state.freeze = false; }, ORBITA.enter * 1000);
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

  // ---------- precalentado: todas las piezas compiladas y subidas, y el PRIMER cambio de sala ensayado ----------
  const PRE_ON = { on: true }, PRE_OFF = { on: false };
  let disposed = false;
  // los shaders del mármol (con oro, cromo y reflejo) tardan segundos en compilarse en algunas placas:
  // se empiezan a compilar apenas está el modelo liviano, en paralelo con la descarga del detallado
  // (dos variantes: para la pantalla y para los dibujos intermedios del resplandor y los ensayos)
  const rtCompile = new THREE.WebGLRenderTarget(4, 4, { type: THREE.HalfFloatType });
  function compileBoth() {
    const prev = renderer.getRenderTarget();
    renderer.setRenderTarget(rtCompile);
    const a = renderer.compileAsync(scene, camera);
    renderer.setRenderTarget(prev);
    const b = renderer.compileAsync(scene, camera);
    return Promise.all([a, b]).catch(() => {});
  }
  let early = Promise.resolve();
  statue.ready.then(() => { if (!disposed) early = compileBoth(); });
  // las capturas se suben a la placa apenas cargan (mientras los shaders se compilan en paralelo)
  orbita.ready.then(() => { if (!disposed) orbita.items.forEach((it) => { const t = it.uniforms.uMap.value; if (t?.image) renderer.initTexture(t); }); });
  async function prewarm() {
    if (disposed) return;
    bus.emit('precompile', PRE_ON);
    const rt = new THREE.WebGLRenderTarget(4, 4, { type: THREE.HalfFloatType });
    const hidden = [];
    root.traverse((o) => { const m = o.material; if (m) (Array.isArray(m) ? m : [m]).forEach((x) => { if (x.uniforms) for (const k in x.uniforms) { const v = x.uniforms[k].value; if (v?.isTexture && v.image) renderer.initTexture(v); } }); });
    const T = performance.now();
    const lap = (m) => import.meta.env.DEV && console.info(`[estatua] precalentado: ${m} ${Math.round(performance.now() - T)} ms`);
    try {
      await early;
      lap('compilación temprana');
      await compileBoth();
      lap('compilación completa');
      // ensayo del primer cambio de sala, fuera de cámara (a un target de 4x4): la ventana al frente, el cromo,
      // los fragmentos, el reflejo y la intro, todo una vez con sus valores de "en uso"
      const it = orbita.items[0];
      const save = { k: it.k.v, alq: statue.material.userData.uniforms.uAlq.value };
      it.k.v = 1; orbita.state.roomId = it.project.id;
      statue.setAlquimia(0.5);
      root.traverse((o) => { if (!o.visible) { hidden.push(o); o.visible = true; } });
      renderer.setRenderTarget(rt);
      renderer.render(scene, camera);
      renderer.setRenderTarget(null);
      lap('ensayo dibujado');
      it.k.v = save.k; orbita.state.roomId = roomId;
      statue.setAlquimia(save.alq);
    } catch (e) {
      console.warn('[estatua] no se pudo precalentar', e);
    } finally {
      hidden.forEach((o) => { o.visible = false; });
      rt.dispose();
      rtCompile.dispose();
      bus.emit('precompile', PRE_OFF);
    }
  }

  // ---------- API pública ----------
  let turnSpeed = 1, intensity = 1;
  const api = {
    setRotation(angle, opts) {
      spin.velocity = 0;
      if (opts?.duration) gsap.to(spin, { angle, duration: opts.duration, ease: opts.ease ?? 'power3.inOut' }); else spin.angle = angle;
    },
    /** Velocidad de la órbita (1 = una vuelta por minuto, 0 = quieta). */
    setOrbitSpeed(value) { turnSpeed = value; },
    setIntensity(value) { statue.setIntensity(value); intensity = value; },
    setVisible(vis) { root.visible = vis; },
    /** Fija a mano cuánto del dibujo dorado está hecho (0..1). null = vuelve a seguir al scroll. */
    setReveal(x) { reveal.override = x; },
    focusProject: goToRoom,
    open: openProject,
    close: () => viewer.close(),
    getState() {
      return { rotation: spin.angle, roomId, openProjectId: viewer.current?.id ?? null, hoveredProjectId: orbita.state.hoveredId, reveal: +reveal.value.toFixed(3), intro: intro.running };
    },
    ready: statue.ready,
    /** Modelo detallado (o falló), capturas y piezas listas. */
    fullReady: Promise.all([statue.fullReady, orbita.ready, parts.ready]),
    prewarm,
    /** La intro arranca cuando se va el velo (main.js). */
    startIntro: () => intro.play(),
  };
  if (import.meta.env.DEV) window.estatua = api;

  // ---------- cada cuadro ----------
  const sizePx = { w: innerWidth, h: innerHeight };
  const tmpC = new THREE.Color();
  const sunV = new THREE.Vector3();
  let lastAlt = altura(0.5), fallSpeed = 0, lastFov = baseFov;
  return {
    api,
    update(time, delta, st) {
      const dt = Math.min(delta, 1 / 30);
      const P = posicion(st);
      const mode = layoutModo(sizePx.w, sizePx.h);
      const L = salaLayout(sizePx.w, sizePx.h);
      const motion = reduced ? 0 : intensity;
      intro.update(st?.velocity || 0);

      // ---- guion ----
      const alt = altura(P);
      const seaY = NIVEL_MAR - alt;
      const vfall = dt > 0 ? Math.abs(lastAlt - alt) / dt : 0;
      lastAlt = alt;
      fallSpeed += (vfall - fallSpeed) * (1 - Math.exp(-dt * 5));
      const arrive = ramp(P, TRAMOS.llegada);
      const night = ramp(P, TRAMOS.noche);
      const alq = ramp(P, TRAMOS.alquimia);
      const descentYaw = 0.55 * ramp(P, [0.9, START.obras]);

      // ---- dibujo dorado y cromo ----
      reveal.target = ramp(P, TRAMOS.oro);
      stepReveal(dt);
      sketch.update(time, dt);
      parts.update(time);
      statue.setAlquimia(alq);
      parts.setBloom(0.16 * (1 - (shared.niebla || 0)));
      sketch.setBright(1 - alq);

      // ---- giro con inercia ----
      if (!spin.dragging && Math.abs(spin.velocity) > 0.0005) {
        spin.angle += spin.velocity * dt;
        spin.velocity *= Math.exp(-dt * ROTATE.friction);
      }
      statue.spin.rotation.y += (spin.angle - statue.spin.rotation.y) * (1 - Math.exp(-dt * ROTATE.smoothing));

      // ---- pose: flota en el cielo, gira hacia la ventana en las salas, se posa en la orilla ----
      const baseY = STATUE.position.y + (ESCENA.landY - STATUE.position.y) * night;
      statue.group.position.set(0, baseY, 0);
      statue.group.rotation.y = descentYaw + yaw.room * (1 - night) + ESCENA.yawContacto * night;
      statue.update(time, dt);
      alquimia.update(time, dt, { baseY, alq, vis: (1 - night * 0.55) * (1 - intro.cover), room: roomK.v, motion: motion ? 1 : 0 });
      if (shared.sol) {
        tmpC.copy(shared.sol.color);
        statue.setRimColor(tmpC);
        statue.setRimScale((0.45 + 0.45 * arrive) * (1 - night * 0.6) * (1 - alq * 0.4));
        statue.setSun(sunV.copy(shared.sol.dir).transformDirection(camera.matrixWorldInverse), tmpC);
        statue.setGoldGlow((0.14 + 0.22 * arrive) * (1 - (shared.niebla || 0)) * (1 - 0.75 * alq));
      }
      // reflejo en el agua: cuando la estatua está cerca del mar
      statue.setReflection((1 - Math.min(1, alt / 7)) * ramp(P, TRAMOS.mar), seaY, time);

      // ---- cámara: hero → mar → sala → orilla (+ la caída: se abre el campo y tiembla con la velocidad) ----
      C.set(0, baseY + ESCENA.center, 0);
      const h = ESCENA.hero[mode], m = ESCENA.mar[mode], k = ESCENA.contacto[mode];
      frame(poseH, C, h.screen[0], h.screen[1], h.h, h.az, h.alt);
      frame(poseM, C, m.screen[0], m.screen[1], m.h, m.az, m.alt);
      frame(poseR, C, L.statue.x, L.statue.y, L.statue.h, roomCam.az, roomCam.alt, roomCam.zoom);
      frame(poseK, C, k.screen[0], k.screen[1], k.h, k.az, k.alt);
      camPos.copy(poseH.p).lerp(poseM.p, arrive).lerp(poseR.p, roomK.v).lerp(poseK.p, night);
      camTgt.copy(poseH.t).lerp(poseM.t, arrive).lerp(poseR.t, roomK.v).lerp(poseK.t, night);
      if (!reduced) {
        const sh = ESCENA.caida.shake * Math.min(1, fallSpeed / 50);
        camPos.x += (Math.sin(time * 23.1) * 0.6 + Math.sin(time * 37.7) * 0.4) * sh;
        camPos.y += (Math.sin(time * 29.3 + 1.3) * 0.6 + Math.sin(time * 41.9) * 0.4) * sh;
      }
      const fov = baseFov + ESCENA.caida.fov * bump(P, TRAMOS.atravesar) * (reduced ? 0 : 1);
      camSet.fov = Math.abs(fov - lastFov) > 0.01 ? fov : undefined;
      if (camSet.fov) lastFov = fov;
      cameraRig.set(camSet);

      // ---- ventanas en órbita (se esperan a que termine la intro; se van a la noche) ----
      if (orbita.mode !== mode && !viewer.isOpen && !flying) {
        const keepState = { ...orbita.state };
        const ks = orbita.items.map((it) => ({ v: it.k.v, target: it.k.target }));
        orbita.dispose();
        orbita = createOrbita(ctx, { projects, mode });
        Object.assign(orbita.state, { orbit: keepState.orbit, roomId: keepState.roomId });
        orbita.items.forEach((it, i) => Object.assign(it.k, ks[i]));
      }
      orbita.group.position.set(0, baseY, 0);
      orbita.state.radiusScale = ESCENA.orbitaHero + (1 - ESCENA.orbitaHero) * arrive;
      orbita.update(time, dt, {
        visible: (1 - night) * (1 - intro.cover),
        rect: L.win, w: sizePx.w, h: sizePx.h, motion: motion * turnSpeed, gust: gust.v,
        avoid: null,
      });
      // la etiqueta con el nombre
      const hid = orbita.state.hoveredId;
      if (hid && !roomId && !viewer.isOpen && !flying) {
        const it = orbita.items.find((x) => x.project.id === hid);
        if (it) {
          if (labelId !== hid) { labelId = hid; label.textContent = it.project.title; }
          orbita.anchor(it, labelPos);
          label.style.transform = `translate3d(${labelPos.x.toFixed(1)}px, ${labelPos.y.toFixed(1)}px, 0) translate(-50%, -100%)`;
          label.classList.add('is-on');
        }
      } else if (labelId !== null) { labelId = null; label.classList.remove('is-on'); }

      // ---- lente: profundidad de campo (solo high). El foco pasa suave de la estatua a la ventana de la sala ----
      const dStatue = camera.position.distanceTo(C);
      shared.lente.dof = 0.55 * roomK.v * (viewer.isOpen || flying ? 0 : 1);
      // en la sala el foco va a la ventana, con un rango que todavía abarca la estatua: solo se va el fondo lejano
      shared.lente.focus = dStatue + (ORBITA.frontDist - dStatue) * roomK.v;
      shared.lente.focusRange = 7 + (Math.max(3, Math.abs(dStatue - ORBITA.frontDist) * 1.6 + 1.5) - 7) * roomK.v;
      shared.lente.rect = L.win;
    },
    resize(w, h) {
      sizePx.w = w; sizePx.h = h;
      alquimia.resize();
      cameraRig.snap();
    },
    setQuality(tier) {
      statue.setQuality(tier);
      alquimia.setQuality(tier);
      parts.setQuality(tier);
    },
    dispose() {
      disposed = true;
      offSala(); offGust();
      removeEventListener('pointermove', onPointerMove);
      removeEventListener('pointerdown', onPointerDown);
      removeEventListener('pointerup', onPointerUp);
      removeEventListener('pointercancel', onPointerCancel);
      document.documentElement.classList.remove('is-spinning', 'is-pointing-project', 'is-project-open');
      gsap.killTweensOf([roomK, roomCam, yaw, gust, spin, orbita.state]);
      orbita.items.forEach((it) => gsap.killTweensOf(it.k));
      viewer.dispose();
      intro.dispose();
      orbita.dispose();
      alquimia.dispose();
      label.remove();
      sketch.dispose();
      parts.dispose();
      statue.dispose();
      statue.group.removeFromParent();
      a11yNav.remove();
      if (window.estatua === api) delete window.estatua;
    },
  };
}
