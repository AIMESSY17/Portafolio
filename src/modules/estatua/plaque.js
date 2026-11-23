import { gsap } from 'gsap';
import { PLAQUE, STATUE } from './config.js';

// Placa de oro grabada en el frente del pedestal (como la placa de museo de las referencias).
// Muestra el proyecto que está de frente (o el que tiene hover). El texto se dibuja en un
// canvas y se usa como color + relieve, así las letras quedan "grabadas" en el metal.
export function createPlaque(ctx, { parent, total }) {
  const { THREE } = ctx;
  const W = 1024, H = Math.round(1024 * (PLAQUE.size.h / PLAQUE.size.w));

  const colorCanvas = document.createElement('canvas');
  const bumpCanvas = document.createElement('canvas');
  colorCanvas.width = bumpCanvas.width = W;
  colorCanvas.height = bumpCanvas.height = H;
  const colorTex = new THREE.CanvasTexture(colorCanvas);
  colorTex.colorSpace = THREE.SRGBColorSpace;
  colorTex.anisotropy = 4;
  const bumpTex = new THREE.CanvasTexture(bumpCanvas);

  const faceMat = new THREE.MeshPhysicalMaterial({
    map: colorTex,
    bumpMap: bumpTex,
    bumpScale: 1.4,
    metalness: 1,
    roughness: 0.28,
    clearcoat: 0.4,
    clearcoatRoughness: 0.2,
    envMapIntensity: 1.6,
    emissive: new THREE.Color(PLAQUE.glow),
    emissiveIntensity: 0,
  });
  const edgeMat = new THREE.MeshPhysicalMaterial({ color: '#C9A227', metalness: 1, roughness: 0.3, envMapIntensity: 1.6 });

  // canto (caja fina) + cara frontal con el grabado
  const { w, h, d } = PLAQUE.size;
  const boxGeo = new THREE.BoxGeometry(w, h, d);
  const box = new THREE.Mesh(boxGeo, [edgeMat, edgeMat, edgeMat, edgeMat, faceMat, edgeMat]);
  box.name = 'estatua_placa';
  box.castShadow = true;

  // grupo en "espacio estatua" (mismo sistema que usa el dorado), girado como el modelo
  const canon = new THREE.Group();
  canon.rotation.y = STATUE.rotationY;
  canon.add(box);
  box.position.set(...PLAQUE.position);
  box.rotation.y = PLAQUE.faceAngle;
  parent.add(canon);

  let current = { title: '', index: -1 };

  function draw({ title, index, year }) {
    const fontReady = document.fonts?.check?.(`600 10px "Inter Tight"`);
    const family = fontReady ? '"Inter Tight", "Helvetica Neue", Arial, sans-serif' : '"Helvetica Neue", Arial, sans-serif';
    const c = colorCanvas.getContext('2d');
    const b = bumpCanvas.getContext('2d');

    // fondo: oro cepillado
    const g = c.createLinearGradient(0, 0, W, H);
    g.addColorStop(0, '#B8901F');
    g.addColorStop(0.45, '#F1D27A');
    g.addColorStop(0.55, '#E2BC55');
    g.addColorStop(1, '#A87F18');
    c.fillStyle = g;
    c.fillRect(0, 0, W, H);
    c.globalAlpha = 0.07;
    for (let x = 0; x < W; x += 3) { c.fillStyle = x % 2 ? '#fff' : '#5B3A1E'; c.fillRect(x, 0, 1, H); }
    c.globalAlpha = 1;
    b.fillStyle = '#fff';
    b.fillRect(0, 0, W, H);

    // marco grabado
    const inset = H * 0.1;
    [c, b].forEach((k, i) => {
      k.strokeStyle = i ? '#000' : 'rgba(91,58,30,0.75)';
      k.lineWidth = H * 0.025;
      k.strokeRect(inset, inset, W - inset * 2, H - inset * 2);
    });

    // texto: nombre grande + línea chica (número de proyecto y año si existe)
    const name = (title || '').toUpperCase();
    let size = H * 0.36;
    c.font = `600 ${size}px ${family}`;
    const maxW = W - inset * 4;
    while (c.measureText(name).width > maxW && size > 20) { size -= 2; c.font = `600 ${size}px ${family}`; }
    const sub = [index >= 0 ? `${String(index + 1).padStart(2, '0')} / ${String(total).padStart(2, '0')}` : '', year || ''].filter(Boolean).join('   ·   ');

    [c, b].forEach((k, i) => {
      k.textAlign = 'center';
      k.textBaseline = 'middle';
      k.fillStyle = i ? '#000' : 'rgba(64,40,18,0.92)';
      k.font = `600 ${size}px ${family}`;
      if ('letterSpacing' in k) k.letterSpacing = `${-size * 0.04}px`;
      k.fillText(name, W / 2, H * 0.47);
      k.font = `600 ${H * 0.11}px ${family}`;
      if ('letterSpacing' in k) k.letterSpacing = `${H * 0.03}px`;
      k.fillText(sub, W / 2, H * 0.76);
    });
    colorTex.needsUpdate = true;
    bumpTex.needsUpdate = true;
  }

  function show(project, index) {
    if (!project || (current.title === project.title && current.index === index)) return;
    const first = current.index < 0;
    current = { title: project.title, index };
    if (first || ctx.reducedMotion) { draw({ title: project.title, index, year: project.year }); return; }
    // cambia el grabado y hace un destello dorado
    draw({ title: project.title, index, year: project.year });
    gsap.killTweensOf(faceMat);
    gsap.fromTo(faceMat, { emissiveIntensity: 0.9 }, { emissiveIntensity: 0, duration: 0.8, ease: 'power2.out' });
  }

  // si la tipografía llega después, redibujamos
  document.fonts?.load?.('600 64px "Inter Tight"').then(() => {
    if (current.index >= 0) draw({ title: current.title, index: current.index });
  }).catch(() => {});

  return {
    mesh: box,
    show,
    setVisible(v) { canon.visible = v; },
    dispose() {
      gsap.killTweensOf(faceMat);
      boxGeo.dispose(); faceMat.dispose(); edgeMat.dispose(); colorTex.dispose(); bumpTex.dispose();
      canon.removeFromParent();
    },
  };
}
