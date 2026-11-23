import './ui.css';
import { gsap } from 'gsap';
import projects from '../data/projects.json';
import contacto from '../config/contacto.js';
import { posicion, START, TRAMOS } from '../config/historia.js';
import { sala as salaLayout } from '../config/layout.js';

// Capa de texto ("Hecha de luz"):
//  · alto de cada sección (src/config/sections.js) y links de Contacto (src/config/contacto.js)
//  · SALAS: la sección "obras" tiene una sala de 100vh por proyecto. Acá se calcula en cuál estamos y se
//    emite `sala:change` { id, progress } (CLAUDE.md sección 8). La ficha (número, nombre, rubro, línea y
//    "Ver sitio") va fija justo debajo de la ventana grande: su lugar sale de config/layout.js, igual que
//    el de la ventana 3D. Entre sala y sala el texto se cruza en 0,8 s.
//  · tono: tinta oscura sobre el cielo claro del hero; blanco cálido sobre el mar y la noche.
// Todo se hace en el loop único (scroll.onUpdate) y solo toca el DOM cuando algo cambia.
export function setupUI({ sections, scroll, bus }) {
  sections.forEach((s) => {
    const el = document.querySelector(`[data-section="${s.id}"]`);
    if (el) el.style.setProperty('--h', s.height);
  });
  setupContacto();
  if (scroll && bus) {
    setupSalas({ sections, scroll, bus });
    setupTono(scroll);
  }
  return {
    /** Todo listo (compilado y subido a la placa): se va el velo. */
    ready() { requestAnimationFrame(() => requestAnimationFrame(() => document.documentElement.classList.add('is-ready'))); },
  };
}

function setupContacto() {
  const wa = document.querySelector('[data-contacto="whatsapp"]');
  const mail = document.querySelector('[data-contacto="mail"]');
  // solo desarrollo: ?contacto=demo muestra los dos links (para ver el diseño antes de cargar los datos)
  const demo = import.meta.env.DEV && new URLSearchParams(location.search).get('contacto') === 'demo';
  if (wa && (contacto.whatsapp || demo)) {
    wa.href = contacto.whatsapp ? `https://wa.me/${contacto.whatsapp}?text=${encodeURIComponent(contacto.mensaje || '')}` : '#contacto';
    wa.hidden = false;
  }
  if (mail && (contacto.mail || demo)) {
    mail.href = contacto.mail ? `mailto:${contacto.mail}` : '#contacto';
    mail.hidden = false;
  }
}

function setupTono(scroll) {
  const root = document.documentElement;
  let tono = '', hero = null, contact = null;
  scroll.onUpdate((st) => {
    const P = posicion(st);
    const t = P < TRAMOS.atravesar[0] + 0.32 ? 'oscuro' : 'claro'; // cambia adentro de la nube
    if (t !== tono) { tono = t; root.dataset.tono = t; }
    const h = P > TRAMOS.derretir[0] + 0.04;
    if (h !== hero) { hero = h; root.classList.toggle('fuera-hero', h); }
    const c = P > START.contacto + 0.42;
    if (c !== contact) { contact = c; root.classList.toggle('en-contacto', c); }
  });
}

function setupSalas({ sections, scroll, bus }) {
  const obras = sections.findIndex((s) => s.id === 'obras');
  const el = document.getElementById('sala');
  if (obras < 0 || !el) return;
  const n = projects.length;
  const ref = {
    num: el.querySelector('.sala__num'), name: el.querySelector('.sala__nombre'), rubro: el.querySelector('.sala__rubro'),
    linea: el.querySelector('.sala__linea'), link: el.querySelector('.sala__link'),
  };
  const parts = [el.querySelector('.sala__a'), el.querySelector('.sala__b')];
  const pad = (v) => String(v).padStart(2, '0');
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

  // la ficha va debajo de la ventana grande (mismo rectángulo que usa la estatua)
  function place() {
    const L = salaLayout();
    el.style.setProperty('--cap-x', `${Math.round(L.cap.x)}px`);
    el.style.setProperty('--cap-y', `${Math.round(L.cap.y)}px`);
    el.style.setProperty('--cap-w', `${Math.round(L.cap.w)}px`);
  }
  place();
  addEventListener('resize', place);

  let room = -1, lastProgress = -1, shown = -1;
  const payload = { id: null, progress: 0 }; // se reutiliza: no se crean objetos mientras se scrollea

  function fill(i) {
    const p = projects[i];
    ref.num.textContent = `${pad(i + 1)} / ${pad(n)}`;
    ref.name.textContent = p.title;
    ref.rubro.textContent = p.rubro || '';
    ref.linea.textContent = p.linea || '';
    if (p.url) { ref.link.href = p.url; ref.link.hidden = false; } else ref.link.hidden = true;
    shown = i;
  }
  // 0,8 s en total: se va (0,3 s, power3.inOut) y entra la nueva (0,5 s, expo.out)
  const tl = gsap.timeline({ paused: true });
  function show(i) {
    tl.clear();
    if (i < 0) {
      tl.to(parts, { opacity: 0, y: -6, duration: reduced ? 0.2 : 0.3, ease: 'power3.inOut', stagger: 0.04 })
        .add(() => { el.classList.remove('is-on'); shown = -1; });
      tl.restart();
      return;
    }
    el.classList.add('is-on');
    if (shown >= 0) tl.to(parts, { opacity: 0, y: -6, duration: reduced ? 0.15 : 0.3, ease: 'power3.inOut', stagger: 0.03 });
    tl.add(() => fill(i))
      .fromTo(parts, { opacity: 0, y: 12 }, { opacity: 1, y: 0, duration: reduced ? 0.2 : 0.5, ease: 'expo.out', stagger: 0.06 });
    tl.restart();
  }
  // armada desde el principio (invisible): la primera aparición no tiene que maquetar ni dibujar letras nuevas
  fill(0);
  shown = -1;
  gsap.set(parts, { opacity: 0 });

  scroll.onUpdate((st) => {
    let i = -1, p = 0;
    if (st.section === obras) {
      const v = st.sectionProgress * n;
      i = Math.min(n - 1, Math.floor(v));
      p = v - i;
    }
    if (i !== room) {
      room = i;
      lastProgress = p;
      show(i);
      payload.id = i < 0 ? null : projects[i].id;
      payload.progress = p;
      bus.emit('sala:change', payload);
    } else if (i >= 0 && Math.abs(p - lastProgress) >= 0.004) {
      lastProgress = p;
      payload.progress = p;
      bus.emit('sala:change', payload);
    }
  });
}
