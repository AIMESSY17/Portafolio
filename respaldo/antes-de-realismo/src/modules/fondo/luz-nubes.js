// Nubes de "Hecha de luz": 3 capas de planos (lejana, media, cercana) con textura horneada UNA vez.
//
// HORNEADO (al cargar, en la placa de video, una capa por cuadro): ruido en dos escalas —formas
// grandes (cimas redondeadas, masas separadas) + filamentos finos en los bordes— y una luz de costado
// calculada ahí mismo. Cada textura guarda: R = densidad, G = luz del sol, B = "cima" (para la luz de
// abajo del atardecer). Se repite en horizontal (cilindro), así las capas derivan con el viento sin corte.
//
// EN CADA CUADRO: una lectura de textura por píxel y color por uniforms (día, atardecer, noche).
// DERRETIDO (pixel sorting vertical, solo en las nubes): cada columna de píxeles toma el máximo de unas
// pocas muestras de más arriba, con un largo distinto por columna: lo claro "chorrea" hacia abajo en
// tiras, como en la referencia. En calidad baja: fundido en vez de pixel sorting.
// ATRAVESAR: cuando la cámara pasa por la capa, un velo de nube cubre la pantalla un instante.
import { NOISE3, HASH } from './luz-glsl.js';
import { SKY_LAYER } from './luz-cielo.js';
import { FullScreenQuad } from 'three/examples/jsm/postprocessing/Pass.js';

// tamaño de cada textura (ancho x alto) por calidad; aspect = ancho/alto del plano en el mundo
const BAKE = {
  far: { kind: 0, size: { high: [2048, 512], low: [1024, 256] }, seed: 3.1 },
  mid: { kind: 1, size: { high: [2048, 768], low: [1024, 384] }, seed: 11.7 },
  near: { kind: 2, size: { high: [2048, 512], low: [1024, 256] }, seed: 23.9 },
};
export const SORT_SAMPLES = { high: 7, medium: 5, low: 0 }; // 0 = fundido

const BAKE_FRAGMENT = /* glsl */`
uniform float uKind, uSeed, uAspect;
varying vec2 vUv;
${NOISE3}
vec3 cyl(float u, float v, float freq){
  float R = uAspect * freq / 6.2831853;
  float a = u * 6.2831853;
  return vec3(cos(a) * R + uSeed, sin(a) * R - uSeed * 0.7, v * freq + uSeed * 1.3);
}
// devuelve (densidad, profundidad): profundidad 0 en la cima/borde de la nube → 1 bien adentro
vec2 densityAt(vec2 uv){
  float u = uv.x, v = uv.y;
  vec2 r = vec2(0.0);
  if (uKind < 0.5) {
    // banco lejano: masa continua con cimas redondeadas
    float tops = fbm3(cyl(u, 0.0, 2.0), 4);
    float h = 0.34 + 0.4 * smoothstep(0.25, 0.75, tops);
    float puff = billow3(cyl(u, v, 7.0), 4);
    float fil = fbm3(cyl(u, v, 26.0), 3);
    float d = h + (puff - 0.42) * 0.18 + (fil - 0.5) * 0.05 - v;
    r = vec2(smoothstep(0.0, 0.06, d), clamp(d / 0.32, 0.0, 1.0));
  } else if (uKind < 1.5) {
    // cúmulos: masas separadas con base casi plana y cimas de coliflor
    vec3 P = cyl(u, 0.0, 1.5);
    float mass = smoothstep(0.44, 0.66, fbm3(P, 3));
    float h = 0.24 + 0.6 * mass * (0.6 + 0.4 * fbm3(P * 2.3 + 5.0, 3));
    vec3 Q = cyl(u, v, 5.0);
    float puff = billow3(Q, 5);
    float fil = fbm3(cyl(u, v, 22.0), 3);
    float d = h + (puff - 0.42) * 0.26 + (fil - 0.5) * 0.06 - v;
    float base = smoothstep(0.1, 0.22 + 0.08 * fbm3(Q * 0.6, 2), v);
    r = vec2(smoothstep(0.0, 0.06, d) * base * smoothstep(0.0, 0.25, mass + 0.04), clamp(d / 0.4, 0.0, 1.0));
  } else {
    // jirones: velos estirados en horizontal que pasan delante (con huecos: no un velo parejo)
    vec3 Q = cyl(u, v * 0.32, 3.6);
    float n = fbm3(Q + vec3(0.0, 0.0, fbm3(Q * 1.7, 3) * 1.4), 5);
    float prof = smoothstep(0.1, 0.45, v) * (1.0 - smoothstep(0.5, 0.86, v));
    float fil = fbm3(cyl(u, v, 28.0), 3);
    float dd = smoothstep(0.42, 0.76, n * prof * 1.5 + (fil - 0.5) * 0.1);
    r = vec2(dd, 1.0 - dd);
  }
  return r;
}
void main(){
  vec2 d0 = densityAt(vUv);
  vec2 s = vec2(0.012 / uAspect, 0.018);            // el sol, arriba a la derecha (en la textura)
  float d1 = densityAt(vUv + s).x, d2 = densityAt(vUv + s * 2.7).x;
  float light = clamp(0.56 + (d0.x - (d1 * 0.6 + d2 * 0.4)) * 2.4, 0.0, 1.0);
  gl_FragColor = vec4(d0.x, light, d0.y, 1.0);       // R densidad · G luz de costado · B profundidad
}`;

const LAYER_VERTEX = /* glsl */`
varying vec2 vUv;
void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;

const LAYER_FRAGMENT = /* glsl */`
uniform sampler2D uTex;
uniform vec3 uLit, uShade, uRim, uHaze, uBounce;
uniform float uOpacity, uMelt, uSamples, uCols, uDrift, uRepeat, uUnder, uRimI, uSeed, uEdgeX, uThresh, uHazeK, uBounceK;
uniform vec2 uFadeLow;
varying vec2 vUv;
${HASH}
void main(){
  vec2 uv = vec2(vUv.x * uRepeat + uDrift, vUv.y);
  vec4 t = texture2D(uTex, uv);
  if (uMelt > 0.001) {
    if (uSamples > 0.5) {
      float col = floor(uv.x * uCols);
      float r = hash11(col * 0.731 + uSeed);
      float start = hash11(col * 1.37 + uSeed * 3.0) * 0.5;   // cada columna empieza a su tiempo
      float m = clamp((uMelt - start) / 0.5, 0.0, 1.0);
      float on = step(0.36, r);                                // no todas chorrean: algunas solo se apagan
      float L = m * (0.04 + 0.42 * r * r) * on;                // largo de la tira (en alto de textura)
      vec2 uc = vec2((col + 0.5) / uCols, uv.y + L * 0.22);    // la columna además cae un poco
      vec4 mx = texture2D(uTex, uc);
      for (int i = 1; i <= 8; i++) {
        if (float(i) > uSamples) break;
        float k = float(i) / uSamples;
        vec4 s = texture2D(uTex, uc + vec2(0.0, L * k));
        // lo denso y luminoso de más arriba baja por la columna (y trae su "cima" clara)
        mx.rg = max(mx.rg, s.rg * (1.0 - 0.28 * k));
        mx.b = min(mx.b, s.b + 0.25 * k);
      }
      mx.r *= 0.82;                                            // la tira es más liviana que la nube
      t = mix(t, mx, smoothstep(0.0, 0.18, m) * on);
      t.r *= 1.0 - smoothstep(0.55, 1.0, m);                   // al final la tira se apaga
      t.r *= 1.0 - smoothstep(0.15, 0.7, uMelt) * (1.0 - on) * 0.85; // las que no chorrean se van antes
    } else {
      t.r *= 1.0 - smoothstep(0.1, 0.9, uMelt);                // calidad baja: fundido
    }
  }
  float dens = t.r, light = t.g, depth = t.b;
  float top = 1.0 - depth;
  // de día la luz viene de arriba y del costado (cimas claras, bases suaves);
  // al atardecer viene de abajo (uUnder): las bases se encienden de oro
  float dayLit = pow(top, 0.85) * 0.8 + light * 0.34 + 0.1;
  float underLit = pow(depth, 0.85) * 0.72 + light * 0.28;
  float lit = smoothstep(0.06, 0.98, mix(dayLit, underLit, uUnder));
  vec3 col = mix(uShade, uLit, lit);
  col += uRim * (1.0 - smoothstep(0.05, 0.4, dens)) * lit * uRimI;  // el borde fino toma la luz
  col = mix(col, uBounce, pow(1.0 - vUv.y, 2.0) * uBounceK);          // rebote cálido desde abajo
  col = mix(col, uHaze, uHazeK);                                       // perspectiva de aire
  float a = smoothstep(uThresh, 0.55, dens) * uOpacity;
  a *= smoothstep(0.0, uEdgeX, vUv.x) * smoothstep(0.0, uEdgeX, 1.0 - vUv.x);
  a *= smoothstep(uFadeLow.x, uFadeLow.y, vUv.y) * smoothstep(0.0, 0.04, 1.0 - vUv.y);
  if (a < 0.002) discard;
  gl_FragColor = vec4(col, a);
  #include <colorspace_fragment>
}`;

// velo de "adentro de la nube" (pantalla completa)
const VEIL_FRAGMENT = /* glsl */`
uniform sampler2D uTex;
uniform vec3 uColor, uShade;
uniform float uAmount, uScroll, uAspect;
varying vec2 vUv;
void main(){
  // dos capas de nube que suben a distinta velocidad (la cámara baja a través de ellas)
  vec2 p = vec2(vUv.x * uAspect * 0.5, vUv.y);
  vec4 t = texture2D(uTex, vec2(p.x * 0.32 + 0.13, fract(p.y * 0.8 - uScroll)));
  vec4 t2 = texture2D(uTex, vec2(p.x * 0.16 + 0.57, fract(p.y * 0.5 - uScroll * 0.55)));
  float dens = clamp(t.r * 0.75 + t2.r * 0.6, 0.0, 1.0);
  vec3 col = mix(uShade, uColor, clamp(0.3 + (1.0 - t.b) * 0.5 + t.g * 0.3, 0.0, 1.0));
  float a = uAmount * (0.28 + 0.72 * dens);
  gl_FragColor = vec4(col, clamp(a, 0.0, 1.0));
  #include <colorspace_fragment>
}`;

export function createNubes(ctx, { track, tier }) {
  const { THREE, root, renderer } = ctx;
  const lowTex = tier === 'low';

  // ---------- horneado ----------
  const bakeMat = track(new THREE.ShaderMaterial({
    uniforms: { uKind: { value: 0 }, uSeed: { value: 0 }, uAspect: { value: 4 } },
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
    fragmentShader: BAKE_FRAGMENT,
    depthTest: false, depthWrite: false,
  }));
  const quad = new FullScreenQuad(bakeMat);
  const targets = {};
  for (const name of Object.keys(BAKE)) {
    const b = BAKE[name];
    const [w, h] = lowTex ? b.size.low : b.size.high;
    const rt = track(new THREE.WebGLRenderTarget(w, h, {
      generateMipmaps: true, minFilter: THREE.LinearMipmapLinearFilter, magFilter: THREE.LinearFilter,
      wrapS: THREE.RepeatWrapping, wrapT: THREE.ClampToEdgeWrapping, depthBuffer: false,
    }));
    rt.texture.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
    targets[name] = rt;
  }
  /** Hornea las 3 texturas (una por cuadro, para no armar un solo trabajo largo en la placa). */
  async function bake() {
    const prev = renderer.getRenderTarget();
    for (const name of Object.keys(BAKE)) {
      const b = BAKE[name], rt = targets[name];
      bakeMat.uniforms.uKind.value = b.kind;
      bakeMat.uniforms.uSeed.value = b.seed;
      bakeMat.uniforms.uAspect.value = rt.width / rt.height;
      renderer.setRenderTarget(rt);
      quad.render(renderer);
      await new Promise((r) => requestAnimationFrame(r));
    }
    renderer.setRenderTarget(prev);
    quad.dispose();
  }

  // ---------- capas ----------
  function makeLayer(name, { width, height, repeat, cols, edgeX, seed, order, thresh = 0.015, fadeLow = [0, 0.04], hazeK = 0 }) {
    const uniforms = {
      uTex: { value: targets[name].texture },
      uLit: { value: new THREE.Color('#ffffff') }, uShade: { value: new THREE.Color('#9aa0ad') }, uRim: { value: new THREE.Color('#fff2d8') },
      uHaze: { value: new THREE.Color('#e6eceb') }, uHazeK: { value: hazeK },
      uBounce: { value: new THREE.Color('#f7f1e7') }, uBounceK: { value: 0 },
      uOpacity: { value: 1 }, uMelt: { value: 0 }, uSamples: { value: SORT_SAMPLES[tier] ?? 5 }, uCols: { value: cols },
      uDrift: { value: 0 }, uRepeat: { value: repeat }, uUnder: { value: 0 }, uRimI: { value: 0.6 }, uSeed: { value: seed }, uEdgeX: { value: edgeX },
      uThresh: { value: thresh }, uFadeLow: { value: new THREE.Vector2(...fadeLow) },
    };
    const mat = track(new THREE.ShaderMaterial({
      uniforms, vertexShader: LAYER_VERTEX, fragmentShader: LAYER_FRAGMENT,
      transparent: true, depthWrite: false, toneMapped: false,
    }));
    const mesh = new THREE.Mesh(track(new THREE.PlaneGeometry(width, height)), mat);
    mesh.name = `luz_nubes_${name}`;
    mesh.renderOrder = order;
    mesh.frustumCulled = false;
    mesh.layers.enable(SKY_LAYER); // el mar las refleja
    root.add(mesh);
    return { name, mesh, uniforms, drift: Math.random() };
  }
  const layers = {
    // la lejana se disuelve hacia abajo en la bruma (no termina en un corte) y toma el color del aire
    // columnas del derretido: unas 4–6 px en pantalla en cada capa
    far: makeLayer('far', { width: 760, height: 64, repeat: 3, cols: 600, edgeX: 0.02, seed: 1.3, order: -60, fadeLow: [0.14, 0.44], hazeK: 0.28 }),
    mid: makeLayer('mid', { width: 150, height: 34, repeat: 2, cols: 700, edgeX: 0.06, seed: 7.9, order: -50, fadeLow: [0.06, 0.2], hazeK: 0.1 }),
    near: makeLayer('near', { width: 22, height: 3.4, repeat: 0.55, cols: 1900, edgeX: 0.12, seed: 19.1, order: 40, thresh: 0.06 }),
  };

  // ---------- velo (adentro de la nube) ----------
  const veilU = {
    uTex: { value: targets.mid.texture }, uColor: { value: new THREE.Color('#fbf7ef') }, uShade: { value: new THREE.Color('#d9d6dc') },
    uAmount: { value: 0 }, uScroll: { value: 0 }, uAspect: { value: 1.6 },
  };
  const veil = new THREE.Mesh(track(new THREE.PlaneGeometry(2, 2)), track(new THREE.ShaderMaterial({
    uniforms: veilU,
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
    fragmentShader: VEIL_FRAGMENT,
    transparent: true, depthTest: false, depthWrite: false, toneMapped: false,
  })));
  veil.name = 'luz_velo_nube';
  veil.renderOrder = 90;
  veil.frustumCulled = false;
  veil.visible = false;
  root.add(veil);

  let curTier = tier;
  return {
    layers,
    veil,
    bake,
    setQuality(t) {
      curTier = t;
      for (const k in layers) layers[k].uniforms.uSamples.value = SORT_SAMPLES[t] ?? 0;
    },
    /** 2 capas en calidad baja (sin la media). */
    get layerCount() { return curTier === 'low' ? 2 : 3; },
    resize(w, h) { veilU.uAspect.value = w / h; },
  };
}
