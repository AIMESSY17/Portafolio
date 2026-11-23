import { CSS3DRenderer } from 'three/examples/jsm/renderers/CSS3DRenderer.js';
import * as THREE from 'three';

// Capa HTML 3D (CSS3DRenderer), DEBAJO del canvas WebGL.
// Sirve para mostrar contenido HTML real (iframes) con perspectiva 3D.
// Usa la MISMA cámara que WebGL, así que todo coincide al píxel.
// Cada módulo recibe su propio grupo (ctx.htmlRoot) dentro de esta escena.
export function createHtmlLayer(container) {
  const renderer = new CSS3DRenderer();
  renderer.domElement.classList.add('html-layer');
  container.appendChild(renderer.domElement);
  const scene = new THREE.Scene();
  return {
    scene,
    renderer,
    setSize(w, h) { renderer.setSize(w, h); },
    render(camera) {
      if (scene.children.some((g) => g.children.length)) renderer.render(scene, camera);
    },
  };
}
