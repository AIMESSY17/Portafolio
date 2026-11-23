import Lenis from 'lenis';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { START, HEIGHT } from '../config/historia.js';
import { createCaida } from './caida.js';

gsap.registerPlugin(ScrollTrigger);

// Scroll suave (Lenis) + ScrollTrigger. Calcula scrollState para todos los módulos.
// Lenis se actualiza desde el loop único (no tiene requestAnimationFrame propio).
// Además maneja la caída automática del cielo al mar (caida.js): bloquea el scroll mientras dura.
export function createScroll({ sections, bus, shared, reducedMotion }) {
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

  /** La inversa de posicion(): a qué scroll (px) corresponde la posición P del guion. */
  function yDeP(P) {
    let idx = 0;
    for (let i = 0; i < sections.length; i++) if (START[sections[i].id] <= P) idx = i;
    const s = sections[idx], el = sectionEls[idx];
    if (!el) return Math.max(0, (P - 0.5) * innerHeight);
    const k = (P - START[s.id]) / HEIGHT[s.id];
    return el.offsetTop + k * el.offsetHeight - innerHeight * 0.5;
  }

  const caida = createCaida({ lenis, state, bus, shared, reducedMotion, yDeP });

  return {
    state,
    lenis,
    caida: caida.api,
    refresh() { collect(); ScrollTrigger.refresh(); compute(); },
    update(timeMs) { lenis.raf(timeMs); compute(); caida.update(timeMs); if (caida.active) compute(); listeners.forEach((fn) => fn(state)); },
    /** fn(scrollState) en cada cuadro, desde el loop único. Devuelve la función para darse de baja. */
    onUpdate(fn) { listeners.add(fn); return () => listeners.delete(fn); },
    /** Bloquea el scroll (por ejemplo, con un proyecto abierto). */
    // Al desbloquear vuelve EXACTAMENTE a la posición que había al bloquear.
    lock() {
      savedY = lenis.animatedScroll ?? scrollY;
      caida.api.locked = true;
      lenis.stop();
      document.documentElement.classList.add('scroll-locked');
    },
    unlock() {
      document.documentElement.classList.remove('scroll-locked');
      caida.api.locked = false;
      lenis.start();
      lenis.scrollTo(savedY, { immediate: true, force: true });
    },
    /**
     * Lleva el scroll a `target` (px). No dispara la caída automática: se usa para los saltos del menú y de
     * las salas, que atraviesan el tramo de la caída a propósito.
     */
    scrollTo(target, opts = {}) {
      caida.api.bypass++;
      let ended = false;
      const done = () => { if (!ended) { ended = true; caida.api.bypass = Math.max(0, caida.api.bypass - 1); } };
      lenis.scrollTo(target, { ...opts, onComplete: (l) => { done(); opts.onComplete?.(l); } });
      // si Lenis no animó (ya estaba ahí, o está frenado) el onComplete llega igual; por las dudas:
      setTimeout(done, ((opts.duration ?? 1.2) + 0.3) * 1000);
    },
    destroy() { caida.destroy(); lenis.destroy(); },
  };
}
