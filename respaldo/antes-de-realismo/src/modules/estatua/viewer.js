import { gsap } from 'gsap';
import { VIEWER } from './config.js';
import { previewSource, escapeHtml } from './windows.js';

// Segunda capa: el proyecto abierto en primer plano, con el portfolio visible detrás.
// No depende de Three.js, así también funciona como alternativa si no hay WebGL.
export function createViewer({ container, reducedMotion = false, onClose }) {
  let open = null; // { project, root, panel, iframe, getReturnRect, prevFocus }

  function targetRect() {
    const m = innerWidth < 700 ? 8 : Math.max(24, innerWidth * 0.05);
    const top = innerWidth < 700 ? 8 : Math.max(24, innerHeight * 0.06);
    return { left: m, top, width: innerWidth - m * 2, height: innerHeight - top - (innerWidth < 700 ? 8 : top * 0.85) };
  }

  function placePanel(panel) {
    const r = targetRect();
    Object.assign(panel.style, { left: `${r.left}px`, top: `${r.top}px`, width: `${r.width}px`, height: `${r.height}px` });
    return r;
  }

  // transformación que lleva el panel final al rectángulo de origen (técnica FLIP)
  function flipFrom(rect, final) {
    if (!rect) return { x: 0, y: 40, scaleX: 0.92, scaleY: 0.92 };
    return {
      x: rect.left + rect.width / 2 - (final.left + final.width / 2),
      y: rect.top + rect.height / 2 - (final.top + final.height / 2),
      scaleX: rect.width / final.width,
      scaleY: rect.height / final.height,
    };
  }

  function onKey(e) {
    if (!open) return;
    if (e.key === 'Escape') { e.preventDefault(); close(); }
    if (e.key === 'Tab') { // mantener el foco dentro de la capa
      const f = [...open.root.querySelectorAll('button, a[href], iframe')].filter((n) => !n.hidden);
      if (!f.length) return;
      const first = f[0], last = f[f.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    }
  }

  function onResize() { if (open) placePanel(open.panel); }

  /**
   * @param project  objeto de projects.json
   * @param fromRect DOMRect de la ventana en pantalla (para animar desde ahí)
   * @param getReturnRect función que devuelve dónde está la ventana al cerrar
   */
  function show(project, { fromRect, getReturnRect } = {}) {
    if (open) return;
    const src = previewSource(project);
    const root = document.createElement('div');
    root.className = 'visor';
    root.setAttribute('role', 'dialog');
    root.setAttribute('aria-modal', 'true');
    root.setAttribute('aria-label', project.title);
    const external = project.url && /^https?:/i.test(project.url) ? project.url : null;
    root.innerHTML = `
      <div class="visor__backdrop" data-close></div>
      <div class="visor__panel" style="--accent:${escapeHtml(project.accent || '#C9A227')}">
        <div class="visor__bar">
          <div class="visor__title">
            <span class="visor__name">${escapeHtml(project.title)}</span>
            <span class="visor__addr">${escapeHtml(src || 'sin vista disponible')}</span>
          </div>
          <div class="visor__actions">
            ${src ? '<button type="button" class="visor__btn" data-reload aria-label="Recargar el sitio" title="Recargar">↻</button>' : ''}
            ${external ? `<a class="visor__btn" href="${escapeHtml(external)}" target="_blank" rel="noopener" aria-label="Abrir en una pestaña nueva" title="Abrir en una pestaña nueva">↗</a>` : ''}
            <button type="button" class="visor__btn visor__close" data-close aria-label="Cerrar proyecto" title="Cerrar (Esc)">✕</button>
          </div>
        </div>
        <div class="visor__body">
          <div class="visor__loading" aria-hidden="true"><span></span></div>
        </div>
      </div>`;
    const panel = root.querySelector('.visor__panel');
    const body = root.querySelector('.visor__body');
    let iframe = null;

    if (src) {
      iframe = document.createElement('iframe');
      iframe.title = project.title;
      if (project.embed !== 'local') iframe.setAttribute('sandbox', VIEWER.sandbox);
      iframe.setAttribute('referrerpolicy', 'strict-origin-when-cross-origin');
      iframe.setAttribute('allow', 'fullscreen; clipboard-write');
      iframe.addEventListener('load', () => body.classList.add('is-loaded'));
      body.appendChild(iframe);
    } else {
      body.classList.add('is-loaded');
      body.insertAdjacentHTML('beforeend', `
        <div class="visor__empty">
          <p class="visor__kicker">${escapeHtml(project.title)}</p>
          <p>${escapeHtml(project.description || '')}</p>
          <p class="visor__note">Este proyecto todavía no tiene una vista para mostrar acá.</p>
        </div>`);
    }

    root.addEventListener('click', (e) => {
      if (e.target.closest('[data-close]')) close();
      if (e.target.closest('[data-reload]') && iframe) {
        body.classList.remove('is-loaded');
        const s = iframe.src; iframe.src = 'about:blank'; requestAnimationFrame(() => (iframe.src = s));
      }
    });

    container.appendChild(root);
    const final = placePanel(panel);
    open = { project, root, panel, iframe, getReturnRect, prevFocus: document.activeElement };
    addEventListener('keydown', onKey);
    addEventListener('resize', onResize);

    const backdrop = root.querySelector('.visor__backdrop');
    // una sola curva en todo el sitio: expo.out para entrar, power3.inOut para transiciones
    if (reducedMotion) {
      gsap.fromTo(root, { opacity: 0 }, { opacity: 1, duration: 0.25, ease: 'power3.inOut' });
    } else {
      gsap.fromTo(backdrop, { opacity: 0 }, { opacity: 1, duration: VIEWER.openDuration * 0.8, ease: 'expo.out' });
      gsap.fromTo(panel,
        { ...flipFrom(fromRect, final), rotateX: 6, opacity: 0.2, transformPerspective: 1600 },
        { x: 0, y: 0, scaleX: 1, scaleY: 1, rotateX: 0, opacity: 1, duration: VIEWER.openDuration, ease: 'expo.out', delay: 0.12 });
    }
    // el iframe carga recién cuando arranca la animación (no compite con ella)
    if (iframe) setTimeout(() => { if (open?.iframe === iframe) iframe.src = src; }, reducedMotion ? 0 : 180);
    setTimeout(() => root.querySelector('.visor__close')?.focus({ preventScroll: true }), 50);
  }

  function close() {
    if (!open || open.closing) return;
    open.closing = true;
    const { root, panel, iframe, getReturnRect, prevFocus, project } = open;
    const backdrop = root.querySelector('.visor__backdrop');
    const final = targetRect();
    const done = () => {
      if (iframe) { iframe.src = 'about:blank'; iframe.remove(); } // libera memoria
      gsap.killTweensOf([panel, backdrop, root]);
      root.remove();
      removeEventListener('keydown', onKey);
      removeEventListener('resize', onResize);
      open = null;
      prevFocus?.focus?.({ preventScroll: true });
    };
    onClose?.(project);
    if (reducedMotion) {
      gsap.to(root, { opacity: 0, duration: 0.2, ease: 'power3.inOut', onComplete: done });
      return;
    }
    const to = flipFrom(getReturnRect?.(), final);
    gsap.to(backdrop, { opacity: 0, duration: VIEWER.closeDuration, ease: 'power3.inOut' });
    gsap.to(panel, { ...to, rotateX: 4, opacity: 0, duration: VIEWER.closeDuration, ease: 'power3.inOut', onComplete: done });
  }

  return {
    show,
    close,
    get isOpen() { return !!open; },
    get current() { return open?.project ?? null; },
    dispose() { if (open) { open.closing = false; close(); } },
  };
}
