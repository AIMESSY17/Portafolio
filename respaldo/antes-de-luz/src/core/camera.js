import * as THREE from 'three';
import { gsap } from 'gsap';

// Única cámara + "rig" que la maneja. Los módulos NO mueven la cámara directo:
// usan cameraRig.focus()/release() (estatua, al abrir proyecto) o cameraRig.set() (scroll).
export const CAMERA_DEFAULTS = {
  position: new THREE.Vector3(0, 1.6, 9),
  target: new THREE.Vector3(0, 1.5, 0),
  fov: 35,
  // Ancho mínimo visible (metros) en el plano z=0. Si la pantalla es angosta (celular
  // vertical) la cámara se aleja hasta que entre este ancho. Ver CLAUDE.md sección 6.
  minVisibleWidth: { desktop: 10, mobile: 4.1 },
  mobileFov: 42,
  parallax: 0.3, // máx. ± unidades
};

export function createCameraRig({ shared, isMobile }) {
  const cfg = CAMERA_DEFAULTS;
  const camera = new THREE.PerspectiveCamera(isMobile ? cfg.mobileFov : cfg.fov, 1, 0.1, 200);

  const base = { position: cfg.position.clone(), target: cfg.target.clone(), fov: camera.fov };
  const fitDistance = { value: base.position.z };
  const focus = { blend: 0, position: new THREE.Vector3(), target: new THREE.Vector3() };
  const parallax = { amount: cfg.parallax };
  const current = { position: base.position.clone(), target: base.target.clone() };

  const tmpPos = new THREE.Vector3();
  const tmpTarget = new THREE.Vector3();
  const tmpDir = new THREE.Vector3();
  let aspect = 1;

  function computeFit() {
    // distancia necesaria para ver minVisibleWidth en el plano del target
    const minW = isMobile || aspect < 0.9 ? cfg.minVisibleWidth.mobile : cfg.minVisibleWidth.desktop;
    const vFov = THREE.MathUtils.degToRad(camera.fov);
    const visibleH = minW / aspect;
    const dist = visibleH / (2 * Math.tan(vFov / 2));
    fitDistance.value = Math.max(base.position.distanceTo(base.target), dist);
  }

  const rig = {
    camera,
    /** Cambiar la pose base (pensado para el sistema de scroll). duration en segundos. */
    set({ position, target, fov, duration = 0, ease = 'power2.inOut' } = {}) {
      const tw = { ease, duration, overwrite: 'auto' };
      if (position) duration ? gsap.to(base.position, { ...tw, ...position }) : base.position.set(position.x ?? base.position.x, position.y ?? base.position.y, position.z ?? base.position.z);
      if (target) duration ? gsap.to(base.target, { ...tw, ...target }) : base.target.set(target.x ?? base.target.x, target.y ?? base.target.y, target.z ?? base.target.z);
      if (fov) {
        const apply = () => { camera.fov = base.fov; camera.updateProjectionMatrix(); computeFit(); };
        duration ? gsap.to(base, { ...tw, fov, onUpdate: apply }) : ((base.fov = fov), apply());
      }
      if (position || target) computeFit();
    },
    /** Acercamiento cinematográfico (lo usa estatua al abrir un proyecto). */
    focus({ position, target, duration = 1.2, ease = 'power3.inOut' }) {
      focus.position.copy(position);
      focus.target.copy(target);
      return gsap.to(focus, { blend: 1, duration, ease, overwrite: 'auto' });
    },
    /** Vuelve a la pose base. */
    release({ duration = 1.1, ease = 'power3.inOut' } = {}) {
      return gsap.to(focus, { blend: 0, duration, ease, overwrite: 'auto' });
    },
    setParallax(amount) { parallax.amount = amount; },
    getState() {
      return { position: current.position.clone(), target: current.target.clone(), fov: camera.fov, focused: focus.blend > 0.001 };
    },
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

      const k = 1 - Math.exp(-delta * 4); // suavizado independiente de fps
      current.position.lerp(tmpPos, k);
      current.target.lerp(tmpTarget, k);
      if (focus.blend > 0.001 && focus.blend < 0.999) {
        // durante la transición seguimos el tween sin retraso extra
        current.position.copy(tmpPos);
        current.target.copy(tmpTarget);
      }
      camera.position.copy(current.position);
      camera.lookAt(current.target);
    },
  };
  computeFit();
  return rig;
}
