// Módulo FONDO — "CLAROSCURO". Dueño: [NOMBRE_1].
// Oscuridad, una sola luz y la Victoria como protagonista (CLAUDE.md 7: el fondo es dueño de la luz).
//   · luz.js        un sol ámbar que gira alrededor de la estatua según la sección, con su haz visible
//   · tipografia.js palabras monumentales en mármol negro con filo de oro + halo con los nombres de los proyectos
//   · obsidiana.js  piso negro espejado con ondas del cursor
//   · templo.js     columnata escaneada en puntos, con un haz que la recorre
//   · brasas.js     brasas que suben y motas que brillan al cruzar el haz
//   · polvo.js      con hover, el polvo dibuja el emblema del proyecto
//   · atmosferas.js cada sección y cada proyecto (hover) tienen su luz y su cielo
//   · cielo.js      domo oscuro que se disuelve con humo encendido al cambiar de mundo
//   · capa-dom.js   grano de película y visor REC (mundo ZURKLIMA)
// La cámara no se mueve. Nada sólido entra en el cilindro reservado de la estatua (CLAUDE.md 6).
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { SECTIONS, makeState } from './atmosferas.js';
import { createLuz } from './luz.js';
import { createCielo } from './cielo.js';
import { createBrasas } from './brasas.js';
import { createTipografia } from './tipografia.js';
import { createObsidiana } from './obsidiana.js';
import { createTemplo } from './templo.js';
import { createPolvo } from './polvo.js';
import { createCapaDom } from './capa-dom.js';

const COUNTS = {
  high:   { embers: 2600, motes: 7000 },
  medium: { embers: 1500, motes: 3500 },
  low:    { embers: 500,  motes: 1200 },
};

export default async function createFondo(ctx) {
  const { THREE, scene, renderer, shared, bus } = ctx;
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

  const luz = createLuz(ctx, { track, tier });
  const cielo = createCielo(ctx, { track });
  const brasas = createBrasas(ctx, { track, tier, counts: COUNTS });
  const obsidiana = createObsidiana(ctx, { track, tier });
  const polvo = createPolvo(ctx, { track, tier });
  const dom = createCapaDom(ctx);
  const [tipo, templo] = await Promise.all([
    createTipografia(ctx, { track, words: SECTIONS.map((s) => s.word) }),
    createTemplo(ctx, { track }),
  ]);

  // ---------- estado: sección + proyecto con hover → atmósfera ----------
  let section = 0, hoverId = null, dim = 0;
  const live = makeState(THREE, 0, null);           // lo que se ve (se acerca al objetivo cada frame)
  let target = makeState(THREE, 0, null);
  function retarget() {
    target = makeState(THREE, section, hoverId);
    cielo.dissolve(target, SNAP);
    polvo.to(hoverId);
    dom.rec(hoverId === 'zurklima');
    tipo.show(section, SNAP);
  }
  retarget();
  const offs = [
    bus.on('section:change', ({ index }) => { if (index !== section) { section = index; templo.sweep(); retarget(); } }),
    bus.on('project:hover', ({ id }) => { if (id !== hoverId) { hoverId = id; retarget(); } }),
    bus.on('project:open', () => { dim = 1; }),
    bus.on('project:close', () => { dim = 0; }),
  ];

  let gustTimer = 7, gust = 0, wind = 0.2, turb = 0, exposure = 1;
  const pointer = { x: 0, y: 0 };

  function setQuality(next) {
    tier = next;
    luz.setQuality(tier); brasas.setQuality(tier); obsidiana.setQuality(tier); polvo.setQuality(tier);
  }

  return {
    update(time, delta, s) {
      // la atmósfera viva se acerca a la elegida (colores e intensidades)
      const k = SNAP ? 1 : Math.min(1, delta * 2.2);
      for (const c of ['sun', 'fill', 'domeTop', 'domeBot', 'domeGlow', 'ember']) live[c].lerp(target[c], k);
      for (const n of ['sunI', 'fillI', 'embers', 'beam', 'scan', 'ink']) live[n] += (target[n] - live[n]) * k;
      live.az = target.az; live.el = target.el;

      // viento: base + scroll rápido + ráfagas (lo lee la estatua para sacudir las ventanas)
      gustTimer -= delta;
      if (gustTimer <= 0) {
        gustTimer = 9 + Math.random() * 6; gust = 1; bus.emit('wind:gust', { strength: 0.8 });
        for (let i = 0; i < 3; i++) obsidiana.drop((Math.random() - 0.5) * 14, -2 - Math.random() * 12, 0.6, time + i * 0.25);
      }
      gust = Math.max(0, gust - delta * 0.6);
      const sv = Math.min(1, Math.abs(s.velocity) * 0.03);
      wind += (0.2 + sv + gust * 0.5 - wind) * Math.min(1, delta * 2);
      shared.wind.strength = Math.min(1, wind);
      turb += (sv * 0.8 + gust * 0.15 - turb) * Math.min(1, delta * 3);

      pointer.x = shared.pointer.x + shared.tilt.x; pointer.y = shared.pointer.y + shared.tilt.y;
      const hasPointer = !(shared.pointer.x === 0 && shared.pointer.y === 0 && shared.tilt.x === 0 && shared.tilt.y === 0);

      luz.update(time, delta, live, k, pointer, SNAP);
      const sunPos = luz.sunPosition();
      cielo.update(time, delta, live, sunPos, SNAP);
      brasas.update(time, delta, live, sunPos, wind, SNAP, reduced);
      obsidiana.update(time, delta, live, sunPos, pointer, hasPointer && !reduced, SNAP);
      templo.update(time, delta, live, SNAP, reduced);
      polvo.update(time, delta, live, pointer, hasPointer, turb, SNAP, reduced);
      tipo.update(time, delta, { section, hover: !!hoverId, pointer, snap: SNAP, reduced });
      tipo.setRingColor(live.sun);
      dom.update();

      // proyecto abierto: la sala baja la luz
      exposure += ((1 - dim * 0.3) - exposure) * Math.min(1, delta * 3);
      renderer.toneMappingExposure = exposure;
    },
    resize() { brasas.resize(); obsidiana.resize(); templo.resize(); polvo.resize(); },
    setQuality,
    dispose() {
      offs.forEach((off) => off?.());
      dom.dispose();
      disposables.forEach((d) => d.dispose?.());
      envTex.dispose();
      renderer.toneMappingExposure = 1;
      scene.environment = null;
      scene.background = null;
    },
    api: {
      /** Para probar: forzar sección (0–3) y/o mundo de proyecto (id o null). */
      preview(sec, project = null) { section = sec; hoverId = project; retarget(); },
    },
  };
}
