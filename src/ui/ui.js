import './ui.css';
import { gsap } from 'gsap';
import projects from '../data/projects.json';
import contacto from '../config/contacto.js';
import { posicion, START, P_CRUCE, CAIDA } from '../config/historia.js';
import { createSonido } from './sonido.js';
import { sala as salaLayout } from '../config/layout.js';
import { setupPelicula, CAPITULOS } from './pelicula.js';

// Capa de texto (versión película):
//  · alto de cada sección (src/config/sections.js) y links de contacto (src/config/contacto.js)
//  · SALAS: una de 100vh por proyecto. Acá se calcula en cuál estamos y se emite `sala:change` { id, progress }
//    (CLAUDE.md 8). La ficha va junto a la ventana grande (config/layout.js): número de obra chico, LA FRASE QUE LA
//    HACE ÚNICA en dorado (lo primero que se lee), nombre grande, rubro en itálica, Necesitaba / Hicimos / Resultado
//    y "Ver sitio ↗". Entre sala y sala el texto se cruza en 0,8 s.
//  · MENÚ: capítulos (I–IV) y, adentro de "Las obras", cada proyecto para saltar directo.
//  · la película (pelicula.js): apertura, franjas, títulos de capítulo, créditos finales.
// Todo se hace en el loop único (scroll.onUpdate) y solo toca el DOM cuando algo cambia.
const ROMANOS = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII'];
const DEMO = import.meta.env.DEV && new URLSearchParams(location.search).has('demo');

export function setupUI({ sections, scroll, bus, shared }) {
  sections.forEach((s) => {
    const el = document.querySelector(`[data-section="${s.id}"]`);
    if (el) el.style.setProperty('--h', s.height);
  });
  setupContacto();
  let pelicula = null;
  if (scroll && bus) {
    const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
    pelicula = setupPelicula({ scroll, bus, shared, reduced });
    setupSalas({ sections, scroll, bus });
    setupTono(scroll);
    setupMenu({ scroll });
    setupCarga(bus);
    createSonido({ scroll, bus });
  }
  return {
    pelicula,
    /** Todo listo (compilado y subido a la placa): se va el velo y arranca la película. */
    ready() {
      requestAnimationFrame(() => requestAnimationFrame(() => {
        document.documentElement.classList.add('is-ready');
        pelicula?.listo();
      }));
    },
  };
}

function setupContacto() {
  const wa = document.querySelector('[data-contacto="whatsapp"]');
  const mail = document.querySelector('[data-contacto="mail"]');
  const demo = import.meta.env.DEV && new URLSearchParams(location.search).get('contacto') === 'demo';
  const waHref = contacto.whatsapp ? `https://wa.me/${contacto.whatsapp}?text=${encodeURIComponent(contacto.mensaje || '')}` : '';
  if (wa && (waHref || demo)) { wa.href = waHref || '#contacto'; wa.hidden = false; }
  const flot = document.querySelector('[data-wa]');
  if (flot && waHref) { flot.href = waHref; flot.hidden = false; }
  if (mail && (contacto.mail || demo)) { mail.href = contacto.mail ? `mailto:${contacto.mail}` : '#contacto'; mail.hidden = false; }
}

function setupTono(scroll) {
  const root = document.documentElement;
  let tono = '', hero = null, contact = null;
  scroll.onUpdate((st) => {
    const P = posicion(st);
    const t = P < P_CRUCE ? 'oscuro' : 'claro'; // cambia adentro de la nube
    if (t !== tono) { tono = t; root.dataset.tono = t; }
    const h = P > 0.72;
    if (h !== hero) { hero = h; root.classList.toggle('fuera-hero', h); }
    const c = P > START.contacto + 0.42;
    if (c !== contact) { contact = c; root.classList.toggle('en-contacto', c); }
  });
}

// Avance de la carga: una línea de oro fina en el velo
function setupCarga(bus) {
  const velo = document.querySelector('.velo');
  if (!velo) return;
  let shown = 0;
  bus.on('carga:progreso', ({ p }) => {
    if (p <= shown) return;
    shown = p;
    velo.style.setProperty('--carga', p.toFixed(3));
  });
}

// Menú chico (arriba a la derecha): capítulos y obras. Escape, clic afuera o elegir algo lo cierran.
function setupMenu({ scroll }) {
  const root = document.getElementById('menu');
  if (!root) return;
  const btn = root.querySelector('.menu__btn'), panel = root.querySelector('.menu__panel');
  const lista = root.querySelector('[data-menu-lista]');
  const n = projects.length;
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  lista.innerHTML = CAPITULOS.map((c, i) => {
    const obras = i === 2
      ? `<ol class="menu__obras">${projects.map((p, k) => `<li><a href="#${esc(p.id)}" data-sala="${k}"><span class="menu__n">${String(k + 1).padStart(2, '0')}</span><span class="menu__nombre">${esc(p.title)}</span><span class="menu__rubro">${esc(p.rubro || '')}</span></a></li>`).join('')}</ol>`
      : '';
    return `<li class="menu__cap"><a href="#cap-${i + 1}" data-cap="${i}"><span class="menu__n menu__n--cap">${c.num}</span><span class="menu__cap-t">${c.titulo}</span></a>${obras}</li>`;
  }).join('');
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const secEl = (id) => document.querySelector(`[data-section="${id}"]`);
  const easing = (x) => 1 - Math.pow(1 - x, 3);
  function irA(y, opts = {}) { scroll.scrollTo(Math.max(0, Math.round(y)), { duration: reduced ? 0 : 2.2, easing, force: true, ...opts }); }
  function irSala(i) { const el = secEl('obras'); if (el) irA(el.offsetTop + (el.offsetHeight / n) * i + 2); }
  function irCap(i) {
    if (i === 0) return irA(0);
    if (i === 1) {
      // II: vuelve al borde del cielo y deja que la caída corra sola (la toma completa)
      const y = (CAIDA.puerta - 0.5 - 0.03) * innerHeight;
      irA(y, { duration: reduced ? 0 : 1.6, onComplete: () => setTimeout(() => scroll.lenis.scrollTo(y + innerHeight * 0.08, { duration: 0.5 }), 120) });
      return;
    }
    if (i === 2) return irSala(0);
    const el = secEl('contacto');
    if (el) irA(el.offsetTop + el.offsetHeight - innerHeight);
  }
  let open = false;
  function set(v) {
    if (v === open) return;
    open = v;
    btn.setAttribute('aria-expanded', String(v));
    document.documentElement.classList.toggle('menu-abierto', v);
    if (v) { panel.hidden = false; requestAnimationFrame(() => panel.classList.add('is-on')); panel.querySelector('a')?.focus({ preventScroll: true }); }
    else { panel.classList.remove('is-on'); setTimeout(() => { if (!open) panel.hidden = true; }, 380); }
  }
  btn.addEventListener('click', () => set(!open));
  panel.addEventListener('click', (e) => {
    const a = e.target.closest('a');
    if (!a) return;
    e.preventDefault();
    if (a.dataset.sala !== undefined) irSala(Number(a.dataset.sala));
    else if (a.dataset.cap !== undefined) irCap(Number(a.dataset.cap));
    set(false);
    btn.focus({ preventScroll: true });
  });
  addEventListener('keydown', (e) => { if (e.key === 'Escape' && open) { set(false); btn.focus({ preventScroll: true }); } });
  addEventListener('pointerdown', (e) => { if (open && !root.contains(e.target)) set(false); }, true);
  // la sala actual se marca en la lista
  let cur = -2;
  scroll.onUpdate((st) => {
    if (!open) return;
    const P = posicion(st);
    const i = P >= START.obras && P < START.contacto ? Math.min(n - 1, Math.floor(P - START.obras)) : -1;
    if (i === cur) return;
    cur = i;
    lista.querySelectorAll('[data-sala]').forEach((a, k) => a.classList.toggle('is-actual', k === i));
  });
}

function setupSalas({ sections, scroll, bus }) {
  const obras = sections.findIndex((s) => s.id === 'obras');
  const el = document.getElementById('sala');
  if (obras < 0 || !el) return;
  const n = projects.length;
  const ref = {
    num: el.querySelector('.sala__num'), unica: el.querySelector('.sala__unica'), name: el.querySelector('.sala__nombre'),
    rubro: el.querySelector('.sala__rubro'), link: el.querySelector('.sala__link'),
    filas: {
      necesitaba: el.querySelector('[data-fila="necesitaba"]'),
      hicimos: el.querySelector('[data-fila="hicimos"]'),
      resultado: el.querySelector('[data-fila="resultado"]'),
    },
  };
  const parts = [el.querySelector('.sala__a'), el.querySelector('.sala__b')];
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

  // la ficha va junto a la ventana grande (mismo rectángulo que usa la estatua)
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

  function fila(key, text) {
    const f = ref.filas[key];
    const t = text || (DEMO ? '[a completar]' : '');
    f.querySelector('dd').textContent = t;
    f.hidden = !t;
  }
  function fill(i) {
    const p = projects[i];
    ref.num.textContent = `Obra ${ROMANOS[i] || i + 1}`;
    ref.unica.textContent = p.unica || '';
    ref.name.textContent = p.title;
    ref.rubro.textContent = p.rubro || '';
    fila('necesitaba', p.necesitaba);
    fila('hicimos', p.hicimos);
    fila('resultado', p.resultado);
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
      .fromTo(parts, { opacity: 0, y: 12 }, { opacity: 1, y: 0, duration: reduced ? 0.2 : 0.5, ease: 'expo.out', stagger: 0.08 });
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
