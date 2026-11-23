// Sonido: apagado por defecto, se prende con el botón chiquito "Sonido".
// Viento arriba (en el cielo y en la caída, más fuerte cuanto más rápido se cae) y agua abajo (olas que
// rompen suave), con fundido según el scroll. Se GENERA en el navegador con Web Audio (ruido filtrado):
// 0 KB de archivos, sin licencias de terceros y sin cortes en el loop.
// El audio se crea recién con el primer clic (los navegadores no dejan sonar nada antes).
import { posicion, START, P_CRUCE, altura } from '../config/historia.js';

export function createSonido({ scroll }) {
  const btn = document.querySelector('[data-sonido]');
  if (!btn || !('AudioContext' in window || 'webkitAudioContext' in window)) { if (btn) btn.hidden = true; return null; }
  let ac = null, master = null, windG = null, waterG = null, windBand = null, windHi = null, waterLow = null, waveG = null;
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
    waterG.gain.setTargetAtTime(water * 0.9, t, 0.3);
  });
  return { setOn };
}

const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
