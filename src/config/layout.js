// Diagramación de las salas (compartida): dónde queda la ventana grande y dónde va su texto.
// La estatua coloca la ventana 3D exactamente sobre `win` y la ui pone el texto en `cap`, así coinciden
// al píxel en cualquier pantalla. Devuelve SIEMPRE el mismo objeto (no crea nada al scrollear).
export const ASPECTO = 1440 / 900; // las capturas de los sitios

/** 'mobile' en pantallas angostas o verticales; 'desktop' en el resto. */
export function modo(w = innerWidth, h = innerHeight) {
  return w < 700 || w / h < 0.9 ? 'mobile' : 'desktop';
}

const out = {
  mode: 'desktop',
  win: { x: 0, y: 0, w: 0, h: 0 },   // ventana grande (px, desde arriba a la izquierda)
  cap: { x: 0, y: 0, w: 0 },         // texto de la sala, debajo de la ventana
  statue: { x: 0.25, y: 0.5, h: 0.78 }, // estatua: centro (fracción de pantalla) y alto (fracción del alto)
};

export function sala(w = innerWidth, h = innerHeight) {
  const m = modo(w, h);
  out.mode = m;
  if (m === 'desktop') {
    // ventana a la derecha, grande; el texto abajo como la ficha de una obra; la estatua a la izquierda
    let ww = Math.min(w * 0.5, 1000);
    let wh = ww / ASPECTO;
    const maxH = h * 0.56;
    if (wh > maxH) { wh = maxH; ww = wh * ASPECTO; }
    const x = w * 0.955 - ww;
    const y = Math.max(56, h * 0.1);
    out.win.x = x; out.win.y = y; out.win.w = ww; out.win.h = wh;
    out.cap.x = x; out.cap.y = y + wh + Math.max(20, h * 0.03); out.cap.w = ww;
    out.statue.x = Math.max(0.17, (x * 0.48) / w);
    out.statue.y = 0.52;
    out.statue.h = 0.8;
  } else {
    // celular: estatua arriba y chica, ventana al medio, texto abajo (una sola columna)
    const g = 16;
    const ww = w - g * 2;
    const wh = ww / ASPECTO;
    const y = Math.round(h * 0.315);
    out.win.x = g; out.win.y = y; out.win.w = ww; out.win.h = wh;
    out.cap.x = g; out.cap.y = y + wh + 18; out.cap.w = ww;
    out.statue.x = 0.5;
    out.statue.y = 0.155;
    out.statue.h = 0.25;
  }
  return out;
}
