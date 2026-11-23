import Lenis from 'lenis';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

gsap.registerPlugin(ScrollTrigger);

// Scroll suave (Lenis) + ScrollTrigger. Calcula scrollState para todos los módulos.
// Lenis se actualiza desde el loop único (no tiene requestAnimationFrame propio).
export function createScroll({ sections, bus, reducedMotion }) {
  const lenis = new Lenis({
    autoRaf: false,
    lerp: reducedMotion ? 1 : 0.09,
    smoothWheel: !reducedMotion,
  });
  lenis.on('scroll', ScrollTrigger.update);

  const state = { progress: 0, velocity: 0, section: 0, sectionProgress: 0 };
  const listeners = new Set(); // la capa de texto (ui) se entera en cada cuadro, sin tener otro loop
  let sectionEls = [];
  let lastSection = -1;
  let savedY = 0;

  function collect() {
    sectionEls = sections.map((s) => document.querySelector(`[data-section="${s.id}"]`)).filter(Boolean);
  }

  function compute() {
    const max = Math.max(1, document.documentElement.scrollHeight - innerHeight);
    const y = lenis.scroll ?? scrollY;
    state.progress = Math.min(1, Math.max(0, y / max));
    state.velocity = lenis.velocity || 0;

    // sección actual = la que contiene el centro de la pantalla
    const mid = y + innerHeight * 0.5;
    let idx = 0;
    for (let i = 0; i < sectionEls.length; i++) {
      if (sectionEls[i].offsetTop <= mid) idx = i;
    }
    const el = sectionEls[idx];
    if (el) state.sectionProgress = Math.min(1, Math.max(0, (mid - el.offsetTop) / Math.max(1, el.offsetHeight)));
    state.section = idx;
    if (idx !== lastSection) {
      lastSection = idx;
      bus.emit('section:change', { index: idx, id: sections[idx]?.id });
    }
  }

  return {
    state,
    lenis,
    refresh() { collect(); ScrollTrigger.refresh(); compute(); },
    update(timeMs) { lenis.raf(timeMs); compute(); listeners.forEach((fn) => fn(state)); },
    /** fn(scrollState) en cada cuadro, desde el loop único. Devuelve la función para darse de baja. */
    onUpdate(fn) { listeners.add(fn); return () => listeners.delete(fn); },
    /** Bloquea el scroll (por ejemplo, con un proyecto abierto). */
    // Al desbloquear vuelve EXACTAMENTE a la posición que había al bloquear.
    lock() {
      savedY = lenis.animatedScroll ?? scrollY;
      lenis.stop();
      document.documentElement.classList.add('scroll-locked');
    },
    unlock() {
      document.documentElement.classList.remove('scroll-locked');
      lenis.start();
      lenis.scrollTo(savedY, { immediate: true, force: true });
    },
    scrollTo(target, opts) { lenis.scrollTo(target, opts); },
    destroy() { lenis.destroy(); },
  };
}
