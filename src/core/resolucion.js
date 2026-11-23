// RESOLUCIÓN DINÁMICA: sube la resolución si sobra rendimiento y la baja ANTES de que caigan los fps.
//  · Mide el tiempo real de la placa de video por cuadro (EXT_disjoint_timer_query_webgl2) si el navegador lo da;
//    si no, el intervalo entre cuadros (con vsync no se ve el margen, así que sube con más cuidado).
//  · Escala s sobre la resolución del tier (pixel ratio = base del tier × s): baja en pasos proporcionales a lo que
//    falta, sube de a 0,06 cuando sobra mucho durante varios segundos. Espera entre cambios (cada cambio rehace los
//    buffers del post: un cuadro algo más lento) y no mide durante el precompilado ni con la pestaña oculta.
//  · Si una subida no se sostiene, la próxima espera el doble (no oscila).
//  · En el piso de la escala, el monitor de calidad (quality.js) puede bajar un tier.
// Nada se crea por cuadro.
export function createResolucion({ renderer, basePR, onApply, forced = false, targetMs = 16.7, maxScale = () => 1.25, busy = () => false }) {
  const gl = renderer.getContext();
  const ext = gl.getExtension && gl.getExtension('EXT_disjoint_timer_query_webgl2');
  const dpr = Math.max(1, window.devicePixelRatio || 1);
  const st = {
    s: 1, min: 0.62, max: 1, gpuMs: 0, frameMs: 16.7, timer: !!ext, pr: basePR(),
  };
  // con una pantalla común (×1) y placa sobrada se puede dibujar un poco más fino que la pantalla (supermuestreo)
  const recalcMax = () => { st.max = Math.min(2, dpr * 1.25) / Math.max(0.5, basePR()); st.max = Math.max(1, Math.min(st.max, maxScale())); };
  recalcMax();
  let holds = 0, cool = 1.5, acc = 0, n = 0, accF = 0, nF = 0, good = 0, upWait = 6, lastUpAt = -1e9, t = 0;
  // pool de consultas de tiempo (los resultados llegan 1–3 cuadros después)
  const pool = [], pending = [];
  let active = null;

  function apply(next) {
    next = Math.max(st.min, Math.min(st.max, next));
    const pr = Math.round(basePR() * next * 100) / 100;
    if (Math.abs(pr - st.pr) < 0.035) return false;
    st.s = next; st.pr = pr;
    onApply(pr);
    cool = 1.0; acc = n = accF = nF = 0; good = 0;
    return true;
  }

  return {
    state: st,
    /** Al empezar el cuadro (antes de dibujar). */
    begin() {
      if (!ext || forced || active) return;
      active = pool.pop() || gl.createQuery();
      gl.beginQuery(ext.TIME_ELAPSED_EXT, active);
    },
    /** Al terminar de dibujar el cuadro. dt = segundos desde el cuadro anterior. */
    end(dt) {
      if (ext && active) { gl.endQuery(ext.TIME_ELAPSED_EXT); pending.push(active); active = null; }
      // resultados disponibles
      let disjoint = false;
      if (ext) disjoint = gl.getParameter(ext.GPU_DISJOINT_EXT);
      while (pending.length) {
        const q = pending[0];
        if (!gl.getQueryParameter(q, gl.QUERY_RESULT_AVAILABLE)) break;
        pending.shift();
        const ns = gl.getQueryParameter(q, gl.QUERY_RESULT);
        pool.push(q);
        if (!disjoint && ns > 0) { acc += ns / 1e6; n++; }
      }
      if (forced) return;
      t += dt;
      if (holds > 0 || document.hidden) { acc = n = accF = nF = 0; return; }
      if (cool > 0) { cool -= dt; acc = n = accF = nF = 0; return; }
      accF += dt * 1000; nF++;
      if (accF < 1000) return; // ventana de un segundo
      st.frameMs = accF / nF;
      if (n) st.gpuMs = acc / n;
      const useGpu = ext && n >= 6;
      accF = nF = acc = n = 0;
      // Cada cambio rehace los buffers del post (un cuadro de ~40 ms en una placa chica): solo se cambia cuando hace
      // falta de verdad. BAJA si se están perdiendo cuadros (ritmo real > 1,07 × objetivo durante 1 s) y la placa es la
      // culpable (si hay temporizador). SUBE solo con la escena tranquila (ni caída ni scroll rápido) y mucho margen.
      const missing = st.frameMs > targetMs * 1.07;
      if (missing && (!useGpu || st.gpuMs > targetMs * 0.85)) {
        if (t - lastUpAt < 4) upWait = Math.min(40, upWait * 2); // la subida no se sostuvo
        const k = useGpu ? Math.sqrt((targetMs * 0.78) / st.gpuMs) : (targetMs * 0.95) / st.frameMs;
        apply(st.s * Math.max(0.8, Math.min(0.94, k)));
        return;
      }
      const room = useGpu ? st.gpuMs < targetMs * 0.55 : st.frameMs < targetMs * 1.02;
      if (room && st.s < st.max && !busy()) { if (++good >= upWait) { lastUpAt = t; apply(st.s + 0.06); } } else if (!room) good = 0;
    },
    /** Un módulo está precompilando: no se mide. */
    hold(on) { holds = Math.max(0, holds + (on ? 1 : -1)); cool = 1; },
    /** Cambió el tier (otra resolución base): vuelve a la escala 1. */
    reset() { recalcMax(); st.s = 1; st.pr = basePR(); cool = 1.5; good = 0; },
    atMin: () => st.s <= st.min + 0.01,
    dispose() { pool.forEach((q) => gl.deleteQuery(q)); pending.forEach((q) => gl.deleteQuery(q)); },
  };
}
