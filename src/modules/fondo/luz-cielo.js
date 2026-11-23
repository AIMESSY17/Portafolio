// Cielo de "Hecha de luz": un domo que sigue a la cámara (siempre detrás de todo).
//  · degradé: celeste muy claro arriba → blanco cálido en el horizonte (día), oro (atardecer),
//    azul profundo (hora azul). Abajo del horizonte, bruma cálida (el "mar de nubes" del hero).
//  · sol: disco + dos halos; la franja finita del horizonte (naranja a la hora azul); estrellas tenues.
//  · todo lo cambia el estado de luz (uniforms): no hay ruido por píxel, solo cuentas baratas.
// También se usa para hornear el entorno de la estatua (PMREM) y en el reflejo del mar (capa 2).
import { HASH } from './luz-glsl.js';

export const SKY_LAYER = 2; // lo que ve la CubeCamera del reflejo

export function skyUniforms(THREE) {
  return {
    uZenith: { value: new THREE.Color('#BFD3DE') },
    uHorizon: { value: new THREE.Color('#ECEFEC') },
    uBelow: { value: new THREE.Color('#F5EFE4') },
    uSunColor: { value: new THREE.Color('#FFE3B5') },
    uBand: { value: new THREE.Color('#E6A884') },
    uBandHi: { value: new THREE.Color('#96788F') },
    uSunDir: { value: new THREE.Vector3(0.6, 0.35, -0.7).normalize() },
    uSunGlow: { value: 0.6 },
    uSunDisc: { value: 0 },
    uBandI: { value: 0 },
    uStars: { value: 0 },
    uCurve: { value: 0.55 },
    uTime: { value: 0 },
  };
}

export const SKY_VERTEX = /* glsl */`
varying vec3 vDir;
void main(){
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vDir = wp.xyz - cameraPosition;
  gl_Position = projectionMatrix * viewMatrix * wp;
  gl_Position.z = gl_Position.w; // siempre al fondo
}`;

export const SKY_FRAGMENT = /* glsl */`
uniform vec3 uZenith, uHorizon, uBelow, uSunColor, uBand, uBandHi, uSunDir;
uniform float uSunGlow, uSunDisc, uBandI, uStars, uCurve, uTime;
varying vec3 vDir;
${HASH}
void main(){
  vec3 d = normalize(vDir);
  float e = d.y;
  vec3 sky = mix(uHorizon, uZenith, pow(clamp(e, 0.0, 1.0), uCurve));
  // abajo del horizonte: bruma (mar de nubes en el hero; el mar real lo tapa en las salas)
  sky = mix(sky, uBelow, smoothstep(0.0, 0.22, -e));
  // sol: halo ancho + halo cercano + disco
  float cs = max(dot(d, normalize(uSunDir)), 0.0);
  sky += uSunColor * (pow(cs, 5.0) * 0.28 + pow(cs, 42.0) * 0.55 + pow(cs, 520.0) * 1.1) * uSunGlow;
  sky += uSunColor * smoothstep(0.99975, 0.9999, cs) * uSunDisc;
  // franja del horizonte: angosta, más fuerte del lado del sol, con un borde rosado arriba
  float up = max(e, 0.0);
  float side = 0.55 + 0.45 * pow(max(dot(normalize(d.xz + 1e-4), normalize(uSunDir.xz + 1e-4)), 0.0), 3.0);
  float band = exp(-pow(up / 0.016, 2.0)) * side;
  float pink = exp(-pow((up - 0.05) / 0.05, 2.0)) * side;
  sky = mix(sky, uBandHi, pink * uBandI * 0.55);
  sky = mix(sky, uBand, band * uBandI);
  // estrellas de la hora azul: pocas, finas y tenues
  if (uStars > 0.01) {
    vec3 g = floor(d * 260.0);
    float h = hash13(g);
    float st = step(0.9972, h) * smoothstep(0.06, 0.45, e);
    sky += vec3(0.85, 0.9, 1.0) * st * uStars * (0.35 + 0.65 * fract(h * 17.0)) * (0.75 + 0.25 * sin(uTime * 1.7 + h * 50.0));
  }
  sky += (hash12(gl_FragCoord.xy) - 0.5) / 255.0; // sin bandas en el degradé
  gl_FragColor = vec4(max(sky, 0.0), 1.0);
  #include <colorspace_fragment>
}`;

export function createCielo(ctx, { track }) {
  const { THREE, root } = ctx;
  const uniforms = skyUniforms(THREE);
  const material = track(new THREE.ShaderMaterial({
    uniforms,
    vertexShader: SKY_VERTEX,
    fragmentShader: SKY_FRAGMENT,
    side: THREE.BackSide,
    depthWrite: false,
    depthTest: false,
    toneMapped: false,
  }));
  const mesh = new THREE.Mesh(track(new THREE.SphereGeometry(150, 48, 24)), material);
  mesh.name = 'luz_cielo';
  mesh.renderOrder = -100;
  mesh.frustumCulled = false;
  mesh.layers.enable(SKY_LAYER);
  // el domo siempre centrado en la cámara que lo dibuja (también en la CubeCamera del reflejo)
  mesh.onBeforeRender = (r, s, cam) => { mesh.position.copy(cam.position); mesh.updateMatrixWorld(); };
  root.add(mesh);

  return {
    mesh,
    uniforms,
    /** Copia el estado de luz a los uniforms. */
    apply(st, time) {
      uniforms.uZenith.value.copy(st.zenith);
      uniforms.uHorizon.value.copy(st.horizon);
      uniforms.uBelow.value.copy(st.below);
      uniforms.uSunColor.value.copy(st.sun);
      uniforms.uBand.value.copy(st.band);
      uniforms.uBandHi.value.copy(st.bandHi);
      uniforms.uSunGlow.value = st.sunGlow;
      uniforms.uSunDisc.value = st.sunDisc;
      uniforms.uBandI.value = st.bandI;
      uniforms.uStars.value = st.stars;
      uniforms.uCurve.value = st.curve;
      uniforms.uTime.value = time;
    },
  };
}
