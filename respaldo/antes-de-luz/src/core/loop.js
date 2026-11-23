import { gsap } from 'gsap';

// ÚNICO loop de animación del sitio. Usamos el ticker de GSAP como reloj, así
// GSAP, ScrollTrigger, Lenis y Three.js comparten el mismo requestAnimationFrame.
export function createLoop() {
  const callbacks = new Set();
  let running = false;
  let start = -1, last = 0;
  gsap.ticker.lagSmoothing(500, 33);

  function frame(t) { // t en segundos (reloj de GSAP)
    if (start < 0) { start = t; last = t; }
    const delta = Math.min(0.1, t - last); // tope: evita saltos al volver de otra pestaña
    last = t;
    const time = t - start;
    callbacks.forEach((fn) => fn(time, delta, t * 1000));
  }

  return {
    add(fn) { callbacks.add(fn); return () => callbacks.delete(fn); },
    start() { if (!running) { running = true; gsap.ticker.add(frame); } },
    stop() { running = false; gsap.ticker.remove(frame); },
  };
}
