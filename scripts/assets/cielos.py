# Cielos de Poly Haven (CC0) → fondos 4K / 2K / 1K en WebP + HDR 1K para reflejos.
#   python -I scripts/assets/cielos.py
# Codificación del fondo: Reinhard (y = x / (1 + x)) guardado en sRGB 8 bits, con tramado. El shader lo
# decodifica (x = y / (1 − y)) y recupera el rango alto: el cielo entra al post-procesado como luz real
# (el sol y las nubes iluminadas pasan de 1 y generan bloom), y el tono final lo pone ACES + el LUT.
# También mide dónde está el sol en cada foto (sunU, sunV) para que el guion lo gire a su lugar.
import os, sys, json, numpy as np
sys.path.insert(0, os.path.dirname(__file__))
from _comun import ASSET, PUB, leer_exr, srgb, a_8bit, achicar, guardar_hdr, webp
from scipy.ndimage import gaussian_filter

CIELOS = {
    #  nombre       archivo                                       luminancia media buscada (cielo, lineal)
    'dia':        ('kloofendal_48d_partly_cloudy_puresky_4k.exr', 0.42),
    'atardecer':  ('belfast_sunset_puresky_4k.exr',               0.30),
    'crepusculo': ('kloppenheim_06_puresky_4k.exr',               0.16),
}
OUT = os.path.join(PUB, 'fondo', 'cielo')
os.makedirs(OUT, exist_ok=True)
solo = sys.argv[1:] or list(CIELOS)
info = {}
for nombre in solo:
    archivo, objetivo = CIELOS[nombre]
    hdr = leer_exr(os.path.join(ASSET, archivo))
    h, w, _ = hdr.shape
    lum = hdr @ np.array([0.2126, 0.7152, 0.0722], np.float32)
    # el sol: lo más brillante (suavizado). En la hora azul no hay disco: el resplandor más fuerte del horizonte
    small = achicar(lum[..., None], 1024, 512)[..., 0]
    sm = gaussian_filter(small, 3)
    y, x = np.unravel_index(np.argmax(sm), sm.shape)
    sunU, sunV = (x + 0.5) / 1024, (y + 0.5) / 512
    # exposición: la media del cielo (arriba del horizonte, sin el sol) queda en el objetivo
    sky = lum[: h // 2]
    med = float(np.median(sky))
    k = objetivo / max(med, 1e-6)
    x_lin = np.minimum(hdr * k, 60.0)
    enc = x_lin / (1.0 + x_lin)
    sizes = {}
    for sufijo, ww in (('', 4096), ('-2k', 2048), ('-1k', 1024)):
        e = enc if ww == w else achicar(enc, ww, ww // 2)
        arr = a_8bit(srgb(e), seed=ww)
        sizes[sufijo or '-4k'] = webp(os.path.join(OUT, f'{nombre}{sufijo}.webp'), arr, q=90 if ww == 4096 else 88)
    # HDR 1K para el entorno (reflejos del mármol y el oro): mismo k, el sol recortado para que el PMREM no haga ruido
    if nombre == 'crepusculo' or '--hdr' in sys.argv:
        # misma luz media que el HDR anterior (la iluminación del fondo está calibrada para ese nivel)
        viejo = os.path.join(OUT, f'{nombre}.hdr')
        kh = 1.0
        if os.path.exists(viejo):
            old = leer_exr(viejo)
            lo = np.median((old @ np.array([0.2126, 0.7152, 0.0722], np.float32))[: old.shape[0] // 2])
            kh = float(lo / max(med, 1e-6))
        info_kh = kh
        small_hdr = np.minimum(achicar(hdr * kh, 1024, 512), 400.0)
        guardar_hdr(os.path.join(OUT, f'{nombre}.hdr'), small_hdr)
        sizes['hdr'] = os.path.getsize(os.path.join(OUT, f'{nombre}.hdr'))
    info[nombre] = {'sunU': round(sunU, 4), 'sunV': round(sunV, 4), 'k': k, 'mediana': med,
                    'max': float(lum.max() * k), 'kb': {s: round(b / 1024) for s, b in sizes.items()}}
    print(nombre, json.dumps(info[nombre]))
with open(os.path.join(os.path.dirname(__file__), 'cielos.json'), 'w') as f:
    json.dump(info, f, indent=2)
