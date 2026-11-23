# Texturas de la estatua y de la lente.
#   marmol-2k.webp / marmol-1k.webp (Marble012, ambientCG, CC0) - UNA textura empaquetada para triplanar:
#       R = detalle de luminancia (vetas; 0,5 = el color base de la paleta), G = rugosidad, B/A = normal X/Y (OpenGL)
#   oro-huellas-1k.webp (imperfection_0002, ShareTextures, CC0 personalizado) - mascara de huellas digitales
#   lente/suciedad.webp (dirt_1-1K, ShareTextures, CC0 personalizado) - suciedad de la lente para el destello
#   python -I scripts/assets/texturas.py <carpeta con los zips descomprimidos>
import os, sys, numpy as np
sys.path.insert(0, os.path.dirname(__file__))
from _comun import PUB
from PIL import Image
from scipy.ndimage import gaussian_filter

X = sys.argv[1]
OUT = os.path.join(PUB, 'estatua')
LENTE = os.path.join(PUB, 'lente')
os.makedirs(LENTE, exist_ok=True)


def carga(p, mode='L', size=None):
    im = Image.open(os.path.join(X, p))
    if im.mode == 'I;16':
        im = Image.fromarray((np.asarray(im, np.float32) / 257).astype(np.uint8))
    im = im.convert(mode)
    if size:
        im = im.resize((size, size), Image.LANCZOS)
    return np.asarray(im, np.float32) / 255


for size, suf in ((2048, '2k'), (1024, '1k')):
    col = carga('Marble012_4K-JPG/Marble012_4K-JPG_Color.jpg', 'L', size)
    rough = carga('Marble012_4K-JPG/Marble012_4K-JPG_Roughness.jpg', 'L', size)
    nrm = carga('Marble012_4K-JPG/Marble012_4K-JPG_NormalGL.jpg', 'RGB', size)
    # detalle: luminancia relativa a la media local grande (asi no trae el tono gris azulado, solo las vetas)
    base = gaussian_filter(col, size / 8, mode='wrap')
    det = np.clip(0.5 + (col - base) * 1.6, 0, 1)
    rgba = np.stack([det, rough, nrm[..., 0], nrm[..., 1]], -1)
    p = os.path.join(OUT, f'marmol-{suf}.webp')
    Image.fromarray((rgba * 255 + 0.5).astype(np.uint8), 'RGBA').save(p, 'WEBP', quality=76, alpha_quality=55, method=6)
    print(p, os.path.getsize(p) // 1024, 'KB')

h = carga('imperfection_0002_4k_G7BfjQ/imperfection_0002_opacity_4k.png', 'L', 1024)
h = gaussian_filter(h, 0.6, mode='wrap')
p = os.path.join(OUT, 'oro-huellas-1k.webp')
Image.fromarray((h * 255 + 0.5).astype(np.uint8), 'L').save(p, 'WEBP', quality=80, method=6)
print(p, os.path.getsize(p) // 1024, 'KB')

d = carga('dirt_1-1K/dirt_1-1K/dirt_1-1K.png', 'L')
d = np.asarray(Image.fromarray((gaussian_filter(d, 1.4, mode='wrap') * 255).astype(np.uint8)).resize((768, 768), Image.LANCZOS), np.float32) / 255
d = np.clip((d - np.percentile(d, 40)) / (np.percentile(d, 99.7) - np.percentile(d, 40)), 0, 1)
p = os.path.join(LENTE, 'suciedad.webp')
Image.fromarray((d * 255 + 0.5).astype(np.uint8), 'L').save(p, 'WEBP', quality=78, method=6)
print(p, os.path.getsize(p) // 1024, 'KB')

