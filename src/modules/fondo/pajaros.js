// Pájaros: 4 bandadas de pájaros chiquitos, a lo lejos, que cruzan el cuadro mientras la cámara cae por debajo
// de las nubes (la escala sale del paralaje: cada bandada está a otra altura y a otra distancia).
// Un solo dibujo de puntos: cada punto es un pájaro (una "v" que aletea, dibujada en el shader). Todo el movimiento
// sale de la posición del guion (P) y del tiempo en el vertex shader, así que va y vuelve con el scroll y no se
// toca nada por cuadro salvo 4 uniforms. Low: 2 bandadas de menos pájaros.
const FLOCKS = [
  // x0 (m), altura sobre el mar (m), z (m), recorrido por pantalla de scroll (m), pájaros
  { x: -150, h: 58, z: -240, v: 170, n: 13 },
  { x: 130, h: 41, z: -300, v: -140, n: 11 },
  { x: -110, h: 27, z: -210, v: 130, n: 9 },
  { x: 160, h: 15, z: -330, v: -185, n: 12 },
];

export function createPajaros(ctx, { track, tier }) {
  const { THREE, root, renderer, camera } = ctx;
  const flocks = tier === 'low' ? [FLOCKS[0], FLOCKS[2]] : FLOCKS;
  const per = tier === 'low' ? 0.6 : 1;
  const base = [], off = [], par = [];
  let seed = 11;
  const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  flocks.forEach((f, fi) => {
    const n = Math.max(4, Math.round(f.n * per));
    for (let i = 0; i < n; i++) {
      // formación en V, con desorden
      const row = Math.ceil(i / 2), side = i % 2 ? 1 : -1;
      base.push(f.x, f.h, f.z);
      off.push(side * row * 2.6 + (rnd() - 0.5) * 2.2, -row * 0.9 + (rnd() - 0.5) * 1.6, row * 3.4 + (rnd() - 0.5) * 3);
      par.push(f.v, rnd() * 6.28, fi + rnd());
    }
  });
  const geo = track(new THREE.BufferGeometry());
  const count = base.length / 3;
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(count * 3), 3)); // (no se usa; hace falta para dibujar)
  geo.setAttribute('aBase', new THREE.BufferAttribute(new Float32Array(base), 3));
  geo.setAttribute('aOff', new THREE.BufferAttribute(new Float32Array(off), 3));
  geo.setAttribute('aPar', new THREE.BufferAttribute(new Float32Array(par), 3));
  const U = {
    uP: { value: 0 }, uTime: { value: 0 }, uSeaY: { value: 0 }, uPx: { value: 800 }, uAmount: { value: 0 },
    uHaze: { value: new THREE.Color('#d9b9a6') },
  };
  const mat = track(new THREE.ShaderMaterial({
    uniforms: U, transparent: true, depthWrite: false, depthTest: false, toneMapped: false,
    vertexShader: /* glsl */`
      attribute vec3 aBase, aOff, aPar;
      uniform float uP, uTime, uSeaY, uPx, uAmount;
      varying float vPh; varying float vA; varying float vFar;
      void main(){
        float prog = uP - 1.5;
        // cada bandada entra en su momento de la caída (aPar.z = bandada)
        float local = clamp((uP - (1.62 + floor(aPar.z) * 0.2)) / 0.28, 0.0, 1.0);
        float out_ = 1.0 - clamp((uP - 2.72) / 0.18, 0.0, 1.0);
        vA = uAmount * smoothstep(0.0, 0.25, local) * out_;
        vec3 p = vec3(aBase.x + prog * aPar.x + aOff.x + sin(uTime * 0.4 + aPar.y) * 1.2,
                      uSeaY + aBase.y + aOff.y + sin(uTime * 0.7 + aPar.y * 3.0) * 0.7,
                      aBase.z + aOff.z);
        vec4 mv = viewMatrix * vec4(p, 1.0);
        gl_Position = projectionMatrix * mv;
        float d = max(1.0, -mv.z);
        vFar = clamp(d / 380.0, 0.0, 1.0);
        gl_PointSize = vA > 0.01 ? clamp(1.9 * uPx / d, 0.0, 26.0) : 0.0;
        vPh = uTime * 7.0 + aPar.y * 5.0;
      }`,
    fragmentShader: /* glsl */`
      uniform vec3 uHaze; varying float vPh; varying float vA; varying float vFar;
      float seg(vec2 p, vec2 a, vec2 b){ vec2 pa = p - a, ba = b - a; float h = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0); return length(pa - ba * h); }
      void main(){
        vec2 c = (gl_PointCoord - 0.5) * 2.0; c.y = -c.y;
        float f = 0.5 + 0.5 * sin(vPh);                     // aleteo: las puntas suben y bajan
        vec2 body = vec2(0.0, -0.05);
        float d = min(seg(c, body, vec2(-0.92, -0.05 + (f - 0.35) * 0.9)), seg(c, body, vec2(0.92, -0.05 + (f - 0.35) * 0.9)));
        float a = (1.0 - smoothstep(0.06, 0.2, d)) * vA;
        if (a < 0.02) discard;
        vec3 col = mix(vec3(0.13, 0.11, 0.14), uHaze, 0.25 + vFar * 0.35);
        gl_FragColor = vec4(col, a * 0.85);
        #include <colorspace_fragment>
      }`,
  }));
  const points = new THREE.Points(geo, mat);
  points.name = 'fondo_pajaros';
  points.frustumCulled = false;
  points.renderOrder = -30;
  points.visible = false;
  root.add(points);

  function resize() {
    // píxeles por metro a 1 m de distancia (para que el tamaño salga de la perspectiva real)
    const h = renderer.domElement.height || innerHeight;
    U.uPx.value = h / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2));
  }
  resize();
  return {
    points, uniforms: U, resize,
    /** P = posición del guion · seaY = y del mar · amount 0..1 (se apaga en las salas, de noche, etc.) */
    update(P, time, seaY, amount, haze) {
      U.uP.value = P; U.uTime.value = time; U.uSeaY.value = seaY; U.uAmount.value = amount;
      if (haze) U.uHaze.value.copy(haze);
      const on = amount > 0.01 && P > 1.5 && P < 2.95;
      if (points.visible !== on) points.visible = on;
    },
  };
}
