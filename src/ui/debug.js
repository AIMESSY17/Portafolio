// ?debug: fps, calidad, resolución dinámica y tiempo de placa en pantalla (para probar en el celular por la red
// local: npm run dev → http://<ip-de-la-pc>:5199/?debug). Se actualiza una vez por segundo dentro del loop único.
export function setupDebug(core) {
  const el = document.createElement('div');
  el.className = 'debug-hud';
  el.setAttribute('aria-hidden', 'true');
  Object.assign(el.style, {
    position: 'fixed', left: '8px', top: '8px', zIndex: 99, padding: '8px 10px', borderRadius: '8px',
    font: '11px/1.45 ui-monospace, Consolas, monospace', color: '#d8f5c8', background: 'rgba(0,0,0,0.62)',
    pointerEvents: 'none', whiteSpace: 'pre',
  });
  document.body.appendChild(el);
  let frames = 0, t0 = performance.now(), worst = 0, last = performance.now();
  core.scroll.onUpdate(() => {
    const now = performance.now();
    worst = Math.max(worst, now - last);
    last = now;
    frames++;
    if (now - t0 < 1000) return;
    const fps = (frames * 1000) / (now - t0);
    const r = core.resolucion, info = core.renderer.info.render;
    el.textContent = `fps ${fps.toFixed(0)}  peor ${worst.toFixed(0)} ms\ncalidad ${core.quality}  pr ${r.pr}  escala ${r.s.toFixed(2)}\n${r.timer ? `gpu ${r.gpuMs.toFixed(1)} ms` : `cuadro ${r.frameMs.toFixed(1)} ms`}  dibujos ${info.calls}`;
    frames = 0; worst = 0; t0 = now;
  });
}
