import * as THREE from 'three';
import {
  EffectComposer, RenderPass, EffectPass, SMAAEffect, SMAAPreset, FXAAEffect,
} from 'postprocessing';
import { CineEffect } from './cine.js';

// ?post=nobloom,norays,nodof,nofxaa,nosmaa,nolut,nograin,noflare (desarrollo y QA: apagar piezas para medir cada una)
const OFF = new Set((new URLSearchParams(location.search).get('post') || '').split(','));

// POST-PROCESADO DE CINE (pmndrs/postprocessing), en UN solo pase de efectos:
//   escena (HalfFloat, luz real) → [ SMAA (FXAA en low) · profundidad de campo con bokeh (solo high) · CINE ]
//   CINE (cine.js) = bloom + halación + rayos + destello anamórfico + suciedad de lente + ACES + LUT por escena +
//   modo térmico + viñeta + grano. El tono ya NO lo aplica el renderer: lo hace este pase (el renderer dibuja a un
//   target y three no aplica tono en targets). renderer.toneMappingExposure sigue siendo la exposición que pone
//   el fondo: este pase la lee en cada cuadro.
// Lo manejan los módulos con shared.lente (ver CLAUDE.md 8):
//   flare, rays, lut ('cielo' | 'atardecer' | 'azul' | sala...), thermal  → ESCRIBE fondo
//   dof (0..1), focus (m), focusRange (m)                                 → ESCRIBE estatua
//   negro (0..1, fundido a negro)                                         → ESCRIBE ui (apertura)
// Cada calidad: high = todo · medium = sin DOF, bloom más chico, rayos con menos muestras · low = FXAA, sin bloom
// ni rayos ni suciedad, solo tono + LUT + viñeta + grano (una sola lectura de textura extra: la LUT).
export const POST = {
  high: { bloom: 0.32, halation: 0.09, dirt: 0.32, rays: 1, raysN: 28, grain: 0.032, vignette: 0.5, lutK: 0.62, dof: true },
  medium: { bloom: 0.26, halation: 0.07, dirt: 0.24, rays: 1, raysN: 16, grain: 0.03, vignette: 0.46, lutK: 0.62, dof: false },
  low: { bloom: 0, halation: 0, dirt: 0, rays: 0, raysN: 8, grain: 0.012, vignette: 0.42, lutK: 0.58, dof: false },
};
export const LUTS = ['cielo', 'atardecer', 'azul', 'tinta', 'lavanda', 'miel', 'rosa', 'canela'];
const LUT_FADE = 1.3; // s del fundido entre LUTs

export function createComposer(renderer, scene, camera, shared, { tier: tier0 = 'high', assets = '/assets/' } = {}) {
  let tier = tier0;
  const composer = new EffectComposer(renderer, { frameBufferType: THREE.HalfFloatType, multisampling: 0, stencilBuffer: false });
  const renderPass = new RenderPass(scene, camera);
  composer.addPass(renderPass);

  const cine = new CineEffect();
  const useFxaa = tier === 'low' || OFF.has('nosmaa');
  const aa = OFF.has('noaa') ? null : useFxaa ? new FXAAEffect() : new SMAAEffect({ preset: SMAAPreset.MEDIUM });
  const pass = new EffectPass(camera, ...(aa ? [aa, cine] : [cine]));
  composer.addPass(pass);

  // ---------- LUTs (tiras PNG de 32³) ----------
  const luts = {};
  const lutState = { a: null, b: null, mix: 0, target: 'atardecer', fading: false };
  const U = cine.uniforms;
  function loadLut(name) {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        const n = img.height; // 32
        const c = document.createElement('canvas');
        c.width = img.width; c.height = n;
        const g = c.getContext('2d', { willReadFrequently: true });
        g.drawImage(img, 0, 0);
        const px = g.getImageData(0, 0, img.width, n).data; // fila = g, columna = b·n + r
        const data = new Uint8Array(n * n * n * 4);
        for (let gi = 0; gi < n; gi++) for (let bi = 0; bi < n; bi++) for (let ri = 0; ri < n; ri++) {
          const s = (gi * img.width + bi * n + ri) * 4, d = ((bi * n + gi) * n + ri) * 4;
          data[d] = px[s]; data[d + 1] = px[s + 1]; data[d + 2] = px[s + 2]; data[d + 3] = 255;
        }
        luts[name] = CineEffect.makeLut(data, n);
        renderer.initTexture(luts[name]);
        resolve(luts[name]);
      };
      img.onerror = () => resolve(null);
      img.src = `${assets}lente/lut-${name}.png`;
    });
  }
  const lutsReady = Promise.all(LUTS.map(loadLut)).then(() => {
    lutState.a = luts[lutState.target] || null;
    if (lutState.a) U.get('tLutA').value = lutState.a;
  });
  function stepLut(name, dt) {
    if (!lutState.a) return;
    if (name && name !== lutState.target && luts[name]) {
      // si llega otra mientras se funde, la que más pesa queda como base (sin saltos visibles)
      if (lutState.fading && lutState.mix > 0.5) lutState.a = lutState.b;
      lutState.target = name;
      lutState.b = luts[name];
      lutState.mix = 0;
      lutState.fading = true;
      U.get('tLutA').value = lutState.a;
      U.get('tLutB').value = lutState.b;
    }
    if (lutState.fading) {
      lutState.mix = Math.min(1, lutState.mix + dt / LUT_FADE);
      if (lutState.mix >= 1) { lutState.a = lutState.b; lutState.fading = false; lutState.mix = 0; U.get('tLutA').value = lutState.a; }
    }
    const m = lutState.mix;
    U.get('uLutMix').value = lutState.fading ? m * m * (3 - 2 * m) : 0;
  }

  // ---------- suciedad de la lente ----------
  new THREE.TextureLoader().load(`${assets}lente/suciedad.webp`, (t) => {
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.colorSpace = THREE.NoColorSpace;
    U.get('tDirt').value = t;
    renderer.initTexture(t);
  });

  // ---------- calidad ----------
  function setQuality(t) {
    tier = t;
    const P = POST[t];
    cine.bloomOn = P.bloom > 0;
    cine.raysN = P.raysN;
  }
  setQuality(tier);

  // ---------- cada cuadro ----------
  const sunP = new THREE.Vector3();
  const sunCol = new THREE.Color();
  let last = performance.now();
  function frame() {
    const now = performance.now();
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    const L = shared.lente, P = POST[tier];
    stepLut(L.lut, dt);
    const expo = renderer.toneMappingExposure;
    U.get('uExpo').value = expo;
    // el bloom mira la luz real (antes de la exposición): su umbral sigue a la exposición para que florezca lo mismo
    cine.bloom.luminanceMaterial.threshold = 2.1 / Math.max(0.3, expo);
    // el sol en pantalla (destello, rayos y suciedad de la lente)
    let flare = 0, rays = 0;
    if (shared.sol && (L.flare > 0.01 || L.rays > 0.01)) {
      sunP.copy(shared.sol.dir).multiplyScalar(1000).add(camera.position).project(camera);
      if (sunP.z < 1 && Math.abs(sunP.x) < 1.6 && Math.abs(sunP.y) < 1.6) {
        U.get('uSun').value.set(sunP.x * 0.5 + 0.5, sunP.y * 0.5 + 0.5);
        const edge = Math.max(Math.abs(sunP.x), Math.abs(sunP.y));
        flare = L.flare * Math.max(0, 1 - Math.max(0, edge - 0.9) / 0.25);
        rays = (L.rays || 0) * P.rays;
      }
      sunCol.copy(shared.sol.color);
      U.get('uSunCol').value.copy(sunCol);
    }
    U.get('uFlare').value = OFF.has('noflare') ? 0 : flare;
    U.get('uRays').value = OFF.has('norays') ? 0 : rays * 0.55;
    U.get('uBloom').value = OFF.has('nobloom') ? 0 : P.bloom * (L.bloom ?? 1);
    U.get('uHalation').value = P.halation;
    U.get('uDirt').value = P.dirt;
    U.get('uLutK').value = OFF.has('nolut') ? 0 : P.lutK * (L.lutK ?? 1);
    U.get('uThermal').value = L.thermal || 0;
    U.get('uVignette').value = P.vignette;
    U.get('uGrain').value = OFF.has('nograin') ? 0 : P.grain;
    U.get('uNegro').value = L.negro || 0;
    U.get('uKeep').value = L.keep ?? 1;
    // profundidad de campo (solo high): foco en metros (la estatua o la ventana de la sala)
    const dofK = P.dof && !OFF.has('nodof') ? (L.dof || 0) : 0;
    U.get('uDof').value = dofK > 0.01 ? dofK : 0;
    U.get('uFocus').value = L.focus || 8;
    U.get('uRange').value = L.focusRange || 3;
    cine.bokehMat.uniforms.uRadius.value = 3.5 + 3.5 * dofK;
  }

  return {
    composer, cine, lutsReady,
    setQuality,
    setSize(w, h) { composer.setSize(w, h, false); },
    render(dt) { frame(); composer.render(dt); },
    /** Al cargar: todo prendido una vez (compila y estrena bloom, rayos, DOF y LUTs) dentro de un recorte. */
    prewarm() {
      cine.forceAll = true;
      U.get('uLutMix').value = 0.5;
      composer.render(1 / 60);
      cine.forceAll = false;
    },
    get tier() { return tier; },
    dispose() { composer.dispose(); Object.values(luts).forEach((t) => t.dispose()); },
  };
}
