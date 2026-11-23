// Capa DOM del fondo (dentro de ctx.overlay, sin capturar clics):
// grano de película sutil y el visor "REC" de cámara de vigilancia para el mundo de ZURKLIMA.

export function createCapaDom(ctx) {
  const { overlay, reducedMotion } = ctx;
  const root = document.createElement('div');
  root.className = 'fondo-capa';
  root.setAttribute('aria-hidden', 'true');
  root.innerHTML = `
    <style>
      .fondo-capa{position:absolute;inset:0;pointer-events:none;overflow:hidden}
      .fondo-grano{position:absolute;inset:-60px;opacity:.07;mix-blend-mode:overlay;
        background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='180' height='180'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.85' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='180' height='180' filter='url(%23n)'/%3E%3C/svg%3E");
        animation:fondo-grano 1s steps(6) infinite}
      @keyframes fondo-grano{0%{transform:translate(0,0)}20%{transform:translate(-22px,14px)}40%{transform:translate(18px,-30px)}60%{transform:translate(-10px,26px)}80%{transform:translate(28px,8px)}100%{transform:translate(0,0)}}
      .fondo-rec{position:absolute;inset:0;opacity:0;transition:opacity .45s ease;
        font:600 12px/1 'Inter Tight','Helvetica Neue',Arial,sans-serif;letter-spacing:.18em;color:#9CFF8A}
      .fondo-rec.is-on{opacity:1}
      .fondo-rec__lines{position:absolute;inset:0;opacity:.18;background:repeating-linear-gradient(0deg,rgba(0,0,0,.55) 0 1px,transparent 1px 3px)}
      .fondo-rec__tag{position:absolute;top:calc(84px + env(safe-area-inset-top,0px));left:max(24px,env(safe-area-inset-left,0px));display:flex;gap:10px;align-items:center}
      .fondo-rec__dot{width:9px;height:9px;border-radius:50%;background:#ff3b30;box-shadow:0 0 10px #ff3b30;animation:fondo-blink 1s steps(2) infinite}
      .fondo-rec__time{position:absolute;bottom:calc(28px + env(safe-area-inset-bottom,0px));right:max(24px,env(safe-area-inset-right,0px));font-variant-numeric:tabular-nums}
      .fondo-rec__corner{position:absolute;width:34px;height:34px;border:2px solid currentColor;opacity:.75}
      .fondo-rec__corner.tl{top:70px;left:16px;border-right:0;border-bottom:0}.fondo-rec__corner.tr{top:70px;right:16px;border-left:0;border-bottom:0}
      .fondo-rec__corner.bl{bottom:16px;left:16px;border-right:0;border-top:0}.fondo-rec__corner.br{bottom:16px;right:16px;border-left:0;border-top:0}
      @keyframes fondo-blink{50%{opacity:.15}}
      @media (prefers-reduced-motion: reduce){.fondo-grano,.fondo-rec__dot{animation:none}}
    </style>
    <div class="fondo-grano"></div>
    <div class="fondo-rec">
      <div class="fondo-rec__lines"></div>
      <span class="fondo-rec__corner tl"></span><span class="fondo-rec__corner tr"></span>
      <span class="fondo-rec__corner bl"></span><span class="fondo-rec__corner br"></span>
      <div class="fondo-rec__tag"><span class="fondo-rec__dot"></span>REC · CAM 01</div>
      <div class="fondo-rec__time">00:00:00:00</div>
    </div>`;
  overlay.appendChild(root);
  const rec = root.querySelector('.fondo-rec');
  const clock = root.querySelector('.fondo-rec__time');
  let on = false, t0 = 0;
  const pad = (n) => String(Math.floor(n)).padStart(2, '0');

  return {
    rec(v) { if (v !== on) { on = v; rec.classList.toggle('is-on', v); t0 = performance.now(); } },
    update() {
      if (!on || reducedMotion) return;
      const s = (performance.now() - t0) / 1000;
      clock.textContent = `${pad(s / 3600)}:${pad((s / 60) % 60)}:${pad(s % 60)}:${pad((s * 25) % 25)}`;
    },
    dispose() { root.remove(); },
  };
}
