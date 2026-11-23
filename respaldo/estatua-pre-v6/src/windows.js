import { CSS3DObject } from 'three/examples/jsm/renderers/CSS3DRenderer.js';
import { WINDOWS } from './config.js';

// Ventanas flotantes con el sitio real adentro (iframe en la capa HTML 3D).
// En WebGL cada ventana tiene: un "perforador" (deja ver el iframe a través del canvas),
// un marco grafito con reflejos, un brillo dorado para el hover y una sombra suave.
export function createWindows(ctx, { projects, mode }) {
  const { THREE, camera, htmlRoot, shared } = ctx;
  const vp = WINDOWS.viewport[mode];
  const slots = WINDOWS.slots[mode];
  const group = new THREE.Group();
  group.name = 'estatua_ventanas';

  const shadowTex = makeShadowTexture(THREE);
  const disposables = [shadowTex];
  const tmpV = new THREE.Vector3();
  const tmpQ = new THREE.Quaternion();
  const tmpS = new THREE.Vector3();
  const camPos = new THREE.Vector3();
  const camLocal = new THREE.Vector3();
  const worldPos = new THREE.Vector3();

  const items = projects.map((project, i) => {
    const slot = slots[i % slots.length];
    // si hay más proyectos que posiciones, se reparten en la órbita
    const angle = i < slots.length ? slot.angle : slot.angle + (Math.PI * 2 * i) / projects.length;
    const pxToM = slot.width / vp.w;
    const totalPxH = vp.h + WINDOWS.barHeight;
    const w = slot.width, h = totalPxH * pxToM;
    const r = WINDOWS.radius * pxToM;

    const win = new THREE.Group();
    win.name = `ventana_${project.id}`;
    group.add(win);

    // 1) perforador: escribe alpha 0 en el canvas → se ve el iframe que está debajo.
    //    Escribe profundidad, así la estatua lo tapa cuando pasa por delante.
    const holeGeo = roundedRect(THREE, w, h, r);
    const holeMat = new THREE.MeshBasicMaterial({ color: 0x000000, blending: THREE.NoBlending, toneMapped: false, fog: false });
    holeMat.opacity = 0; // con NoBlending el alpha 0 se escribe tal cual
    const hole = new THREE.Mesh(holeGeo, holeMat);
    hole.userData.projectId = project.id;
    win.add(hole);

    // 2) marco grafito (refleja el entorno: brillos plateados)
    const pad = 0.022 * (w / 1.5) + 0.006;
    const frameGeo = roundedRect(THREE, w + pad * 2, h + pad * 2, r + pad);
    const frameMat = new THREE.MeshPhysicalMaterial({ color: WINDOWS.frame.color, metalness: 0.85, roughness: 0.32, clearcoat: 0.6, clearcoatRoughness: 0.25 });
    const frame = new THREE.Mesh(frameGeo, frameMat);
    frame.position.z = -0.006;
    frame.castShadow = true;
    win.add(frame);

    // 3) brillo dorado (hover)
    const glowGeo = roundedRect(THREE, w + pad * 2 + 0.03, h + pad * 2 + 0.03, r + pad + 0.015);
    const glowMat = new THREE.MeshBasicMaterial({ color: WINDOWS.frame.glow, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, fog: false });
    const glow = new THREE.Mesh(glowGeo, glowMat);
    glow.position.z = -0.012;
    win.add(glow);

    // 4) sombra difusa detrás y abajo
    const shadowGeo = new THREE.PlaneGeometry(w * 1.7, h * 1.7);
    const shadowMat = new THREE.MeshBasicMaterial({ map: shadowTex, transparent: true, opacity: 0.75, depthWrite: false, color: 0x000000 });
    const shadow = new THREE.Mesh(shadowGeo, shadowMat);
    shadow.position.set(0.04 * w, -0.08 * h, -0.35);
    win.add(shadow);

    disposables.push(holeGeo, holeMat, frameGeo, frameMat, glowGeo, glowMat, shadowGeo, shadowMat);

    // ---------- HTML: barra tipo navegador + iframe ----------
    const el = document.createElement('div');
    el.className = `ventana ventana--${mode}`;
    el.style.width = `${vp.w}px`;
    el.style.height = `${totalPxH}px`;
    el.style.setProperty('--radius', `${WINDOWS.radius}px`);
    el.style.setProperty('--bar', `${WINDOWS.barHeight}px`);
    el.style.setProperty('--accent', project.accent || '#C9A227');
    el.innerHTML = `
      <div class="ventana__bar">
        <span class="ventana__dots"><i></i><i></i><i></i></span>
        <span class="ventana__addr">${escapeHtml(displayAddress(project))}</span>
      </div>
      <div class="ventana__body"></div>`;
    const body = el.querySelector('.ventana__body');
    const src = previewSource(project);
    let iframe = null;
    if (src) {
      body.innerHTML = `<div class="ventana__loading"><span>${escapeHtml(project.title)}</span></div>`;
    } else {
      body.appendChild(placeholder(project));
    }
    const css = new CSS3DObject(el);
    el.style.pointerEvents = 'none'; // CSS3DObject lo pone en 'auto': lo anulamos (el clic lo maneja el raycast)
    htmlRoot.add(css);

    return {
      project, slot, angle, win, hole, frame, glow, frameMat, glowMat, shadowMat, el, css, body,
      w, h, pxToM, src, index: i,
      hover: { value: 0 }, iframeLoaded: false,
      loadIframe() {
        if (!src || iframe) return;
        iframe = document.createElement('iframe');
        iframe.src = src;
        iframe.title = `Vista previa de ${project.title}`;
        iframe.setAttribute('tabindex', '-1');
        iframe.setAttribute('aria-hidden', 'true');
        // sitios externos: sin popups, sin navegar la página de arriba (las vistas locales son nuestras)
        if (project.embed !== 'local') iframe.setAttribute('sandbox', 'allow-scripts allow-same-origin');
        iframe.setAttribute('loading', 'lazy');
        iframe.setAttribute('referrerpolicy', 'strict-origin-when-cross-origin');
        iframe.style.width = `${vp.w}px`;
        iframe.style.height = `${vp.h}px`;
        iframe.addEventListener('load', () => { this.iframeLoaded = true; el.classList.add('is-loaded'); }, { once: true });
        body.appendChild(iframe);
      },
      unloadIframe() {
        if (!iframe) return;
        iframe.src = 'about:blank';
        iframe.remove();
        iframe = null;
      },
    };
  });

  // Carga escalonada de los iframes (no traba la aparición de la estatua)
  const timers = items.map((it, i) => setTimeout(() => it.loadIframe(), 600 + i * WINDOWS.iframeStagger));

  const state = { orbit: 0, timeScale: 1, intensity: 1, radiusScale: 1, hoveredId: null, gust: 0, featuredId: null, featuredScale: 1, featuredGlow: 0 };

  function update(time, delta) {
    const motion = shared.reducedMotion ? 0 : state.intensity;
    state.orbit += delta * WINDOWS.orbitSpeed * state.timeScale * motion;
    camera.getWorldPosition(camPos);
    // el grupo puede estar girado (la estatua se gira con el mouse): trabajamos en su espacio local
    group.updateWorldMatrix(true, false);
    camLocal.copy(camPos);
    group.worldToLocal(camLocal);

    for (const it of items) {
      const { slot, win } = it;
      const target = it.project.id === state.hoveredId ? 1 : 0;
      const feat = it.project.id === state.featuredId ? 1 : 0;
      it.feat = (it.feat ?? 0) + (feat - (it.feat ?? 0)) * (1 - Math.exp(-delta * 4));
      it.hover.value += (target - it.hover.value) * (1 - Math.exp(-delta / (WINDOWS.hover.duration * 0.35)));
      const hv = it.hover.value;

      // posición en la elipse + flotación propia
      const th = it.angle + state.orbit * slot.speed;
      const rs = state.radiusScale;
      tmpV.set(Math.cos(th) * slot.rx * rs, slot.y + Math.sin(time * 0.55 + it.index * 1.7) * slot.bob * motion, Math.sin(th) * slot.rz * rs);
      win.position.copy(tmpV);

      // mirar a la cámara + leve giro hacia el centro (perspectiva)
      worldPos.copy(tmpV).applyMatrix4(group.matrixWorld);
      win.lookAt(camPos);
      win.rotateY(-(worldPos.x / (slot.rx * rs)) * WINDOWS.outwardYaw * 2.2);
      win.rotateZ(Math.sin(time * 0.31 + it.index) * 0.012 * motion + Math.sin(time * 9 + it.index * 2) * state.gust);

      // hover: se acerca al visitante y crece un poco
      if (hv > 0.001) {
        const dir = camLocal.clone().sub(win.position).normalize();
        win.position.addScaledVector(dir, WINDOWS.hover.forward * hv);
      }
      win.scale.setScalar((1 + (WINDOWS.hover.scale - 1) * hv) * (1 + (state.featuredScale - 1) * it.feat));
      it.glowMat.opacity = 0.05 + Math.max(hv * 0.4, it.feat * state.featuredGlow);
      it.frameMat.emissive?.setRGB(0.12 * hv, 0.1 * hv, 0.05 * hv);

      // sincronizar la capa HTML con la ventana WebGL
      win.updateMatrixWorld(true);
      win.matrixWorld.decompose(tmpV, tmpQ, tmpS);
      it.css.position.copy(tmpV);
      it.css.quaternion.copy(tmpQ);
      it.css.scale.copy(tmpS).multiplyScalar(it.pxToM);

    }
  }

  // ángulo de cada ventana en el plano XZ del grupo (sin el giro del plato), en un tiempo dado
  function localAngle(it, orbit = state.orbit) {
    const th = it.angle + orbit * it.slot.speed;
    return Math.atan2(Math.sin(th) * it.slot.rz, Math.cos(th) * it.slot.rx);
  }

  function setVisible(v) {
    group.visible = v;
    items.forEach((it) => { it.css.visible = v; });
  }

  function dispose() {
    timers.forEach(clearTimeout);
    items.forEach((it) => {
      it.unloadIframe();
      htmlRoot.remove(it.css);
      it.el.remove();
    });
    disposables.forEach((d) => d.dispose());
    group.removeFromParent();
  }

  return { group, items, state, update, setVisible, dispose, mode, localAngle };
}

// ---------- helpers ----------
export function previewSource(project) {
  if (project.embed === 'local' && project.localPath) return project.localPath;
  if (project.embed === 'iframe' && project.url) return project.url;
  return null;
}

function displayAddress(project) {
  if (project.embed === 'local' && project.localPath) return `vista local · ${project.title}`;
  if (!project.url) return project.title;
  try { const u = new URL(project.url); return u.host + (u.pathname === '/' ? '' : u.pathname); } catch { return project.url; }
}

function placeholder(project) {
  const d = document.createElement('div');
  d.className = 'ventana__placeholder';
  const dev = import.meta.env.DEV
    ? `<p class="ventana__dev">Falta la URL: completala en <code>src/data/projects.json</code></p>`
    : '';
  d.innerHTML = `<p class="ventana__kicker">Proyecto</p><h3>${escapeHtml(project.title)}</h3><p class="ventana__desc">${escapeHtml(project.description || '')}</p>${dev}`;
  return d;
}

function roundedRect(THREE, w, h, r) {
  const s = new THREE.Shape();
  const x = -w / 2, y = -h / 2;
  r = Math.min(r, w / 2, h / 2);
  s.moveTo(x + r, y);
  s.lineTo(x + w - r, y);
  s.quadraticCurveTo(x + w, y, x + w, y + r);
  s.lineTo(x + w, y + h - r);
  s.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  s.lineTo(x + r, y + h);
  s.quadraticCurveTo(x, y + h, x, y + h - r);
  s.lineTo(x, y + r);
  s.quadraticCurveTo(x, y, x + r, y);
  return new THREE.ShapeGeometry(s, 8);
}

function makeShadowTexture(THREE) {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(64, 64, 8, 64, 64, 64);
  grd.addColorStop(0, 'rgba(255,255,255,0.9)');
  grd.addColorStop(0.5, 'rgba(255,255,255,0.35)');
  grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(c);
  return t;
}

export function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
