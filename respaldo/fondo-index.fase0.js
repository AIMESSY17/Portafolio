// Módulo FONDO — versión mínima de la Fase 0. Dueño: [NOMBRE_1].
// Pone la iluminación global, el color de fondo y la "vela" que sigue al cursor.
// [NOMBRE_1] lo reemplaza por el fondo renacentista real, respetando esta interfaz.
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';

export default function createFondo(ctx) {
  const { THREE, scene, renderer, root, shared, bus } = ctx;
  const BG = new THREE.Color('#14100B');

  scene.background = BG;
  scene.fog = new THREE.Fog(BG, 14, 34);

  // Mapa de entorno tenue: da reflejos plateados al mármol y al marco de las ventanas.
  const pmrem = new THREE.PMREMGenerator(renderer);
  const envTex = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environment = envTex;
  scene.environmentIntensity = 0.32;
  pmrem.dispose();

  const hemi = new THREE.HemisphereLight('#F1D27A', '#14100B', 0.25);
  root.add(hemi);

  // Luz principal: champagne cálida, alta y lateral (claroscuro sobre pliegues y alas).
  const key = new THREE.DirectionalLight('#F3DFB8', 2.6);
  key.position.set(4.5, 7, 4);
  key.target.position.set(0, 1.5, 0);
  key.castShadow = true;
  key.shadow.mapSize.set(1024, 1024);
  key.shadow.camera.left = -4; key.shadow.camera.right = 4;
  key.shadow.camera.top = 5; key.shadow.camera.bottom = -2;
  key.shadow.bias = -0.0005;
  key.shadow.normalBias = 0.02;
  root.add(key, key.target);

  // Relleno frío plateado desde el otro lado.
  const fill = new THREE.DirectionalLight('#AFC0D6', 0.55);
  fill.position.set(-5, 2.5, 3);
  root.add(fill);

  // "Vela": luz cálida que sigue al cursor por delante de la escena.
  const candle = new THREE.PointLight('#FFC58A', 6, 9, 1.6);
  candle.position.set(0, 2, 3.2);
  root.add(candle);

  let gustTimer = 6;

  return {
    update(time, delta) {
      const p = shared.pointer;
      const tx = p.x * 3.2, ty = 1.6 + p.y * 1.8;
      candle.position.x += (tx - candle.position.x) * Math.min(1, delta * 3);
      candle.position.y += (ty - candle.position.y) * Math.min(1, delta * 3);
      candle.intensity = 6 + Math.sin(time * 7.3) * 0.25 + Math.sin(time * 3.1) * 0.35; // parpadeo suave

      // viento base muy suave (placeholder)
      shared.wind.strength = 0.25 + Math.sin(time * 0.3) * 0.1;
      gustTimer -= delta;
      if (gustTimer <= 0) { gustTimer = 9 + Math.random() * 6; bus.emit('wind:gust', { strength: 0.8 }); }
    },
    resize() {},
    setQuality(tier) {
      key.castShadow = tier !== 'low';
    },
    dispose() {
      envTex.dispose();
      scene.environment = null;
      scene.background = null;
      scene.fog = null;
    },
  };
}
