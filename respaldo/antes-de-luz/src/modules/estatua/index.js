// Módulo ESTATUA — Dueño: [NOMBRE_2].
// La Victoria de Samotracia (v6) + proyectos web reales orbitando + apertura en segunda capa.
// Expone una API pública (ctx.apis.estatua) para que el sistema de scroll la controle.
//
// Qué hace con el scroll (REVEAL en config.js): entre "Proyectos" y "Contacto" el oro avanza solo:
// se dibuja el boceto, la cabeza y los brazos se separan y se rellenan, las alas se pintan desde la
// punta y el oro sube por las piernas. En "Sobre nosotros" la cámara se acerca a la cabeza dorada.
// En "Contacto" la estatua baja y aparecen dos torsos partidos.
import { gsap } from 'gsap';
import projects from '../../data/projects.json';
import { sections } from '../../config/sections.js';
import { STATUE, VIEWER, ROTATE, REVEAL, SALA } from './config.js';
import { createStatue } from './statue.js';
import { createWindows } from './windows.js';
import { createViewer } from './viewer.js';
import { createPlaque } from './plaque.js';
import { createSketch } from './sketch.js';
import { createParts } from './parts.js';
import { createAbout } from './about.js';
import { createTorsos } from './torsos.js';
import { range, smooth } from './models.js';
import './estatua.css';

export default function createEstatua(ctx) {
  const { THREE, root, camera, bus, shared, overlay, cameraRig, scroll, renderer, scene } = ctx;

  const statue = createStatue(ctx);
  // grupo de sala: mueve/achica la estatua cuando se entra a una sala (la API controla statue.group aparte)
  const roomGroup = new THREE.Group();
  roomGroup.name = 'estatua_sala';
  root.add(roomGroup);
  roomGroup.add(statue.group);

  // La órbita de proyectos sigue a la estatua (si sube, baja o se corre por scroll/API) pero NO gira con ella.
  const follow = new THREE.Group();
  follow.name = 'estatua_orbita';
  root.add(follow);
  // Grupo de proyectos: separado para poder moverlos por separado (API).
  const projectsGroup = new THREE.Group();
  projectsGroup.name = 'estatua_proyectos';
  follow.add(projectsGroup);

  // Placa de oro en el pedestal, boceto y partes de oro: flotan y giran junto con la estatua
  const plaque = createPlaque(ctx, { parent: statue.floatGroup, total: projects.length });
  const sketch = createSketch(ctx, { parent: statue.floatGroup });
  const parts = createParts(ctx, { parent: statue.floatGroup });
  const about = createAbout(ctx);
  const torsos = createTorsos(ctx, { statue });

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
  let roomId = null;
  let windows = buildWindows(layoutMode());

  function buildWindows(mode) {
    const w = createWindows(ctx, { projects, mode });
    Object.assign(w.state, { featuredScale: ROTATE.featuredScale, featuredGlow: ROTATE.featuredGlow });
    projectsGroup.add(w.group);
    w.focus(roomId); // si se reconstruye (cambio escritorio/celular) en medio de una sala
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

  // ---------- coreografía con el scroll ----------
  // reveal: 0..1, qué tanto del dibujo dorado está hecho. Sigue al scroll con retraso suave.
  const reveal = { value: 0, target: 0, override: null };
  // Posición de cada sección en pantallas (100vh) desde el tope de la página: sirve para medir distancias
  // al centro de la pantalla en unidades que no dependen del alto de cada sección.
  const secIdx = (id) => sections.findIndex((x) => x.id === id);
  const starts = [];
  sections.reduce((acc, x, i) => { starts[i] = acc; return acc + x.height; }, 0);
  const I = { from: secIdx(REVEAL.sections.from), to: secIdx(REVEAL.sections.to), about: secIdx(REVEAL.about.section), contact: secIdx(REVEAL.contact.section) };
  /** Pantallas entre el centro de la pantalla y el inicio de la sección `idx` (negativo = todavía no llegó). */
  function screensFrom(st, idx) {
    if (!st || idx < 0) return -1e3;
    return starts[st.section] + st.sectionProgress * sections[st.section].height - starts[idx];
  }
  function revealFromScroll(st) {
    const { from, to } = I;
    if (st.section < from) return st.section === from - 1 ? Math.max(0, st.sectionProgress - 0.6) * 0.1 : 0;
    if (st.section >= to) return 1;
    return Math.min(1, (st.section - from + st.sectionProgress) / (to - from));
  }
  function stepReveal(delta) {
    const goal = reveal.override ?? reveal.target;
    const k = delta * REVEAL.speed;
    reveal.value += Math.max(-k * 2, Math.min(k, goal - reveal.value));
    const w = reveal.value;
    sketch.setOverride(range(w, REVEAL.frame));
    parts.set(range(w, REVEAL.partsLines), range(w, REVEAL.partsFill));
    statue.setWingPaint(range(w, REVEAL.wingLines), range(w, REVEAL.wingFill));
    statue.setLegs(range(w, REVEAL.legs));
  }

  // ---------- salas ----------
  // `room.k` (0..1) lo anima UN tween reutilizado (GSAP, ticker único): play al entrar a la primera sala,
  // reverse al volver al hero o ir a contacto. Entre salas no se mueve: solo cambia la ventana.
  const room = { k: 0 };
  let contactE = 0; // descenso de la estatua en Contacto (0..1), lo calcula sceneByScroll
  const roomTween = gsap.to(room, { k: 1, duration: SALA.duration, ease: 'power3.inOut', paused: true });
  const offSala = bus.on('sala:change', ({ id }) => {
    if (id === roomId) return; // las actualizaciones de progress no cambian nada acá
    const was = roomId !== null;
    roomId = id;
    windows.focus(id);
    if (id !== null && !was) roomTween.play(); else if (id === null && was) roomTween.reverse();
  });
  function applyRoom() {
    const p = SALA[windows.mode].statue, k = room.k;
    roomGroup.position.set(p.x * k, p.y * k, 0);
    roomGroup.scale.setScalar(1 + (p.scale - 1) * k);
    const bright = (1 + (p.bright - 1) * k) * (1 - smooth(0.6, 0.9, contactE)); // las salas la bajan; en Contacto se apaga al bajar
    statue.setBright(bright);
    parts.setBright(bright);
    sketch.setBright(bright);
  }

  let windowsShown = true;
  let lastDrop = 0;
  let contactW = 0;
  function sceneByScroll(time, delta, st) {
    const portrait = innerWidth / innerHeight < 0.9;
    // pesos por sección (la posición se mide con el centro de la pantalla, en pantallas de 100vh)
    const dAbout = screensFrom(st, I.about), dContact = screensFrom(st, I.contact);
    const wAbout = I.about < 0 ? 0 : smooth(...REVEAL.about.in, dAbout) * (1 - smooth(...REVEAL.about.out, dAbout));
    const wContact = smooth(...REVEAL.contact.range, dContact);

    about.update(time, delta, wAbout, portrait, viewer.isOpen);

    // ventanas: se apartan en el zoom y se van en Contacto
    windows.state.radiusScale = 1 + about.shotWeight * 1.7 + wContact * 2.2;
    const show = wContact < 0.55 && about.shotWeight < 0.5;
    if (show !== windowsShown) { windows.setVisible(show); windowsShown = show; if (!show) setHover(null); }

    // contacto: la estatua baja y aparecen los torsos (se suma sobre lo que la API haya puesto)
    const e = wContact * wContact * (3 - 2 * wContact);
    contactE = e;
    const drop = e * REVEAL.contactDrop;
    statue.group.position.y += lastDrop - drop;
    lastDrop = drop;
    // se esconde el modelo, NO el grupo con las luces de contorno (cambiar la cantidad de luces recompila todo)
    statue.spin.visible = e < 0.9; // ya bajó del piso: se esconde (el bloom no tiene piso que la tape)
    statue.setRimScale((1 - e) * (1 - 0.5 * room.k));
    contactW = wContact;
    torsos.update(time, wContact, e, portrait, torsoSpin.angle, spin.dragging && contactW > 0.5);
  }

  // ---------- interacción: hover / clic con raycast ----------
  const pickTargets = [];
  const raycaster = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  let down = null;

  // Los navegadores que pasan por detrás de la estatua NO se pueden clickear: la estatua
  // (statue.blocker) está en la lista del raycast y, al estar más cerca, se queda con el golpe.
  function pick(e) {
    ndc.set((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1);
    raycaster.setFromCamera(ndc, camera);
    pickTargets.length = 0;
    for (const it of windows.items) if (it.win.visible && it.vis > 0.5) pickTargets.push(it.hole); // las fundidas no se clickean
    pickTargets.push(statue.blocker);
    const hit = raycaster.intersectObjects(pickTargets, false)[0];
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

  // ---------- girar la estatua arrastrando (mouse o dedo) ----------
  // Gira SOLO la estatua, con inercia y sin "snap". En Contacto el mismo gesto gira los torsos.
  const spin = { angle: 0, velocity: 0, dragging: false, lastX: 0, lastT: 0 };
  const torsoSpin = { angle: 0, velocity: 0 };
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
        const stepAngle = dx * spinPerPixel();
        const target = contactW > 0.5 ? torsoSpin : spin;
        target.angle += stepAngle;
        const dt = Math.max(1, now - spin.lastT) / 1000;
        target.velocity = target.velocity * 0.6 + (stepAngle / dt) * 0.4;
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
    gsap.killTweensOf(spin); // si estaba girando por la API, el visitante lo vuelve a agarrar
    spin.lastX = e.clientX;
    spin.lastT = down.t;
    spin.velocity = 0;
    torsoSpin.velocity = 0;
  }
  function endSpin() {
    const was = spin.dragging;
    if (was) document.documentElement.classList.remove('is-spinning');
    spin.dragging = false;
    if (performance.now() - spin.lastT > 80) { spin.velocity = 0; torsoSpin.velocity = 0; } // soltó quieto: sin inercia
  }

  // ---------- traer un proyecto al frente (flechas ← →, focusProject) ----------
  let slowTween = null;
  function bringToFront(it) {
    const delta = windows.orbitDeltaToFront(it, ROTATE.featuredAngle);
    slowTween?.kill();
    windows.state.timeScale = 0; // la órbita se frena mientras se acomoda y un rato más
    gsap.to(windows.state, { orbit: windows.state.orbit + delta, duration: ctx.reducedMotion ? 0.01 : 1.2, ease: 'power3.inOut', overwrite: 'auto' });
    slowTween = gsap.to(windows.state, { timeScale: 1, duration: 2.5, ease: 'power2.inOut', delay: 6 });
  }
  function step(dir) {
    const n = windows.items.length;
    const cur = Math.max(0, windows.items.findIndex((x) => x.project.id === windows.state.featuredId));
    bringToFront(windows.items[(cur + dir + n) % n]);
  }
  function onKey(e) {
    if (viewer.isOpen || roomId !== null || e.target.closest?.('input, textarea, select')) return;
    if (e.key === 'ArrowRight') { e.preventDefault(); step(1); }
    if (e.key === 'ArrowLeft') { e.preventDefault(); step(-1); }
  }
  addEventListener('keydown', onKey);

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

  // ---------- precalentado ----------
  // Cuando TODAS las piezas existen (estatua, partes de oro, torsos de Contacto, dibujos), se dejan
  // visibles un instante y se dibujan UNA vez en un target de 4x4 (no se ve nada): eso sube sus
  // geometrías a la placa de video. Los shaders se compilan aparte (compileAsync, que recorre
  // también los objetos ocultos) y las texturas con initTexture. Así ninguna pieza se compila ni se
  // sube a mitad del scroll. Durante todo esto el core no mide fps (evento `precompile`).
  const PRECOMPILE_ON = { on: true }, PRECOMPILE_OFF = { on: false };
  const TEXTURE_KEYS = ['map', 'bumpMap', 'normalMap', 'emissiveMap', 'alphaMap', 'roughnessMap'];
  let disposed = false;
  async function prewarm() {
    if (disposed) return;
    bus.emit('precompile', PRECOMPILE_ON);
    const t0 = performance.now();
    let blocked = 0;
    const hidden = [];
    const rt = new THREE.WebGLRenderTarget(4, 4);
    try {
      root.traverse((o) => {
        const m = o.material;
        if (!m) return;
        (Array.isArray(m) ? m : [m]).forEach((mat) => TEXTURE_KEYS.forEach((k) => mat[k]?.image && renderer.initTexture(mat[k])));
      });
      // 1) shaders en paralelo y SIN bloquear, para los dos destinos: pantalla y target (el bloom
      //    dibuja a un target, que usa otras variantes del mismo shader). compile recorre también los ocultos.
      const prev = renderer.getRenderTarget();
      renderer.setRenderTarget(rt);
      const inTarget = renderer.compileAsync(scene, camera);
      renderer.setRenderTarget(prev);
      await Promise.all([inTarget, renderer.compileAsync(scene, camera)]);
      if (disposed) return;
      // 2) con los shaders listos, todo visible un instante y UN dibujado en el target de 4x4 (no se ve):
      //    sube las geometrías a la placa de video. Lo único que bloquea es esto.
      const t1 = performance.now();
      root.traverse((o) => { if (!o.visible) { hidden.push(o); o.visible = true; } });
      renderer.setRenderTarget(rt);
      renderer.render(scene, camera);
      renderer.setRenderTarget(prev);
      blocked = performance.now() - t1;
    } catch (e) {
      console.warn('[estatua] no se pudo precalentar', e);
    } finally {
      hidden.forEach((o) => { o.visible = false; });
      rt.dispose();
      if (import.meta.env.DEV) console.info(`[estatua] precalentado en ${Math.round(performance.now() - t0)} ms (bloqueo ${Math.round(blocked)} ms)`);
      bus.emit('precompile', PRECOMPILE_OFF);
    }
  }
  Promise.all([statue.ready, parts.ready, torsos.ready])
    .then(() => setTimeout(prewarm, 400))
    .catch(() => {});

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
      if (visible != null) { windows.setVisible(visible); windowsShown = visible; if (!visible) setHover(null); }
    },
    /** Intensidad de todas las animaciones propias (0 = quieto, 1 = normal, 2 = el doble). */
    setIntensity(value, opts) {
      const t = { v: windows.state.intensity };
      gsap.to(t, { v: value, ...tweenOpts(opts), onUpdate: () => { windows.state.intensity = t.v; statue.setIntensity(t.v); } });
      if (!opts?.duration) { windows.state.intensity = value; statue.setIntensity(value); }
    },
    /** Velocidad de la órbita de proyectos (1 = una vuelta por minuto, 0 = quieta, 2 = el doble). */
    setOrbitSpeed(value, opts) {
      gsap.to(windows.state, { speed: value, ...tweenOpts(opts) });
    },
    /** Muestra u oculta todo el módulo. */
    setVisible(v) { root.visible = v; windows.setVisible(v); windowsShown = v; },
    /** Giro de la ESTATUA sola (radianes). Los proyectos siguen orbitando. Ej: setRotation(Math.PI, { duration: 1.5 }) */
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
    /** Fija a mano cuánto del dibujo dorado está hecho (0..1). null = vuelve a seguir al scroll. */
    setReveal(v) { reveal.override = v; },
    setSketch(v) { reveal.override = v; },
    /** Trae un proyecto al frente de la órbita (sin abrirlo). */
    focusProject(id) {
      const it = windows.items.find((x) => x.project.id === id);
      if (it) bringToFront(it);
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
        reveal: +reveal.value.toFixed(3),
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
    update(time, delta, st) {
      if (st) reveal.target = revealFromScroll(st);
      stepReveal(delta);
      sketch.update(time, delta);
      parts.update(time);

      // inercia del giro al soltar (la estatua y, en Contacto, los torsos)
      if (!spin.dragging && Math.abs(spin.velocity) > 0.0005) {
        spin.angle += spin.velocity * delta;
        spin.velocity *= Math.exp(-delta * ROTATE.friction);
      }
      if (!spin.dragging && Math.abs(torsoSpin.velocity) > 0.0005) {
        torsoSpin.angle += torsoSpin.velocity * delta;
        torsoSpin.velocity *= Math.exp(-delta * ROTATE.friction);
      }
      statue.spin.rotation.y += (spin.angle - statue.spin.rotation.y) * (1 - Math.exp(-delta * ROTATE.smoothing));
      statue.update(time, delta);

      // la órbita sigue a la estatua (sin su giro)
      follow.position.copy(statue.group.position).sub(STATUE.position);

      // el destacado lo decide la propia órbita (el más cercano a la cámara); la placa muestra ese o el del hover
      const shown = windows.items.find((x) => x.project.id === roomId)
        || windows.items.find((x) => x.project.id === windows.state.hoveredId)
        || windows.items.find((x) => x.project.id === windows.state.featuredId);
      if (shown) plaque.show(shown.project, shown.index);
      windows.update(time, delta);

      applyRoom();
      sceneByScroll(time, delta, st);
    },
    resize() {
      const mode = layoutMode();
      if (mode !== windows.mode && !viewer.isOpen) {
        const st = { ...windows.state };
        windows.dispose();
        windows = buildWindows(mode);
        Object.assign(windows.state, { roomId: st.roomId, orbit: st.orbit, intensity: st.intensity, radiusScale: st.radiusScale, timeScale: st.timeScale, speed: st.speed });
        windows.setVisible(windowsShown);
      }
    },
    setQuality(tier) {
      statue.setQuality(tier);
      parts.setQuality(tier);
      windows.items.forEach((it) => (it.frame.castShadow = tier !== 'low'));
    },
    dispose() {
      disposed = true;
      offSala();
      roomTween.kill();
      removeEventListener('pointermove', onPointerMove);
      removeEventListener('pointerdown', onPointerDown);
      removeEventListener('pointerup', onPointerUp);
      removeEventListener('pointercancel', onPointerCancel);
      removeEventListener('keydown', onKey);
      document.documentElement.classList.remove('is-spinning', 'is-pointing-project', 'is-project-open');
      about.dispose();
      torsos.dispose();
      sketch.dispose();
      parts.dispose();
      plaque.dispose();
      offGust();
      slowTween?.kill();
      gsap.killTweensOf(spin);
      gsap.killTweensOf(windows.state);
      viewer.dispose();
      windows.dispose();
      statue.dispose();
      follow.removeFromParent();
      a11yNav.remove();
      if (window.estatua === api) delete window.estatua;
    },
  };
}
