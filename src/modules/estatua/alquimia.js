// Alquimia: lo que rodea a la estatua mientras se transmuta en oro.
//   · ANILLOS: 4 bandas finas de oro, como un astrolabio o una esfera armilar, con marcas grabadas y letras griegas.
//     Cada una gira a su velocidad y con su inclinación (y su eje también gira despacio). En una está grabado
//     "ΝΙΚΗ" y brilla cuando el mouse pasa cerca.
//   · POLVO de oro muy fino, lento, entre los anillos; y el que cae desde la corona de ventanas hacia la estatua.
//     Todo en UN solo dibujo de puntos (la animación está en el shader: no se toca nada por cuadro).
//   · HILO: una línea de luz dorada fina que une las ventanas formando el aro de la corona.
// Todo se crea y se sube a la placa al cargar (los shaders se compilan en el precalentado). En low: menos polvo,
// anillos sin relieve y sin el hilo animado.
import { ANILLOS, CORONA } from './config.js';

// Cinzel solo trae Δ y Ω del griego: el resto se escribe con las letras latinas idénticas (Ν = N, Ι = I, Κ = K…).
// Las palabras grabadas usan solo esas: ΝΙΚΗ (victoria), ΤΕΧΝΗ (oficio), ΑΚΜΗ (cumbre).
const LATIN = { Α: 'A', Β: 'B', Ε: 'E', Ζ: 'Z', Η: 'H', Ι: 'I', Κ: 'K', Μ: 'M', Ν: 'N', Ο: 'O', Ρ: 'P', Τ: 'T', Υ: 'Y', Χ: 'X' };
const cinzel = (s) => [...s].map((c) => LATIN[c] || c).join('');
const LETRAS = 'ΑΒΔΕΖΗΙΚΜΝΟΡΤΥΧΩ';
const FONT = 'Cinzel, "Times New Roman", Georgia, serif';

// ---------- textura de UN segmento de banda (canvas); se repite N veces alrededor (repeat.x) ----------
// así las letras quedan en su proporción real sobre la banda (antes una sola textura larga las estiraba).
function drawBand(kind, W, H) {
  const mk = () => { const c = document.createElement('canvas'); c.width = W; c.height = H; return c; };
  const albedo = mk(), bump = mk(), glow = mk();
  const a = albedo.getContext('2d'), b = bump.getContext('2d'), g = glow.getContext('2d');
  // base: oro con un degradé fino (un pulido real no es plano)
  const grad = a.createLinearGradient(0, 0, 0, H);
  grad.addColorStop(0, '#d2a43e'); grad.addColorStop(0.5, '#f3d488'); grad.addColorStop(1, '#c39331');
  a.fillStyle = grad; a.fillRect(0, 0, W, H);
  b.fillStyle = '#9a9a9a'; b.fillRect(0, 0, W, H);   // 0.6 = nivel; lo grabado baja
  g.fillStyle = '#000'; g.fillRect(0, 0, W, H);
  const engrave = (draw, glows = false) => {
    a.save(); a.fillStyle = a.strokeStyle = 'rgba(255,240,196,0.6)'; a.translate(1, 1); draw(a); a.restore();
    a.save(); a.fillStyle = a.strokeStyle = 'rgba(64,40,4,0.85)'; draw(a); a.restore();
    b.save(); b.fillStyle = b.strokeStyle = '#2a2a2a'; draw(b); b.restore();
    if (glows) { g.save(); g.fillStyle = g.strokeStyle = '#ffffff'; draw(g); g.restore(); }
  };
  // filetes finos arriba y abajo
  engrave((ctx) => { ctx.lineWidth = 1.6; ctx.beginPath(); ctx.moveTo(0, H * 0.12); ctx.lineTo(W, H * 0.12); ctx.moveTo(0, H * 0.88); ctx.lineTo(W, H * 0.88); ctx.stroke(); });
  const ticks = (n, h0, h1, wd) => (ctx) => { ctx.lineWidth = wd; ctx.beginPath(); for (let i = 0; i < n; i++) { const x = ((i + 0.5) / n) * W; ctx.moveTo(x, H * h0); ctx.lineTo(x, H * h1); } ctx.stroke(); };
  const text = (strs, size, y, glows = false, weight = 600) => engrave((ctx) => {
    ctx.font = `${weight} ${size}px ${FONT}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    strs.forEach((t, i) => ctx.fillText(cinzel(t), ((i + 0.5) / strs.length) * W, y));
  }, glows);
  const rombo = (cx) => (ctx) => { ctx.beginPath(); ctx.moveTo(cx, H * 0.4); ctx.lineTo(cx + H * 0.08, H * 0.5); ctx.lineTo(cx, H * 0.6); ctx.lineTo(cx - H * 0.08, H * 0.5); ctx.closePath(); ctx.fill(); };
  if (kind === 'alfabeto') {
    engrave(ticks(6, 0.14, 0.24, 1.4)); engrave(ticks(6, 0.76, 0.86, 1.4));
    text([0, 1, 2, 3, 4, 5].map((i) => LETRAS[(i * 5 + 3) % LETRAS.length]), H * 0.42, H * 0.53);
  } else if (kind === 'escala') {
    engrave(ticks(36, 0.14, 0.32, 1.1)); engrave(ticks(6, 0.14, 0.5, 2)); engrave(ticks(36, 0.68, 0.86, 1.1));
    text(['ΤΕΧΝΗ', 'ΑΚΜΗ'], H * 0.26, H * 0.66, false, 500);
  } else if (kind === 'simbolos') {
    engrave(ticks(12, 0.14, 0.22, 1.2));
    engrave((ctx) => {
      ctx.lineWidth = 1.8;
      const n = 3, cy = H * 0.53, r = H * 0.2;
      for (let i = 0; i < n; i++) {
        const cx = ((i + 0.5) / n) * W; ctx.beginPath();
        if (i === 0) { ctx.arc(cx, cy, r, 0, 7); ctx.moveTo(cx + 2.5, cy); ctx.arc(cx, cy, 2.5, 0, 7); }                       // el sol (oro)
        else if (i === 1) { ctx.moveTo(cx, cy - r); ctx.lineTo(cx + r, cy + r * 0.8); ctx.lineTo(cx - r, cy + r * 0.8); ctx.closePath(); } // el fuego
        else { ctx.moveTo(cx, cy + r); ctx.lineTo(cx + r, cy - r * 0.8); ctx.lineTo(cx - r, cy - r * 0.8); ctx.closePath(); ctx.moveTo(cx - r * 0.6, cy); ctx.lineTo(cx + r * 0.6, cy); } // la tierra
        ctx.stroke();
      }
    });
  } else if (kind === 'nike') {
    engrave(ticks(18, 0.14, 0.22, 1.2)); engrave(ticks(18, 0.78, 0.86, 1.2));
    text(['ΝΙΚΗ'], H * 0.5, H * 0.54, true, 600);
    engrave(rombo(0)); engrave(rombo(W));
  }
  return { albedo, bump, glow };
}

export function createAlquimia(ctx, { statue }) {
  const { THREE, root, camera, renderer, shared } = ctx;
  const mobile = ctx.isMobile;
  const k = mobile ? ANILLOS.mobile : 1;
  let tier = ctx.quality;
  const reduced = ctx.reducedMotion;
  const owned = [];
  const keep = (x) => (owned.push(x), x);

  const group = new THREE.Group();
  group.name = 'estatua_alquimia';
  root.add(group);
  const maxAniso = renderer.capabilities.getMaxAnisotropy();

  // ---------- anillos ----------
  const rings = ANILLOS.rings.map((cfg, i) => {
    const R = cfg.r * k;
    const H = ANILLOS.band * k;
    const W = 1024, TH = 64;
    // cuántas veces se repite el segmento para que las letras queden en su proporción (largo = alto × W/TH)
    const reps = Math.max(3, Math.round((2 * Math.PI * R) / (H * (W / TH))));
    const t = drawBand(cfg.tex, W, TH);
    const map = keep(new THREE.CanvasTexture(t.albedo)); map.colorSpace = THREE.SRGBColorSpace;
    const bump = keep(new THREE.CanvasTexture(t.bump));
    const glow = cfg.tex === 'nike' ? keep(new THREE.CanvasTexture(t.glow)) : null;
    [map, bump, glow].forEach((x) => { if (x) { x.wrapS = THREE.RepeatWrapping; x.repeat.x = reps; x.anisotropy = Math.min(8, maxAniso); } });
    // Cinzel puede llegar después: se redibuja el segmento (canvas chico, antes del precalentado)
    document.fonts?.load?.(`600 ${TH}px Cinzel`).then(() => {
      const t2 = drawBand(cfg.tex, W, TH);
      map.image = t2.albedo; bump.image = t2.bump; if (glow) glow.image = t2.glow;
      [map, bump, glow].forEach((x) => { if (x) x.needsUpdate = true; });
    }).catch(() => {});
    const mat = keep(new THREE.MeshStandardMaterial({
      map, bumpMap: bump, bumpScale: 0.8, color: '#ffffff', metalness: 1, roughness: 0.18, envMapIntensity: 1.4,
      emissive: new THREE.Color('#ffd98a'), emissiveMap: glow, emissiveIntensity: glow ? 0.0 : 0,
      side: THREE.DoubleSide, transparent: true, opacity: 0,
    }));
    const geo = keep(new THREE.CylinderGeometry(R, R, H, tier === 'low' ? 96 : 192, 1, true));
    const band = new THREE.Mesh(geo, mat);
    band.name = `anillo_${cfg.tex}`;
    const tilt = new THREE.Group();   // inclinación
    tilt.rotation.x = cfg.tilt; tilt.rotation.z = 0.25 * (i % 2 ? -1 : 1);
    tilt.add(band);
    const prec = new THREE.Group();   // precesión del eje
    prec.rotation.y = i * 1.7;
    prec.add(tilt);
    prec.position.y = ANILLOS.center;
    group.add(prec);
    return { cfg, R, band, tilt, prec, mat, glowOn: 0 };
  });
  const nike = rings.find((r) => r.cfg.tex === 'nike');

  // ---------- polvo de oro (y el que cae de la corona) ----------
  const counts = ANILLOS.dust;
  const nTotal = counts.high;   // se reserva el máximo; la calidad recorta lo que se dibuja (setDrawRange)
  const pos = new Float32Array(nTotal * 3), prm = new Float32Array(nTotal * 4); // pos = (radio, altura, fase) · prm = (tipo, vel, tamaño, azar)
  let seed = 7;
  const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  for (let i = 0; i < nTotal; i++) {
    const falling = rnd() < ANILLOS.dust.falling;
    pos[i * 3] = falling ? (CORONA.desktop.r * k * (0.7 + rnd() * 0.5)) : (0.8 + rnd() * 1.4) * k;
    pos[i * 3 + 1] = falling ? 0 : 0.2 + rnd() * 3.4;
    pos[i * 3 + 2] = rnd() * 6.2832;
    prm[i * 4] = falling ? 1 : 0;
    prm[i * 4 + 1] = 0.5 + rnd();
    prm[i * 4 + 2] = 0.55 + rnd() * 0.9;
    prm[i * 4 + 3] = rnd();
  }
  const dustGeo = keep(new THREE.BufferGeometry());
  dustGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  dustGeo.setAttribute('aPrm', new THREE.BufferAttribute(prm, 4));
  const U = {
    uTime: { value: 0 }, uPx: { value: 1 }, uAmount: { value: 0 }, uCrownY: { value: CORONA.desktop.y }, uColor: { value: new THREE.Color('#ffd27a') },
  };
  const dustMat = keep(new THREE.ShaderMaterial({
    uniforms: U, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false,
    vertexShader: /* glsl */`
      attribute vec4 aPrm;
      uniform float uTime, uPx, uAmount, uCrownY;
      varying float vA;
      void main(){
        float kind = aPrm.x, sp = aPrm.y, sz = aPrm.z, rn = aPrm.w;
        float t = uTime * sp;
        vec3 p; float alpha;
        if (kind < 0.5) {
          // polvo suspendido: gira muy despacio entre los anillos y sube y baja
          float ang = position.z + t * (0.05 + rn * 0.05) * (rn > 0.5 ? 1.0 : -1.0);
          p = vec3(cos(ang) * position.x, position.y + sin(t * 0.35 + rn * 20.0) * 0.12, sin(ang) * position.x);
          alpha = 0.34 + 0.2 * sin(t * 0.9 + rn * 30.0);
        } else {
          // el que cae de la corona: baja despacio hacia la estatua y se va apagando
          float u = fract(position.z * 0.159 + t * 0.045);
          float r = mix(position.x, 0.3, pow(u, 1.4));
          float ang = position.z + u * 1.6 + t * 0.05;
          p = vec3(cos(ang) * r, mix(uCrownY, 0.7, u), sin(ang) * r);
          alpha = sin(3.14159 * u) * 0.55;
        }
        vA = alpha * uAmount;
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        gl_Position = projectionMatrix * mv;
        gl_PointSize = vA > 0.01 ? max(1.6, sz * 4.6 * uPx / max(0.6, -mv.z * 0.28)) : 0.0;
      }`,
    fragmentShader: /* glsl */`
      uniform vec3 uColor; varying float vA;
      void main(){
        vec2 c = gl_PointCoord - 0.5;
        float a = exp(-dot(c, c) * 18.0) * vA;
        if (a < 0.006) discard;
        gl_FragColor = vec4(uColor * a, a);
        #include <colorspace_fragment>
      }`,
  }));
  dustGeo.setDrawRange(0, counts[tier] ?? counts.high);
  const dust = new THREE.Points(dustGeo, dustMat);
  dust.name = 'estatua_polvo_oro';
  dust.frustumCulled = false;
  dust.renderOrder = 40;
  group.add(dust);

  // ---------- hilo de luz de la corona ----------
  let thread = null;
  const threadU = { uColor: { value: new THREE.Color(CORONA.thread.color) }, uOpacity: { value: 0 }, uDist: { value: 8 }, uR: { value: 1 } };
  {
    const c = mobile ? CORONA.mobile : CORONA.desktop;
    const geo = keep(new THREE.TorusGeometry(c.r, 0.0055, 5, tier === 'low' ? 72 : 180));
    const mat = keep(new THREE.ShaderMaterial({
      uniforms: threadU, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false,
      vertexShader: /* glsl */`
        uniform float uDist, uR; varying float vF;
        void main(){
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          vF = clamp(0.5 + (uDist - length(mv.xyz)) / (2.0 * uR), 0.0, 1.0);   // las de adelante, más brillantes
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: /* glsl */`
        uniform vec3 uColor; uniform float uOpacity; varying float vF;
        void main(){
          float a = uOpacity * (0.18 + 0.82 * vF * vF);
          gl_FragColor = vec4(uColor * a, a);
          #include <colorspace_fragment>
        }`,
    }));
    thread = new THREE.Mesh(geo, mat);
    thread.name = 'estatua_corona_hilo';
    thread.rotation.set(Math.PI / 2 + CORONA.tilt, 0, 0);   // el aro tumbado, con la inclinación de la corona
    thread.frustumCulled = false;
    thread.renderOrder = 39;
    thread.position.y = c.y;
    group.add(thread);
    threadU.uR.value = c.r;
  }

  // ---------- el mouse cerca del anillo de ΝΙΚΗ ----------
  const p = new THREE.Vector3(), pts = [];
  const NP = 40;
  for (let i = 0; i < NP; i++) pts.push(new THREE.Vector3());
  let px = 0, py = 0, hasPointer = false;
  const onMove = (e) => { if (e.pointerType === 'touch') return; px = e.clientX; py = e.clientY; hasPointer = true; };
  addEventListener('pointermove', onMove, { passive: true });
  const ringPt = new THREE.Vector3();
  function nikeDistance() {
    if (!nike || !hasPointer) return 1e9;
    nike.band.updateWorldMatrix(true, false);
    const m = nike.band.matrixWorld;
    let best = 1e9;
    for (let i = 0; i < NP; i++) {
      const a = (i / NP) * Math.PI * 2;
      ringPt.set(Math.cos(a) * nike.R, 0, Math.sin(a) * nike.R).applyMatrix4(m).project(camera);
      if (ringPt.z > 1) continue;
      const dx = (ringPt.x * 0.5 + 0.5) * innerWidth - px, dy = (0.5 - ringPt.y * 0.5) * innerHeight - py;
      const d = Math.hypot(dx, dy);
      if (d < best) best = d;
    }
    return best;
  }

  const camL = new THREE.Vector3();
  let nikeK = 0;
  return {
    group,
    /**
     * baseY = y de la base de la estatua · alq = 0..1 transmutación · vis = 0..1 visibilidad general
     * room = 0..1 (en una sala se atenúa) · motion = 0 con movimiento reducido
     */
    update(time, dt, { baseY, alq, vis, room, motion }) {
      group.position.y = baseY;
      group.visible = vis > 0.003;
      if (!group.visible) return;
      const a = (ANILLOS.alpha.hero + (ANILLOS.alpha.alq - ANILLOS.alpha.hero) * alq) * vis * (1 - 0.62 * room); // en la sala manda la obra
      for (const r of rings) {
        r.band.rotation.y += dt * r.cfg.spin * motion;
        r.prec.rotation.y += dt * r.cfg.prec * motion;
        r.mat.opacity = a;
      }
      // ΝΙΚΗ brilla cuando el mouse pasa cerca del anillo
      if (nike) {
        const d = nikeDistance();
        const want = Math.max(0, Math.min(1, 1 - (d - 12) / ANILLOS.nikeGlowDist));
        nikeK += (want - nikeK) * (1 - Math.exp(-dt * (want > nikeK ? 9 : 2.2)));
        nike.mat.emissiveIntensity = 0.03 + nikeK * 2.1;
      }
      U.uTime.value = time;
      U.uAmount.value = (0.35 + 0.65 * alq) * vis * (1 - 0.5 * room);
      // hilo: distancia de la cámara al centro de la corona
      threadU.uOpacity.value = CORONA.thread.opacity * vis * (0.5 + 0.5 * alq) * (1 - 0.4 * room);
      thread.updateWorldMatrix(true, false);
      camL.setFromMatrixPosition(thread.matrixWorld);
      threadU.uDist.value = camera.position.distanceTo(camL);
    },
    resize() { U.uPx.value = Math.min(2, renderer.getPixelRatio()); },
    setQuality(next) { tier = next; dustGeo.setDrawRange(0, counts[next] ?? counts.high); },
    dispose() {
      removeEventListener('pointermove', onMove);
      owned.forEach((o) => o.dispose?.());
      group.removeFromParent();
    },
  };
}
