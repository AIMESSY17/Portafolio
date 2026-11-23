// Partículas de sala (UN dibujo de puntos, la animación está en el shader: no se toca nada por cuadro).
//   modo 0 = POLEN (La Pastoril): motas cálidas que flotan y suben despacio, con un brillo leve
//   modo 1 = AZÚCAR impalpable (Casa de Muffin): copos blancos que caen lentos; al tocar el agua el fondo deja
//            una onda chiquita (mar.drop, desde index.js)
// Alrededor de la estatua, en coordenadas del mundo (el mar ya llegó: no hay caída en las salas).
export function createSalaParticulas(ctx, { track, tier }) {
  const { THREE, root, renderer } = ctx;
  const N = { high: 320, medium: 200, low: 90 };
  const total = N.high;
  const seed = new Float32Array(total * 4);
  let s = 11;
  const rnd = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
  for (let i = 0; i < total * 4; i++) seed[i] = rnd();
  const geo = track(new THREE.BufferGeometry());
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(total * 3), 3)); // no se usa (todo en aSeed)
  geo.setAttribute('aSeed', new THREE.BufferAttribute(seed, 4));
  geo.setDrawRange(0, N[tier] ?? N.high);
  const uniforms = {
    uTime: { value: 0 }, uMode: { value: 0 }, uAmount: { value: 0 }, uSeaY: { value: -1.15 }, uPx: { value: 1 },
    uPolen: { value: new THREE.Color('#ffe2a0') }, uAzucar: { value: new THREE.Color('#fff8f0') },
  };
  const mat = track(new THREE.ShaderMaterial({
    uniforms, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    vertexShader: /* glsl */`
      attribute vec4 aSeed;
      uniform float uTime, uMode, uAmount, uSeaY, uPx;
      varying float vA;
      void main(){
        vec3 p;
        float a;
        if (uMode < 0.5) {
          // polen: flota y sube muy despacio, con un vaivén
          float y = fract(aSeed.y + uTime * (0.006 + aSeed.w * 0.01));
          p = vec3((aSeed.x - 0.5) * 14.0 + sin(uTime * 0.35 + aSeed.z * 30.0) * 0.5,
                   uSeaY + 0.2 + y * 5.5,
                   (aSeed.z - 0.5) * 12.0 - 2.0 + cos(uTime * 0.27 + aSeed.x * 20.0) * 0.5);
          a = smoothstep(0.0, 0.15, y) * smoothstep(1.0, 0.8, y) * (0.45 + 0.55 * sin(uTime * (1.0 + aSeed.w * 2.0) + aSeed.x * 50.0));
        } else {
          // azúcar: cae derecho y lento; cerca del agua se apaga
          float y = 1.0 - fract(aSeed.y + uTime * (0.035 + aSeed.w * 0.03));
          p = vec3((aSeed.x - 0.5) * 9.0 + sin(uTime * 0.5 + aSeed.z * 20.0) * 0.08,
                   uSeaY + y * 5.0,
                   (aSeed.z - 0.5) * 8.0 - 1.0);
          a = smoothstep(0.0, 0.06, y) * smoothstep(1.0, 0.85, y) * 0.8;
        }
        vA = a * uAmount;
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        gl_Position = projectionMatrix * mv;
        float size = uMode < 0.5 ? 3.2 : 2.4;
        gl_PointSize = vA > 0.01 ? max(1.2, size * uPx * (8.0 / max(1.0, -mv.z))) : 0.0;
      }`,
    fragmentShader: /* glsl */`
      uniform float uMode; uniform vec3 uPolen, uAzucar;
      varying float vA;
      void main(){
        vec2 c = gl_PointCoord - 0.5;
        float a = exp(-dot(c, c) * 14.0) * vA;
        if (a < 0.006) discard;
        vec3 col = uMode < 0.5 ? uPolen * 1.6 : uAzucar * 1.1;
        gl_FragColor = vec4(col * a, a);
        #include <colorspace_fragment>
      }`,
  }));
  const points = new THREE.Points(geo, mat);
  points.name = 'fondo_sala_particulas';
  points.frustumCulled = false;
  points.renderOrder = 30;
  points.visible = false;
  root.add(points);
  return {
    points, uniforms,
    resize() { uniforms.uPx.value = Math.min(2, renderer.getPixelRatio()); },
    setQuality(t) { geo.setDrawRange(0, N[t] ?? N.high); },
  };
}
