import * as THREE from 'three';

// Único renderer y único <canvas> WebGL.
// Versión película: la escena se dibuja a un buffer HalfFloat y el post (composer.js) hace el antialias (SMAA/FXAA)
// y el tono: el canvas no necesita MSAA ni transparencia (ya no hay iframes debajo: ver CLAUDE.md 5b, histórico).
export function createRenderer(container) {
  const renderer = new THREE.WebGLRenderer({
    antialias: false,
    alpha: false,
    stencil: false,
    depth: false,
    powerPreference: 'high-performance',
  });
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1;
  renderer.setClearColor(0x000000, 1);
  renderer.domElement.classList.add('webgl-canvas');
  renderer.domElement.setAttribute('aria-hidden', 'true');
  container.appendChild(renderer.domElement);
  return renderer;
}

export function hasWebGL() {
  try {
    const c = document.createElement('canvas');
    return !!(window.WebGLRenderingContext && (c.getContext('webgl2') || c.getContext('webgl')));
  } catch {
    return false;
  }
}
