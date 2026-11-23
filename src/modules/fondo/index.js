// Módulo FONDO — versión fotográfica. El fondo es dueño de la luz global, el cielo y el mar (CLAUDE.md 7).
// La Victoria cae del cielo al mar:
//   · foto-cielo.js    panoramas reales (Poly Haven CC0) con fundido; Vía Láctea (ESO) + estrellas nítidas
//   · foto-nubes.js    nubes reales recortadas de la foto: mar de nubes, cruce a toda velocidad, velo
//   · foto-ambiente.js HDR reales (1K) como entorno: lo que reflejan el mármol, el cromo y los marcos
//   · luz-mar.js       mar con olas Gerstner que refleja el panorama (CubeCamera solo al cambiar de sala)
//   · luz-destellos.js destellos finos del camino de sol
//   · luz-estados.js   retoque y colores de cada momento (día, atardecer, cada sala, noche)
// El guion (qué pasa en cada tramo del scroll) está en config/historia.js, compartido con la estatua.
//
// Reglas de fluidez: todo suavizado usa damp(); ningún cuadro cuenta más de 1/30 s; no se crea nada
// dentro de update() ni de los eventos; nada se prende/apaga de golpe (primero se funde a 0); todo se
// compila y se sube a la placa de video antes de mostrarse (core.prewarm).
import { gsap } from 'gsap';
import { createFotoCielo, PANOS, panoSun } from './foto-cielo.js';
import { createFotoNubes } from './foto-nubes.js';
import { createFotoAmbiente } from './foto-ambiente.js';
import { createMar } from './luz-mar.js';
import { createDestellos } from './luz-destellos.js';
import { createPajaros } from './pajaros.js';
import { createEstados, createEstado, copyEstado, mixEstado } from './luz-estados.js';
import { createStats } from './stats.js';
import { warmTextures } from './texturas.js';
import { damp, MAX_DT } from './ritmo.js';
import { posicion, TRAMOS, ramp, START, NIVEL_MAR, CAIDA, altura, P_CRUCE } from '../../config/historia.js';

// El fondo viejo "Claroscuro" queda APAGADO y no se carga (claroscuro.js). Con true vuelve entero.
export const FONDO_VIEJO = false;

const SALA_DUR = 0.8;
const GUST = { strength: 0.8 };
// LUT de cada sala (public/assets/lente/lut-*.png, elegidas en referencias/DECISIONES.md)
const SALA_LUT = {
  'tinta-negra': 'tinta', 'mantra-estetica': 'lavanda', 'aura-aika': 'atardecer', zurklima: 'cielo',
  'la-pastoril': 'miel', chufas: 'rosa', 'casa-de-muffin': 'canela',
};

export default async function createFondo(ctx) {
  if (FONDO_VIEJO) return (await import('./claroscuro.js')).default(ctx);
  const { THREE, scene, camera, renderer, shared, bus } = ctx;
  const disposables = [];
  const track = (x) => (disposables.push(x), x);
  let tier = ctx.quality;
  const reduced = ctx.reducedMotion;

  scene.background = null;
  scene.fog = null;

  // ---------- carga (el velo muestra el avance) ----------
  const prog = { cielo: 0, hdr: 0, nubes: 0 };
  const progPayload = { p: 0 };
  const report = () => { progPayload.p = prog.cielo * 0.5 + prog.hdr * 0.35 + prog.nubes * 0.15; bus.emit('carga:progreso', progPayload); };

  // ---------- estados de luz ----------
  const E = createEstados(THREE);
  const live = createEstado(THREE);
  const salaLive = createEstado(THREE);
  const salaFrom = createEstado(THREE);
  copyEstado(live, E.dia);
  copyEstado(salaLive, E.atardecer);
  copyEstado(salaFrom, E.atardecer);
  let salaTo = E.atardecer;
  const salaK = { v: 1 };

  // ---------- piezas ----------
  const sunDia = panoSun(THREE, PANOS.dia), sunTarde = panoSun(THREE, PANOS.atardecer), sunCrep = panoSun(THREE, PANOS.crepusculo);
  sunCrep.y = Math.max(sunCrep.y, 0.05);
  const sunDir = sunDia.clone();
  const cielo = createFotoCielo(ctx, { track, tier, sunDir, onProgress: (p) => { prog.cielo = p; report(); } });
  const nubes = createFotoNubes(ctx, { track, tier });
  nubes.ready.then(() => { prog.nubes = 1; report(); });
  const mar = createMar(ctx, { track, tier, sunDir });
  const destellos = createDestellos(ctx, { track, tier, sunDir });
  const pajaros = createPajaros(ctx, { track, tier });
  const amb = createFotoAmbiente(ctx, { track, onProgress: (p) => { prog.hdr = p; report(); }, viaMatrix: cielo.uniforms.uViaM.value });
  const stats = createStats(ctx);
  // la estatua lee el sol y cuánto es de noche; el core lee la lente (destello, aberración)
  shared.sol = { dir: sunDir, color: live.sun, noche: 0 };
  shared.lente = shared.lente || { flare: 0, aberracion: 0, dof: 0 };

  // ---------- carga y horneados (una sola vez, antes de mostrar nada) ----------
  await Promise.all([cielo.ready, nubes.ready]);
  // los panoramas (4K) se suben a la placa ya, no en el primer cuadro
  [cielo.uniforms.uDia, cielo.uniforms.uTarde, cielo.uniforms.uCrep, cielo.uniforms.uVia, nubes.uniforms.uMap].forEach((u) => u.value?.image && renderer.initTexture(u.value));
  await amb.bakeAll(cielo.uniforms.uVia.value);
  await warmTextures(renderer);
  amb.use('dia', true);

  // ---------- reflejo del mar: se actualiza SOLO al cambiar de "lugar" (sala, mar, noche) ----------
  let anchor = null;
  const envMix = mar.uniforms.uEnvMix;
  let reflectState = E.atardecer, reflectNight = 0;
  const prepareReflection = () => {
    cielo.apply(reflectState, 0, 1 - reflectNight, reflectNight, reflectNight, reflectNight, 0);
  };
  const onReflectionDone = (back) => {
    mar.setFront(back);
    gsap.killTweensOf(envMix);
    gsap.to(envMix, { value: back, duration: reduced ? 0.25 : SALA_DUR, ease: 'power3.inOut' });
  };
  const dReflection = gsap.delayedCall(0.35, () => mar.startReflection(prepareReflection, onReflectionDone)).pause();
  function setAnchor(next, st, night, instant = false) {
    if (anchor === next) return;
    anchor = next;
    reflectState = st;
    reflectNight = night;
    if (instant) {
      const back = mar.renderReflection(prepareReflection);
      mar.setFront(back);
      gsap.killTweensOf(envMix);
      envMix.value = back;
      return;
    }
    dReflection.restart(true); // después, de a una cara por cuadro
  }
  setAnchor('atardecer', E.atardecer, 0, true);

  // ---------- eventos ----------
  let salaId = null, dim = 0, nowT = 0;
  const offs = [
    bus.on('sala:change', ({ id }) => {
      if (id === salaId) return;
      salaId = id;
      copyEstado(salaFrom, salaLive);
      salaTo = id ? (E.salas[id] || E.atardecer) : E.atardecer;
      salaK.v = 0;
      gsap.to(salaK, { v: 1, duration: reduced ? 0.25 : SALA_DUR, ease: 'power3.inOut', overwrite: true });
    }),
    bus.on('project:open', () => { dim = 1; }),
    bus.on('project:close', () => { dim = 0; }),
    // un fragmento de cromo cae al agua: deja ondas
    bus.on('fragmento:agua', ({ x, z, s = 1 }) => mar.drop(x, z, 1.6 * s, nowT)),
  ];

  let gustTimer = 6, gust = 0, wind = 0.3, dimLive = 0, veilScroll = 0, drift = 0;
  let lastAlt = altura(0.5), fallSpeed = 0;
  const pointer = { x: 0, y: 0 };

  function setQuality(next) {
    tier = next;
    mar.setQuality(tier); destellos.setQuality(tier); nubes.setQuality(tier);
  }

  // solo desarrollo: ?sala=<id> simula estar en esa sala (sirve con ?only=fondo, sin scrollear)
  if (import.meta.env.DEV) {
    const q = new URLSearchParams(location.search);
    if (q.get('sala')) setTimeout(() => bus.emit('sala:change', { id: q.get('sala'), progress: 0.5 }), 600);
  }

  const [e0, e1] = CAIDA.espesor;
  const veilK0 = (rel) => 1 - Math.min(1, Math.max(e0 + 2 - rel, rel - (e1 - 2), 0) / 12);
  return {
    update(time, delta, s) {
      stats?.update();
      nowT = time;
      const dt = Math.min(delta, MAX_DT);
      const P = posicion(s);
      const cam = camera.position;

      // ---- la caída ----
      const alt = altura(P);
      const seaY = NIVEL_MAR - alt;
      const deckY = seaY + CAIDA.nubes;
      const v = dt > 0 ? Math.abs(lastAlt - alt) / dt : 0; // m/s de escena
      lastAlt = alt;
      fallSpeed += (v - fallSpeed) * damp(6, dt);

      // ---- guion ----
      const sunsetK = ramp(P, TRAMOS.atardecer);
      const seaK = ramp(P, TRAMOS.mar);
      const night = ramp(P, TRAMOS.noche);
      const starsK = ramp(P, TRAMOS.estrellas);

      // ---- luz: día → atardecer de la sala → noche ----
      mixEstado(salaLive, salaFrom, salaTo, salaK.v);
      mixEstado(live, E.dia, salaLive, sunsetK);
      mixEstado(live, live, E.noche, night);
      shared.sol.noche = night;
      sunDir.copy(sunDia).lerp(sunTarde, sunsetK).lerp(sunCrep, night).normalize();

      // ---- reflejo del mar (un cubo nuevo solo al cambiar de lugar) ----
      if (P >= START.contacto) setAnchor('noche', E.noche, 1);
      else if (salaId) setAnchor(salaId, E.salas[salaId] || E.atardecer, 0);
      else if (P > P_CRUCE) setAnchor('atardecer', E.atardecer, 0);
      if (mar.mesh.visible) mar.stepReflection();

      // ---- viento: base + scroll rápido + ráfagas ----
      pointer.x = shared.pointer.x + shared.tilt.x; pointer.y = shared.pointer.y + shared.tilt.y;
      gustTimer -= dt;
      if (gustTimer <= 0 && !reduced) { gustTimer = 8 + Math.random() * 7; gust = 1; bus.emit('wind:gust', GUST); }
      gust = Math.max(0, gust - dt * 0.5);
      const sv = Math.min(1, Math.abs(s.velocity) * 0.025);
      wind += (0.32 + sv * 0.5 + gust * 0.45 + Math.min(1, fallSpeed / 60) * 0.4 - wind) * damp(2, dt);
      shared.wind.x = -0.93; shared.wind.y = 0.22 + Math.min(1, fallSpeed / 60); shared.wind.z = -0.3;
      shared.wind.strength = Math.min(1, wind);

      // ---- cielo ----
      cielo.apply(live, 1 - sunsetK, sunsetK * (1 - night), night, night, starsK, time);

      // ---- nubes ----
      if (!reduced) drift = (drift + dt * (0.6 + wind) * 1.4) % 400;
      const crossIn = ramp(P, [P_CRUCE - 0.34, P_CRUCE - 0.06]) * (1 - ramp(P, [P_CRUCE + 0.06, P_CRUCE + 0.34]));
      const streak = reduced ? 0 : Math.min(1, Math.max(0, (fallSpeed - 6) / 55));
      nubes.uniforms.uLit.value.copy(live.cloudLit);
      nubes.uniforms.uShade.value.copy(live.cloudShade);
      nubes.uniforms.uHaze.value.copy(live.haze).lerp(live.below, live.belowK);
      nubes.update(deckY, time, dt, {
        capa: 1 - 0.6 * night,
        cruce: crossIn,
        lejana: tier === 'high' ? (0.32 * (1 - sunsetK) + 0.2 * sunsetK) * (1 - night) : 0,
        streak, drift: drift - 200,
      });
      shared.niebla = veilK0(cam.y - deckY);
      // velo: cuánto de la capa hay entre la cámara y lo de adentro (la cámara adentro = casi blanco)
      const rel = cam.y - deckY;
      const outside = Math.max(e0 + 2 - rel, rel - (e1 - 2), 0);
      const veilK = (1 - Math.min(1, outside / 12)) * (P < START.obras ? 1 : 0);
      const vu = nubes.veilU;
      vu.uAmount.value = veilK * 0.94;
      vu.uColor.value.copy(live.veil);
      vu.uShade.value.copy(live.cloudShade).lerp(live.veil, 0.5);
      veilScroll = (veilScroll + dt * (0.15 + fallSpeed * 0.012)) % 10;
      vu.uScroll.value = veilScroll;
      const veilOn = vu.uAmount.value > 0.003;
      if (nubes.veil.visible !== veilOn) nubes.veil.visible = veilOn;

      // ---- mar ----
      mar.setAltitude(seaY, 1 + alt / 5);
      mar.uniforms.uHazeN.value = 35 + alt * 2.2;
      mar.uniforms.uHazeF.value = 270 + alt * 9;
      destellos.setSeaY(seaY);
      const mu = mar.uniforms;
      mu.uTime.value = reduced ? time * 0.25 : time;
      mu.uFade.value = seaK;
      mu.uFadeCol.value.copy(live.haze);
      mu.uDeep.value.copy(live.seaDeep); mu.uShallow.value.copy(live.seaShallow);
      mu.uHaze.value.copy(live.horizonte); mu.uSunColor.value.copy(live.sun);
      mu.uSand.value.copy(live.sand); mu.uFoam.value.copy(live.foam);
      mu.uSpec.value = live.spec; mu.uGlitter.value = live.glitter; mu.uDetail.value = live.detail; mu.uReflI.value = live.reflI;
      mu.uShore.value = night;
      mu.uAmp.value = 1 - night * 0.55;
      const seaOn = seaK > 0.001;
      if (mar.mesh.visible !== seaOn) mar.mesh.visible = seaOn;
      if (seaOn && !reduced && alt < 6) mar.pointerRipple(pointer.x, pointer.y, time);

      // ---- pájaros (bandadas a lo lejos, solo en la caída) ----
      pajaros.update(P, time, seaY, reduced ? 0 : (1 - night) * (tier === 'low' ? 0.8 : 1), live.horizonte);

      // ---- destellos del camino de sol ----
      const du = destellos.uniforms;
      du.uTime.value = reduced ? time * 0.3 : time;
      du.uAmount.value = live.glints * seaK * (1 - Math.min(1, alt / 40));
      du.uGold.value.copy(live.glintGold); du.uSilver.value.copy(live.glintSilver); du.uGoldMix.value = live.goldMix;
      const glOn = du.uAmount.value > 0.003;
      if (destellos.points.visible !== glOn) destellos.points.visible = glOn;

      // ---- luces y entorno (día ↔ atardecer: directo, adentro de la nube) ----
      amb.apply(live, sunDir);
      const envName = P < P_CRUCE ? 'dia' : night >= 0.5 ? 'noche' : 'atardecer';
      amb.use(envName, envName === 'dia' || amb.active === 'dia');

      // ---- lente (la aplica el core en una sola pasada) ----
      const L = shared.lente;
      L.flare = sunsetK * (1 - night) * (1 - veilK);
      // rayos de luz: fuertes en la caída (cuando sale el horizonte), más suaves con el mar quieto
      L.rays = sunsetK * (1 - night) * (1 - veilK) * (0.42 + 0.58 * Math.min(1, fallSpeed / 35)) * (dimLive > 0.5 ? 0 : 1);
      // LUT de la escena (el post la funde en 1,3 s): cielo de día, atardecer, cada sala con la suya, hora azul
      L.lut = P < P_CRUCE ? 'cielo' : night >= 0.5 ? 'azul' : (salaId && SALA_LUT[salaId]) || 'atardecer';

      // ---- proyecto abierto: baja la luz ----
      dimLive += (dim - dimLive) * damp(4, dt);
      renderer.toneMappingExposure = live.exposure * (1 - dimLive * 0.28);
    },
    resize(w, h) { nubes.resize(w, h); destellos.resize(); cielo.resize(); pajaros.resize(); },
    setQuality,
    dispose() {
      offs.forEach((off) => off?.());
      gsap.killTweensOf(salaK); gsap.killTweensOf(envMix); dReflection.kill();
      stats?.dispose();
      amb.dispose();
      disposables.forEach((d) => d.dispose?.());
      renderer.toneMappingExposure = 1;
      scene.environment = null;
      scene.background = null;
      delete shared.sol;
    },
    api: {
      /** Estado de luz actual (para probar desde la consola). */
      get estado() { return live; },
      /** Para la estatua: altura del mar en este momento (y del mundo). */
      get nivelMar() { return mar.mesh.position.y; },
    },
  };
}
