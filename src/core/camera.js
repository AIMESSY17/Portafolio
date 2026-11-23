import * as THREE from 'three';
import { gsap } from 'gsap';

// Única cámara + "rig" que la maneja. Los módulos NO mueven la cámara directo:
// usan cameraRig.set() (pose según el scroll) o cameraRig.focus()/release() (acercamientos).
export const CAMERA_DEFAULTS = {
  position: new THREE.Vector3(0, 1.6, 9),
  target: new THREE.Vector3(0, 1.5, 0),
  fov: 35,
  // Ancho mínimo visible (metros) en el plano del target. Si la pantalla es angosta la cámara se
  // aleja hasta que entre este ancho. Cada pose puede pedir el suyo con set({ minWidth }).
  minVisibleWidth: { desktop: 10, mobile: 4.1 },
  mobileFov: 42,
  parallax: 0.3,  // máx. ± unidades con el mouse o el giroscopio
  smoothing: 4,   // qué tan pegada sigue la cámara a su pose (1/s)
};

export function createCameraRig({ shared, isMobile, reducedMotion = false }) {
  const cfg = CAMERA_DEFAULTS;
  // lejos: 6000 m (en la caída, desde arriba, el mar llega hasta el horizonte)
  const camera = new THREE.PerspectiveCamera(isMobile ? cfg.mobileFov : cfg.fov, 1, 0.1, 6000);

  const base = { position: cfg.position.clone(), target: cfg.target.clone(), fov: camera.fov, minWidth: null };
  const fitDistance = { value: base.position.z };
  const focus = { blend: 0, position: new THREE.Vector3(), target: new THREE.Vector3() };
  const parallax = { amount: reducedMotion ? 0 : cfg.parallax };
  const current = { position: base.position.clone(), target: base.target.clone() };

  const tmpPos = new THREE.Vector3();
  const tmpTarget = new THREE.Vector3();
  const tmpDir = new THREE.Vector3();
  let aspect = 1;
  let first = true;

  function computeFit() {
    // distancia necesaria para ver el ancho mínimo en el plano del target
    const minW = base.minWidth ?? (isMobile || aspect < 0.9 ? cfg.minVisibleWidth.mobile : cfg.minVisibleWidth.desktop);
    const vFov = THREE.MathUtils.degToRad(camera.fov);
    const visibleH = minW / aspect;
    const dist = visibleH / (2 * Math.tan(vFov / 2));
    fitDistance.value = Math.max(base.position.distanceTo(base.target), dist);
  }
  function applyFov() { camera.fov = base.fov; camera.updateProjectionMatrix(); computeFit(); }

  const rig = {
    camera,
    /**
     * Pose base. Sin duration es inmediato y no crea nada (se puede llamar en cada cuadro).
     * minWidth: ancho mínimo visible de esta pose (m); null vuelve al de config.
     */
    set({ position, target, fov, minWidth, duration = 0, ease = 'power3.inOut' } = {}) {
      if (minWidth !== undefined) base.minWidth = minWidth;
      if (duration) {
        const tw = { ease, duration, overwrite: 'auto' };
        if (position) gsap.to(base.position, { ...tw, ...position, onUpdate: computeFit });
        if (target) gsap.to(base.target, { ...tw, ...target, onUpdate: computeFit });
        if (fov) gsap.to(base, { ...tw, fov, onUpdate: applyFov });
        return;
      }
      if (position) base.position.set(position.x ?? base.position.x, position.y ?? base.position.y, position.z ?? base.position.z);
      if (target) base.target.set(target.x ?? base.target.x, target.y ?? base.target.y, target.z ?? base.target.z);
      if (fov && fov !== base.fov) { base.fov = fov; applyFov(); } else computeFit();
    },
    /** Acercamiento cinematográfico (por ejemplo al abrir un proyecto). */
    focus({ position, target, duration = 1.2, ease = 'power3.inOut' }) {
      focus.position.copy(position);
      focus.target.copy(target);
      return gsap.to(focus, { blend: 1, duration, ease, overwrite: 'auto' });
    },
    /** Vuelve a la pose base. */
    release({ duration = 1.1, ease = 'power3.inOut' } = {}) {
      return gsap.to(focus, { blend: 0, duration, ease, overwrite: 'auto' });
    },
    setParallax(amount) { parallax.amount = reducedMotion ? 0 : amount; },
    /** Salta a la pose sin el suavizado (al cargar o al saltar de lugar en la página). */
    snap() { first = true; },
    getState() {
      return { position: current.position.clone(), target: current.target.clone(), fov: camera.fov, focused: focus.blend > 0.001 };
    },
    get fovDeg() { return camera.fov; },
    get aspect() { return aspect; },
    resize(w, h) {
      aspect = w / h;
      camera.aspect = aspect;
      camera.updateProjectionMatrix();
      computeFit();
    },
    update(delta) {
      // pose base, alejada si hace falta para que entre el ancho mínimo
      const dir = tmpDir.copy(base.position).sub(base.target).normalize();
      tmpPos.copy(base.target).addScaledVector(dir, fitDistance.value);
      tmpTarget.copy(base.target);

      // parallax suave (mouse o giroscopio), atenuado cuando hay foco
      const px = (shared.pointer.x + shared.tilt.x) * parallax.amount * (1 - focus.blend * 0.8);
      const py = (shared.pointer.y + shared.tilt.y) * parallax.amount * 0.6 * (1 - focus.blend * 0.8);
      tmpPos.x += px;
      tmpPos.y += py;

      if (focus.blend > 0) {
        tmpPos.lerp(focus.position, focus.blend);
        tmpTarget.lerp(focus.target, focus.blend);
      }

      const k = first ? 1 : 1 - Math.exp(-delta * cfg.smoothing); // suavizado independiente de fps
      first = false;
      current.position.lerp(tmpPos, k);
      current.target.lerp(tmpTarget, k);
      if (focus.blend > 0.001 && focus.blend < 0.999) {
        // durante la transición seguimos el tween sin retraso extra
        current.position.copy(tmpPos);
        current.target.copy(tmpTarget);
      }
      camera.position.copy(current.position);
      camera.lookAt(current.target);
      camera.updateMatrixWorld();
    },
  };
  computeFit();
  return rig;
}
