// La luz: un "sol" ámbar que gira alrededor de la estatua, con su haz volumétrico visible en el aire,
// un resplandor en la fuente, una luz de relleno del otro lado y la vela que sigue al cursor.
import { NOISE } from './glsl.js';

export function createLuz(ctx, { track, tier }) {
  const { THREE, root } = ctx;
  const TARGET = new THREE.Vector3(0, 1.6, 0);
  const RADIUS = 11;

  const hemi = new THREE.HemisphereLight('#2A3550', '#120C08', 0.18);
  const sun = new THREE.SpotLight('#FFB15A', 520, 40, 0.42, 0.75, 1.6);
  sun.castShadow = tier !== 'low';
  sun.shadow.mapSize.set(1024, 1024);
  sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.03;
  sun.shadow.camera.near = 3; sun.shadow.camera.far = 30;
  sun.target.position.copy(TARGET);
  const fill = new THREE.DirectionalLight('#7E8FB0', 0.35);
  fill.target.position.copy(TARGET);
  const candle = new THREE.PointLight('#FFC58A', 4, 8, 1.6);
  candle.position.set(0, 2, 3.2);
  root.add(hemi, sun, sun.target, fill, fill.target, candle);

  // haz volumétrico: cono abierto con shader aditivo (polvo en suspensión dentro de la luz)
  const coneGeo = track(new THREE.CylinderGeometry(0.2, 2.4, 1, 64, 24, true));
  coneGeo.translate(0, -0.5, 0);           // la punta en el origen, se abre hacia -y
  coneGeo.rotateX(-Math.PI / 2);           // ahora apunta a +z
  const beamU = { uColor: { value: new THREE.Color('#FFB15A') }, uOpacity: { value: 1 }, uTime: { value: 0 } };
  const beamMat = track(new THREE.ShaderMaterial({
    uniforms: beamU, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, toneMapped: false,
    vertexShader: /* glsl */`
      varying float vAlong; varying vec3 vN; varying vec3 vView; varying vec3 vLocal; varying float vDist;
      void main(){
        vAlong = position.z;               // 0 en la fuente → 1 en la estatua
        vLocal = position;
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        vN = normalize(normalMatrix * normal); vView = normalize(-mv.xyz); vDist = -mv.z;
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */`
      uniform vec3 uColor; uniform float uOpacity, uTime;
      varying float vAlong; varying vec3 vN; varying vec3 vView; varying vec3 vLocal; varying float vDist;
      ${NOISE}
      void main(){
        float edge = pow(abs(dot(normalize(vN), normalize(vView))), 1.6);     // más denso en el centro del haz
        float len = smoothstep(0.0, 0.08, vAlong) * (1.0 - smoothstep(0.55, 1.15, vAlong));
        float dust = 0.65 + 0.7 * fbm(vec2(atan(vLocal.y, vLocal.x) * 2.0, vAlong * 6.0 - uTime * 0.08));
        float a = edge * len * dust * 0.42 * uOpacity * smoothstep(5.0, 12.0, vDist);   // no empaña la cámara
        gl_FragColor = vec4(uColor * a, a);
        #include <colorspace_fragment>
      }`,
  }));
  const beam = new THREE.Mesh(coneGeo, beamMat);
  beam.renderOrder = 5;
  beam.frustumCulled = false;
  root.add(beam);

  // resplandor en la fuente de luz (se ve cuando el sol queda en cuadro, por ejemplo en contraluz)
  const flareTex = track(new THREE.TextureLoader().load(ctx.assetsPath + 'claroscuro/destello.webp'));
  flareTex.colorSpace = THREE.SRGBColorSpace;
  const flare = new THREE.Sprite(track(new THREE.SpriteMaterial({ map: flareTex, color: '#FFB15A', blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, toneMapped: false })));
  flare.scale.setScalar(7);
  root.add(flare);

  const tmp = new THREE.Vector3();
  const cur = { az: -0.85, el: 0.62 };

  function place(az, el) {
    const ce = Math.cos(el);
    sun.position.set(TARGET.x + RADIUS * Math.sin(az) * ce, TARGET.y + RADIUS * Math.sin(el), TARGET.z + RADIUS * Math.cos(az) * ce);
    fill.position.set(-sun.position.x, 3, -sun.position.z * 0.3 + 4);
    // el haz va de la fuente a un poco más allá de la estatua
    const len = sun.position.distanceTo(TARGET) * 1.35;
    beam.position.copy(sun.position);
    beam.lookAt(TARGET);
    beam.scale.set(1, 1, len);
    tmp.copy(sun.position).sub(TARGET).normalize().multiplyScalar(2.5);
    flare.position.copy(sun.position).sub(tmp);
  }

  return {
    sun, fill, candle, hemi, beam, flare,
    TARGET,
    update(time, delta, state, k, pointer, snap) {
      // girar por el camino corto
      let d = state.az - cur.az; d = Math.atan2(Math.sin(d), Math.cos(d));
      const kk = snap ? 1 : Math.min(1, delta * 1.1);
      cur.az += d * kk; cur.el += (state.el - cur.el) * kk;
      place(cur.az + pointer.x * 0.05, cur.el);
      sun.color.copy(state.sun); sun.intensity = 520 * state.sunI;
      fill.color.copy(state.fill); fill.intensity = state.fillI;
      beamU.uColor.value.copy(state.sun); beamU.uOpacity.value = state.beam;
      beamU.uTime.value = time;
      flare.material.color.copy(state.sun);
      candle.position.x += (pointer.x * 3.2 - candle.position.x) * Math.min(1, delta * 3);
      candle.position.y += (1.6 + pointer.y * 1.8 - candle.position.y) * Math.min(1, delta * 3);
      candle.intensity = 4 + Math.sin(time * 7.3) * 0.2 + Math.sin(time * 3.1) * 0.25;
    },
    setQuality(tier) { sun.castShadow = tier !== 'low'; beam.visible = true; },
    sunPosition: () => sun.position,
  };
}
