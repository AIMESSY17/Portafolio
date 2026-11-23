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
  const cameraRig = createCameraRig({ shared, isMobile, reducedMotion });
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
    // "Hecha de luz" no usa sombras proyectadas en ninguna calidad (la luz la hacen el cielo y el bloom).
    // Queda siempre apagado: prenderlo/apagarlo al cambiar de calidad no recompila nada, pero no suma.
    renderer.shadowMap.enabled = false;
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
    /**
     * Precalentado general, al terminar de montar todo y ANTES de mostrar la página:
     *  1) sube todas las texturas a la placa de video (initTexture), también las de uniforms propios;
     *  2) compila todos los shaders en paralelo, para la pantalla y para los render targets (bloom,
     *     reflejos), sin trabar (compileAsync recorre también los objetos ocultos);
     *  3) dibuja TODO una vez (visible y sin recorte por cámara): a un target de 4x4 y a 1 píxel de la
     *     pantalla. Así ninguna geometría, textura ni programa se estrena en medio del scroll.
     * Mientras dura, el monitor de calidad no mide (evento `precompile`).
     */
    async prewarm() {
      bus.emit('precompile', PRECOMPILE_ON);
      const t0 = performance.now();
      const rt = new THREE.WebGLRenderTarget(4, 4, { type: THREE.HalfFloatType });
      const hidden = [], culled = [];
      try {
        const seen = new Set();
        scene.traverse((o) => {
          const list = Array.isArray(o.material) ? o.material : o.material ? [o.material] : [];
          for (const m of list) {
            if (seen.has(m)) continue;
            seen.add(m);
            for (const k of TEXTURE_KEYS) if (m[k]?.isTexture && m[k].image) renderer.initTexture(m[k]);
            if (m.uniforms) for (const name in m.uniforms) { const v = m.uniforms[name].value; if (v?.isTexture && v.image && !v.isRenderTargetTexture) renderer.initTexture(v); }
          }
        });
        renderer.setRenderTarget(rt);
        const inTarget = renderer.compileAsync(scene, camera);
        renderer.setRenderTarget(null);
        await Promise.all([inTarget, renderer.compileAsync(scene, camera)]);
        scene.traverse((o) => {
          if (!o.visible) { hidden.push(o); o.visible = true; }
          if (o.frustumCulled) { culled.push(o); o.frustumCulled = false; }
        });
        renderer.setRenderTarget(rt);
        renderer.render(scene, camera);
        renderer.setRenderTarget(null);
        renderer.setScissorTest(true);
        renderer.setScissor(0, 0, 1, 1);
        composer.render();
        renderer.setScissorTest(false);
      } catch (e) {
        console.warn('[core] no se pudo precalentar todo', e);
      } finally {
        hidden.forEach((o) => { o.visible = false; });
        culled.forEach((o) => { o.frustumCulled = true; });
        rt.dispose();
        if (import.meta.env.DEV) console.info(`[core] precalentado en ${Math.round(performance.now() - t0)} ms`);
        bus.emit('precompile', PRECOMPILE_OFF);
      }
    },
  };
}

const PRECOMPILE_ON = { on: true }, PRECOMPILE_OFF = { on: false };
const TEXTURE_KEYS = ['map', 'bumpMap', 'normalMap', 'emissiveMap', 'alphaMap', 'roughnessMap', 'metalnessMap', 'envMap'];
