# Vía Láctea de ESO ("Milky Way at the Residencia", uhd_9180_panorama_eq.tif, CC BY 4.0) →
#   estrellas.webp (4K) / estrellas-2k.webp: solo el brillo de la banda (sin estrellas, sin suelo, sin la luz zodiacal)
#   estrellas.bin: las estrellas más brillantes como puntos (dirección xyz, magnitud 0..1, color rgb), de la más
#                  brillante a la más tenue (el shader las dibuja nítidas a resolución completa).
# El panorama original cubre 360° × 103° (de +90° a −13°): se coloca en un equirectangular completo.
#   python -I scripts/assets/estrellas.py
import os, sys, numpy as np
sys.path.insert(0, os.path.dirname(__file__))
from _comun import ASSET, PUB, srgb, a_8bit, webp
from PIL import Image
from scipy.ndimage import median_filter, gaussian_filter, maximum_filter, grey_opening

Image.MAX_IMAGE_PIXELS = None
SPAN = 103.0  # grados de alto del original
src = Image.open(os.path.join(ASSET, 'uhd_9180_panorama_eq.tif')).convert('RGB')
W0, H0 = src.size


def lineal(a):
    a = a.astype(np.float32) / 255
    return np.where(a <= 0.04045, a / 12.92, ((a + 0.055) / 1.055) ** 2.4)


def mascara(h, desde=7.0, ancho=11.0):
    el = 90 - (np.arange(h) + 0.5) / h * SPAN           # elevación de cada fila
    return np.clip((el - desde) / ancho, 0, 1) ** 1.5   # nada debajo de `desde` (suelo, árboles); entra suave

# ---------- banda (fondo) ----------
OUT = os.path.join(PUB, 'fondo', 'cielo')
for W, suf in ((4096, ''), (2048, '-2k')):
    h = round(W * SPAN / 360)
    img = lineal(np.asarray(src.resize((W, h), Image.BOX)))
    k = 7 if W == 4096 else 4
    # mediana (borra las estrellas) + un desenfoque mínimo; el planeta se aplasta recortando los picos
    band = np.stack([gaussian_filter(median_filter(img[..., c], size=k), 0.8) for c in range(3)], -1)
    pico = np.percentile(band, 99.6, axis=(0, 1))
    band = np.minimum(band, pico)
    band[: max(2, h // 60)] *= np.linspace(0, 1, max(2, h // 60))[:, None, None]  # el borde del cenit del original
    # se va el brillo a gran escala (luz zodiacal, resplandor del horizonte): queda la estructura de la banda
    fondo = np.stack([gaussian_filter(band[..., c], W / 50) for c in range(3)], -1)
    # la banda arranca alto (14° → 30°): abajo están los árboles y el cono de la luz zodiacal
    el = 90 - (np.arange(h) + 0.5) / h * SPAN
    cenit = 1 - np.clip((el - 62) / 14, 0, 1)            # el polo del original está estirado y borroso: se va arriba de 62°
    band = np.clip(band - fondo * 0.9, 0, None) * (mascara(h, 14.0, 16.0) * cenit)[:, None, None]
    band = np.clip(band / np.percentile(band, 99.8), 0, 1.2) ** 1.35 * 0.85
    full = np.zeros((W // 2, W, 3), np.float32)
    full[:h] = band
    webp(os.path.join(OUT, f'estrellas{suf}.webp'), a_8bit(srgb(full)), q=82)
    print('banda', W, os.path.getsize(os.path.join(OUT, f'estrellas{suf}.webp')) // 1024, 'KB')

# ---------- estrellas (puntos) ----------
W = 8192
h = round(W * SPAN / 360)
img = lineal(np.asarray(src.resize((W, h), Image.BOX)))
lum = img @ np.array([0.2126, 0.7152, 0.0722], np.float32)
bg = median_filter(lum, size=9)
res = np.clip(lum - bg, 0, None) * mascara(h)[:, None]
peaks = (res == maximum_filter(res, size=5)) & (res > np.percentile(res, 99.3))
ys, xs = np.nonzero(peaks)
flux = gaussian_filter(res, 0.8)[ys, xs]
order = np.argsort(-flux)[:2600]
ys, xs, flux = ys[order], xs[order], flux[order]
lf = np.log(flux)
norm = np.clip((lf - lf.min()) / (lf.max() - lf.min()), 1e-4, 1)
p = np.log(0.5) / np.log(np.percentile(norm, 96))      # solo el 4 % más brillante pasa de 0,5 (las de 4 puntas)
mag = norm ** p
col = img[ys, xs] - np.stack([median_filter(img[..., c], size=9)[ys, xs] for c in range(3)], -1)
col = np.clip(col, 1e-4, None)
col = col / col.max(axis=1, keepdims=True)
col = 0.55 + 0.45 * col                                  # color real, pero sin saturar de más
u = (xs + 0.5) / W
el = np.radians(90 - (ys + 0.5) / h * SPAN)
a = (u - 0.5) * 2 * np.pi
pos = np.stack([np.sin(a) * np.cos(el), np.sin(el), -np.cos(a) * np.cos(el)], -1)
data = np.concatenate([pos, mag[:, None], col], 1).astype(np.float32)
data.tofile(os.path.join(OUT, 'estrellas.bin'))
print('estrellas', len(data), 'brillantes(>0.5):', int((mag > 0.5).sum()), os.path.getsize(os.path.join(OUT, 'estrellas.bin')) // 1024, 'KB')
