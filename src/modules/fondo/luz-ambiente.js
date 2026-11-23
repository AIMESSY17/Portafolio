// Luces y entorno de "Hecha de luz" (el fondo es dueño de la luz global, CLAUDE.md 7).
//  · sol: una luz direccional dorada (de costado en el hero, rasante en el atardecer, luna a la noche)
//  · cielo: luz hemisférica (color del cielo arriba, rebote cálido del mar/nubes abajo)
//  · entorno (lo que reflejan el mármol y el oro): tres mapas PMREM horneados al cargar con el mismo
//    shader del cielo (día, atardecer, noche). Se cambian solo en momentos tapados (dentro de la nube y
//    a mitad del paso a la noche), así el reflejo de la estatua nunca "salta" a la vista.
import { gsap } from 'gsap';
import { skyUniforms, SKY_VERTEX, SKY_FRAGMENT } from './luz-cielo.js';

export function createAmbiente(ctx, { track }) {
  const { THREE, root, renderer, scene } = ctx;
  const sun = new THREE.DirectionalLight('#ffe5ba', 2.6);
  sun.name = 'luz_sol';
  sun.castShadow = false;
  sun.target.position.set(0, 1.5, 0);
  const hemi = new THREE.HemisphereLight('#d9e7f0', '#f1e2cc', 1);
  hemi.name = 'luz_cielo_hemisferica';
  root.add(sun, sun.target, hemi);

  // ---------- entornos ----------
  const envUniforms = skyUniforms(THREE);
  const envScene = new THREE.Scene();
  const envMat = track(new THREE.ShaderMaterial({
    uniforms: envUniforms, vertexShader: SKY_VERTEX, fragmentShader: SKY_FRAGMENT,
    side: THREE.BackSide, depthWrite: false, depthTest: false, toneMapped: false,
  }));
  envScene.add(new THREE.Mesh(track(new THREE.SphereGeometry(40, 32, 16)), envMat));
  const envs = {};
  // el cielo se dibuja en un cubo de 64 px y de ahí sale el PMREM (≈0,7 MB cada entorno, no 6 MB)
  const cubeRT = new THREE.WebGLCubeRenderTarget(64, { type: THREE.HalfFloatType, generateMipmaps: false });
  const cubeCam = new THREE.CubeCamera(0.1, 100, cubeRT);
  envScene.add(cubeCam);
  let pmrem = null;

  /** Hornea un entorno con el estado de luz `st` (colores del cielo + sol). Solo al cargar. */
  function bake(name, st, sunDir) {
    pmrem ??= new THREE.PMREMGenerator(renderer);
    envUniforms.uZenith.value.copy(st.zenith);
    envUniforms.uHorizon.value.copy(st.horizon);
    // abajo: sobre el mar, el reflejo es el agua (oscura); en el cielo, el mar de nubes (claro)
    if (st.cloudUnder > 0.5) envUniforms.uBelow.value.copy(st.seaShallow).lerp(st.haze, 0.2);
    else envUniforms.uBelow.value.copy(st.below);
    envUniforms.uSunColor.value.copy(st.sun);
    envUniforms.uBand.value.copy(st.band);
    envUniforms.uBandHi.value.copy(st.bandHi);
    envUniforms.uSunDir.value.copy(sunDir);
    envUniforms.uSunGlow.value = st.sunGlow;
    envUniforms.uSunDisc.value = Math.min(1, st.sunDisc);
    envUniforms.uBandI.value = st.bandI;
    envUniforms.uStars.value = 0;
    envUniforms.uCurve.value = st.curve;
    // todos del mismo tamaño: cambiar de entorno no recompila nada
    cubeCam.update(renderer, envScene);
    const rt = pmrem.fromCubemap(cubeRT.texture);
    envs[name] = track(rt);
    return rt.texture;
  }
  /** Libera lo que solo sirve para hornear (después de hornear todos). */
  function endBake() { pmrem?.dispose(); pmrem = null; cubeRT.dispose(); }

  // Cambiar de entorno con la estatua a la vista: la intensidad baja un instante, se cambia abajo y vuelve
  // (0,8 s en total, la misma curva que todo el sitio). Así el reflejo nunca salta.
  let active = null, wanted = null;
  const dip = { v: 1 };
  let dipTl = null;
  function swapNow(name) { active = name; scene.environment = envs[name].texture; }
  return {
    sun, hemi, envs,
    bake, endBake,
    /** Pide un entorno. instant = cambio directo (tapado por la nube o al cargar). */
    use(name, instant = false) {
      if (!envs[name] || wanted === name) return;
      wanted = name;
      if (instant || active === null) { dipTl?.kill(); dip.v = 1; swapNow(name); return; }
      dipTl?.kill();
      dipTl = gsap.timeline()
        .to(dip, { v: 0.35, duration: 0.4, ease: 'power3.inOut' })
        .add(() => swapNow(wanted))
        .to(dip, { v: 1, duration: 0.4, ease: 'power3.inOut' });
    },
    get active() { return active; },
    /** Copia el estado de luz al sol y al cielo. `dir` = dirección hacia el sol. */
    apply(st, dir) {
      sun.color.copy(st.sun);
      sun.intensity = st.sunI;
      sun.position.copy(dir).multiplyScalar(30).add(sun.target.position);
      hemi.color.copy(st.hemiSky);
      hemi.groundColor.copy(st.hemiGround);
      hemi.intensity = st.hemiI;
      scene.environmentIntensity = st.envI * dip.v;
    },
    dispose() { dipTl?.kill(); },
  };
}
