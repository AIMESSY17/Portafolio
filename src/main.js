// Arma todo: crea el core y monta los módulos. Soporta ?only=fondo | ?only=estatua (CLAUDE.md 11).
// Orden: montar → esperar el modelo detallado y las capturas (con tope) → precalentar TODO (shaders,
// texturas, geometrías) → arrancar el loop → sacar el velo. Así nada se estrena en medio del scroll.
import { createCore } from './core/index.js';
import { hasWebGL } from './core/renderer.js';
import { sections } from './config/sections.js';
import { setupUI } from './ui/ui.js';
import createFondo from './modules/fondo/index.js';
import createEstatua from './modules/estatua/index.js';

const params = new URLSearchParams(location.search);
const only = params.get('only');
const stage = document.getElementById('stage');
const overlay = document.getElementById('overlay');
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

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
  const ui = setupUI({ sections, scroll: core.scroll, bus: core.bus, shared: core.shared });

  if (only === 'fondo') {
    await core.mount('fondo', createFondo);
    await core.mount('placeholder', placeholderStatue);
  } else if (only === 'estatua') {
    await core.mount('placeholder', placeholderLights);
    await core.mount('estatua', createEstatua);
  } else {
    // en paralelo: la estatua empieza a bajar su modelo mientras el fondo carga los panoramas
    await Promise.all([core.mount('fondo', createFondo), core.mount('estatua', createEstatua)]);
  }
  // el modelo detallado y las capturas, con tope: si tardan, se muestra igual (y se suben al llegar)
  if (import.meta.env.DEV) console.info(`[main] módulos montados ${Math.round(performance.now())} ms`);
  await Promise.race([core.apis.estatua?.fullReady, wait(6000)]);
  if (import.meta.env.DEV) console.info(`[main] modelo y capturas ${Math.round(performance.now())} ms`);
  await core.apis.estatua?.prewarm?.();
  await core.prewarm();
  core.start();
  // solo desarrollo: ?p=<posición en pantallas> salta a ese punto del guion (para capturas)
  if (import.meta.env.DEV && params.has('p')) {
    const P = Number(params.get('p'));
    core.scroll.caida.enabled = false; // las capturas de control saltan a un punto: sin la toma automática
    core.scroll.scrollTo(Math.max(0, (P - 0.5) * innerHeight), { immediate: true, force: true });
    core.cameraRig.snap();
  }
  ui.ready(); // se va el velo (póster) y arranca la película (apertura → capítulo I)
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
  document.documentElement.classList.add('no-webgl', 'is-ready', 'en-contacto');
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
    b.querySelector('span').textContent = p.rubro || p.description;
    b.addEventListener('click', () => viewer.show(p, { fromRect: b.getBoundingClientRect(), getReturnRect: () => b.getBoundingClientRect() }));
    li.appendChild(b);
    list.appendChild(li);
  });
}
