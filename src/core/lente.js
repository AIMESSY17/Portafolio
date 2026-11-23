import * as THREE from 'three';
import { FullScreenQuad } from 'three/examples/jsm/postprocessing/Pass.js';

// Lente: UNA sola pasada barata, después de la escena y el bloom, que hace tres cosas:
//   · destello del sol (lens flare) cuando el sol entra en cuadro: halo, fantasmas sobre la línea sol–centro
//     y una raya horizontal finita. Si algo tapa el sol (la estatua), se apaga: lee el brillo en ese punto.
//   · aberración cromática leve en los bordes, SOLO durante la caída.
//   · profundidad de campo en las salas: todo desenfocado menos la ventana grande (su rectángulo sale de
//     config/layout.js, el mismo que usa la estatua). Apagada en calidad baja.
// Cómo: copia lo que ya está en pantalla a una textura (ya con tono y color finales), y la vuelve a dibujar
// con los efectos. El desenfoque se hace a 1/2 y 1/4 de resolución, solo si hace falta. Si no hay ningún
// efecto prendido, no hace nada (cero costo).
//   · RAYOS de luz (god rays): barrido radial desde el sol sobre lo más brillante de la imagen, a media resolución
//     (a 1/4 y con menos muestras en medium/low): las nubes tapan y dejan pasar la luz en haces.
//   · ETALONAJE final cálido y suave (sombras entibiadas, luces doradas, negros que no se lavan) y grano de película
//     muy fino. Corre siempre en high y medium; en low solo si hay otro efecto prendido (ahorra una pasada entera).
// Lo maneja shared.lente = { flare, aberracion, dof, rect, rays, grade } (ver CLAUDE.md 8).
export function createLente(renderer, camera, shared) {
  const size = new THREE.Vector2();
  let frame = new THREE.FramebufferTexture(2, 2);
  frame.minFilter = frame.magFilter = THREE.LinearFilter;
  const rtOpt = { type: THREE.UnsignedByteType, depthBuffer: false, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter };
  const half = new THREE.WebGLRenderTarget(2, 2, rtOpt), halfTmp = new THREE.WebGLRenderTarget(2, 2, rtOpt);
  const quarter = new THREE.WebGLRenderTarget(2, 2, rtOpt), quarterTmp = new THREE.WebGLRenderTarget(2, 2, rtOpt);
  const rayRT = new THREE.WebGLRenderTarget(2, 2, rtOpt);
  let tier = 'high';

  const blurMat = new THREE.ShaderMaterial({
    uniforms: { tDiffuse: { value: null }, uStep: { value: new THREE.Vector2() } },
    depthTest: false, depthWrite: false,
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
    fragmentShader: /* glsl */`
      uniform sampler2D tDiffuse; uniform vec2 uStep; varying vec2 vUv;
      void main(){
        vec4 c = texture2D(tDiffuse, vUv) * 0.227027;
        c += (texture2D(tDiffuse, vUv + uStep * 1.3846) + texture2D(tDiffuse, vUv - uStep * 1.3846)) * 0.3162162;
        c += (texture2D(tDiffuse, vUv + uStep * 3.2308) + texture2D(tDiffuse, vUv - uStep * 3.2308)) * 0.0702703;
        gl_FragColor = c;
      }`,
  });
  const rayMat = new THREE.ShaderMaterial({
    uniforms: { tFrame: { value: null }, uSun: { value: new THREE.Vector2(0.5, 0.5) }, uN: { value: 24 }, uAspect: { value: 1 } },
    depthTest: false, depthWrite: false, blending: THREE.NoBlending,
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
    fragmentShader: /* glsl */`
      uniform sampler2D tFrame; uniform vec2 uSun; uniform float uN, uAspect; varying vec2 vUv;
      void main(){
        vec2 d = (uSun - vUv);
        float len = length(d * vec2(uAspect, 1.0));
        vec2 stepv = d / uN * 0.92;
        vec2 uv = vUv;
        float acc = 0.0, w = 1.0;
        for (int i = 0; i < 32; i++) {
          if (float(i) >= uN) break;
          uv += stepv;
          vec3 c = texture2D(tFrame, clamp(uv, 0.001, 0.999)).rgb;
          float l = dot(c, vec3(0.299, 0.587, 0.114));
          acc += smoothstep(0.78, 0.99, l) * w;   // solo lo más brillante (cielo claro junto al sol); lo oscuro (nubes) tapa
          w *= 0.955;
        }
        float fall = exp(-len * 1.35);              // se apaga lejos del sol
        gl_FragColor = vec4(vec3(acc / uN * fall), 1.0);
      }`,
  });
  const lensMat = new THREE.ShaderMaterial({
    uniforms: {
      tFrame: { value: null }, tBlur: { value: null },
      uRes: { value: new THREE.Vector2(1, 1) },
      uCA: { value: 0 }, uDof: { value: 0 }, uRect: { value: new THREE.Vector4(0, 0, 1, 1) },
      uSun: { value: new THREE.Vector2(0.5, 0.5) }, uFlare: { value: 0 }, uFlareCol: { value: new THREE.Color('#ffd7a0') },
      uUseBlur: { value: 0 },
      tRays: { value: null }, uRays: { value: 0 }, uGrade: { value: 0 }, uTime: { value: 0 },
    },
    depthTest: false, depthWrite: false, blending: THREE.NoBlending,
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
    fragmentShader: /* glsl */`
      uniform sampler2D tFrame, tBlur;
      uniform vec2 uRes, uSun;
      uniform vec4 uRect;   // ventana nítida: x, y (abajo-izquierda), ancho, alto en uv
      uniform float uCA, uDof, uFlare, uUseBlur;
      uniform vec3 uFlareCol;
      uniform sampler2D tRays; uniform float uRays, uGrade, uTime;
      varying vec2 vUv;
      float gHash(vec2 p){ p = fract(p * vec2(443.897, 441.423)); p += dot(p, p.yx + 19.19); return fract((p.x + p.y) * p.x); }
      float sdBox(vec2 p, vec2 b, float r){ vec2 q = abs(p) - b + r; return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r; }
      void main(){
        vec2 uv = vUv;
        float aspect = uRes.x / uRes.y;
        vec2 dc = uv - 0.5;
        float r2 = dot(dc * vec2(aspect, 1.0), dc * vec2(aspect, 1.0));
        vec3 col;
        if (uCA > 0.001) {
          // aberración: solo en los bordes (crece con la distancia al centro al cuadrado)
          vec2 off = dc * uCA * 0.016 * smoothstep(0.05, 0.6, r2);
          col = vec3(texture2D(tFrame, uv - off).r, texture2D(tFrame, uv).g, texture2D(tFrame, uv + off).b);
        } else {
          col = texture2D(tFrame, uv).rgb;
        }
        if (uUseBlur > 0.5) {
          // profundidad de campo: nítido adentro de la ventana, desenfocado afuera (borde suave)
          vec2 c = (uRect.xy + uRect.zw * 0.5);
          vec2 p = (uv - c) * vec2(aspect, 1.0);
          float d = sdBox(p, uRect.zw * 0.5 * vec2(aspect, 1.0), 0.012);
          float coc = smoothstep(0.0, 0.07, d) * uDof;
          col = mix(col, texture2D(tBlur, uv).rgb, coc);
        }
        if (uFlare > 0.001) {
          // ¿se ve el sol? brillo de la imagen en ese punto (si lo tapa la estatua, se apaga)
          vec3 s0 = texture2D(tFrame, uSun).rgb + texture2D(tFrame, uSun + vec2(0.004, 0.0)).rgb + texture2D(tFrame, uSun - vec2(0.004, 0.0)).rgb;
          float vis = smoothstep(2.1, 2.8, dot(s0, vec3(0.333)));
          float f = uFlare * vis;
          if (f > 0.001) {
            vec2 toS = (uv - uSun) * vec2(aspect, 1.0);
            float ds = length(toS);
            vec3 add = uFlareCol * (exp(-ds * 9.0) * 0.18 + exp(-ds * 40.0) * 0.25);       // halo
            add += uFlareCol * exp(-abs(toS.y) * 520.0) * exp(-abs(toS.x) * 2.2) * 0.22;  // raya horizontal
            vec2 axis = vec2(0.5) - uSun;
            for (int i = 0; i < 5; i++) {                                                  // fantasmas
              float k = float(i) == 0.0 ? 0.42 : float(i) == 1.0 ? 0.7 : float(i) == 2.0 ? 1.08 : float(i) == 3.0 ? 1.45 : 1.9;
              float rad = float(i) == 0.0 ? 0.018 : float(i) == 1.0 ? 0.05 : float(i) == 2.0 ? 0.03 : float(i) == 3.0 ? 0.085 : 0.045;
              vec2 g = (uv - (uSun + axis * k)) * vec2(aspect, 1.0);
              float disc = 1.0 - smoothstep(rad * 0.7, rad, length(g));
              vec3 tint = float(i) == 1.0 ? vec3(0.55, 0.75, 1.0) : float(i) == 3.0 ? vec3(0.75, 0.6, 1.0) : vec3(1.0, 0.85, 0.6);
              add += tint * disc * 0.05;
            }
            col += add * f;
          }
        }
        if (uRays > 0.001) col += texture2D(tRays, uv).r * uRays * uFlareCol;
        if (uGrade > 0.001) {
          // etalonaje: sombras entibiadas, luces doradas, curva suave y los negros no se lavan
          float l = dot(col, vec3(0.299, 0.587, 0.114));
          vec3 g = col * mix(vec3(1.035, 1.0, 0.94), vec3(1.035, 1.005, 0.955), smoothstep(0.5, 1.0, l));
          g = mix(g, g * g * (3.0 - 2.0 * g), 0.16);
          g = max(g - 0.01, 0.0) / 0.99;
          // grano de película, muy fino (más en los medios tonos)
          float n = gHash(gl_FragCoord.xy + fract(uTime * 7.31) * 113.0) - 0.5;
          g += n * 0.034 * (0.35 + 0.65 * (1.0 - abs(l * 2.0 - 1.0)));
          col = mix(col, g, uGrade);
        }
        gl_FragColor = vec4(col, 1.0);
      }`,
  });
  const quad = new FullScreenQuad(blurMat);

  function setSize() {
    renderer.getDrawingBufferSize(size);
    const w = Math.max(2, size.x | 0), h = Math.max(2, size.y | 0);
    frame.dispose();
    frame = new THREE.FramebufferTexture(w, h);
    frame.minFilter = frame.magFilter = THREE.LinearFilter;
    half.setSize(Math.max(2, w >> 1), Math.max(2, h >> 1));
    halfTmp.setSize(Math.max(2, w >> 1), Math.max(2, h >> 1));
    quarter.setSize(Math.max(2, w >> 2), Math.max(2, h >> 2));
    quarterTmp.setSize(Math.max(2, w >> 2), Math.max(2, h >> 2));
    lensMat.uniforms.uRes.value.set(w, h);
    const rs = tier === 'high' ? 1 : 2;
    rayRT.setSize(Math.max(2, w >> (1 + rs - 1)), Math.max(2, h >> (1 + rs - 1)));
    rayMat.uniforms.uAspect.value = w / h;
  }

  function blur(srcTex, sw, sh, tmp, dst, k = 1) {
    quad.material = blurMat;
    blurMat.uniforms.tDiffuse.value = srcTex;
    blurMat.uniforms.uStep.value.set(k / sw, 0);
    renderer.setRenderTarget(tmp); quad.render(renderer);
    blurMat.uniforms.tDiffuse.value = tmp.texture;
    blurMat.uniforms.uStep.value.set(0, k / tmp.height);
    renderer.setRenderTarget(dst); quad.render(renderer);
  }

  const sunP = new THREE.Vector3();
  return {
    setSize,
    setQuality(t) { tier = t; setSize(); },
    /** Dibuja la lente si hay algún efecto prendido. force = todo prendido (para compilar al cargar). */
    render(force = false) {
      const L = shared.lente;
      if (!L) return;
      let flare = 0, rays = 0, haveSun = false;
      if (force) { flare = 1; rays = 1; haveSun = true; lensMat.uniforms.uSun.value.set(0.5, 0.5); }
      else if ((L.flare > 0.01 || L.rays > 0.01) && shared.sol) {
        sunP.copy(shared.sol.dir).multiplyScalar(100).add(camera.position).project(camera);
        if (sunP.z < 1 && Math.abs(sunP.x) < 1.6 && Math.abs(sunP.y) < 1.6) {
          haveSun = true;
          lensMat.uniforms.uSun.value.set(sunP.x * 0.5 + 0.5, sunP.y * 0.5 + 0.5);
          if (Math.abs(sunP.x) < 1.05 && Math.abs(sunP.y) < 1.05) flare = L.flare * (1 - Math.max(0, Math.max(Math.abs(sunP.x), Math.abs(sunP.y)) - 0.85) / 0.2);
          rays = L.rays || 0;
        }
      }
      const ca = force ? 1 : (L.aberracion || 0);
      const dof = force ? 1 : tier === 'low' ? 0 : (L.dof || 0);
      const grade = force ? 1 : (tier === 'low' ? 0 : (L.grade || 0));
      const doRays = haveSun && rays >= 0.01;
      const other = flare >= 0.01 || ca >= 0.01 || dof >= 0.01 || doRays;
      if (!other && grade < 0.01) return;
      const gradeNow = tier === 'low' ? (other ? Math.max(grade, L.grade || 0) : 0) : grade;

      const prevTarget = renderer.getRenderTarget();
      const prevAuto = renderer.autoClear;
      renderer.autoClear = false;
      renderer.setRenderTarget(null);
      renderer.copyFramebufferToTexture(frame);
      const u = lensMat.uniforms;
      u.uUseBlur.value = 0;
      u.uRays.value = 0;
      if (doRays) {
        rayMat.uniforms.tFrame.value = frame;
        rayMat.uniforms.uSun.value.copy(u.uSun.value);
        rayMat.uniforms.uN.value = force || tier === 'high' ? 28 : tier === 'medium' ? 18 : 10;
        quad.material = rayMat;
        renderer.setRenderTarget(rayRT);
        quad.render(renderer);
        u.tRays.value = rayRT.texture;
        u.uRays.value = force ? 1 : rays * 0.55 * (tier === 'low' ? 0.8 : 1);
      }
      if (dof >= 0.01) {
        blur(frame, frame.image.width, frame.image.height, halfTmp, half, 1);
        blur(half.texture, half.width, half.height, quarterTmp, quarter, 1.2);
        u.tBlur.value = quarter.texture;
        u.uUseBlur.value = 1;
        const r = L.rect;
        if (r) u.uRect.value.set(r.x / innerWidth, 1 - (r.y + r.h) / innerHeight, r.w / innerWidth, r.h / innerHeight);
      }
      u.tFrame.value = frame;
      u.uCA.value = ca;
      u.uDof.value = dof;
      u.uFlare.value = flare;
      u.uGrade.value = gradeNow;
      u.uTime.value = performance.now() * 0.001;
      if (shared.sol?.color) u.uFlareCol.value.copy(shared.sol.color).convertLinearToSRGB();
      quad.material = lensMat;
      renderer.setRenderTarget(null);
      quad.render(renderer);
      quad.material = blurMat;
      renderer.setRenderTarget(prevTarget);
      renderer.autoClear = prevAuto;
    },
  };
}
