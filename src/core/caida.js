import { gsap } from 'gsap';
import { CAIDA, posicion } from '../config/historia.js';

// CAÍDA AUTOMÁTICA (cielo → mar), como una toma de película.
// Cuando el scroll llega al final del hero se bloquea y la cámara cae sola en ~4 s: entra en la capa de nubes,
// las atraviesa, sale el horizonte y frena suave a ras del agua. Al terminar se devuelve el scroll. Si desde
// ahí se scrollea para arriba, la misma toma pero al revés.
//   · Todo el sitio sigue leyendo la posición del scroll (P): la caída solo mueve el scroll por el usuario,
//     cuadro a cuadro, siguiendo una curva de altura pensada (lenta al arrancar, rápida adentro de las nubes,
//     freno largo al final). Así nada más tuvo que cambiar para que la caída sea automática.
//   · Clic, tecla o scroll fuerte durante la caída = salta directo al final en 0,4 s.
//   · prefers-reduced-motion: fundido simple (sin movimiento).
//   · Con ?sincaida (solo desarrollo) o scroll.caida.enabled = false no hay caída automática (capturas, QA).
// shared.caida = { on, dir, q, skip } lo escribe el core (el fondo y la estatua lo leen: pájaros, rayos, símbolos).

export const DURACION = 4;          // s
const SALTO = 0.4;                  // s al saltarla
const ARMADO = 0.55;                // s sin escuchar entradas (la inercia del scroll que la disparó)
const TOL = 0.004;                  // tolerancia en P

// Curva de la caída: velocidad de bajada (m/s) en el tiempo. Lenta al arrancar, acelera adentro de la capa de
// nubes (la cámara las atraviesa a ~1 s del arranque), pico justo debajo y un freno largo hasta el agua.
const sm = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const velocidad = (t) => sm(0, 1.2, t) * (0.28 + 0.72 * sm(0.9, 2.3, t)) * Math.pow(1 - sm(2.15, DURACION, t), 1.3);

// P (posición del scroll) en cada instante q = t / DURACION, ya invertida la curva de altura de historia.js
const N = 400;
const PATH = new Float32Array(N + 1);
(function bake() {
  const cum = new Float32Array(N + 1);
  for (let i = 1; i <= N; i++) cum[i] = cum[i - 1] + (velocidad((i - 0.5) / N * DURACION));
  const [p0, p1] = CAIDA.tramo;
  for (let i = 0; i <= N; i++) {
    const s = Math.min(1, Math.max(0, cum[i] / cum[N]));            // fracción de altura recorrida
    // inversa de smoothstep: s = 3u² − 2u³
    const u = 0.5 - Math.sin(Math.asin(1 - 2 * s) / 3);
    PATH[i] = p0 + u * (p1 - p0);
  }
})();
function pathP(q) {
  const x = Math.min(1, Math.max(0, q)) * N, i = Math.min(N - 1, Math.floor(x));
  return PATH[i] + (PATH[i + 1] - PATH[i]) * (x - i);
}
function pathQ(P) { // q cuyo P es el pedido (búsqueda binaria; PATH crece)
  let a = 0, b = N;
  while (b - a > 1) { const m = (a + b) >> 1; if (PATH[m] < P) a = m; else b = m; }
  const d = PATH[b] - PATH[a];
  return (a + (d > 1e-6 ? (P - PATH[a]) / d : 0)) / N;
}

export const P_ARRIBA = CAIDA.puerta;     // el scroll llega acá y se dispara la caída
export const P_ABAJO = CAIDA.tramo[1];    // donde queda a ras del agua
const P_HERO = 0.5;                       // arriba de todo

export function createCaida({ lenis, state, bus, shared, reducedMotion, yDeP }) {
  const enabledByUrl = !(import.meta.env.DEV && new URLSearchParams(location.search).has('sincaida'));
  const api = { enabled: enabledByUrl, bypass: 0, locked: false, active: false };
  const info = shared.caida || (shared.caida = { on: false, dir: 1, q: 0, skip: false });
  let side = null;              // 'arriba' | 'abajo' | null (sin ubicar)
  let run = null;               // { dir, q0, q1, t, dur, from, to, skip, armed }
  let prevP = null, last = 0;
  let fade = null;
  const html = document.documentElement;
  let wheelAcc = 0, wheelT = 0;

  function ubicar(P) {
    if (P <= P_ARRIBA + TOL) return 'arriba';
    if (P >= P_ABAJO - TOL) return 'abajo';
    return null;
  }

  // ---- entradas que la saltan ----
  const saltar = () => { if (run && !run.skip && run.armed) startSkip(); };
  const onKey = (e) => { if (!e.metaKey && !e.ctrlKey && !e.altKey && !/^(Shift|Control|Alt|Meta|Tab)$/.test(e.key)) saltar(); };
  const onWheel = (e) => {
    if (!run) return;
    e.preventDefault();
    const now = performance.now();
    if (now - wheelT > 300) wheelAcc = 0;
    wheelT = now;
    wheelAcc += Math.abs(e.deltaY);
    if (run.armed && wheelAcc > 260) saltar();
  };
  const onTouch = () => saltar();
  function listen(on) {
    const m = on ? addEventListener : removeEventListener;
    m('pointerdown', saltar, true);
    m('keydown', onKey, true);
    m('wheel', onWheel, { passive: false, capture: true });
    m('touchstart', onTouch, { passive: true, capture: true });
  }

  function start(dir, P) {
    const total = DURACION;
    run = { dir, t: 0, dur: total, from: 0, to: 0, skip: false, armed: false, q0: 0, q1: 1 };
    if (dir > 0) { run.q0 = Math.min(0.98, pathQ(Math.max(P, CAIDA.tramo[0] + 1e-3))); run.q1 = 1; }
    else { run.q0 = pathQ(Math.min(P, P_ABAJO)); run.q1 = 0; }
    run.dur = total * Math.abs(run.q1 - run.q0);
    info.on = true; info.dir = dir; info.q = run.q0; info.skip = false;
    api.active = true;
    lenis.stop();
    html.classList.add('scroll-locked', 'en-caida');
    listen(true);
    setTimeout(() => { if (run) run.armed = true; }, ARMADO * 1000);
    bus.emit('caida:inicio', { dir });
    if (reducedMotion) startFade();
  }

  function startSkip() {
    run.skip = true; info.skip = true;
    run.t = 0; run.dur = SALTO;
    run.from = lenis.animatedScroll; run.to = yDeP(run.dir > 0 ? P_ABAJO : P_ARRIBA - 0.02);
    if (fade) { fade.progress(1); }
  }

  // movimiento reducido: un fundido a la capa de nubes y el salto
  function startFade() {
    ensureFade();
    run.fade = true;
    fade = gsap.timeline()
      .to(fadeEl, { opacity: 1, duration: 0.3, ease: 'power2.in' })
      .add(() => { lenis.scrollTo(yDeP(run.dir > 0 ? P_ABAJO : P_ARRIBA - 0.02), { immediate: true, force: true }); })
      .to(fadeEl, { opacity: 0, duration: 0.5, ease: 'power2.out', delay: 0.1 })
      .add(() => { fade = null; if (run) fin(); });
  }
  let fadeEl = null;
  function ensureFade() {
    if (fadeEl) return;
    fadeEl = document.createElement('div');
    fadeEl.className = 'caida-fundido';
    fadeEl.setAttribute('aria-hidden', 'true');
    document.body.appendChild(fadeEl);
  }

  function fin() {
    const dir = run.dir;
    listen(false);
    run = null; info.on = false; info.skip = false; api.active = false;
    html.classList.remove('scroll-locked', 'en-caida');
    lenis.start();
    side = dir > 0 ? 'abajo' : 'arriba';
    prevP = null;
    bus.emit('caida:fin', { dir });
    // de vuelta arriba: el scroll baja suave hasta el principio del hero (así vuelve el texto)
    if (dir < 0 && !reducedMotion) lenis.scrollTo(yDeP(P_HERO), { duration: 1.4, easing: (x) => 1 - Math.pow(1 - x, 3) });
  }

  function step(dt) {
    if (run.fade) return;
    if (run.skip) {
      run.t += dt;
      const k = Math.min(1, run.t / run.dur), e = 1 - (1 - k) * (1 - k);
      lenis.scrollTo(run.from + (run.to - run.from) * e, { immediate: true, force: true });
      info.q = run.q0 + (run.q1 - run.q0) * k;
      if (k >= 1) fin();
      return;
    }
    run.t += dt;
    const k = Math.min(1, run.t / run.dur);
    const q = run.q0 + (run.q1 - run.q0) * k;
    info.q = q;
    const P = k >= 1 ? (run.dir > 0 ? P_ABAJO : pathP(0)) : pathP(q);
    lenis.scrollTo(yDeP(P), { immediate: true, force: true });
    if (k >= 1) fin();
  }

  return {
    api,
    /** Cada cuadro, después de calcular el estado del scroll. */
    update(timeMs) {
      const dt = Math.min(0.05, Math.max(0, (timeMs - last) / 1000));
      last = timeMs;
      if (run) { step(dt); return; }
      const P = posicion(state);
      if (side === null) {
        side = ubicar(P);
        if (side === null && api.enabled) { // la página se abrió en medio de la caída (el navegador recordó la posición)
          const abajo = P > (P_ARRIBA + P_ABAJO) / 2;
          lenis.scrollTo(yDeP(abajo ? P_ABAJO : P_HERO), { immediate: true, force: true });
          side = abajo ? 'abajo' : 'arriba';
        }
        prevP = P;
        return;
      }
      if (side === null) { side = ubicar(P); prevP = P; return; }
      const libre = api.enabled && !api.bypass && !api.locked && !html.classList.contains('en-intro');
      if (libre && prevP !== null) {
        if (side === 'arriba' && P > P_ARRIBA + TOL && P >= prevP && P < P_ABAJO - 0.2) { start(1, P); prevP = P; return; }
        if (side === 'abajo' && P < P_ABAJO - TOL && P <= prevP && P > P_ARRIBA + 0.2) { start(-1, P); prevP = P; return; }
      }
      // se movió por otro lado (menú, salto): se reubica sin disparar la toma
      const now = ubicar(P);
      if (now) side = now;
      else if (!api.bypass && !libre) { /* dentro de la zona sin poder disparar (desarrollo): no se toca */ }
      prevP = P;
    },
    get active() { return !!run; },
    destroy() { listen(false); fade?.kill(); fadeEl?.remove(); },
  };
}
