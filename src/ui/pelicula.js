import './pelicula.css';
import projects from '../data/projects.json';
import { posicion, START, CAIDA } from '../config/historia.js';

// LA PELÍCULA (capa DOM: casi nada de trabajo para la placa de video).
//  · APERTURA (primera visita): pantalla negra con franjas 2.39:1, una línea de oro dibuja la silueta de la estatua
//    en 2 s (SVG inline en index.html: aparece antes que el 3D), "<marca> presenta" en Cinzel y se abre el cielo
//    (un iris). Todo el tiempo lo lleva el CSS; acá solo se escucha el salto (clic, tecla, rueda, toque) y se recuerda
//    la visita (localStorage con try/catch).
//  · FRANJAS DE CINE: entran suave en cada transición importante (caída, títulos de capítulo) y se van al terminar.
//  · CAPÍTULOS: "I — El cielo", "II — La caída", "III — Las obras", "IV — Los créditos": aparecen y se van en 1,5 s.
//  · CRÉDITOS FINALES: a la hora azul suben lentos; al terminar quedan "Hablemos.", WhatsApp, mail, los créditos
//    obligatorios y "Esta página cargó en X s y corre a Y fps en tu dispositivo" (medido de verdad acá).
// Todo corre dentro del loop único (scroll.onUpdate). No se crean objetos por cuadro.
export const CAPITULOS = [
  { num: 'I', titulo: 'El cielo' },
  { num: 'II', titulo: 'La caída' },
  { num: 'III', titulo: 'Las obras' },
  { num: 'IV', titulo: 'Los créditos' },
];
const KEY = 'samotracia.apertura.v1';
const TECNOLOGIAS = 'Three.js · WebGL 2 · GLSL · pmndrs/postprocessing · GSAP · Lenis · Web Audio · Vite · Vercel';

/** Capítulo en la posición P del guion. */
export function capituloDe(P) {
  if (P < CAIDA.puerta + 0.02) return 0;
  if (P < START.obras) return 1;
  if (P < START.contacto + 0.3) return 2;
  return 3;
}

export function setupPelicula({ scroll, bus, reduced }) {
  const html = document.documentElement;
  const marca = html.dataset.marca || '';
  document.querySelectorAll('[data-marca-texto]').forEach((el) => { el.textContent = marca; });

  // ---------- franjas ----------
  let holds = 0;
  const franjas = (on) => { holds = Math.max(0, holds + (on ? 1 : -1)); html.classList.toggle('franjas-on', holds > 0); };

  // ---------- apertura ----------
  const apertura = document.querySelector('.apertura');
  let aperturaViva = html.classList.contains('con-apertura');
  const aperturaListeners = [];
  function terminarApertura() {
    if (!aperturaViva) return;
    aperturaViva = false;
    try { localStorage.setItem(KEY, '1'); } catch { /* sin almacenamiento */ }
    html.classList.remove('con-apertura', 'apertura-salto');
    quitarEscuchas();
    aperturaListeners.splice(0).forEach((fn) => fn());
  }
  function saltar() {
    if (!aperturaViva || html.classList.contains('apertura-salto')) return;
    html.classList.add('apertura-salto');
    setTimeout(terminarApertura, 450);
  }
  const onKey = (e) => { if (!/^(Shift|Control|Alt|Meta|Tab)$/.test(e.key)) saltar(); };
  const escuchas = [['pointerdown', saltar], ['keydown', onKey], ['wheel', saltar], ['touchstart', saltar]];
  function quitarEscuchas() { escuchas.forEach(([n, f]) => removeEventListener(n, f, true)); }
  if (aperturaViva) {
    escuchas.forEach(([n, f]) => addEventListener(n, f, { capture: true, passive: true }));
    // el CSS termina el iris a los 5,4 s; por si la pestaña estuvo oculta, igual se cierra
    apertura?.addEventListener('animationend', (e) => { if (e.animationName === 'iris') terminarApertura(); });
    setTimeout(() => {
      // (si el iris está en pausa, alguien congeló las animaciones a propósito: control de calidad)
      const iris = document.getAnimations?.().find((a) => a.animationName === 'iris');
      if (iris?.playState !== 'paused') terminarApertura();
    }, 6200);
  }

  // ---------- capítulos ----------
  const capEl = document.querySelector('.capitulo');
  const capNum = capEl?.querySelector('.capitulo__num'), capTit = capEl?.querySelector('.capitulo__titulo');
  let capActual = -1, capMostrado = -1, capTimer = 0, listo = false;
  function mostrarCapitulo(i) {
    if (!capEl || i === capMostrado) return;
    capMostrado = i;
    capNum.textContent = CAPITULOS[i].num;
    capTit.textContent = CAPITULOS[i].titulo;
    capEl.classList.remove('is-on');
    void capEl.offsetWidth; // reinicia la animación de 1,5 s
    capEl.classList.add('is-on');
    if (!html.classList.contains('en-caida')) {
      franjas(true);
      clearTimeout(capTimer);
      capTimer = setTimeout(() => franjas(false), 1500);
    }
  }
  bus.on('caida:inicio', ({ dir }) => { franjas(true); if (dir > 0) mostrarCapitulo(1); });

  // ---------- visor REC (sala de ZURKLIMA: la toma corta a cámara térmica de vigilancia) ----------
  const rec = document.createElement('div');
  rec.className = 'rec';
  rec.setAttribute('aria-hidden', 'true');
  rec.innerHTML = '<i class="rec__c rec__c--a"></i><i class="rec__c rec__c--b"></i><i class="rec__c rec__c--c"></i><i class="rec__c rec__c--d"></i><span class="rec__txt"><b></b>REC</span>';
  document.body.appendChild(rec);
  let recOn = false;
  bus.on('sala:change', ({ id }) => {
    const on = id === 'zurklima' && !reduced;
    if (on === recOn) return;
    recOn = on;
    html.classList.toggle('sala-rec', on);
  });
  bus.on('caida:fin', () => franjas(false));

  // ---------- créditos ----------
  const cred = document.querySelector('[data-creditos]');
  const rollo = cred?.querySelector('[data-rollo]');
  const medida = cred?.querySelector('[data-medida]');
  if (rollo) {
    const bloque = (rol, ...lineas) => `<div class="cr-bloque"><p class="cr-rol">${rol}</p>${lineas.map((l) => `<p class="cr-nombre">${l}</p>`).join('')}</div>`;
    const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
    rollo.innerHTML = [
      `<p class="cr-titulo">Samotracia</p>`,
      bloque('Dirección, diseño y desarrollo', esc(marca)),
      `<div class="cr-bloque"><p class="cr-rol">Obras</p>${projects.map((p) => `<p class="cr-obra"><span>${esc(p.title)}</span><i>${esc(p.rubro || '')}</i></p>`).join('')}</div>`,
      bloque('Tecnologías', esc(TECNOLOGIAS)),
      bloque('La Victoria', '“Nike of Samothrace” — p_moraiti'),
      bloque('Cielos', 'Poly Haven'),
      bloque('Vía Láctea', 'Y. Beletsky (LCO) / ESO'),
      bloque('Filmada en', 'Comodoro Rivadavia, Patagonia'),
    ].join('');
  }
  let rodado = false, enCreditos = false;
  function empezarCreditos() {
    if (!cred || rodado) return;
    rodado = true;
    if (reduced) { cred.classList.add('fin'); return; }
    const alto = rollo.scrollHeight + innerHeight;
    cred.style.setProperty('--rollo-dur', `${Math.max(9, Math.min(16, alto / 85)).toFixed(1)}s`);
    cred.classList.add('rodando');
  }
  rollo?.addEventListener('animationend', () => { cred.classList.add('fin'); cred.classList.remove('rodando'); });
  cred?.addEventListener('click', (e) => { if (cred.classList.contains('rodando') && !e.target.closest('a')) { cred.classList.add('fin'); cred.classList.remove('rodando'); } });

  // ---------- medición real: carga y fps en este dispositivo ----------
  let frames = 0, t0 = performance.now(), fps = 0, cargaS = 0;
  function escribirMedida() {
    if (!medida || !cargaS) return;
    const s = cargaS.toFixed(1).replace('.', ',');
    medida.textContent = `Esta página cargó en ${s} s y corre a ${Math.round(fps)} fps en tu dispositivo.`;
  }

  scroll.onUpdate((st) => {
    // fps del último segundo (contado en el loop único)
    frames++;
    const now = performance.now();
    if (now - t0 >= 1000) { fps = (frames * 1000) / (now - t0); frames = 0; t0 = now; if (enCreditos) escribirMedida(); }
    if (!listo || aperturaViva) return;
    const P = posicion(st);
    const cap = capituloDe(P);
    if (cap !== capActual) {
      capActual = cap;
      if (!html.classList.contains('en-caida') || cap === 1) mostrarCapitulo(cap);
    }
    const c = P > START.contacto + 0.42;
    if (c !== enCreditos) {
      enCreditos = c;
      cred?.classList.toggle('visible', c);
      if (c) { empezarCreditos(); escribirMedida(); }
    }
  });

  return {
    franjas,
    /** El 3D está listo y el velo se fue: arranca la película (y, si hubo apertura, al terminarla). */
    listo() {
      cargaS = performance.now() / 1000; // desde que se pidió la página (navegación) hasta el 3D listo
      const go = () => { listo = true; };
      if (aperturaViva) aperturaListeners.push(go); else go();
    },
    get aperturaViva() { return aperturaViva; },
  };
}
