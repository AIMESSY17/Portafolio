// Sonido: apagado por defecto, se prende con el botón chiquito "Sonido".
// Viento arriba (en el cielo y en la caída, más fuerte cuanto más rápido se cae) y agua abajo, con fundido según
// el scroll. El viento y el fondo de mar se GENERAN con Web Audio (ruido filtrado, 0 KB, sin cortes en el loop).
// Sobre el mar rompen OLAS REALES (jasinski, Freesound, CC0): dos golpes cortos que se disparan al azar con tono y
// volumen distintos (así no se nota la repetición). Se descargan recién al prender el sonido (~45 KB).
// En la transmutación (la caída, cuando el oro sube por la estatua) suena un BRILLO MÁGICO corto, sintetizado.
// El audio se crea recién con el primer clic (los navegadores no dejan sonar nada antes).
import { posicion, START, P_CRUCE, altura, TRAMOS } from '../config/historia.js';

export function createSonido({ scroll, bus }) {
  const btn = document.querySelector('[data-sonido]');
  if (!btn || !('AudioContext' in window || 'webkitAudioContext' in window)) { if (btn) btn.hidden = true; return null; }
  let ac = null, master = null, windG = null, waterG = null, windBand = null, windHi = null, waterLow = null, waveG = null;
  let olasG = null, olas = [], proxOla = 2, brilloHecho = false;
  let on = false;

  function noiseBuffer(seconds, kind) {
    const n = Math.floor(ac.sampleRate * seconds);
    const buf = ac.createBuffer(2, n, ac.sampleRate);
    for (let c = 0; c < 2; c++) {
      const d = buf.getChannelData(c);
      let b0 = 0, b1 = 0, b2 = 0, last = 0;
      for (let i = 0; i < n; i++) {
        const w = Math.random() * 2 - 1;
        if (kind === 'pink') { // ruido rosa (Paul Kellet, versión corta)
          b0 = 0.99765 * b0 + w * 0.099046; b1 = 0.963 * b1 + w * 0.2965164; b2 = 0.57 * b2 + w * 1.0526913;
          d[i] = (b0 + b1 + b2 + w * 0.1848) * 0.16;
        } else { // ruido marrón (más grave)
          last = (last + 0.02 * w) / 1.02;
          d[i] = last * 3.2;
        }
      }
      // sin clic en la vuelta del loop: fundido cruzado de los bordes
      const f = Math.floor(ac.sampleRate * 0.05);
      for (let i = 0; i < f; i++) { const k = i / f; d[i] = d[i] * k + d[n - f + i] * (1 - k); }
    }
    return buf;
  }
  function loop(buf) { const s = ac.createBufferSource(); s.buffer = buf; s.loop = true; s.start(); return s; }

  function build() {
    ac = new (window.AudioContext || window.webkitAudioContext)();
    master = ac.createGain(); master.gain.value = 0; master.connect(ac.destination);
    const pink = noiseBuffer(6, 'pink'), brown = noiseBuffer(7, 'brown');

    // viento: banda que se mueve sola (ráfagas) + un silbido agudo muy bajo
    windG = ac.createGain(); windG.gain.value = 0; windG.connect(master);
    windBand = ac.createBiquadFilter(); windBand.type = 'bandpass'; windBand.frequency.value = 420; windBand.Q.value = 0.7;
    windHi = ac.createBiquadFilter(); windHi.type = 'bandpass'; windHi.frequency.value = 1800; windHi.Q.value = 6;
    const hiG = ac.createGain(); hiG.gain.value = 0.05;
    const w = loop(pink);
    w.connect(windBand).connect(windG);
    w.connect(windHi).connect(hiG).connect(windG);
    const lfo = ac.createOscillator(); lfo.frequency.value = 0.09;
    const lfoG = ac.createGain(); lfoG.gain.value = 220;
    lfo.connect(lfoG).connect(windBand.frequency); lfo.start();

    // agua: grave filtrado con olas lentas (la ganancia sube y baja cada ~7 s) + espuma aguda
    waterG = ac.createGain(); waterG.gain.value = 0; waterG.connect(master);
    waterLow = ac.createBiquadFilter(); waterLow.type = 'lowpass'; waterLow.frequency.value = 520;
    waveG = ac.createGain(); waveG.gain.value = 0.6;
    const wv = loop(brown);
    wv.connect(waterLow).connect(waveG).connect(waterG);
    const waveL = ac.createOscillator(); waveL.frequency.value = 1 / 7.3;
    const waveLG = ac.createGain(); waveLG.gain.value = 0.38;
    waveL.connect(waveLG).connect(waveG.gain); waveL.start();
    const foam = ac.createBiquadFilter(); foam.type = 'highpass'; foam.frequency.value = 2600;
    const foamG = ac.createGain(); foamG.gain.value = 0.0;
    const fl = loop(pink);
    fl.connect(foam).connect(foamG).connect(waterG);
    const foamL = ac.createOscillator(); foamL.frequency.value = 1 / 7.3;
    const foamLG = ac.createGain(); foamLG.gain.value = 0.05;
    foamL.connect(foamLG).connect(foamG.gain); foamL.start();

    // olas reales: se bajan ahora (solo si el sonido se prendió alguna vez)
    olasG = ac.createGain(); olasG.gain.value = 0; olasG.connect(master);
    const ext = new Audio().canPlayType('audio/ogg; codecs="vorbis"') ? 'ogg' : 'mp3';
    Promise.all(['olas-1', 'olas-2'].map((n) => fetch(`${import.meta.env.BASE_URL}assets/sonido/${n}.${ext}`)
      .then((r) => r.arrayBuffer()).then((b) => ac.decodeAudioData(b)).catch(() => null)))
      .then((bufs) => { olas = bufs.filter(Boolean); });
  }

  // una ola: tono y volumen al azar, con un paneo leve (cerca/lejos)
  function ola(k) {
    if (!olas.length) return;
    const s = ac.createBufferSource();
    s.buffer = olas[(Math.random() * olas.length) | 0];
    s.playbackRate.value = 0.82 + Math.random() * 0.3;
    const g = ac.createGain(); g.gain.value = (0.35 + Math.random() * 0.4) * k;
    const pan = ac.createStereoPanner ? ac.createStereoPanner() : null;
    if (pan) { pan.pan.value = Math.random() * 1.2 - 0.6; s.connect(g).connect(pan).connect(olasG); } else s.connect(g).connect(olasG);
    s.start();
  }

  // brillo mágico: parciales agudos tipo campana, ataque rápido y cola de 1,6 s, apenas desafinados
  function brillo() {
    if (!ac || !on) return;
    const t = ac.currentTime;
    const out = ac.createGain(); out.gain.value = 0.0; out.connect(master);
    out.gain.setValueAtTime(0, t); out.gain.linearRampToValueAtTime(0.22, t + 0.03); out.gain.exponentialRampToValueAtTime(0.0008, t + 1.9);
    const hp = ac.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 900; hp.connect(out);
    [1568, 2093, 2637, 3136, 4186].forEach((f, i) => {
      const o = ac.createOscillator(); o.type = 'sine';
      o.frequency.value = f * (1 + (Math.random() - 0.5) * 0.004);
      const g = ac.createGain(); g.gain.value = 0.5 / (i + 1);
      const d = i * 0.07; // arpegio muy rápido hacia arriba
      g.gain.setValueAtTime(0, t + d); g.gain.linearRampToValueAtTime(0.5 / (i + 1), t + d + 0.02); g.gain.exponentialRampToValueAtTime(0.0005, t + d + 1.6);
      o.connect(g).connect(hp); o.start(t + d); o.stop(t + d + 1.8);
    });
  }

  function setOn(v) {
    on = v;
    if (on && !ac) build();
    if (!ac) return;
    if (on && ac.state === 'suspended') ac.resume();
    const t = ac.currentTime;
    master.gain.cancelScheduledValues(t);
    master.gain.setTargetAtTime(on ? 0.55 : 0, t, on ? 0.6 : 0.25);
    btn.setAttribute('aria-pressed', String(on));
    btn.classList.toggle('is-on', on);
  }
  btn.hidden = false;
  btn.addEventListener('click', () => setOn(!on));

  // fundido con el scroll (se escribe solo con el sonido prendido)
  let lastAlt = altura(0.5), speed = 0, lastT = performance.now();
  scroll.onUpdate((st) => {
    if (!on || !ac) return;
    const now = performance.now();
    const dt = Math.max(0.001, (now - lastT) / 1000);
    lastT = now;
    const P = posicion(st);
    const alt = altura(P);
    speed += (Math.abs(lastAlt - alt) / dt - speed) * Math.min(1, dt * 4);
    lastAlt = alt;
    const water = smooth(P_CRUCE + 0.1, START.obras, P);
    const fall = Math.min(1, speed / 60);
    const t = ac.currentTime;
    windG.gain.setTargetAtTime((1 - water) * (0.35 + 0.65 * fall) + water * 0.08, t, 0.15);
    windBand.Q.setTargetAtTime(0.7 - fall * 0.35, t, 0.2);
    waterG.gain.setTargetAtTime(water * 0.6, t, 0.3);
    olasG.gain.setTargetAtTime(water * 0.85, t, 0.4);
    // las olas rompen cada 3,5–7 s cuando estamos sobre el agua
    proxOla -= dt;
    if (water > 0.25 && proxOla <= 0) { ola(water); proxOla = 3.5 + Math.random() * 3.5; }
    // el brillo de la transmutación: una vez por bajada, a mitad del oro
    const alqMid = (TRAMOS.alquimia[0] + TRAMOS.alquimia[1]) / 2;
    if (!brilloHecho && P > alqMid && P < START.obras) { brilloHecho = true; brillo(); }
    if (P < TRAMOS.alquimia[0]) brilloHecho = false;
  });
  return { setOn };
}

const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
