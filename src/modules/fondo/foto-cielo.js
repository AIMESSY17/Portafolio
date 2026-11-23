// Cielo fotográfico: un domo que sigue a la cámara con PANORAMAS REALES de Poly Haven (CC0).
//   día        kloofendal_48d_partly_cloudy_puresky  (cúmulos grandes con contraste)
//   atardecer  belfast_sunset_puresky                (sol dorado sobre el horizonte)
//   crepúsculo qwantani_dusk_2_puresky               (hora azul; se oscurece en el shader)
//   estrellas  Vía Láctea de ESO/S. Brunier (CC BY 4.0): solo el brillo de la banda. Las estrellas se
//              dibujan aparte, nítidas, desde sus posiciones reales (estrellas.bin).
// Cada panorama se gira para que su sol caiga donde lo pone el guion (así la luz de la estatua, el camino de
// sol del mar y el sol de la foto coinciden). Fundido suave entre panoramas: pesos por uniform, y solo se lee
// la textura de los que pesan algo. Sin mipmaps: a pantalla completa la foto siempre se amplía.
// El domo también se dibuja en el reflejo del mar (capa 2).
import { HASH } from './luz-glsl.js';

export const SKY_LAYER = 2;

// Dónde está el sol en cada foto (u, v desde arriba, medido en el HDR) y dónde lo queremos (azimut, grados:
// 0 = detrás de la estatua, + = hacia la derecha). La elevación es la de la foto.
export const PANOS = {
  dia: { file: 'dia', hdr: 'dia.hdr', sunU: 0.5952, sunV: 0.2344, az: 118 },
  atardecer: { file: 'atardecer', hdr: 'atardecer.hdr', sunU: 0.637, sunV: 0.4846, az: -17 },
  // hora azul = Kloppenheim 06 (versión película): el resplandor más fuerte medido en su EXR (scripts/assets/cielos.json)
  crepusculo: { file: 'crepusculo', hdr: 'crepusculo.hdr', sunU: 0.6069, sunV: 0.4561, az: -12 },
};
/** Corrimiento horizontal (fracción de vuelta) que lleva el sol de la foto al azimut pedido. */
export function panoOffset(p) {
  // convención de Three (equirectUv): u = atan(z, x) / 2π + 0.5; un azimut A (dir = (sin A, ·, -cos A)) cae en A/2π + 0.25
  return (p.az / 360 + 0.25 - p.sunU + 2) % 1;
}
/** Dirección hacia el sol de la foto (ya girada). */
export function panoSun(THREE, p, out = new THREE.Vector3()) {
  const az = THREE.MathUtils.degToRad(p.az), el = THREE.MathUtils.degToRad(90 - p.sunV * 180);
  return out.set(Math.sin(az) * Math.cos(el), Math.sin(el), -Math.cos(az) * Math.cos(el));
}

const VERTEX = /* glsl */`
varying vec3 vDir;
void main(){
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vDir = wp.xyz - cameraPosition;
  gl_Position = projectionMatrix * viewMatrix * wp;
  gl_Position.z = gl_Position.w; // siempre al fondo
}`;

const FRAGMENT = /* glsl */`
uniform sampler2D uDia, uTarde, uCrep, uVia;
uniform vec4 uW;          // pesos: día, atardecer, crepúsculo, (libre)
uniform vec3 uOff;        // corrimiento de cada foto (fracción de vuelta)
uniform vec3 uExpo;       // exposición de cada foto
uniform vec3 uContrast;   // contraste de cada foto
uniform vec3 uSat;        // saturación de cada foto
uniform vec3 uTint;       // tono de la sala (multiplica, apenas)
uniform vec3 uBelow;      // abajo del horizonte: el mar de nubes del hero
uniform float uBelowK, uNight, uVia1, uViaRot;
uniform vec3 uSunDir, uSunCol, uHazeCol;
uniform float uSunK, uHazeK;
uniform mat3 uViaM;
varying vec3 vDir;
${HASH}
const float PI2 = 6.28318530718;
vec3 grade(vec3 c, float e, float k, float s){
  c *= e;
  float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
  c = mix(vec3(l), c, s);
  // contraste alrededor del gris medio, en un espacio casi perceptual
  vec3 p = pow(max(c, 0.0), vec3(1.0 / 2.2));
  p = (p - 0.45) * k + 0.45;
  return pow(max(p, 0.0), vec3(2.2));
}
vec2 equi(vec3 d, float off){
  float u = atan(d.z, d.x) / PI2 + 0.5 - off;
  float v = asin(clamp(d.y, -1.0, 1.0)) / 3.14159265 + 0.5;
  return vec2(fract(u), v);
}
// los panoramas vienen codificados con Reinhard (y = x / (1 + x), scripts/assets/cielos.py): se recupera la luz real
vec3 pano(sampler2D t, vec2 uv){ vec3 y = texture2D(t, uv).rgb; return y / max(1.0 - y, vec3(1.0 / 48.0)); }
void main(){
  vec3 d = normalize(vDir);
  vec3 col = vec3(0.0);
  if (uW.x > 0.001) col += uW.x * grade(pano(uDia, equi(d, uOff.x)), uExpo.x, uContrast.x, uSat.x);
  if (uW.y > 0.001) col += uW.y * grade(pano(uTarde, equi(d, uOff.y)), uExpo.y, uContrast.y, uSat.y);
  if (uW.z > 0.001) {
    vec3 c = grade(pano(uCrep, equi(d, uOff.z)), uExpo.z, uContrast.z, uSat.z);
    // hora azul: más oscuro hacia arriba, con la franja clara pegada al horizonte
    float up = clamp(d.y, 0.0, 1.0);
    c *= mix(1.0, mix(0.34, 0.06, pow(up, 0.45)), uNight);
    c = mix(c, c * vec3(0.55, 0.68, 1.1), uNight * smoothstep(0.02, 0.4, up));
    col += uW.z * c;
  }
  // Vía Láctea (solo el brillo de la banda), girada sobre el cielo
  if (uVia1 > 0.001 && d.y > -0.05) {
    vec3 g = uViaM * d;
    float u = atan(g.x, -g.z) / PI2 + 0.5;
    float v = 0.5 + asin(clamp(g.y, -1.0, 1.0)) / 3.14159265;
    vec3 via = texture2D(uVia, vec2(u, v)).rgb;
    // hora azul: la banda apenas se insinúa (fría y desaturada; el color real de la foto, al 35 %)
    via = mix(vec3(dot(via, vec3(0.3, 0.55, 0.15))) * vec3(0.85, 0.92, 1.1), via, 0.35);
    col += via * 0.32 * uVia1 * smoothstep(-0.02, 0.25, d.y);
  }
  col *= uTint;
  // perspectiva aérea: cerca de la línea del horizonte el aire se aclara y se entibia (más hacia el lado del sol)
  {
    vec2 hd = normalize(d.xz + 1e-5), hs = normalize(uSunDir.xz + 1e-5);
    float side = pow(max(dot(hd, hs), 0.0), 3.0);
    float band = d.y < 0.0 ? 1.0 : exp(-d.y * (6.5 - 2.5 * side));
    col = mix(col, uHazeCol * (0.92 + 0.4 * side), clamp(band * uHazeK * (0.6 + 0.4 * side), 0.0, 1.0));
  }
  // el sol: resplandor ancho y cálido + disco chico y blanco (el que reflejan el mar y el oro)
  if (uSunK > 0.001) {
    float sd = max(dot(d, uSunDir), 0.0);
    col += uSunCol * (pow(sd, 8.0) * 0.04 + pow(sd, 60.0) * 0.16 + pow(sd, 600.0) * 1.6) * uSunK;
    float disc = smoothstep(0.99978, 0.99992, sd);
    col = mix(col, vec3(1.0, 0.94, 0.84) * 26.0, disc * uSunK); // luz real: el post lo hace florecer y le pone el destello
  }
  // abajo del horizonte en el hero: el mar de nubes (claro), que sigue hasta el horizonte
  col = mix(col, uBelow, uBelowK * smoothstep(0.0, -0.16, d.y));
  col += (hash12(gl_FragCoord.xy) - 0.5) / 255.0; // sin bandas
  gl_FragColor = vec4(max(col, 0.0), 1.0);
  #include <colorspace_fragment>
}`;

// Estrellas nítidas: puntos a resolución completa, con forma de estrella de 4 puntas finas en las más
// brillantes y un titileo sutil. Posiciones y colores reales (sacados de la foto de ESO).
const STAR_VERTEX = /* glsl */`
attribute float aMag;
attribute vec3 aCol;
uniform float uAmount, uTime, uPx;
uniform mat3 uViaT;
varying float vI; varying float vMag; varying vec3 vCol;
void main(){
  vec3 d = uViaT * position;                      // misma rotación que la Vía Láctea
  float horizon = smoothstep(0.0, 0.14, d.y);
  float tw = 0.86 + 0.14 * sin(uTime * (1.3 + fract(aMag * 91.7) * 2.6) + aMag * 400.0);
  vI = uAmount * horizon * (0.42 + 0.58 * aMag) * tw;
  vMag = aMag; vCol = aCol;
  vec4 wp = vec4(cameraPosition + d * 140.0, 1.0);
  gl_Position = projectionMatrix * viewMatrix * wp;
  gl_Position.z = gl_Position.w * 0.99999;
  float s = aMag > 0.5 ? mix(8.0, 17.0, (aMag - 0.5) / 0.5) : mix(2.0, 3.6, aMag / 0.5);
  gl_PointSize = vI > 0.01 ? s * uPx : 0.0;
}`;
const STAR_FRAGMENT = /* glsl */`
varying float vI; varying float vMag; varying vec3 vCol;
void main(){
  vec2 c = gl_PointCoord - 0.5;
  float r2 = dot(c, c);
  float a;
  if (vMag > 0.5) {
    // núcleo chico + dos rayos finos que se apagan hacia la punta
    float core = exp(-r2 * 260.0);
    float rx = exp(-abs(c.y) * 160.0) * pow(max(0.0, 1.0 - abs(c.x) * 2.0), 2.0);
    float ry = exp(-abs(c.x) * 160.0) * pow(max(0.0, 1.0 - abs(c.y) * 2.0), 2.0);
    a = core + (rx + ry) * 0.55;
  } else {
    a = exp(-r2 * 30.0);
  }
  a *= vI;
  if (a < 0.004) discard;
  gl_FragColor = vec4(mix(vec3(1.0), vCol, 0.35), min(a, 1.0)); // aditivo: color × alfa (una sola vez)
  #include <colorspace_fragment>
}`;

export function createFotoCielo(ctx, { track, tier, onProgress, sunDir }) {
  const { THREE, root, renderer, assetsPath: A } = ctx;
  const res = tier === 'low' ? '-2k' : '';
  const loader = new THREE.TextureLoader();
  const maxAniso = renderer.capabilities.getMaxAnisotropy();
  let done = 0;
  const total = 5;
  const tick = () => onProgress?.(++done / total);
  function tex(name) {
    return new Promise((resolve) => {
      const t = loader.load(`${A}cielo/${name}${res}.webp`, () => { tick(); resolve(t); }, undefined, () => { tick(); resolve(t); });
      t.colorSpace = THREE.SRGBColorSpace;
      t.generateMipmaps = false;           // siempre se amplía: sin mipmaps (menos memoria, sin costura)
      t.minFilter = THREE.LinearFilter;
      t.magFilter = THREE.LinearFilter;
      t.wrapS = THREE.RepeatWrapping;
      t.anisotropy = maxAniso;
      track(t);
    });
  }

  const viaM = new THREE.Matrix3();
  // la banda de la Vía Láctea cruzando el cielo en diagonal, alta sobre el mar
  const e = new THREE.Euler(0.95, -0.55, 0.42, 'YXZ');
  viaM.setFromMatrix4(new THREE.Matrix4().makeRotationFromEuler(e));

  const uniforms = {
    uDia: { value: null }, uTarde: { value: null }, uCrep: { value: null }, uVia: { value: null },
    uW: { value: new THREE.Vector4(1, 0, 0, 0) },
    uOff: { value: new THREE.Vector3(panoOffset(PANOS.dia), panoOffset(PANOS.atardecer), panoOffset(PANOS.crepusculo)) },
    uExpo: { value: new THREE.Vector3(1, 1, 1) },
    uContrast: { value: new THREE.Vector3(1, 1, 1) },
    uSat: { value: new THREE.Vector3(1, 1, 1) },
    uTint: { value: new THREE.Color(1, 1, 1) },
    uBelow: { value: new THREE.Color('#E9EEF2') }, uBelowK: { value: 0 },
    uNight: { value: 0 }, uVia1: { value: 0 }, uViaRot: { value: 0 },
    uViaM: { value: viaM },
    uSunDir: { value: sunDir || new THREE.Vector3(0, 0.1, -1) }, uSunCol: { value: new THREE.Color('#ffc98a') },
    uHazeCol: { value: new THREE.Color('#f7c896') }, uSunK: { value: 0 }, uHazeK: { value: 0 },
  };
  const material = track(new THREE.ShaderMaterial({
    uniforms, vertexShader: VERTEX, fragmentShader: FRAGMENT,
    side: THREE.BackSide, depthWrite: false, depthTest: false, toneMapped: false,
  }));
  const mesh = new THREE.Mesh(track(new THREE.SphereGeometry(150, 64, 32)), material);
  mesh.name = 'foto_cielo';
  mesh.renderOrder = -100;
  mesh.frustumCulled = false;
  mesh.layers.enable(SKY_LAYER);
  mesh.onBeforeRender = (r, s, cam) => { mesh.position.copy(cam.position); mesh.updateMatrixWorld(); };
  root.add(mesh);

  // estrellas
  const starU = { uAmount: { value: 0 }, uTime: { value: 0 }, uPx: { value: 1 }, uViaT: { value: viaM.clone().transpose() } };
  const starMat = track(new THREE.ShaderMaterial({
    uniforms: starU, vertexShader: STAR_VERTEX, fragmentShader: STAR_FRAGMENT,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false,
  }));
  const starGeo = track(new THREE.BufferGeometry());
  const stars = new THREE.Points(starGeo, starMat);
  stars.name = 'foto_estrellas';
  stars.frustumCulled = false;
  stars.renderOrder = -99;
  stars.visible = false;
  root.add(stars);
  const starsReady = fetch(`${A}cielo/estrellas.bin`).then((r) => r.arrayBuffer()).then((buf) => {
    const f = new Float32Array(buf);
    const n = f.length / 7;
    const keep = tier === 'low' ? Math.min(n, 900) : n; // vienen ordenadas de la más brillante a la más tenue
    const pos = new Float32Array(keep * 3), mag = new Float32Array(keep), col = new Float32Array(keep * 3);
    for (let i = 0; i < keep; i++) {
      pos[i * 3] = f[i * 7]; pos[i * 3 + 1] = f[i * 7 + 1]; pos[i * 3 + 2] = f[i * 7 + 2];
      mag[i] = f[i * 7 + 3];
      col[i * 3] = f[i * 7 + 4]; col[i * 3 + 1] = f[i * 7 + 5]; col[i * 3 + 2] = f[i * 7 + 6];
    }
    starGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    starGeo.setAttribute('aMag', new THREE.BufferAttribute(mag, 1));
    starGeo.setAttribute('aCol', new THREE.BufferAttribute(col, 3));
    tick();
  }).catch(() => tick());

  const ready = Promise.all([tex('dia'), tex('atardecer'), tex('crepusculo'), tex('estrellas'), starsReady]).then(([d, t, c, v]) => {
    uniforms.uDia.value = d; uniforms.uTarde.value = t; uniforms.uCrep.value = c; uniforms.uVia.value = v;
  });

  function resize() { starU.uPx.value = Math.min(2, renderer.getPixelRatio()); }
  resize();

  return {
    mesh, stars, uniforms, ready, resize,
    /**
     * w = pesos de los panoramas (día, atardecer, crepúsculo) · st = estado de luz (grade, tinte, mar de nubes)
     * night = 0..1 hora azul · starsK = 0..1 estrellas
     */
    apply(st, wDia, wTarde, wCrep, night, starsK, time) {
      uniforms.uW.value.set(wDia, wTarde, wCrep, 0);
      uniforms.uExpo.value.set(st.expoDia, st.expoTarde, st.expoCrep);
      uniforms.uContrast.value.set(st.contrastDia, st.contrastTarde, st.contrastCrep);
      uniforms.uSat.value.set(st.satDia, st.satTarde, st.satCrep);
      uniforms.uTint.value.copy(st.skyTint);
      uniforms.uBelow.value.copy(st.below);
      uniforms.uBelowK.value = st.belowK;
      uniforms.uHazeCol.value.copy(st.horizonte);
      uniforms.uHazeK.value = st.hazeK;
      uniforms.uSunCol.value.copy(st.sun);
      uniforms.uSunK.value = st.sunK;
      uniforms.uNight.value = night;
      uniforms.uVia1.value = starsK * 0.85;
      starU.uAmount.value = starsK;
      starU.uTime.value = time;
      const on = starsK > 0.003;
      if (stars.visible !== on) stars.visible = on;
    },
  };
}
