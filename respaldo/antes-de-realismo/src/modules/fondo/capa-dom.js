// Capa DOM del fondo (dentro de ctx.overlay, sin capturar clics):
//  · grano de película muy sutil (la sala de ZURKLIMA lo sube un poco)
//  · cuatro esquinas finas tipo visor de cámara (1 px, blanco al 30 %) alrededor de la ventana del
//    proyecto, solo en la sala de ZURKLIMA. Siguen a la ventana proyectándola a pantalla (sin leer el DOM).
// (El cartel REC / timecode se sacó: la galería es sobria.)

const GRAIN_BASE = 0.035, GRAIN_EXTRA = 0.05, PAD = 14; // opacidad del grano; separación de las esquinas (px)

export function createCapaDom(ctx) {
  const { THREE, overlay, camera } = ctx;
  const root = document.createElement('div');
  root.className = 'fondo-capa';
  root.setAttribute('aria-hidden', 'true');
  root.innerHTML = `
    <style>
      .fondo-capa{position:absolute;inset:0;pointer-events:none;overflow:hidden}
      .fondo-grano{position:absolute;inset:-60px;opacity:${GRAIN_BASE};mix-blend-mode:overlay;
        background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='180' height='180'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.85' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='180' height='180' filter='url(%23n)'/%3E%3C/svg%3E");
        animation:fondo-grano 1s steps(6) infinite}
      @keyframes fondo-grano{0%{transform:translate(0,0)}20%{transform:translate(-22px,14px)}40%{transform:translate(18px,-30px)}60%{transform:translate(-10px,26px)}80%{transform:translate(28px,8px)}100%{transform:translate(0,0)}}
      .fondo-visor{position:absolute;inset:0;opacity:0;visibility:hidden}
      .fondo-visor i{position:absolute;left:0;top:0;width:22px;height:22px;border:1px solid rgba(255,255,255,.3);will-change:transform}
      .fondo-visor .tl{border-right:0;border-bottom:0}.fondo-visor .tr{border-left:0;border-bottom:0}
      .fondo-visor .bl{border-right:0;border-top:0}.fondo-visor .br{border-left:0;border-top:0}
      @media (prefers-reduced-motion: reduce){.fondo-grano{animation:none}}
    </style>
    <div class="fondo-grano"></div>
    <div class="fondo-visor"><i class="tl"></i><i class="tr"></i><i class="bl"></i><i class="br"></i></div>`;
  overlay.appendChild(root);
  const grain = root.querySelector('.fondo-grano');
  const visor = root.querySelector('.fondo-visor');
  const corners = [...visor.querySelectorAll('i')]; // tl, tr, bl, br
  const sx = [-1, 1, -1, 1], sy = [-1, -1, 1, 1];   // hacia qué lado se corre cada esquina
  const lx = [0, 0, 0, 0], ly = [0, 0, 0, 0];       // últimos px escritos (no se toca el DOM si no cambió)
  const sizeW = [0, 0, 0, 0];

  const v = new THREE.Vector3();
  let win = null, halfW = 1, halfH = 0.6, lastGrain = GRAIN_BASE, lastVisor = 0;

  return {
    /** Ventana (grupo `ventana_<id>`) que rodean las esquinas del visor. null = ninguna. */
    setVisor(obj) {
      win = obj;
      const hole = obj && obj.children[0];
      if (!hole?.geometry) return;
      hole.geometry.computeBoundingBox();
      const b = hole.geometry.boundingBox;
      halfW = (b.max.x - b.min.x) / 2; halfH = (b.max.y - b.min.y) / 2;
    },
    update(st) {
      const g = GRAIN_BASE + st.grain * GRAIN_EXTRA;
      if (Math.abs(g - lastGrain) > 0.002) { grain.style.opacity = g.toFixed(3); lastGrain = g; }
      const o = st.visor;
      if (Math.abs(o - lastVisor) > 0.01 || (o === 0) !== (lastVisor === 0)) {
        visor.style.opacity = o.toFixed(2);
        visor.style.visibility = o > 0.01 ? 'visible' : 'hidden';
        lastVisor = o;
      }
      if (o < 0.02 || !win) return;
      for (let i = 0; i < 4; i++) {
        v.set(sx[i] * halfW, -sy[i] * halfH, 0);
        win.localToWorld(v).project(camera);
        const x = (v.x * 0.5 + 0.5) * innerWidth + sx[i] * PAD - (i % 2 ? 22 : 0);
        const y = (-v.y * 0.5 + 0.5) * innerHeight + sy[i] * PAD - (i > 1 ? 22 : 0);
        if (Math.abs(x - lx[i]) > 0.4 || Math.abs(y - ly[i]) > 0.4) {
          corners[i].style.transform = `translate3d(${x.toFixed(1)}px,${y.toFixed(1)}px,0)`;
          lx[i] = x; ly[i] = y;
        }
      }
    },
    dispose() { root.remove(); },
  };
}
