// Medidor de desarrollo: se prende con ?stats y SOLO existe en DEV (en producción el bundle lo descarta).
// Muestra fps, draw calls, triángulos, puntos y el "peor frame" de los últimos 2 segundos (los tirones).
// Para medir con scripts: window.__fondoStats.mark() reinicia el acumulado y .read() devuelve
// { fps (promedio), worst (máx ms), p95 (ms), calls, tris, points } desde el último mark().
//
// Ojo: renderer.info se reinicia solo en cada render(); acá se apaga eso y se reinicia a mano una
// vez por cuadro, así los números suman TODAS las pasadas del cuadro (escena + bloom).
export function createStats(ctx) {
  if (!import.meta.env.DEV || !new URLSearchParams(location.search).has('stats')) return null;
  const { renderer, overlay } = ctx;
  renderer.info.autoReset = false;

  const el = document.createElement('pre');
  el.style.cssText = 'position:fixed;left:8px;bottom:8px;margin:0;padding:6px 8px;font:11px/1.35 ui-monospace,monospace;color:#9CFF8A;background:rgba(0,0,0,.65);border-radius:6px;pointer-events:none;z-index:99999;white-space:pre';
  overlay.appendChild(el);

  const SIZE = 512;
  const times = new Float64Array(SIZE), dts = new Float32Array(SIZE);
  let head = 0, last = performance.now(), shown = 0;
  let frames = 0, accT = 0, fps = 0;
  // acumulado desde el último mark()
  const acc = { n: 0, ms: 0, worst: 0, calls: 0, tris: 0, points: 0, hist: new Uint32Array(200) };
  const out = { fps: 0, worst: 0, p95: 0, calls: 0, tris: 0, points: 0 };

  function mark() { acc.n = 0; acc.ms = 0; acc.worst = 0; acc.calls = 0; acc.tris = 0; acc.points = 0; acc.hist.fill(0); }
  window.__fondoStats = {
    mark,
    read() {
      let seen = 0, p95 = 0;
      for (let i = 0; i < acc.hist.length; i++) { seen += acc.hist[i]; if (seen >= acc.n * 0.95) { p95 = i; break; } }
      out.fps = acc.ms ? (acc.n * 1000) / acc.ms : 0;
      out.worst = acc.worst; out.p95 = p95;
      out.calls = acc.n ? acc.calls / acc.n : 0; out.tris = acc.n ? acc.tris / acc.n : 0; out.points = acc.n ? acc.points / acc.n : 0;
      return out;
    },
  };

  return {
    update() {
      const now = performance.now();
      const dt = now - last; last = now;
      times[head] = now; dts[head] = dt; head = (head + 1) % SIZE;
      frames++; accT += dt;
      if (accT >= 500) { fps = (frames * 1000) / accT; frames = 0; accT = 0; }
      // lo que dibujó el cuadro anterior
      const info = renderer.info;
      if (info.render.calls) {
        acc.n++; acc.ms += dt; acc.worst = Math.max(acc.worst, dt);
        acc.calls += info.render.calls; acc.tris += info.render.triangles; acc.points += info.render.points;
        acc.hist[Math.min(acc.hist.length - 1, Math.round(dt))]++;
      }
      if (now - shown > 250) {
        shown = now;
        let worst = 0;
        for (let i = 0; i < SIZE; i++) if (now - times[i] < 2000 && dts[i] > worst) worst = dts[i];
        el.textContent = `${fps.toFixed(0)} fps · peor frame ${worst.toFixed(0)} ms (2 s)\n${info.render.calls} calls · ${(info.render.triangles / 1000).toFixed(0)}k tris · ${(info.render.points / 1000).toFixed(0)}k pts`;
      }
      info.reset();
    },
    dispose() { el.remove(); renderer.info.autoReset = true; delete window.__fondoStats; },
  };
}
