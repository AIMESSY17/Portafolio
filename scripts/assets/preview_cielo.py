# Vista previa de un cielo codificado: decodifica (Reinhard inverso), aplica ACES como el post y guarda
# el panorama chico + un recorte 1:1 alrededor del sol (para buscar bandas).
#   python -I scripts/assets/preview_cielo.py <nombre> <salida_dir> [exposicion]
import os, sys, json, numpy as np
from PIL import Image
sys.path.insert(0, os.path.dirname(__file__))
from _comun import PUB, srgb

nombre, out = sys.argv[1], sys.argv[2]
expo = float(sys.argv[3]) if len(sys.argv) > 3 else 1.0
im = np.asarray(Image.open(os.path.join(PUB, 'fondo', 'cielo', f'{nombre}.webp')).convert('RGB')).astype(np.float32) / 255
lin = np.where(im <= 0.04045, im / 12.92, ((im + 0.055) / 1.055) ** 2.4)
x = lin / np.maximum(1 - lin, 1 / 64)
x *= expo / 0.6
# ACES (Narkowicz, la misma familia que usa three)
a = (x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14)
img = (srgb(np.clip(a, 0, 1)) * 255).astype(np.uint8)
info = json.load(open(os.path.join(os.path.dirname(__file__), 'cielos.json')))[nombre]
h, w, _ = img.shape
cx, cy = int(info['sunU'] * w), int(info['sunV'] * h)
Image.fromarray(img).resize((1600, 800), Image.BOX).save(os.path.join(out, f'{nombre}-pano.jpg'), quality=88)
x0, y0 = max(0, cx - 640), max(0, min(h - 720, cy - 360))
Image.fromarray(img[y0:y0 + 720, x0:x0 + 1280]).save(os.path.join(out, f'{nombre}-recorte.png'))
print('ok', cx, cy)
