// Detecta el tier inicial y lo baja si los fps reales no alcanzan.
const ORDER = ['low', 'medium', 'high'];
export const TIER_SETTINGS = {
  high: { pixelRatio: () => Math.min(window.devicePixelRatio || 1, 1.5), targetFps: 55 },
  medium: { pixelRatio: () => Math.min(window.devicePixelRatio || 1, 1.25), targetFps: 50 },
  low: { pixelRatio: () => 1, targetFps: 28 },
};

/** ?quality=low|medium|high fija la calidad y el monitor no la mueve nunca. */
export function isQualityForced() {
  return ORDER.includes(new URLSearchParams(location.search).get('quality'));
}

export function detectQuality(gl) {
  const forced = new URLSearchParams(location.search).get('quality');
  if (ORDER.includes(forced)) return forced;

  const isMobile = matchMedia('(pointer: coarse)').matches || /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
  if (isMobile) return 'low';

  let gpu = '';
  try {
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    if (ext) gpu = String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)).toLowerCase();
  } catch { /* sin info */ }
  const cores = navigator.hardwareConcurrency || 4;
  const weakGpu = /intel|swiftshader|llvmpipe|mali|adreno|powervr|microsoft basic/.test(gpu) && !/iris xe|arc/.test(gpu);
  if (weakGpu || cores <= 4) return 'medium';
  return 'high';
}

// Monitor de fps (calidad adaptativa). Reglas:
//  · No mide durante los primeros 4 s después de cargar, ni mientras algún módulo precompila
//    (hold), ni con la pestaña oculta; después de cada cambio espera 3 s a que se asiente.
//  · Baja UN escalón (nunca de high a low de golpe) solo si los fps están por debajo del
//    objetivo del tier durante 3 s seguidos.
//  · Puede volver a subir un escalón si anda sobrado (>= 57 fps) durante 10 s seguidos, hasta el
//    tier con el que arrancó. Si esa subida falla (vuelve a bajar en menos de 20 s), la próxima
//    espera el doble (hasta 60 s) para no oscilar.
//  · Con ?quality= forzado no hace nada.
// Mide con performance.now() (no con el delta del loop, que está acotado y subestima los tirones).
export function createQualityMonitor(getTier, onChange, { ceiling = 'high', forced = false } = {}) {
  const DOWN_AFTER = 3, UP_FPS = 57, SETTLE = 3, START_GRACE = 4;
  let acc = 0, frames = 0, last = performance.now();
  let grace = START_GRACE, holds = 0, bad = 0, good = 0;
  let upWait = 10, failedUps = 0, upAt = -1e9;
  const clear = () => { acc = 0; frames = 0; bad = 0; good = 0; last = performance.now(); };

  function change(next, fps, up) {
    const now = performance.now();
    if (up) { upAt = now; } else if (now - upAt < 20000) { failedUps++; upWait = Math.min(60, 10 * 2 ** failedUps); } else { failedUps = 0; upWait = 10; }
    grace = SETTLE;
    clear();
    onChange(next, fps, up);
  }

  return {
    tick() {
      if (forced) return;
      const now = performance.now();
      const dt = (now - last) / 1000;
      last = now;
      if (holds > 0) { acc = 0; frames = 0; return; }
      if (grace > 0) { grace -= dt; acc = 0; frames = 0; return; }
      acc += dt; frames++;
      if (acc < 1) return;
      const fps = frames / acc;
      acc = 0; frames = 0;
      const tier = getTier();
      const i = ORDER.indexOf(tier);
      if (fps < TIER_SETTINGS[tier].targetFps) {
        good = 0;
        if (++bad >= DOWN_AFTER && i > 0) change(ORDER[i - 1], fps, false);
      } else if (fps >= UP_FPS && i < ORDER.indexOf(ceiling)) {
        bad = 0;
        if (++good >= upWait) change(ORDER[i + 1], fps, true);
      } else { bad = 0; good = 0; }
    },
    /** Vuelve a dar `seconds` de gracia (al volver a la pestaña, al terminar de precompilar). */
    resetGrace(seconds = START_GRACE) { grace = seconds; clear(); },
    /** Un módulo está precompilando (true) o terminó (false): no se mide mientras tanto. */
    hold(on) { holds = Math.max(0, holds + (on ? 1 : -1)); if (holds === 0) this.resetGrace(1.5); else clear(); },
  };
}
