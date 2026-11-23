import * as THREE from 'three';
import { createRenderer } from './renderer.js';
import { createHtmlLayer } from './htmlLayer.js';
import { createCameraRig } from './camera.js';
import { createLoop } from './loop.js';
import { createScroll } from './scroll.js';
import { detectQuality, isQualityForced, createQualityMonitor, TIER_SETTINGS } from './quality.js';
import { createBus } from './bus.js';
import { createShared } from './shared.js';
import { createComposer } from './composer.js';
import { createLoader } from './loader.js';

// Arma el núcleo: renderer, cámara, loop, scroll, calidad, bus, shared y capas.
export function createCore({ sections, stage, overlay }) {
  const isMobile = matchMedia('(pointer: coarse)').matches || /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

  const bus = createBus();
  const shared = createShared();
  shared.reducedMotion = reducedMotion;

  const htmlLayer = createHtmlLayer(stage); // debajo
  const renderer = createRenderer(stage);   // encima (transparente donde hay ventanas)
  const scene = new THREE.Scene();
  const cameraRig = createCameraRig({ shared, isMobile });
  const camera = cameraRig.camera;
  const composer = createComposer(renderer, scene, camera);
  const loader = createLoader(renderer);
  const loop = createLoop();
  const scroll = createScroll({ sections, bus, reducedMotion });

  let quality = detectQuality(renderer.getContext());
  const modules = new Map(); // nombre -> instancia
  const apis = {};           // nombre -> api pública del módulo (ver CLAUDE.md 5c)

  // ---------- puntero y giroscopio (los escribe el core) ----------
  const pointerTarget = { x: 0, y: 0 };
  addEventListener('pointermove', (e) => {
    if (e.pointerType === 'touch') return;
    pointerTarget.x = (e.clientX / innerWidth) * 2 - 1;
    pointerTarget.y = -((e.clientY / innerHeight) * 2 - 1);
  }, { passive: true });
  document.addEventListener('pointerleave', () => { pointerTarget.x = 0; pointerTarget.y = 0; });

  const tiltTarget = { x: 0, y: 0 };
  let tiltBase = null;
  function onOrientation(e) {
    if (e.gamma == null) return;
    if (!tiltBase) tiltBase = { b: e.beta, g: e.gamma };
    tiltTarget.x = THREE.MathUtils.clamp((e.gamma - tiltBase.g) / 25, -1, 1);
    tiltTarget.y = THREE.MathUtils.clamp(-(e.beta - tiltBase.b) / 25, -1, 1);
  }
  if (isMobile && 'DeviceOrientationEvent' in window && !reducedMotion) {
    const ask = DeviceOrientationEvent.requestPermission;
    if (typeof ask === 'function') {
      // iOS pide permiso con un gesto del usuario
      addEventListener('touchend', function once() {
        removeEventListener('touchend', once);
        ask().then((r) => r === 'granted' && addEventListener('deviceorientation', onOrientation)).catch(() => {});
      });
    } else {
      addEventListener('deviceorientation', onOrientation);
    }
  }

  // ---------- calidad ----------
  function applyQuality(tier) {
    quality = tier;
    renderer.setPixelRatio(TIER_SETTINGS[tier].pixelRatio());
    renderer.shadowMap.enabled = tier !== 'low';
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    composer.setQuality(tier); // bloom: high 0.4, medium 0.25, low apagado
    document.documentElement.dataset.quality = tier;
  }
  // Calidad adaptativa: baja de a un escalón, puede volver a subir hasta el tier inicial y no se mueve
  // con ?quality= forzado (reglas en quality.js).
  const monitor = createQualityMonitor(() => quality, (tier, fps, up) => {
    console.info(`[calidad] ${quality} -> ${tier} (${up ? 'sube' : 'baja'}, fps promedio ${fps.toFixed(0)})`);
    applyQuality(tier);
    modules.forEach((m) => m.setQuality?.(tier));
    bus.emit('quality:change', { tier });
  }, { ceiling: quality, forced: isQualityForced() });
  // un módulo avisa que está precompilando: no se mide mientras tanto
  bus.on('precompile', ({ on }) => monitor.hold(on));
  applyQuality(quality);

  // ---------- tamaño ----------
  function resize() {
    const w = innerWidth, h = innerHeight;
    renderer.setSize(w, h);
    htmlLayer.setSize(w, h);
    composer.setSize(w, h);
    cameraRig.resize(w, h);
    modules.forEach((m) => m.resize?.(w, h));
  }
  addEventListener('resize', resize);
  resize();

  // ---------- loop ----------
  loop.add((time, delta, timeMs) => {
    const k = 1 - Math.exp(-delta * 6);
    shared.pointer.x += (pointerTarget.x - shared.pointer.x) * k;
    shared.pointer.y += (pointerTarget.y - shared.pointer.y) * k;
    shared.tilt.x += (tiltTarget.x - shared.tilt.x) * k;
    shared.tilt.y += (tiltTarget.y - shared.tilt.y) * k;

    scroll.update(timeMs);
    cameraRig.update(delta);
    modules.forEach((m) => m.update?.(time, delta, scroll.state));
    composer.render();
    htmlLayer.render(camera);
    monitor.tick(delta);
  });

  // pausa total con la pestaña oculta
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) loop.stop(); else { monitor.resetGrace(2); loop.start(); }
  });

  return {
    THREE, scene, camera, cameraRig, renderer, bus, shared, loader, scroll, apis, overlay,
    get quality() { return quality; },
    isMobile, reducedMotion,
    /** Monta un módulo con su propio root (WebGL) y htmlRoot (capa HTML). */
    async mount(name, factory) {
      const root = new THREE.Group();
      root.name = `root_${name}`;
      scene.add(root);
      const htmlRoot = new THREE.Group();
      htmlRoot.name = `html_${name}`;
      htmlLayer.scene.add(htmlRoot);
      const ctx = {
        THREE, scene, camera, renderer, root, htmlRoot, bus, shared, loader,
        quality, isMobile, reducedMotion,
        assetsPath: `${import.meta.env.BASE_URL}assets/${name}/`,
        cameraRig, scroll, apis, overlay,
      };
      const instance = await factory(ctx);
      modules.set(name, instance);
      if (instance.api) apis[name] = instance.api;
      instance.resize?.(innerWidth, innerHeight);
      return instance;
    },
    unmount(name) {
      const m = modules.get(name);
      m?.dispose?.();
      modules.delete(name);
      delete apis[name];
      scene.remove(scene.getObjectByName(`root_${name}`));
      htmlLayer.scene.remove(htmlLayer.scene.getObjectByName(`html_${name}`));
    },
    start() { scroll.refresh(); loop.start(); },
    resize,
  };
}
