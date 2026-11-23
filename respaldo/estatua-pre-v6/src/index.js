// Módulo ESTATUA — Dueño: [NOMBRE_2].
// La Victoria de Samotracia + proyectos web reales orbitando + apertura en segunda capa.
// Expone una API pública (ctx.apis.estatua) para que el sistema de scroll la controle.
import { gsap } from 'gsap';
import projects from '../../data/projects.json';
import { STATUE, VIEWER, ROTATE, WINDOWS } from './config.js';
import { createStatue } from './statue.js';
import { createWindows } from './windows.js';
import { createViewer } from './viewer.js';
import { createPlaque } from './plaque.js';
import './estatua.css';

export default function createEstatua(ctx) {
  const { THREE, root, camera, bus, shared, overlay, cameraRig, scroll } = ctx;

  // "Plato giratorio": estatua + proyectos giran juntos cuando el visitante arrastra.
  const turntable = new THREE.Group();
  turntable.name = 'estatua_giro';
  root.add(turntable);

  const statue = createStatue(ctx);
  turntable.add(statue.group);

  // Grupo de proyectos: separado de la estatua para poder moverlos por separado (API).
  const projectsGroup = new THREE.Group();
  projectsGroup.name = 'estatua_proyectos';
  turntable.add(projectsGroup);

  // Placa de oro en el pedestal: flota y gira junto con la estatua
  const plaque = createPlaque(ctx, { parent: statue.floatGroup, total: projects.length });

  // Accesos de teclado (invisibles hasta recibir foco)
  const a11yNav = document.createElement('nav');
  a11yNav.className = 'estatua-a11y';
  a11yNav.setAttribute('aria-label', 'Proyectos');
  overlay.append(a11yNav);

  const viewer = createViewer({
    container: overlay,
    reducedMotion: ctx.reducedMotion,
    onClose: () => onViewerClose(),
  });

  const layoutMode = () => (innerWidth < 700 || innerWidth / innerHeight < 0.9 ? 'mobile' : 'desktop');
  let windows = buildWindows(layoutMode());

  function buildWindows(mode) {
    const w = createWindows(ctx, { projects, mode });
    Object.assign(w.state, { featuredScale: ROTATE.featuredScale, featuredGlow: ROTATE.featuredGlow });
    projectsGroup.add(w.group);
    a11yNav.innerHTML = '';
    w.items.forEach((it) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.textContent = `Abrir ${it.project.title}`;
      b.addEventListener('focus', () => setHover(it.project.id));
      b.addEventListener('blur', () => setHover(null));
      b.addEventListener('click', () => openProject(it.project.id));
      a11yNav.appendChild(b);
    });
    return w;
  }

  // ---------- interacción: hover / clic con raycast ----------
  const raycaster = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  let down = null;

  function pick(e) {
    ndc.set((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1);
    raycaster.setFromCamera(ndc, camera);
    const targets = windows.items.map((it) => it.hole);
    targets.push(statue.blocker);
    const hit = raycaster.intersectObjects(targets, false)[0];
    return hit?.object?.userData?.projectId ?? null;
  }

  const interactiveTarget = (e) => e.target.closest?.('a, button, input, textarea, select, .visor, [data-no-3d]');

  function setHover(id) {
    if (windows.state.hoveredId === id) return;
    windows.state.hoveredId = id;
    shared.focusProjectId = id;
    document.documentElement.classList.toggle('is-pointing-project', !!id);
    bus.emit('project:hover', { id });
  }

  // ---------- girar 360° arrastrando (mouse o dedo) ----------
  const spin = { angle: 0, velocity: 0, dragging: false, lastX: 0, lastT: 0 };
  const spinPerPixel = () => (Math.PI * 2) / Math.max(600, innerWidth * ROTATE.fullTurnScreens);

  function onPointerMove(e) {
    if (viewer.isOpen) return;
    if (down && ROTATE.enabled) {
      const dx = e.clientX - spin.lastX;
      const totalX = Math.abs(e.clientX - down.x), totalY = Math.abs(e.clientY - down.y);
      // empieza a girar cuando el gesto es claramente horizontal
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
    if (!windows.group.visible || e.pointerType === 'touch') return;
    if (interactiveTarget(e)) { setHover(null); return; }
    setHover(pick(e));
  }
  function onPointerDown(e) {
    if (viewer.isOpen || interactiveTarget(e) || (e.pointerType === 'mouse' && e.button !== 0)) return;
    down = { x: e.clientX, y: e.clientY, t: performance.now() };
    gsap.killTweensOf(spin); // si estaba acomodándose, el visitante lo vuelve a agarrar
    spin.lastX = e.clientX;
    spin.lastT = down.t;
    spin.velocity = 0;
  }
  function endSpin() {
    const was = spin.dragging;
    if (was) document.documentElement.classList.remove('is-spinning');
    spin.dragging = false;
    if (performance.now() - spin.lastT > 80) spin.velocity = 0; // soltó quieto: sin inercia
    if (was && ROTATE.snap) snapToNearest();
  }

  // ---------- acomodarse en un proyecto ----------
  const tmpCam = new THREE.Vector3();
  const TAU = Math.PI * 2;
  const wrap = (a) => ((a % TAU) + TAU + Math.PI) % TAU - Math.PI; // a (-PI, PI]
  // ángulo (en el piso) donde se presenta el proyecto elegido: adelante, corrido a la derecha
  function frontAngle() {
    camera.getWorldPosition(tmpCam);
    return Math.atan2(tmpCam.z, tmpCam.x) - ROTATE.featuredAngle[windows.mode];
  }
  // ángulo del plato que deja la ventana `it` de frente, el más cercano a `near`
  function angleFor(it, near, orbitAhead = 0) {
    const local = windows.localAngle(it, windows.state.orbit + orbitAhead) - projectsGroup.rotation.y;
    const base = local - frontAngle();
    return near + wrap(base - near);
  }
  function orbitAheadFor(seconds) {
    return seconds * WINDOWS.orbitSpeed * windows.state.timeScale * windows.state.intensity;
  }
  function settleOn(it, from) {
    const ahead = orbitAheadFor(ROTATE.snapDuration);
    const target = angleFor(it, from, ahead);
    spin.velocity = 0;
    gsap.to(spin, { angle: target, duration: ctx.reducedMotion ? 0.01 : ROTATE.snapDuration, ease: 'power3.out', overwrite: 'auto' });
    // la órbita se frena un rato para que el proyecto elegido quede de frente
    slowTween?.kill();
    slowTween = gsap.timeline()
      .to(windows.state, { timeScale: 0, duration: 0.5, ease: 'power2.out' })
      .to(windows.state, { timeScale: 1, duration: 2.5, ease: 'power2.inOut' }, '+=7');
  }
  function snapToNearest() {
    const rest = spin.angle + spin.velocity / ROTATE.friction; // dónde frenaría solo
    let best = null, bestD = Infinity;
    for (const it of windows.items) {
      const d = Math.abs(angleFor(it, rest) - rest);
      if (d < bestD) { bestD = d; best = it; }
    }
    if (best) settleOn(best, rest);
  }
  // proyecto anterior / siguiente (flechas del teclado)
  function step(dir) {
    const order = windows.items
      .map((it) => ({ it, a: angleFor(it, spin.angle) }))
      .sort((a, b) => a.a - b.a);
    const cur = order.reduce((m, o, i) => (Math.abs(o.a - spin.angle) < Math.abs(order[m].a - spin.angle) ? i : m), 0);
    const next = order[(cur + (dir > 0 ? 1 : order.length - 1)) % order.length];
    settleOn(next.it, spin.angle);
  }
  function onKey(e) {
    if (viewer.isOpen || e.target.closest?.('input, textarea, select')) return;
    if (e.key === 'ArrowRight') { e.preventDefault(); step(-1); }
    if (e.key === 'ArrowLeft') { e.preventDefault(); step(1); }
  }
  addEventListener('keydown', onKey);

  // ventana más de frente (para destacarla y mostrarla en la placa)
  function frontmost() {
    const f = frontAngle();
    let best = null, bestD = Infinity;
    for (const it of windows.items) {
      const world = windows.localAngle(it) - projectsGroup.rotation.y - turntable.rotation.y;
      const d = Math.abs(wrap(world - f));
      if (d < bestD) { bestD = d; best = it; }
    }
    return best;
  }
  function onPointerUp(e) {
    if (!down || viewer.isOpen) { endSpin(); down = null; return; }
    const wasSpinning = spin.dragging;
    endSpin();
    if (wasSpinning) { down = null; return; }
    const moved = Math.hypot(e.clientX - down.x, e.clientY - down.y);
    const quick = performance.now() - down.t < 600;
    down = null;
    if (moved > 10 || !quick || interactiveTarget(e) || !windows.group.visible) return;
    const id = pick(e);
    if (id) openProject(id);
  }
  addEventListener('pointermove', onPointerMove, { passive: true });
  addEventListener('pointerdown', onPointerDown, { passive: true });
  addEventListener('pointerup', onPointerUp);
  addEventListener('pointercancel', onPointerCancel);
  function onPointerCancel() { endSpin(); down = null; }

  // ---------- abrir / cerrar ----------
  let slowTween = null;
  function openProject(id) {
    const it = windows.items.find((x) => x.project.id === id);
    if (!it || viewer.isOpen) return;
    setHover(id);

    // cámara: se acerca hacia la ventana elegida (la maneja el core)
    const winPos = it.win.getWorldPosition(new THREE.Vector3());
    const camState = cameraRig.getState();
    const camTarget = winPos.clone();
    const camPos = camState.position.clone().lerp(winPos, VIEWER.camera.approach);
    camPos.z = Math.max(camPos.z, winPos.z + 2.2);
    if (!ctx.reducedMotion) cameraRig.focus({ position: camPos, target: camTarget, duration: VIEWER.camera.duration });

    // la órbita sigue, pero muy lenta, de fondo
    slowTween?.kill();
    slowTween = gsap.to(windows.state, { timeScale: VIEWER.orbitSlowdown, duration: 1.2, ease: 'power2.out' });

    scroll.lock();
    document.documentElement.classList.add('is-project-open');
    viewer.show(it.project, {
      fromRect: it.el.getBoundingClientRect(),
      getReturnRect: () => it.el.getBoundingClientRect(),
    });
    bus.emit('project:open', { id });
  }

  function onViewerClose() {
    cameraRig.release({ duration: VIEWER.closeDuration + 0.3 });
    slowTween?.kill();
    slowTween = gsap.to(windows.state, { timeScale: 1, duration: 1.6, ease: 'power2.inOut' });
    scroll.unlock();
    document.documentElement.classList.remove('is-project-open');
    setHover(null);
    bus.emit('project:close', {});
  }

  // ---------- API pública (para el sistema de scroll) ----------
  const tweenOpts = (o) => ({ duration: o?.duration ?? 0, ease: o?.ease ?? 'power2.inOut', overwrite: 'auto' });
  const applyVec = (target, v, o) => {
    if (!v) return;
    const to = { x: v.x ?? target.x, y: v.y ?? target.y, z: v.z ?? target.z };
    if (o?.duration) gsap.to(target, { ...to, ...tweenOpts(o) }); else target.set(to.x, to.y, to.z);
  };
  const applyScale = (obj, s, o) => {
    if (s == null) return;
    const v = typeof s === 'number' ? { x: s, y: s, z: s } : s;
    applyVec(obj.scale, v, o);
  };

  const api = {
    /** Mueve/rota/escala la estatua. Ej: setStatue({ position:{y:1}, rotation:{y:0.4}, scale:0.8 }, { duration: 1 }) */
    setStatue({ position, rotation, scale, visible } = {}, opts) {
      applyVec(statue.group.position, position, opts);
      applyVec(statue.group.rotation, rotation, opts);
      applyScale(statue.group, scale != null ? (typeof scale === 'number' ? scale * STATUE.scale : scale) : null, opts);
      if (visible != null) statue.group.visible = visible;
    },
    /** Mueve el conjunto de proyectos (offset), cambia el radio de la órbita o la visibilidad. */
    setProjects({ position, rotation, scale, radiusScale, visible } = {}, opts) {
      applyVec(projectsGroup.position, position, opts);
      applyVec(projectsGroup.rotation, rotation, opts);
      applyScale(projectsGroup, scale, opts);
      if (radiusScale != null) gsap.to(windows.state, { radiusScale, ...tweenOpts(opts) });
      if (visible != null) { windows.setVisible(visible); if (!visible) setHover(null); }
    },
    /** Intensidad de todas las animaciones propias (0 = quieto, 1 = normal, 2 = el doble). */
    setIntensity(value, opts) {
      const t = { v: windows.state.intensity };
      gsap.to(t, { v: value, ...tweenOpts(opts), onUpdate: () => { windows.state.intensity = t.v; statue.setIntensity(t.v); } });
      if (!opts?.duration) { windows.state.intensity = value; statue.setIntensity(value); }
    },
    /** Muestra u oculta todo el módulo. */
    setVisible(v) { root.visible = v; windows.setVisible(v); },
    /** Giro del conjunto estatua + proyectos (radianes). Ej: setRotation(Math.PI, { duration: 1.5 }) */
    setRotation(angle, opts) {
      spin.velocity = 0;
      if (opts?.duration) gsap.to(spin, { angle, ...tweenOpts(opts) }); else spin.angle = angle;
    },
    /** Cámara: delega en el core (cameraRig.set). */
    setCamera(pose, opts) { cameraRig.set({ ...pose, ...opts }); },
    /** Todo junto: set({ statue, projects, intensity, visible, camera }, { duration }) */
    set({ statue: s, projects: p, intensity, visible, camera: c } = {}, opts) {
      if (s) api.setStatue(s, opts);
      if (p) api.setProjects(p, opts);
      if (intensity != null) api.setIntensity(intensity, opts);
      if (visible != null) api.setVisible(visible);
      if (c) api.setCamera(c, opts);
    },
    /** Gira hasta dejar un proyecto de frente (sin abrirlo). */
    focusProject(id) {
      const it = windows.items.find((x) => x.project.id === id);
      if (it) settleOn(it, spin.angle);
    },
    open: openProject,
    close: () => viewer.close(),
    getState() {
      return {
        statue: { position: statue.group.position.clone(), rotation: statue.group.rotation.clone(), scale: statue.group.scale.x / STATUE.scale, visible: statue.group.visible },
        projects: { position: projectsGroup.position.clone(), radiusScale: windows.state.radiusScale, visible: windows.group.visible },
        intensity: windows.state.intensity,
        rotation: spin.angle,
        openProjectId: viewer.current?.id ?? null,
        hoveredProjectId: windows.state.hoveredId,
        featuredProjectId: windows.state.featuredId,
      };
    },
    /** Promesa que se resuelve cuando la estatua es visible. */
    ready: statue.ready,
  };

  // atajo para probar desde la consola del navegador en desarrollo
  if (import.meta.env.DEV) window.estatua = api;

  // ---------- reacciones a eventos de otros ----------
  const offGust = bus.on('wind:gust', ({ strength = 0.5 } = {}) => {
    if (ctx.reducedMotion) return;
    // ráfaga: los navegadores tiemblan un instante
    gsap.fromTo(windows.state, { gust: 0.035 * strength }, { gust: 0, duration: 2.2, ease: 'power2.out', overwrite: 'auto' });
  });

  return {
    api,
    update(time, delta) {
      // inercia del giro al soltar
      if (!spin.dragging && Math.abs(spin.velocity) > 0.0005) {
        spin.angle += spin.velocity * delta;
        spin.velocity *= Math.exp(-delta * ROTATE.friction);
      }
      turntable.rotation.y += (spin.angle - turntable.rotation.y) * (1 - Math.exp(-delta * ROTATE.smoothing));
      statue.update(time, delta);

      // proyecto destacado = el que está de frente; la placa muestra ese (o el que tiene hover)
      const front = windows.group.visible ? frontmost() : null;
      windows.state.featuredId = front?.project.id ?? null;
      const shown = windows.items.find((x) => x.project.id === windows.state.hoveredId) || front;
      if (shown) plaque.show(shown.project, shown.index);
      windows.update(time, delta);
    },
    resize() {
      const mode = layoutMode();
      if (mode !== windows.mode && !viewer.isOpen) {
        const st = { ...windows.state };
        windows.dispose();
        windows = buildWindows(mode);
        Object.assign(windows.state, { orbit: st.orbit, intensity: st.intensity, radiusScale: st.radiusScale, timeScale: st.timeScale });
      }
    },
    setQuality(tier) {
      statue.setQuality(tier);
      windows.items.forEach((it) => (it.frame.castShadow = tier !== 'low'));
    },
    dispose() {
      removeEventListener('pointermove', onPointerMove);
      removeEventListener('pointerdown', onPointerDown);
      removeEventListener('pointerup', onPointerUp);
      removeEventListener('pointercancel', onPointerCancel);
      removeEventListener('keydown', onKey);
      plaque.dispose();
      offGust();
      slowTween?.kill();
      viewer.dispose();
      windows.dispose();
      statue.dispose();
      a11yNav.remove();
      if (window.estatua === api) delete window.estatua;
    },
  };
}
