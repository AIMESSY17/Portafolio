// Carga de modelos .glb del módulo.
// En la vista previa de un solo archivo (npm run preview:file) los modelos vienen embebidos en
// base64 en window.__SAMOTRACIA_ASSETS__ y SIN compresión meshopt: se leen directo, sin fetch.
export function loadGlb(ctx, file) {
  const embedded = window.__SAMOTRACIA_ASSETS__ || {};
  if (embedded[file]) {
    const bin = atob(embedded[file]);
    const buf = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
    return ctx.loader.parseAsync(buf.buffer, '');
  }
  return ctx.loader.loadAsync(ctx.assetsPath + file);
}

export const clamp01 = (x) => Math.min(1, Math.max(0, x));
export const smooth = (a, b, x) => {
  const t = clamp01((x - a) / (b - a));
  return t * t * (3 - 2 * t);
};
/** Lleva x del rango [a, b] a 0..1. */
export const range = (x, [a, b]) => clamp01((x - a) / (b - a));
