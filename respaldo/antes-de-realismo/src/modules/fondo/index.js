// Módulo FONDO — "HECHA DE LUZ". El fondo es dueño de la luz global, el cielo y el mar (CLAUDE.md 7).
// La Victoria baja del cielo al mar (la original se posa sobre la proa de un barco):
//   · luz-cielo.js     domo del cielo: día → atardecer dorado → hora azul
//   · luz-nubes.js     3 capas de nubes horneadas una vez; se derriten en píxeles al bajar; velo al atravesar
//   · luz-mar.js       mar con olas Gerstner, reflejo del cielo (CubeCamera solo al cambiar de sala), orilla
//   · luz-destellos.js destellos dorados y plateados del camino de sol (bloom)
//   · luz-ambiente.js  sol, luz de cielo y los entornos (PMREM) que refleja la estatua
//   · luz-estados.js   cómo se ve cada momento (día, atardecer, cada sala, noche)
//   · stats.js         medidor de desarrollo (?stats)
// El guion (qué pasa en cada tramo del scroll) está en config/historia.js, compartido con la estatua.
//
// Reglas de fluidez: todo suavizado usa damp(); ningún cuadro cuenta más de 1/30 s; no se crea nada
// dentro de update() ni de los eventos; nada se prende/apaga de golpe (primero se funde a 0); todo se
// compila y se sube a la placa de video antes de mostrarse (core.prewarm).
import { gsap } from 'gsap';
import { createCielo } from './luz-cielo.js';
import { createNubes } from './luz-nubes.js';
import { createMar } from './luz-mar.js';
import { createDestellos } from './luz-destellos.js';
import { createAmbiente } from './luz-ambiente.js';
import { createEstados, createEstado, copyEstado, mixEstado } from './luz-estados.js';
import { createStats } from './stats.js';
import { warmTextures } from './texturas.js';
import { damp, MAX_DT } from './ritmo.js';
import { posicion, TRAMOS, ramp, bump, START } from '../../config/historia.js';

// El fondo viejo "Claroscuro" (columnas de puntos, brasas, polvo de emblemas, piso de obsidiana, cielo
// oscuro, letras 3D, halo de nombres y HUD) queda APAGADO y no se carga. Con true vuelve entero
// (está en claroscuro.js, con sus propias opciones LETRAS y POLVO, también en false).
export const FONDO_VIEJO = false;

// Dónde está cada capa de nubes. En el cielo (hero) están en el mundo; sobre el mar acompañan a la cámara
// (están tan lejos que no tendrían paralaje): la lejana se apoya en el horizonte y la media queda arriba.
const NUBES_CIELO = {
  far: { x: 0, y: 3, z: -115, o: 1, rise: 9, par: 0.6 },
  mid: { x: 0, y: 0.4, z: -24, o: 0.97, rise: 15, par: 1.2 },
  near: { x: 0, y: 0.62, z: 1.5, o: 0.95, rise: 3.4, toward: 4.2, par: 0.5 },
};
// sobre el mar las lejanas flotan por encima del horizonte (si se apoyan en el agua parecen icebergs)
const NUBES_MAR = {
  far: { dy: 5.5, dz: -285, o: 0.9, sy: 0.7 },
  mid: { dy: 13.5, dz: -46, o: 0.72, sy: 1 },
  near: { dy: 0, dz: 0, o: 0, sy: 1 },
};
const CERCANA_SUBE = [1.02, 1.55]; // la capa cercana sube y pasa por la cámara al atravesar la nube
const DERIVA = { far: 0.0018, mid: 0.0032, near: 0.011 }; // vueltas de textura por segundo (viento)
const SALA_DUR = 0.8;
const ENV_DIA_HASTA = 1.38; // P: el entorno de día cambia al de atardecer dentro de la nube
const GUST = { strength: 0.8 };

export default async function createFondo(ctx) {
  if (FONDO_VIEJO) return (await import('./claroscuro.js')).default(ctx);
  const { THREE, scene, camera, renderer, shared, bus } = ctx;
  const disposables = [];
  const track = (x) => (disposables.push(x), x);
  let tier = ctx.quality;
  const reduced = ctx.reducedMotion;

  scene.background = null;
  scene.fog = null;

  // ---------- estados de luz ----------
  const E = createEstados(THREE);
  const live = createEstado(THREE);     // lo que se ve en este cuadro
  const salaLive = createEstado(THREE); // el atardecer de la sala actual (cruza en 0,8 s)
  const salaFrom = createEstado(THREE);
  copyEstado(live, E.dia);
  copyEstado(salaLive, E.atardecer);
  copyEstado(salaFrom, E.atardecer);
  let salaTo = E.atardecer;
  const salaK = { v: 1 };

  // ---------- piezas ----------
  const sunDir = new THREE.Vector3(0.6, 0.4, -0.7).normalize();
  const cielo = createCielo(ctx, { track });
  const nubes = createNubes(ctx, { track, tier });
  const mar = createMar(ctx, { track, tier, sunDir });
  const destellos = createDestellos(ctx, { track, tier, sunDir });
  const amb = createAmbiente(ctx, { track });
  const stats = createStats(ctx);
  // la estatua lee el sol (iridiscencia de las alas) y cuánto es de noche
  shared.sol = { dir: sunDir, color: live.sun, noche: 0 };

  const tmpDir = new THREE.Vector3();
  function sunFrom(st, azOffset, out) {
    const az = THREE.MathUtils.degToRad(st.sunAz + azOffset), el = THREE.MathUtils.degToRad(st.sunEl);
    return out.set(Math.sin(az) * Math.cos(el), Math.sin(el), -Math.cos(az) * Math.cos(el));
  }

  // ---------- horneados (una sola vez) ----------
  await nubes.bake();
  await warmTextures(renderer);
  amb.bake('dia', E.dia, sunFrom(E.dia, 0, tmpDir));
  amb.bake('atardecer', E.atardecer, sunFrom(E.atardecer, 0, tmpDir));
  amb.bake('noche', E.noche, sunFrom(E.noche, 0, tmpDir));
  // cada sala con su entorno (así el mármol toma el tono de la sala: plateado en ZURKLIMA, lavanda en
  // Mantra...). En calidad baja alcanza con el del atardecer.
  if (tier !== 'low') for (const id in E.salas) amb.bake(`sala-${id}`, E.salas[id], sunFrom(E.salas[id], 0, tmpDir));
  amb.endBake();
  amb.use('dia', true);

  // ---------- nubes según el guion ----------
  const L = nubes.layers;
  const names = ['far', 'mid', 'near'];
  function tintClouds(st) {
    for (const n of names) {
      const u = L[n].uniforms;
      u.uLit.value.copy(st.cloudLit); u.uShade.value.copy(st.cloudShade); u.uRim.value.copy(st.cloudRim);
      u.uHaze.value.copy(st.horizon);
      u.uBounce.value.copy(st.below);
      u.uBounceK.value = 0.4 * (1 - st.cloudUnder); // de día, la luz que devuelve el mar de nubes
      u.uUnder.value = st.cloudUnder; u.uRimI.value = st.cloudRimI;
    }
  }
  function placeClouds(P, px, py, cam, forceSea = false, night = 0) {
    const meltEnd = TRAMOS.derretir[1];
    const sky = !forceSea && P < meltEnd;
    const melt = ramp(P, TRAMOS.derretir);
    const nearUp = ramp(P, CERCANA_SUBE);
    const seaIn = forceSea ? 1 : ramp(P, [meltEnd, TRAMOS.llegada[1]]);
    for (const n of names) {
      const { mesh, uniforms: u } = L[n];
      let o;
      if (sky) {
        const c = NUBES_CIELO[n];
        const k = n === 'near' ? nearUp : melt;
        mesh.position.set(c.x + px * c.par, c.y + c.rise * k + py * c.par * 0.5, c.z + (c.toward || 0) * k);
        mesh.scale.set(n === 'near' ? 1 + k * 0.6 : 1, n === 'near' ? 1 + k * 0.6 : 1, 1);
        u.uMelt.value = n === 'near' ? Math.max(melt * 0.4, nearUp) : melt;
        o = c.o;
      } else {
        const c = NUBES_MAR[n];
        mesh.position.set(cam.x * 0.85 + px * 0.8, cam.y + c.dy, cam.z + c.dz);
        mesh.scale.set(1, c.sy, 1);
        u.uMelt.value = 0;
        o = c.o * seaIn * (n === 'mid' ? 1 - 0.65 * night : 1);
      }
      // calidad baja: 2 capas. En el cielo se quedan los cúmulos y los jirones; sobre el mar, las del horizonte
      if (tier === 'low' && ((sky && n === 'far') || (!sky && n === 'mid'))) o = 0;
      u.uOpacity.value = o;
      const on = o > 0.003;
      if (mesh.visible !== on) mesh.visible = on;
      mesh.rotation.y = Math.atan2(cam.x - mesh.position.x, cam.z - mesh.position.z);
    }
  }

  // ---------- reflejo del mar: se actualiza SOLO al cambiar de "lugar" (sala, mar, noche) ----------
  let anchor = null;
  const envMix = mar.uniforms.uEnvMix;
  let reflectState = E.atardecer;
  const prepareReflection = () => {
    cielo.apply(reflectState, 0);
    tintClouds(reflectState);
    placeClouds(START.obras + 0.5, 0, 0, camera.position, true);
  };
  // al terminar de dibujar el cubo nuevo, el agua cruza hacia él (el próximo update vuelve a poner lo que se ve)
  const onReflectionDone = (back) => {
    mar.setFront(back);
    gsap.killTweensOf(envMix);
    gsap.to(envMix, { value: back, duration: reduced ? 0.25 : SALA_DUR, ease: 'power3.inOut' });
  };
  // el reflejo nuevo arranca un poco después del cambio de sala, para no sumar trabajo al cuadro en el que
  // arrancan todas las transiciones
  const dReflection = gsap.delayedCall(0.35, () => mar.startReflection(prepareReflection, onReflectionDone)).pause();
  function setAnchor(next, st, instant = false) {
    if (anchor === next) return;
    anchor = next;
    reflectState = st;
    if (instant) {
      sunFrom(st, 0, sunDir);
      const back = mar.renderReflection(prepareReflection);
      mar.setFront(back);
      gsap.killTweensOf(envMix);
      envMix.value = back;
      return;
    }
    dReflection.restart(true); // después, de a una cara por cuadro
  }
  setAnchor('atardecer', E.atardecer, true);

  // ---------- eventos ----------
  let salaId = null, dim = 0;
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
  ];

  let gustTimer = 6, gust = 0, wind = 0.3, azOff = 0, exposure = 1, dimLive = 0, veilScroll = 0;
  const pointer = { x: 0, y: 0 };

  function setQuality(next) {
    tier = next;
    nubes.setQuality(tier); mar.setQuality(tier); destellos.setQuality(tier);
  }

  // solo desarrollo: ?sala=<id> simula estar en esa sala (sirve con ?only=fondo, sin scrollear)
  if (import.meta.env.DEV) {
    const q = new URLSearchParams(location.search);
    if (q.get('sala')) setTimeout(() => bus.emit('sala:change', { id: q.get('sala'), progress: 0.5 }), 600);
  }

  return {
    update(time, delta, s) {
      stats?.update();
      const dt = Math.min(delta, MAX_DT);
      const P = posicion(s);
      const cam = camera.position;

      // ---- guion ----
      const sunset = ramp(P, TRAMOS.atardecer);
      const seaK = ramp(P, TRAMOS.mar);
      const night = ramp(P, TRAMOS.noche);
      const through = bump(P, TRAMOS.atravesar);

      // ---- luz: día → atardecer de la sala → noche ----
      mixEstado(salaLive, salaFrom, salaTo, salaK.v);
      mixEstado(live, E.dia, salaLive, sunset);
      mixEstado(live, live, E.noche, night);
      shared.sol.noche = night;

      // ---- reflejo: un cubo nuevo solo al cambiar de lugar (antes de aplicar lo que se ve: el cubo
      //      usa por un instante el cielo de destino y lo de abajo lo vuelve a poner como está) ----
      if (P >= START.contacto) setAnchor('noche', E.noche);
      else if (salaId) setAnchor(salaId, E.salas[salaId] || E.atardecer);
      else if (P > START.descenso) setAnchor('atardecer', E.atardecer);
      if (mar.mesh.visible) { sunFrom(reflectState, 0, sunDir); mar.stepReflection(); }

      // el sol sigue un poco al mouse: ±8° sobre el mar (mueve el camino de sol), menos en el cielo
      pointer.x = shared.pointer.x + shared.tilt.x; pointer.y = shared.pointer.y + shared.tilt.y;
      const azTarget = reduced ? 0 : pointer.x * (3 + 5 * seaK);
      azOff += (azTarget - azOff) * damp(2.2, dt);
      sunFrom(live, azOff, sunDir);

      // ---- viento: base + scroll rápido + ráfagas (la estatua lo lee para las alas de luz) ----
      gustTimer -= dt;
      if (gustTimer <= 0 && !reduced) { gustTimer = 8 + Math.random() * 7; gust = 1; bus.emit('wind:gust', GUST); }
      gust = Math.max(0, gust - dt * 0.5);
      const sv = Math.min(1, Math.abs(s.velocity) * 0.025);
      wind += (0.32 + sv * 0.5 + gust * 0.45 - wind) * damp(2, dt);
      shared.wind.x = -0.93; shared.wind.y = 0.22; shared.wind.z = -0.3;
      shared.wind.strength = Math.min(1, wind);

      // ---- cielo ----
      cielo.apply(live, time);

      // ---- nubes ----
      tintClouds(live);
      placeClouds(P, pointer.x, pointer.y, cam, false, night);
      for (const n of names) {
        const lay = L[n];
        if (!reduced) lay.drift = (lay.drift + dt * DERIVA[n] * (0.6 + wind)) % 1;
        lay.uniforms.uDrift.value = lay.drift;
      }
      const vu = nubes.veil.material.uniforms;
      vu.uAmount.value = through * 0.92;
      vu.uColor.value.copy(live.veil);
      vu.uShade.value.copy(live.cloudShade).lerp(live.veil, 0.55);
      veilScroll = (veilScroll + dt * (0.25 + Math.abs(s.velocity) * 0.004)) % 10;
      vu.uScroll.value = veilScroll;
      const veilOn = vu.uAmount.value > 0.003;
      if (nubes.veil.visible !== veilOn) nubes.veil.visible = veilOn;

      // ---- mar ----
      const mu = mar.uniforms;
      mu.uTime.value = reduced ? time * 0.25 : time;
      mu.uFade.value = seaK;
      mu.uFadeCol.value.copy(live.below);
      mu.uDeep.value.copy(live.seaDeep); mu.uShallow.value.copy(live.seaShallow);
      mu.uHaze.value.copy(live.haze); mu.uSunColor.value.copy(live.sun);
      mu.uSand.value.copy(live.sand); mu.uFoam.value.copy(live.foam);
      mu.uSpec.value = live.spec; mu.uGlitter.value = live.glitter; mu.uDetail.value = live.detail; mu.uReflI.value = live.reflI;
      mu.uShore.value = night;
      mu.uAmp.value = 1 - night * 0.55;
      const seaOn = seaK > 0.001;
      if (mar.mesh.visible !== seaOn) mar.mesh.visible = seaOn;
      if (seaOn && !reduced) mar.pointerRipple(pointer.x, pointer.y, time);

      // ---- destellos del camino de sol ----
      const du = destellos.uniforms;
      du.uTime.value = reduced ? time * 0.3 : time;
      du.uAmount.value = live.glints * seaK;
      du.uGold.value.copy(live.glintGold); du.uSilver.value.copy(live.glintSilver); du.uGoldMix.value = live.goldMix;
      const glOn = du.uAmount.value > 0.003;
      if (destellos.points.visible !== glOn) destellos.points.visible = glOn;

      // ---- luces y entorno (el cambio de entorno queda tapado: adentro de la nube / a media noche) ----
      // en calidad baja la estatua no tiene luces de contorno: el cielo la ilumina un poco más
      if (tier === 'low') live.hemiI *= 1.35;
      amb.apply(live, sunDir);
      const salaEnv = salaId && amb.envs[`sala-${salaId}`] ? `sala-${salaId}` : 'atardecer';
      const envName = P < ENV_DIA_HASTA ? 'dia' : night >= 0.5 ? 'noche' : salaEnv;
      amb.use(envName, envName === 'dia' || amb.active === 'dia'); // día ↔ atardecer: directo, adentro de la nube

      // ---- proyecto abierto: baja la luz ----
      dimLive += (dim - dimLive) * damp(4, dt);
      exposure = live.exposure * (1 - dimLive * 0.28);
      renderer.toneMappingExposure = exposure;
    },
    resize(w, h) { nubes.resize(w, h); destellos.resize(); },
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
    },
  };
}
