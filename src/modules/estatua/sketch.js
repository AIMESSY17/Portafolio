import { STATUE, SKETCH } from './config.js';

// Boceto dorado: un dibujo técnico de la estatua (cuadrícula, círculo, regla lateral) que se
// "dibuja" solo, línea por línea, a medida que el scroll avanza. Son solo líneas: sin texturas.
// state.reveal (0..1) = cuánto del dibujo está trazado.
export function createSketch(ctx, { parent }) {
  const { THREE } = ctx;
  const v3 = (x, y, z) => new THREE.Vector3(x, y, z);
  const positions = [], times = [], kinds = [];

  // generador pseudoaleatorio fijo: el "temblor del lápiz" es siempre el mismo
  let seed = 7;
  const rand = () => (seed = (seed * 16807) % 2147483647) / 2147483647;

  // Agrega una polilínea como segmentos. t0..t1 = momento (del reveal) en que se dibuja.
  // kind: 0 = trazo fuerte, 0.5 = medio, 1 = suave, 2 = muy suave. `sketchy` la repite con temblor.
  function addLine(pts, t0, t1, kind = 0, { sketchy = true } = {}) {
    const passes = sketchy ? 2 : 1;
    for (let pass = 0; pass < passes; pass++) {
      const j = pass ? SKETCH.jitter : 0;
      const shift = pass ? v3((rand() - 0.5) * j, (rand() - 0.5) * j, (rand() - 0.5) * j) : v3(0, 0, 0);
      const pp = pts.map((p) => p.clone().add(shift).add(pass ? v3((rand() - 0.5) * j * 0.5, (rand() - 0.5) * j * 0.5, (rand() - 0.5) * j * 0.5) : v3(0, 0, 0)));
      const dt = pass ? 0.012 : 0;
      for (let i = 0; i < pp.length - 1; i++) {
        const a = pp[i], b = pp[i + 1];
        positions.push(a.x, a.y, a.z, b.x, b.y, b.z);
        times.push(t0 + (t1 - t0) * (i / (pp.length - 1)) + dt, t0 + (t1 - t0) * ((i + 1) / (pp.length - 1)) + dt);
        kinds.push(kind + pass * 0.5, kind + pass * 0.5);
      }
    }
  }
  const ellipse = (c, u, v, ru, rv, a0 = 0, sweep = Math.PI * 2, steps = 48) => {
    const out = [];
    for (let i = 0; i <= steps; i++) {
      const a = a0 + (sweep * i) / steps;
      out.push(c.clone().addScaledVector(u, Math.cos(a) * ru).addScaledVector(v, Math.sin(a) * rv));
    }
    return out;
  };
  const curve = (pts, steps = 32) => new THREE.CatmullRomCurve3(pts).getPoints(steps);
  const X = v3(1, 0, 0), Y = v3(0, 1, 0);

  const { axis, feetY, headTopY, shoulderY } = SKETCH.body;
  const [ax, az] = axis;
  const step = 0.06;

  // líneas de nivel horizontales que suben por el eje de la estatua (la "columna")
  for (let y = feetY - 0.1, i = 0; y < headTopY + 0.3; y += step * 2, i++) {
    const t = (i / 26) * 0.12;
    addLine([v3(ax, y, az), v3(ax, Math.min(y + step, headTopY + 0.3), az)], t, t + 0.01, 1, { sketchy: false });
  }
  // círculo mayor que encierra la figura
  const center = v3(ax, (feetY + headTopY) / 2 + 0.06, az);
  const R = (headTopY - feetY) * 0.56;
  addLine(ellipse(center, X, Y, R, R, Math.PI / 2, Math.PI * 2, 96), 0.06, 0.3, 1);
  // marco cuadrado
  const half = (headTopY - feetY) / 2;
  const corners = [v3(ax - half, feetY, az), v3(ax + half, feetY, az), v3(ax + half, headTopY, az), v3(ax - half, headTopY, az), v3(ax - half, feetY, az)];
  for (let i = 0; i < 4; i++) addLine(curve([corners[i], corners[i + 1]], 12), 0.04 + i * 0.04, 0.09 + i * 0.04, 1);
  // regla vertical con 8 marcas y un número por tramo
  const unit = (headTopY - feetY) / 8;
  const ruleX = ax - half - 0.08;
  addLine([v3(ruleX, feetY, az), v3(ruleX, headTopY, az)], 0.1, 0.22, 1, { sketchy: false });
  const marks = [];
  for (let i = 0; i <= 8; i++) {
    const y = feetY + unit * i;
    marks.push(y);
    const t = 0.12 + i * 0.012;
    addLine([v3(ruleX - 0.05, y, az), v3(ruleX + 0.05, y, az)], t, t + 0.01, 1, { sketchy: false });
  }
  // línea de hombros
  addLine([v3(ax - half * 0.7, shoulderY, az), v3(ax + half * 0.7, shoulderY, az)], 0.24, 0.3, 1);

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('aT', new THREE.Float32BufferAttribute(times, 1));
  geo.setAttribute('aKind', new THREE.Float32BufferAttribute(kinds, 1));

  const uniforms = {
    uReveal: { value: 0 },
    uTime: { value: 0 },
    uColor: { value: new THREE.Color(SKETCH.color) },
    uTip: { value: new THREE.Color(SKETCH.tip) },
    uOpacity: { value: 1 },
  };
  const material = new THREE.ShaderMaterial({
    uniforms,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    vertexShader: /* glsl */ `
      attribute float aT;
      attribute float aKind;
      varying float vT;
      varying float vKind;
      void main() { vT = aT; vKind = aKind; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: /* glsl */ `
      uniform float uReveal, uTime, uOpacity;
      uniform vec3 uColor, uTip;
      varying float vT;
      varying float vKind;
      void main() {
        if (vT > uReveal) discard;
        float tip = 1.0 - smoothstep(0.0, 0.03, uReveal - vT);  // punta del lápiz
        float base = vKind < 0.75 ? (vKind < 0.25 ? 0.62 : 0.26) : (vKind < 1.25 ? 0.3 : 0.12);
        float shimmer = 0.85 + 0.15 * sin(vT * 90.0 - uTime * 2.2); // brillo que recorre las líneas
        vec3 col = mix(uColor, uTip, tip);
        gl_FragColor = vec4(col * (base * shimmer + tip * 0.9), 1.0) * uOpacity;
      }`,
  });
  const lines = new THREE.LineSegments(geo, material);
  lines.name = 'estatua_boceto';
  lines.frustumCulled = false;
  lines.renderOrder = 5;

  // números de la regla (01..08)
  const labels = [];
  ['01', '02', '03', '04', '05', '06', '07', '08'].forEach((txt, i) => {
    const c = document.createElement('canvas');
    c.width = 128; c.height = 64;
    const g = c.getContext('2d');
    g.fillStyle = SKETCH.color;
    g.font = '500 34px "JetBrains Mono", ui-monospace, monospace';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(txt, 64, 34);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, opacity: 0, blending: THREE.AdditiveBlending });
    const sprite = new THREE.Sprite(mat);
    sprite.scale.set(0.16, 0.08, 1);
    sprite.position.set(ruleX - 0.15, (marks[i] + marks[i + 1]) / 2, az);
    sprite.userData.t = 0.13 + i * 0.012;
    labels.push(sprite);
  });

  // el dibujo está en espacio estatua: se gira igual que el modelo de presentación
  const group = new THREE.Group();
  group.name = 'estatua_boceto_grupo';
  group.rotation.y = STATUE.rotationY;
  group.add(lines, ...labels);
  group.visible = false;
  parent.add(group);

  const state = { reveal: 0, target: 0, override: null, enabled: true };
  return {
    state,
    setTarget(v) { state.target = v; },
    setOverride(v) { state.override = v; },
    update(time, delta) {
      const goal = state.override ?? state.target;
      const speed = delta * SKETCH.drawSpeed;
      state.reveal += Math.max(-speed * 2, Math.min(speed, goal - state.reveal)); // borra al doble de velocidad
      uniforms.uReveal.value = state.reveal;
      uniforms.uTime.value = time;
      group.visible = state.enabled && state.reveal > 0.001;
      labels.forEach((l) => { l.material.opacity = Math.min(1, Math.max(0, (state.reveal - l.userData.t) / 0.04)) * 0.7 * uniforms.uOpacity.value; });
      if (uniforms.uOpacity.value < 0.003) group.visible = false;
    },
    setVisible(v) { state.enabled = v; },
    /** Brillo del dibujo (1 = normal). Lo bajan las salas. */
    setBright(v) { uniforms.uOpacity.value = v; },
    dispose() {
      geo.dispose();
      material.dispose();
      labels.forEach((l) => { l.material.map.dispose(); l.material.dispose(); });
      group.removeFromParent();
    },
  };
}
