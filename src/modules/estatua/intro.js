// Intro (solo la primera visita): pantalla negra, una línea de oro fina dibuja la silueta de la estatua en 2 s
// (con el boceto de la v6: círculo y marco), un destello suave y se abre el cielo real.
// Se salta con un clic, una tecla o al scrollear. Se recuerda con localStorage (con try/catch: si no hay
// almacenamiento, se muestra cada vez, y si falla todo, no se rompe nada).
// Cómo: una cortina negra pegada a la cámara, DETRÁS de la estatua (tapa el cielo y el mar, no la figura), y
// la estatua en "modo intro" (negra con la silueta en oro, ver gilding.js). Nada se compila de nuevo: la
// cortina existe desde la carga y solo cambia su opacidad.
import { gsap } from 'gsap';
import { INTRO } from './config.js';

export function createIntro(ctx, { statue, sketch }) {
  const { THREE, root, camera } = ctx;
  let seen = false;
  try { seen = localStorage.getItem(INTRO.key) === '1'; } catch { seen = false; }
  const q = new URLSearchParams(location.search);
  const forced = import.meta.env.DEV && q.has('intro');
  const off = import.meta.env.DEV && (q.has('nointro') || q.has('p')); // capturas de control: sin intro
  // Versión película: la apertura es DOM (ui/pelicula.js, aparece antes que el 3D). Esta intro 3D queda apagada
  // (INTRO.enabled = false en config.js); si se prende, vuelve tal cual era.
  const active = INTRO.enabled !== false && (!seen || forced) && !off && !ctx.reducedMotion;
  if (!active) document.documentElement.classList.remove('con-intro', 'en-intro');
  else document.documentElement.classList.add('en-intro'); // los textos esperan a que termine

  const u = { uOpacity: { value: active ? 1 : 0 }, uFlash: { value: 0 }, uColor: { value: new THREE.Color('#FFF4DE') } };
  const curtain = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.ShaderMaterial({
    uniforms: u,
    transparent: true, depthWrite: true, depthTest: true, toneMapped: false,
    vertexShader: 'void main(){ gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: /* glsl */`
      uniform float uOpacity, uFlash; uniform vec3 uColor;
      void main(){
        gl_FragColor = vec4(uColor * uFlash, uOpacity);
        #include <colorspace_fragment>
      }`,
  }));
  curtain.name = 'estatua_intro_cortina';
  curtain.renderOrder = -98;      // después del cielo, antes que todo lo transparente
  curtain.frustumCulled = false;
  curtain.visible = active;
  root.add(curtain);

  const st = { k: active ? 1 : 0, draw: 0, running: active, done: !active };
  let tl = null;
  const doneListeners = [];
  const tmp = new THREE.Vector3(), fwd = new THREE.Vector3();

  function finish() {
    st.running = false; st.done = true;
    document.documentElement.classList.remove('en-intro');
    curtain.visible = false;
    statue.setIntro(0, 1);
    sketch.setOverride(null);
    try { localStorage.setItem(INTRO.key, '1'); } catch { /* sin almacenamiento */ }
    doneListeners.splice(0).forEach((fn) => fn());
  }

  function play() {
    if (!active) { finish(); return; }
    st.running = true;
    document.documentElement.classList.add('en-intro');
    tl = gsap.timeline({ onComplete: finish })
      .to(st, { draw: 1, duration: INTRO.draw, ease: 'power3.inOut' }, 0.15)
      .to(u.uFlash, { value: 0.85, duration: INTRO.flash, ease: 'power3.inOut' })
      .add('abre')
      .to(u.uFlash, { value: 0, duration: INTRO.open, ease: 'power3.inOut' }, 'abre')
      .to(u.uOpacity, { value: 0, duration: INTRO.open, ease: 'power3.inOut' }, 'abre')
      .to(st, { k: 0, duration: INTRO.open * 0.7, ease: 'power3.inOut' }, 'abre+=0.05');
  }
  /** Saltar: todo se abre rápido (0,5 s). */
  function skip() {
    if (!st.running) return;
    tl?.kill();
    st.running = false;
    gsap.timeline({ onComplete: finish })
      .to(u.uFlash, { value: 0, duration: 0.3, ease: 'power3.inOut' }, 0)
      .to(u.uOpacity, { value: 0, duration: 0.5, ease: 'power3.inOut' }, 0)
      .to(st, { k: 0, draw: 1, duration: 0.45, ease: 'power3.inOut' }, 0);
  }
  const onDown = () => skip();
  const onKey = () => skip();
  if (active) { addEventListener('pointerdown', onDown, { passive: true }); addEventListener('keydown', onKey); }

  return {
    get active() { return active; },
    get running() { return st.running; },
    get done() { return st.done; },
    /** 0..1: cuánto de la escena todavía tapa la intro (las ventanas esperan a que termine). */
    get cover() { return st.done ? 0 : u.uOpacity.value; },
    onDone(fn) { if (st.done) fn(); else doneListeners.push(fn); },
    play,
    skip,
    update(scrollVelocity) {
      if (st.done) return;
      if (st.running && Math.abs(scrollVelocity) > 0.5) skip(); // scrollear la salta
      statue.setIntro(st.k, st.draw);
      sketch.setOverride(st.k > 0.001 ? Math.min(0.25, st.draw * 0.3) : null);
      // la cortina: de frente a la cámara, unos metros detrás de la estatua
      camera.getWorldDirection(fwd);
      const d = camera.position.length() + 7;
      tmp.copy(camera.position).addScaledVector(fwd, d);
      curtain.position.copy(tmp);
      curtain.quaternion.copy(camera.quaternion);
      const h = 2 * d * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2) * 1.2;
      curtain.scale.set(h * camera.aspect, h, 1);
    },
    dispose() {
      tl?.kill();
      removeEventListener('pointerdown', onDown);
      removeEventListener('keydown', onKey);
      curtain.geometry.dispose();
      curtain.material.dispose();
      curtain.removeFromParent();
    },
  };
}
