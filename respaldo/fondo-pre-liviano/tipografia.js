// Tipografía monumental: una palabra gigante por sección, tallada en mármol negro con filo de oro,
// detrás de la estatua. Entra letra por letra (suben y se enderezan) y la anterior se va hacia arriba.
// Más un halo: un anillo de texto con los nombres de los proyectos girando detrás de la cabeza de la Victoria.
import { FontLoader } from 'three/examples/jsm/loaders/FontLoader.js';
import { TextGeometry } from 'three/examples/jsm/geometries/TextGeometry.js';
import projects from '../../data/projects.json';

const WORD_Z = -8.6;   // detrás de la estatua, fuera del cilindro de radio 6

export async function createTipografia(ctx, { track, words }) {
  const { THREE, root, camera, assetsPath: A } = ctx;
  const font = new FontLoader().parse(await (await fetch(A + 'claroscuro/instrument-serif.json')).json());
  const tl = new THREE.TextureLoader();
  const nrm = track(tl.load(A + 'textures/marmol/marmol_normal_1k.webp'));
  const rgh = track(tl.load(A + 'textures/marmol/marmol_rough_1k.webp'));
  [nrm, rgh].forEach((t) => { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(0.6, 0.6); });

  const group = new THREE.Group();
  group.name = 'fondo_palabras';
  root.add(group);

  const res = font.data.resolution;
  const built = words.map((word) => {
    const front = track(new THREE.MeshPhysicalMaterial({
      color: '#0C0A09', roughness: 0.3, roughnessMap: rgh, normalMap: nrm, normalScale: new THREE.Vector2(0.35, 0.35),
      metalness: 0, clearcoat: 1, clearcoatRoughness: 0.08, envMapIntensity: 1.3, transparent: true, opacity: 1,
    }));
    const side = track(new THREE.MeshPhysicalMaterial({ color: '#C9A227', metalness: 1, roughness: 0.22, clearcoat: 0.5, transparent: true, opacity: 1 }));
    const g = new THREE.Group();
    const letters = [];
    let x = 0;
    const tracking = 0.06;
    for (const ch of word) {
      const glyph = font.data.glyphs[ch];
      const adv = (glyph ? glyph.ha : res * 0.3) / res;
      if (glyph) {
        const geo = track(new TextGeometry(ch, { font, size: 1, depth: 0.2, curveSegments: 10, bevelEnabled: true, bevelThickness: 0.035, bevelSize: 0.02, bevelSegments: 3 }));
        geo.computeBoundingBox();
        const cx = (geo.boundingBox.max.x + geo.boundingBox.min.x) / 2;
        geo.translate(-cx, 0, -0.1);           // pivote en el centro de la letra, apoyada en la línea base
        const m = new THREE.Mesh(geo, [front, side]);
        m.castShadow = true; m.receiveShadow = true;
        m.userData.x = x + cx;
        g.add(m);
        letters.push(m);
      }
      x += adv + tracking;
    }
    const width = x - tracking;
    letters.forEach((m, i) => { m.userData.x -= width / 2; m.userData.i = i; m.position.x = m.userData.x; m.visible = false; });
    group.add(g);
    return { word, g, letters, width, front, side, v: 0, target: 0, t0: 0 };
  });

  // ---- halo de texto con los nombres de los proyectos ----
  const names = projects.map((p) => p.title.toUpperCase()).join('   ·   ') + '   ·   ';
  // el lienzo mide exactamente una vuelta del texto, así la textura se repite sin costuras
  const RING_R = 7.2, RING_H = 0.26;
  const cv = document.createElement('canvas'); cv.height = 96; cv.width = 2048;
  const draw = () => {
    let g = cv.getContext('2d');
    const font = '600 48px "Inter Tight", "Helvetica Neue", Arial, sans-serif';
    g.font = font; if ('letterSpacing' in g) g.letterSpacing = '8px';
    const w = Math.ceil(g.measureText(names).width);
    if (cv.width !== w) { cv.width = Math.min(8192, w); g = cv.getContext('2d'); }
    g.clearRect(0, 0, cv.width, cv.height);
    g.font = font; if ('letterSpacing' in g) g.letterSpacing = '8px';
    g.fillStyle = '#ffffff'; g.textBaseline = 'middle';
    g.fillText(names, 0, 50);
    ringTex.needsUpdate = true;
    // cuántas copias entran en la circunferencia sin deformar las letras (número entero = sin costura)
    if (ringU) ringU.uRepeat.value = Math.max(1, Math.round((2 * Math.PI * RING_R) / (RING_H * cv.width / cv.height)));
  };
  let ringU = null;
  const ringTex = track(new THREE.CanvasTexture(cv));
  ringTex.wrapS = THREE.RepeatWrapping; ringTex.colorSpace = THREE.SRGBColorSpace; ringTex.anisotropy = 8;
  draw();
  document.fonts?.load('600 64px "Inter Tight"').then(draw).catch(() => {});
  ringU = { uMap: { value: ringTex }, uColor: { value: new THREE.Color('#F1D27A') }, uOpacity: { value: 0.5 }, uRepeat: { value: 4 }, uOffset: { value: 0 } };
  draw();
  const ringMat = track(new THREE.ShaderMaterial({
    uniforms: ringU, transparent: true, depthWrite: false, side: THREE.DoubleSide, toneMapped: false,
    vertexShader: 'varying vec2 vUv; varying vec3 vW; void main(){ vUv = uv; vec4 w = modelMatrix * vec4(position,1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }',
    fragmentShader: /* glsl */`
      uniform sampler2D uMap; uniform vec3 uColor; uniform float uOpacity, uRepeat, uOffset; varying vec2 vUv; varying vec3 vW;
      void main(){
        float a = texture2D(uMap, vec2((1.0 - vUv.x) * uRepeat + uOffset, vUv.y)).a;
        a *= 1.0 - smoothstep(-3.0, 0.5, vW.z);          // solo el arco de atrás (el de adelante taparía todo)
        a *= uOpacity;
        if (a < 0.01) discard;
        gl_FragColor = vec4(uColor, a);
        #include <colorspace_fragment>
      }`,
  }));
  const ring = new THREE.Mesh(track(new THREE.CylinderGeometry(RING_R, RING_R, RING_H, 200, 1, true)), ringMat);
  ring.position.set(0, 3.15, 0);
  ring.rotation.set(0.12, 0, -0.05);
  root.add(ring);

  const easeOut = (x) => 1 - Math.pow(1 - x, 4);
  let active = -1, dim = 0;
  const v3 = new THREE.Vector3();

  return {
    show(index, snap) {
      if (index === active) return;
      active = index;
      built.forEach((b, i) => { b.target = i === index ? 1 : 0; if (b.target) b.t0 = 0; if (snap) b.v = b.target; });
    },
    update(time, delta, { section, hover, pointer, snap, reduced }) {
      // tamaño y lugar según pantalla
      const dist = camera.position.z - WORD_Z;
      const visH = 2 * dist * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
      const visW = visH * camera.aspect;
      const narrow = camera.aspect < 0.9;
      const target = Math.min(narrow ? visW * 0.88 : 15.5, visW * 0.84);
      group.position.set(0, narrow ? 5.2 : 1.15, WORD_Z);
      group.rotation.y = reduced ? 0 : pointer.x * 0.05;
      group.rotation.x = reduced ? 0 : -pointer.y * 0.025;

      dim += ((hover ? 1 : 0) - dim) * (snap ? 1 : Math.min(1, delta * 4));
      for (const b of built) {
        const s = target / b.width;
        b.g.scale.setScalar(Math.min(s, 2.8));
        if (b.target === 1) b.t0 = snap ? 99 : b.t0 + delta;
        b.v += (b.target - b.v) * (snap ? 1 : Math.min(1, delta * (b.target ? 6 : 3.5)));
        const fade = b.target ? 1 : b.v;
        b.front.opacity = b.side.opacity = fade * (1 - dim * 0.82);
        for (const m of b.letters) {
          const i = m.userData.i;
          // entrada: cada letra con su retraso
          const p = b.target ? easeOut(Math.max(0, Math.min(1, (b.t0 - i * 0.07) / 1.1))) : 1;
          const out = 1 - b.v;                          // salida: suben y se inclinan hacia atrás
          m.visible = b.v > 0.01 && p > 0.001;
          m.position.y = (1 - p) * -1.4 + (b.target ? 0 : out * 1.2);
          m.position.z = (1 - p) * -0.6;
          m.rotation.x = (1 - p) * -1.1 + (b.target ? 0 : out * 0.6);
          m.rotation.y = reduced ? 0 : Math.sin(time * 0.35 + i * 0.7) * 0.025;
        }
      }
      // halo
      ringU.uOffset.value = reduced ? 0 : -time * 0.012;
      const want = section === 1 ? 0.7 : 0.26;
      ringU.uOpacity.value += (want * (1 - dim * 0.6) - ringU.uOpacity.value) * (snap ? 1 : Math.min(1, delta * 2));
      v3.set(0, 0, 0);
    },
    setRingColor(c) { ringU.uColor.value.copy(c); },
  };
}
