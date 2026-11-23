import './lite.css';
import projects from '../data/projects.json';
import contacto from '../config/contacto.js';

// VERSIÓN LIVIANA PREMIUM (respaldo): sin WebGL2, o si en calidad baja el dispositivo no llega a 30 fps.
// El cielo (la misma foto del póster), las obras con su captura y su frase única, y los créditos con animaciones CSS.
// Cero WebGL: solo HTML, CSS e imágenes que ya existen.
const ROMANOS = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X'];
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

export function startLite({ motivo = 'sin-webgl2' } = {}) {
  const html = document.documentElement;
  if (html.classList.contains('lite')) return;
  html.classList.add('lite', 'is-ready');
  html.classList.remove('con-apertura');
  html.dataset.lite = motivo;
  html.dataset.tono = 'claro';
  const marca = html.dataset.marca || '';
  const wa = contacto.whatsapp ? `https://wa.me/${contacto.whatsapp}?text=${encodeURIComponent(contacto.mensaje || '')}` : '';
  const root = document.createElement('div');
  root.className = 'lite-pagina';
  root.innerHTML = `
    <header class="lite-hero">
      <p class="lite-hero__marca">${esc(marca)} <span>presenta</span></p>
      <h1 class="lite-hero__titulo">Convertimos tu negocio en oro</h1>
      <p class="lite-hero__oficio">Diseño y desarrollo web · Comodoro Rivadavia</p>
    </header>
    <section class="lite-obras" aria-label="Obras">
      <p class="lite-cap"><span>III</span>Las obras</p>
      ${projects.map((p, i) => `
        <article class="lite-obra">
          <div class="lite-obra__img"><img src="${esc(p.captura)}" alt="Captura de ${esc(p.title)}" loading="lazy" decoding="async" width="1440" height="900"></div>
          <div class="lite-obra__txt">
            <p class="lite-obra__num">Obra ${ROMANOS[i] || i + 1}</p>
            <p class="lite-obra__unica">${esc(p.unica)}</p>
            <h2 class="lite-obra__nombre">${esc(p.title)}</h2>
            <p class="lite-obra__rubro">${esc(p.rubro)}</p>
            <dl class="lite-obra__filas">
              ${p.necesitaba ? `<div><dt>Necesitaba</dt><dd>${esc(p.necesitaba)}</dd></div>` : ''}
              ${p.hicimos ? `<div><dt>Hicimos</dt><dd>${esc(p.hicimos)}</dd></div>` : ''}
              ${p.resultado ? `<div><dt>Resultado</dt><dd>${esc(p.resultado)}</dd></div>` : ''}
            </dl>
            ${p.url ? `<a class="lite-obra__link" href="${esc(p.url)}" target="_blank" rel="noopener">Ver sitio ↗</a>` : ''}
          </div>
        </article>`).join('')}
    </section>
    <section class="lite-creditos" aria-label="Créditos y contacto">
      <div class="lite-creditos__rollo" aria-hidden="true">
        <p class="cr-rol">Dirección, diseño y desarrollo</p><p class="cr-nombre">${esc(marca)}</p>
        <p class="cr-rol">Obras</p>${projects.map((p) => `<p class="cr-nombre">${esc(p.title)}</p>`).join('')}
      </div>
      <h2 class="lite-creditos__hablemos">Hablemos.</h2>
      <p class="lite-creditos__links">
        ${wa ? `<a href="${wa}" target="_blank" rel="noopener">WhatsApp</a>` : ''}
        ${contacto.mail ? `<a href="mailto:${esc(contacto.mail)}">Mail</a>` : ''}
      </p>
      <p class="lite-creditos__legal">“Nike of Samothrace” de p_moraiti, CC BY 4.0 · Vía Láctea: Y. Beletsky (LCO)/ESO, CC BY 4.0 · Cielos: Poly Haven (CC0)</p>
    </section>`;
  document.body.appendChild(root);
  // las obras aparecen al entrar en pantalla (CSS; el observador solo pone la clase)
  if ('IntersectionObserver' in window) {
    const io = new IntersectionObserver((es) => es.forEach((e) => { if (e.isIntersecting) { e.target.classList.add('is-on'); io.unobserve(e.target); } }), { rootMargin: '0px 0px -12% 0px' });
    root.querySelectorAll('.lite-obra, .lite-creditos').forEach((el) => io.observe(el));
  } else root.querySelectorAll('.lite-obra, .lite-creditos').forEach((el) => el.classList.add('is-on'));
  window.scrollTo(0, 0);
}
