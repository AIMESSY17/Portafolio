// Arma todo: crea el core y monta los módulos. Soporta ?only=fondo | ?only=estatua (CLAUDE.md 11).
import { createCore } from './core/index.js';
import { hasWebGL } from './core/renderer.js';
import { sections } from './config/sections.js';
import { setupUI } from './ui/ui.js';
import createFondo from './modules/fondo/index.js';
import createEstatua from './modules/estatua/index.js';

const only = new URLSearchParams(location.search).get('only');
const stage = document.getElementById('stage');
const overlay = document.getElementById('overlay');

if (!hasWebGL()) {
  startWithoutWebGL();
} else {
  start().catch((err) => {
    console.error('[main] error al iniciar la escena 3D', err);
    startWithoutWebGL();
  });
}

async function start() {
  const core = createCore({ sections, stage, overlay });
  setupUI({ sections, scroll: core.scroll, bus: core.bus });

  if (only === 'fondo') {
    await core.mount('fondo', createFondo);
    await core.mount('placeholder', placeholderStatue);
  } else if (only === 'estatua') {
    await core.mount('placeholder', placeholderLights);
    await core.mount('estatua', createEstatua);
  } else {
    await core.mount('fondo', createFondo);
    await core.mount('estatua', createEstatua);
  }
  core.start();
  if (import.meta.env.DEV) window.core = core;
}

// ?only=fondo → cápsula gris de 3 m en el origen, para ver la escala real
function placeholderStatue({ THREE, root }) {
  const geo = new THREE.CapsuleGeometry(0.55, 1.9, 8, 16);
  const mat = new THREE.MeshStandardMaterial({ color: '#888888', roughness: 0.7 });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.y = 1.5;
  root.add(mesh);
  return { update() {}, resize() {}, setQuality() {}, dispose() { geo.dispose(); mat.dispose(); } };
}

// ?only=estatua → luz ambiente + direccional neutra y fondo #14100B
function placeholderLights({ THREE, scene, root }) {
  scene.background = new THREE.Color('#14100B');
  const amb = new THREE.AmbientLight('#ffffff', 0.5);
  const dir = new THREE.DirectionalLight('#ffffff', 2);
  dir.position.set(3, 6, 5);
  root.add(amb, dir);
  return { update() {}, resize() {}, setQuality() {}, dispose() { scene.background = null; } };
}

// Sin WebGL: la capa de texto + lista de proyectos que abre el mismo visor.
async function startWithoutWebGL() {
  document.documentElement.classList.add('no-webgl');
  setupUI({ sections, scroll: null });
  const [{ default: projects }, { createViewer }] = await Promise.all([
    import('./data/projects.json'),
    import('./modules/estatua/viewer.js'),
  ]);
  const viewer = createViewer({ container: overlay, reducedMotion: true });
  const list = document.querySelector('[data-fallback-projects]');
  list.hidden = false;
  projects.forEach((p) => {
    const li = document.createElement('li');
    const b = document.createElement('button');
    b.type = 'button';
    b.innerHTML = `<strong></strong><span></span>`;
    b.querySelector('strong').textContent = p.title;
    b.querySelector('span').textContent = p.description;
    b.addEventListener('click', () => viewer.show(p, { fromRect: b.getBoundingClientRect(), getReturnRect: () => b.getBoundingClientRect() }));
    li.appendChild(b);
    list.appendChild(li);
  });
}
