import './ui.css';
import projects from '../data/projects.json';
import contacto from '../config/contacto.js';

// Capa de texto:
//  · alto de cada sección y links del menú (usan el scroll suave del core)
//  · SALAS: la sección "obras" tiene una sala de 100vh por proyecto. Acá se calcula en cuál estamos y se
//    emite `sala:change` { id, progress } (CLAUDE.md sección 8): id = proyecto de la sala o null (hero,
//    contacto); progress = 0..1 dentro de la sala. Los módulos (estatua, fondo) reaccionan a ese evento.
//  · el panel de la sala (número, nombre, rubro, línea y link) se arma con projects.json.
export function setupUI({ sections, scroll, bus }) {
  sections.forEach((s) => {
    const el = document.querySelector(`[data-section="${s.id}"]`);
    if (el) el.style.setProperty('--h', s.height);
  });
  document.querySelectorAll('[data-scroll-to]').forEach((a) => {
    a.addEventListener('click', (e) => {
      const target = document.getElementById(a.dataset.scrollTo);
      if (!target) return;
      e.preventDefault();
      if (scroll) scroll.scrollTo(target, { duration: 1.6 });
      else target.scrollIntoView({ behavior: 'smooth' });
    });
  });
  setupContacto();
  if (scroll && bus) setupSalas({ sections, scroll, bus });
}

function setupContacto() {
  const wa = document.querySelector('[data-contacto="whatsapp"]');
  const mail = document.querySelector('[data-contacto="mail"]');
  if (wa && contacto.whatsapp) {
    wa.href = `https://wa.me/${contacto.whatsapp}?text=${encodeURIComponent(contacto.mensaje || '')}`;
    wa.hidden = false;
  }
  if (mail && contacto.mail) {
    mail.href = `mailto:${contacto.mail}`;
    mail.hidden = false;
  }
}

function setupSalas({ sections, scroll, bus }) {
  const obras = sections.findIndex((s) => s.id === 'obras');
  const el = document.getElementById('sala');
  if (obras < 0 || !el) return;
  const n = projects.length;
  const ref = {
    num: el.querySelector('.sala__num'), name: el.querySelector('.sala__name'), rubro: el.querySelector('.sala__rubro'),
    linea: el.querySelector('.sala__linea'), link: el.querySelector('.sala__link'),
  };
  const pad = (v) => String(v).padStart(2, '0');

  let room = -1, lastProgress = -1, swap = 0;
  const payload = { id: null, progress: 0 }; // se reutiliza: no se crean objetos mientras se scrollea

  function fill(i) {
    const p = projects[i];
    ref.num.textContent = `${pad(i + 1)} / ${pad(n)}`;
    ref.name.textContent = p.title;
    ref.rubro.textContent = p.rubro || '';
    ref.linea.textContent = p.linea || '';
    if (p.url) { ref.link.href = p.url; ref.link.hidden = false; } else ref.link.hidden = true;
    el.classList.remove('is-swap');
    el.classList.add('is-on');
  }
  // el texto se cambia con un fundido corto por CSS (sin JS animando)
  function show(i) {
    clearTimeout(swap);
    if (i < 0) { el.classList.remove('is-on', 'is-swap'); return; }
    if (el.classList.contains('is-on')) {
      el.classList.add('is-swap');
      swap = setTimeout(() => fill(i), 220);
    } else fill(i);
  }

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
