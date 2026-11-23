import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { FullScreenQuad } from 'three/examples/jsm/postprocessing/Pass.js';
import { createLente } from './lente.js';

// Post-procesado.
//
// 1) BLOOM SELECTIVO (resplandor del oro de la estatua y de las brasas), en la capa 1 de la cámara:
//    - Qué brilla: los objetos con `obj.layers.enable(1)` (o `obj.userData.bloom = true`). El mármol
//      de la estatua está en la capa 1, pero su material expone `userData.bloomUniform`: mientras dura
//      la pasada de bloom lo prendemos y el shader dibuja SOLO el oro (ver GILDING_BLOOM). Las partes de
//      oro de la estatua van por capa. Las brasas del fondo NO brillan (galería sobria).
//    - Cómo: la escena se dibuja normal, directo a pantalla (el tono y el antialiasing no cambian).
//      Después se dibuja a media resolución SOLO lo de la capa 1, se desenfoca en dos escalas y se
//      suma encima.
//    - ALPHA (CLAUDE.md 5b): la suma usa blendFuncSeparate(DST_ALPHA, ONE, ZERO, ONE). El color se
//      multiplica por el alpha que ya hay en pantalla y el alpha no se toca. Donde una ventana
//      perforó el canvas (alpha 0) el bloom suma 0: el iframe queda intacto.
//    Intensidad: high 0.4, medium 0.25, low apagado.
// 2) Pasadas extra (addPass): van por EffectComposer y DEBEN conservar el alpha.
// "Hecha de luz": brillan el oro de la estatua, las partículas de las alas, los destellos del mar y la
// figura de luz de Contacto. Lo que tapa (ventanas) entra a la pasada en negro para no dejar pasar el halo.
export const BLOOM_STRENGTH = { high: 0.62, medium: 0.4, low: 0 };

const BLOOM_LAYER = 1;

export function createComposer(renderer, scene, camera, shared) {
  let composer = null;
  const effects = [];
  const bloom = createBloom(renderer, scene, camera);
  // 3) lente: destello del sol, aberración en la caída y profundidad de campo en las salas (lente.js)
  const lente = createLente(renderer, camera, shared);

  function build() {
    composer?.dispose();
    composer = new EffectComposer(renderer);
    composer.addPass(new RenderPass(scene, camera));
    effects.forEach((p) => composer.addPass(p));
    composer.addPass(new OutputPass());
  }

  return {
    addPass(pass) { effects.push(pass); build(); },
    removePass(pass) {
      const i = effects.indexOf(pass);
      if (i >= 0) effects.splice(i, 1);
      if (effects.length) build(); else { composer?.dispose(); composer = null; }
    },
    setQuality(tier) { bloom.setStrength(BLOOM_STRENGTH[tier] ?? 0); lente.setQuality(tier); },
    setSize(w, h) { composer?.setSize(w, h); bloom.setSize(); lente.setSize(); },
    render() {
      if (composer) composer.render(); else renderer.render(scene, camera);
      bloom.render();
      lente.render();
    },
    /** Compila y estrena la lente con todo prendido (al cargar, dentro de un recorte de 1 píxel). */
    prewarmLente() { lente.render(true); },
  };
}

function createBloom(renderer, scene, camera) {
  let strength = 0;
  const rtOptions = { type: THREE.HalfFloatType, depthBuffer: true, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter };
  const mask = new THREE.WebGLRenderTarget(2, 2, rtOptions);          // 1/2: lo que brilla
  const blurTmp = new THREE.WebGLRenderTarget(2, 2, { ...rtOptions, depthBuffer: false });
  const wide1 = new THREE.WebGLRenderTarget(2, 2, { ...rtOptions, depthBuffer: false }); // 1/2 desenfocado
  const wide2 = new THREE.WebGLRenderTarget(2, 2, { ...rtOptions, depthBuffer: false }); // 1/4 desenfocado (halo ancho)
  const wide2Tmp = new THREE.WebGLRenderTarget(2, 2, { ...rtOptions, depthBuffer: false });

  const blurMat = new THREE.ShaderMaterial({
    uniforms: { tDiffuse: { value: null }, uStep: { value: new THREE.Vector2() } },
    depthTest: false,
    depthWrite: false,
    vertexShader: /* glsl */ `varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`,
    fragmentShader: /* glsl */ `
      uniform sampler2D tDiffuse; uniform vec2 uStep; varying vec2 vUv;
      void main(){
        vec4 c = texture2D(tDiffuse, vUv) * 0.227027;
        c += (texture2D(tDiffuse, vUv + uStep) + texture2D(tDiffuse, vUv - uStep)) * 0.1945946;
        c += (texture2D(tDiffuse, vUv + uStep * 2.0) + texture2D(tDiffuse, vUv - uStep * 2.0)) * 0.1216216;
        c += (texture2D(tDiffuse, vUv + uStep * 3.0) + texture2D(tDiffuse, vUv - uStep * 3.0)) * 0.054054;
        c += (texture2D(tDiffuse, vUv + uStep * 4.0) + texture2D(tDiffuse, vUv - uStep * 4.0)) * 0.016216;
        gl_FragColor = c;
      }`,
  });
  const compositeMat = new THREE.ShaderMaterial({
    uniforms: { tNear: { value: null }, tWide: { value: null }, uStrength: { value: 0 } },
    depthTest: false,
    depthWrite: false,
    transparent: true,
    blending: THREE.CustomBlending,
    blendEquation: THREE.AddEquation,
    blendSrc: THREE.DstAlphaFactor,    // color = bloom * alpha de la pantalla (0 en las ventanas perforadas)
    blendDst: THREE.OneFactor,
    blendSrcAlpha: THREE.ZeroFactor,   // el alpha de la pantalla NO se modifica
    blendDstAlpha: THREE.OneFactor,
    vertexShader: /* glsl */ `varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`,
    fragmentShader: /* glsl */ `
      uniform sampler2D tNear, tWide; uniform float uStrength; varying vec2 vUv;
      void main(){
        vec3 b = (texture2D(tNear, vUv).rgb * 0.7 + texture2D(tWide, vUv).rgb * 1.1) * uStrength;
        gl_FragColor = vec4(b, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
  const quad = new FullScreenQuad(blurMat);

  // Se recorre la escena en cada cuadro (unos cientos de objetos: es barato) con arrays reutilizados,
  // así un objeto nuevo (ej. el modelo detallado de la estatua) nunca se cuela en la pasada de bloom.
  const renderables = [], glowFlags = [], savedVisible = [], bloomUniforms = [];
  let glowCount = 0;
  function visit(o) {
    if (!(o.isMesh || o.isPoints || o.isLine || o.isSprite)) return;
    const glows = o.layers.isEnabled(BLOOM_LAYER) || !!o.userData.bloom;
    renderables.push(o);
    glowFlags.push(glows);
    if (!glows) return;
    glowCount++;
    const u = o.material?.userData?.bloomUniform;
    if (u && !bloomUniforms.includes(u)) bloomUniforms.push(u);
  }
  function collect() {
    renderables.length = 0; glowFlags.length = 0; bloomUniforms.length = 0; glowCount = 0;
    scene.traverse(visit);
  }

  const prevClear = new THREE.Color();
  function setSize() {
    const size = renderer.getDrawingBufferSize(new THREE.Vector2());
    const w = Math.max(2, size.x >> 1), h = Math.max(2, size.y >> 1);
    [mask, blurTmp, wide1].forEach((rt) => rt.setSize(w, h));
    [wide2, wide2Tmp].forEach((rt) => rt.setSize(Math.max(2, w >> 1), Math.max(2, h >> 1)));
  }
  setSize();

  function blur(src, tmp, dst) {
    blurMat.uniforms.tDiffuse.value = src.texture;
    blurMat.uniforms.uStep.value.set(1 / src.width, 0);
    renderer.setRenderTarget(tmp);
    quad.render(renderer);
    blurMat.uniforms.tDiffuse.value = tmp.texture;
    blurMat.uniforms.uStep.value.set(0, 1 / src.height);
    renderer.setRenderTarget(dst);
    quad.render(renderer);
  }

  return {
    setStrength(v) { strength = v; },
    setSize,
    render() {
      if (strength <= 0) return;
      collect();
      if (!glowCount) return;

      // guardar el estado del renderer
      const prevTarget = renderer.getRenderTarget();
      const prevAutoClear = renderer.autoClear;
      const prevAlpha = renderer.getClearAlpha();
      renderer.getClearColor(prevClear);
      const prevShadowAuto = renderer.shadowMap.autoUpdate;
      const prevBg = scene.background, prevFog = scene.fog;

      // 1) dibujar SOLO lo que brilla (lo demás se esconde: es barato y no dispara reflejos del piso)
      for (let i = 0; i < renderables.length; i++) {
        savedVisible[i] = renderables[i].visible;
        if (!glowFlags[i]) renderables[i].visible = false;
      }
      bloomUniforms.forEach((u) => (u.value = 1));
      scene.background = null;
      scene.fog = null;
      renderer.shadowMap.autoUpdate = false; // reutiliza las sombras ya calculadas en la pasada normal
      renderer.setClearColor(0x000000, 0);
      renderer.autoClear = true;
      renderer.setRenderTarget(mask);
      renderer.render(scene, camera);
      for (let i = 0; i < renderables.length; i++) renderables[i].visible = savedVisible[i];
      bloomUniforms.forEach((u) => (u.value = 0));
      scene.background = prevBg;
      scene.fog = prevFog;
      renderer.shadowMap.autoUpdate = prevShadowAuto;

      // 2) desenfocar en dos escalas
      renderer.autoClear = false;
      blur(mask, blurTmp, wide1);
      quad.material = blurMat;
      blur(wide1, wide2Tmp, wide2);

      // 3) sumar a la pantalla (el alpha no se toca)
      compositeMat.uniforms.tNear.value = wide1.texture;
      compositeMat.uniforms.tWide.value = wide2.texture;
      compositeMat.uniforms.uStrength.value = strength;
      quad.material = compositeMat;
      renderer.setRenderTarget(null);
      quad.render(renderer);
      quad.material = blurMat;

      renderer.setRenderTarget(prevTarget);
      renderer.autoClear = prevAutoClear;
      renderer.setClearColor(prevClear, prevAlpha);
    },
  };
}
