// Módulo FONDO — "CLAROSCURO". Dueño: [NOMBRE_1].
// Oscuridad, una sola luz y la Victoria como protagonista (CLAUDE.md 7: el fondo es dueño de la luz).
//   · luz.js        un sol ámbar que gira alrededor de la estatua según la sección, con su haz visible
//   · obsidiana.js  piso negro brillante (un solo material, sin espejo) con ondas baratas del cursor
//   · templo.js     columnata escaneada en puntos (9 columnas), con un haz que la recorre
//   · brasas.js     brasas que suben y motas que brillan al cruzar el haz
//   · polvo.js      con hover, el polvo dibuja el emblema del proyecto (APAGADO: POLVO = false)
//   · atmosferas.js cada sección y cada proyecto (hover) tienen su luz y su cielo
//   · cielo.js      domo oscuro que se disuelve con humo encendido al cambiar de mundo
//   · mundo.js      el mundo de cada sala (partículas, bruma, hilo dorado, viñeta detrás de la ventana)
//   · capa-dom.js   grano de película muy sutil + esquinas de visor (sala de ZURKLIMA)
//   · tipografia.js palabras 3D + anillo de nombres: APAGADO (LETRAS = false), ya no se carga
//   · stats.js      medidor de desarrollo (?stats)
// La cámara no se mueve. Nada sólido entra en el cilindro reservado de la estatua (CLAUDE.md 6).
//
// Reglas de fluidez (ver ritmo.js): todo suavizado usa damp(), ningún cuadro cuenta más de 1/30 s,
// no se crea nada dentro de update() ni de los eventos, nada se prende/apaga de golpe, y todo se
// compila y se sube a la placa de video antes de mostrarse.
import { gsap } from 'gsap';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { SECTIONS, COLOR_KEYS, NUMBER_KEYS, createState, fillState, warmColors } from './atmosferas.js';
import { createLuz } from './luz.js';
import { createCielo } from './cielo.js';
import { createBrasas } from './brasas.js';
import { createObsidiana } from './obsidiana.js';
import { createTemplo } from './templo.js';
import { createPolvo } from './polvo.js';
import { createCapaDom } from './capa-dom.js';
import { createMundo } from './mundo.js';
import { createStats } from './stats.js';
import { warmTextures } from './texturas.js';
import { damp, MAX_DT } from './ritmo.js';

// Palabras 3D monumentales + anillo con los nombres de los proyectos. Apagado: si se prende, se
// carga la fuente y las texturas de mármol (dynamic import: apagado no cuesta ni un byte).
export const LETRAS = false;

// Polvo que dibuja el emblema de cada proyecto con el hover. Apagado: no se crea, no carga imágenes ni cuesta nada.
export const POLVO = false;

const COUNTS = {
  high:   { embers: 400, motes: 3000 },   // brasas: un tercio de las anteriores (galería sobria)
  medium: { embers: 200, motes: 1500 },
  low:    { embers: 133, motes: 800 },
};

// Cuánto tardan los cambios de atmósfera (velocidad de seguimiento, 1/s): entrar al hover ≈ 0,6 s,
// salir ≈ 0,9 s, cambiar de sección ≈ 1,8 s.
const CHASE = { hoverIn: 6.5, hoverOut: 4.4, section: 2.2, sala: 2.4 }; // sala ≈ 1,2 s
const ROOM_SWEEP = 0.3; // rad: cuánto gira la luz a lo largo de una sala (con el progress)
const HOVER_STABLE = 0.12;   // s de hover estable antes de cambiar de mundo
const STAGGER = { sky: 0.15, dust: 0.3 }; // luz a 0 ms, cielo +150 ms, polvo +300 ms
const PRECOMPILE_ON = { on: true }, PRECOMPILE_OFF = { on: false };
const GUST = { strength: 0.8 }; // payload reutilizado del evento wind:gust
const NO_POLVO = { ready: Promise.resolve(), to() {}, setQuality() {}, resize() {}, update() {} }; // POLVO = false

export default async function createFondo(ctx) {
  const { THREE, scene, camera, renderer, shared, bus } = ctx;
  const disposables = [];
  const track = (x) => (disposables.push(x), x);
  let tier = ctx.quality;
  const reduced = ctx.reducedMotion;
  // solo desarrollo: ?snap → transiciones instantáneas (para capturas en máquinas lentas)
  const SNAP = import.meta.env.DEV && new URLSearchParams(location.search).has('snap');

  scene.background = null;   // el domo es el fondo
  scene.fog = null;
  // entorno: el mismo con el que se calibró el oro de la estatua (no cambiar sin revisarlo juntos)
  const pmrem = new THREE.PMREMGenerator(renderer);
  const envTex = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  pmrem.dispose();
  scene.environment = envTex;
  scene.environmentIntensity = 0.22;

  warmColors(THREE); // todos los colores de todas las atmósferas, creados ahora
  const luz = createLuz(ctx, { track });
  const cielo = createCielo(ctx, { track });
  const brasas = createBrasas(ctx, { track, tier, counts: COUNTS });
  const obsidiana = createObsidiana(ctx, { track, tier });
  const polvo = POLVO ? createPolvo(ctx, { track, tier }) : NO_POLVO;
  const dom = createCapaDom(ctx);
  const mundo = createMundo(ctx, { track, tier });
  const stats = createStats(ctx); // solo DEV con ?stats
  const [tipo, templo] = await Promise.all([
    LETRAS ? import('./tipografia.js').then((m) => m.createTipografia(ctx, { track, words: SECTIONS.map((s) => s.word) })) : null,
    createTemplo(ctx, { track, tier }),
  ]);

  // ---------- estado: sección + proyecto con hover → atmósfera ----------
  let section = 0, hoverId = null, pendingHover = null, dim = 0;
  let salaId = null, roomTarget = 0, prog = 0; // sala actual y su progress (0–1; prog = suavizado)
  let skyDur = 0.9;
  let chase = CHASE.section;
  const live = createState(THREE);     // lo que se ve (se acerca al objetivo cada frame)
  const target = createState(THREE);
  fillState(THREE, live, 0, null);
  fillState(THREE, target, 0, null);

  // Las transiciones son delayedCalls de GSAP reutilizados (sobre el ticker único): cada cambio
  // REINICIA el anterior, así si el usuario scrollea rápido nunca se acumulan.
  const applySky = () => cielo.dissolve(target, SNAP, skyDur);
  const applyDust = () => { polvo.to(salaId ? null : hoverId); tipo?.show(section, SNAP); };
  const dSky = gsap.delayedCall(STAGGER.sky, applySky).pause();
  const dDust = gsap.delayedCall(STAGGER.dust, applyDust).pause();
  const commitHover = () => {
    if (pendingHover === hoverId) return;
    hoverId = pendingHover;
    if (!salaId) retarget(hoverId ? CHASE.hoverIn : CHASE.hoverOut, hoverId ? 0.6 : 0.9); // en una sala el hover no tiñe nada
  };
  const dHover = gsap.delayedCall(HOVER_STABLE, commitHover).pause();

  function retarget(speed, dur = 0.9) {
    skyDur = dur;
    fillState(THREE, target, section, hoverId, salaId);   // la luz ya empieza a seguirlo (0 ms)
    chase = speed;
    dSky.restart(true);                            // el cielo se disuelve a +150 ms
    dDust.restart(true);                           // el polvo se reacomoda a +300 ms
  }
  // estado inicial: sin escalonar (todavía no hay nada en pantalla)
  cielo.dissolve(target, true);
  polvo.to(null);
  tipo?.show(section, true);

  // Los otros módulos se montan DESPUÉS del fondo y algunas de sus piezas nacen ocultas (torsos, partes
  // de oro). renderer.compile recorre todos los objetos, visibles o no: cuando la estatua avisa que
  // está lista (y otra vez un poco después, cuando ya creó todas sus piezas) se compilan sus shaders
  // en segundo plano, para que no se compilen en medio de una transición. Solo se lee la escena.
  const compileAll = () => {
    bus.emit('precompile', PRECOMPILE_ON); // el core no mide fps mientras tanto
    renderer.compileAsync(scene, camera).catch(() => {}).finally(() => bus.emit('precompile', PRECOMPILE_OFF));
  };
  const dCompileA = gsap.delayedCall(0.6, compileAll).pause();
  const dCompileB = gsap.delayedCall(3, compileAll).pause();

  const offs = [
    bus.on('estatua:ready', () => { dCompileA.restart(true); dCompileB.restart(true); }),
    bus.on('section:change', ({ index }) => { if (index !== section) { section = index; templo.sweep(); retarget(CHASE.section); } }),
    // sala:change { id, progress }: cada sala cambia de mundo (disolución del cielo de 1,2 s). id null = hero/contacto:
    // vuelve la atmósfera de galería. El progress (0–1) hace avanzar despacio algo dentro de la sala.
    bus.on('sala:change', ({ id, progress }) => {
      roomTarget = progress || 0;
      if (id === salaId) return;
      salaId = id;
      const win = id ? scene.getObjectByName(`ventana_${id}`) : null; // la ventana grande de la sala (solo se lee)
      mundo.setWindow(win); dom.setVisor(win);
      retarget(CHASE.sala, 1.2);
    }),
    // el hover cambia de mundo solo si se queda quieto 120 ms: pasar rápido por varias ventanas no dispara nada
    bus.on('project:hover', ({ id }) => { pendingHover = id; if (id === hoverId) dHover.pause(); else dHover.restart(true); }),
    bus.on('project:open', () => { dim = 1; }),
    bus.on('project:close', () => { dim = 0; }),
  ];

  let gustTimer = 7, gust = 0, wind = 0.2, turb = 0, exposure = 1;
  const pointer = { x: 0, y: 0 };

  function setQuality(next) {
    tier = next;
    luz.setQuality(tier); brasas.setQuality(tier); obsidiana.setQuality(tier); polvo.setQuality(tier); templo.setQuality(tier); mundo.setQuality(tier);
  }

  // ---------- precalentado: todo a la placa de video ANTES de mostrarse ----------
  // Los shaders se compilan (en paralelo, sin trabar) y las texturas se suben ahora. Los estados
  // posibles (disolución, humo de tinta, visión nocturna, ondas) viven dentro de los mismos
  // programas (se prenden con uniforms), así que una compilación los cubre a todos.
  await warmTextures(renderer);
  await polvo.ready;
  try { await renderer.compileAsync(scene, camera); } catch { renderer.compile(scene, camera); }

  // solo desarrollo: ?sala=<id>[&progress=0.5] simula entrar a esa sala (sirve con ?only=fondo, sin scrollear)
  if (import.meta.env.DEV) {
    const q = new URLSearchParams(location.search);
    if (q.get('sala')) setTimeout(() => bus.emit('sala:change', { id: q.get('sala'), progress: Number(q.get('progress') ?? 0.5) }), 1500);
  }

  return {
    update(time, delta, s) {
      stats?.update();
      const dt = Math.min(delta, MAX_DT); // un frame lento no produce un salto

      // la atmósfera viva se acerca a la elegida (colores e intensidades)
      const k = SNAP ? 1 : damp(chase, dt);
      for (let i = 0; i < COLOR_KEYS.length; i++) live[COLOR_KEYS[i]].lerp(target[COLOR_KEYS[i]], k);
      for (let i = 0; i < NUMBER_KEYS.length; i++) { const n = NUMBER_KEYS[i]; live[n] += (target[n] - live[n]) * k; }
      prog += (roomTarget - prog) * damp(5, dt);
      live.az = target.az + (salaId ? prog * ROOM_SWEEP : 0); live.el = target.el; // la luz gira unos grados dentro de la sala

      // viento: base + scroll rápido + ráfagas (lo lee la estatua para sacudir las ventanas)
      gustTimer -= dt;
      if (gustTimer <= 0) {
        gustTimer = 9 + Math.random() * 6; gust = 1; bus.emit('wind:gust', GUST);
        for (let i = 0; i < 3; i++) obsidiana.drop((Math.random() - 0.5) * 14, -2 - Math.random() * 12, 0.6, time + i * 0.25);
      }
      gust = Math.max(0, gust - dt * 0.6);
      const sv = Math.min(1, Math.abs(s.velocity) * 0.03);
      wind += (0.2 + sv + gust * 0.5 - wind) * damp(2.5, dt);
      shared.wind.strength = Math.min(1, wind);
      turb += (sv * 0.8 + gust * 0.15 - turb) * damp(4, dt);

      pointer.x = shared.pointer.x + shared.tilt.x; pointer.y = shared.pointer.y + shared.tilt.y;
      const hasPointer = !(shared.pointer.x === 0 && shared.pointer.y === 0 && shared.tilt.x === 0 && shared.tilt.y === 0);

      luz.update(time, dt, live, pointer, SNAP);
      const sunPos = luz.sunPosition();
      const ink = live.ink;
      if (salaId) live.ink = ink * (0.45 + 0.55 * prog); // el humo de tinta se abre con el progress
      cielo.update(time, dt, live, sunPos, SNAP);
      live.ink = ink;
      brasas.update(time, dt, live, sunPos, wind, SNAP, reduced);
      obsidiana.update(time, dt, live, pointer, hasPointer && !reduced, SNAP);
      templo.update(time, dt, live, SNAP, reduced);
      polvo.update(time, dt, live, pointer, hasPointer, turb, SNAP, reduced);
      if (tipo) { tipo.update(time, dt, { section, hover: !!hoverId, pointer, snap: SNAP, reduced }); tipo.setRingColor(live.sun); }
      mundo.update(time, dt, live, prog, reduced);
      dom.update(live);

      // proyecto abierto: la sala baja la luz
      exposure += ((1 - dim * 0.3) - exposure) * damp(4, dt);
      renderer.toneMappingExposure = exposure;
    },
    resize() { brasas.resize(); obsidiana.resize(); templo.resize(); polvo.resize(); mundo.resize(); },
    setQuality,
    dispose() {
      offs.forEach((off) => off?.());
      dSky.kill(); dDust.kill(); dHover.kill(); dCompileA.kill(); dCompileB.kill();
      cielo.dispose();
      mundo.dispose();
      dom.dispose();
      stats?.dispose();
      disposables.forEach((d) => d.dispose?.());
      envTex.dispose();
      renderer.toneMappingExposure = 1;
      scene.environment = null;
      scene.background = null;
    },
    api: {
      /** Para probar: forzar sección (0–3) y/o mundo de proyecto (id o null). */
      preview(sec, project = null) { section = sec; hoverId = project; pendingHover = project; retarget(CHASE.section); },
    },
  };
}
