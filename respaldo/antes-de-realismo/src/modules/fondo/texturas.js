// Carga de texturas del fondo con precalentado: todas se registran acá y, cuando terminó la carga,
// `warmTextures` las sube a la placa de video (renderer.initTexture) ANTES de mostrar nada. Así
// ninguna textura se sube a mitad de una transición.
const registry = [];

export function loadTex(THREE, url) {
  let done;
  const loaded = new Promise((res) => (done = res));
  const tex = new THREE.TextureLoader().load(url, () => done(), undefined, () => done());
  registry.push({ tex, loaded });
  return tex;
}

export async function warmTextures(renderer) {
  const items = registry.splice(0);
  await Promise.all(items.map((i) => i.loaded));
  items.forEach(({ tex }) => { if (tex.image) renderer.initTexture(tex); });
}
