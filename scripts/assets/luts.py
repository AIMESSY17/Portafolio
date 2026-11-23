# LUTs (free-10-cinematic-luts-pack, FreeVisuals: libres para uso personal y comercial).
#   python -I scripts/assets/luts.py prueba <carpeta_luts> <salida.jpg> <img1> <img2> <img3>   → hoja de contacto
#   python -I scripts/assets/luts.py exportar <carpeta_luts> "<Nombre LUT>=nombre" ...          → public/assets/lente/lut-<nombre>.png
# Exporta cada LUT 33³ como una tira PNG de 33·33 × 33 (cortes en B a lo ancho). El post la sube como textura 3D.
import os, sys, glob, numpy as np
sys.path.insert(0, os.path.dirname(__file__))
from _comun import PUB
from PIL import Image, ImageDraw


def leer_cube(p):
    n, vals = 0, []
    for line in open(p, encoding='utf8', errors='ignore'):
        t = line.strip().split()
        if not t or t[0].startswith('#'):
            continue
        if t[0] == 'LUT_3D_SIZE':
            n = int(t[1])
        elif len(t) == 3:
            try:
                vals.append([float(v) for v in t])
            except ValueError:
                pass
    a = np.array(vals, np.float32)
    return n, a.reshape(n, n, n, 3)  # [b][g][r] (en .cube R varía más rápido)


def aplicar(lut, n, img):
    x = img.astype(np.float32) / 255 * (n - 1)
    i0 = np.clip(np.floor(x).astype(int), 0, n - 2)
    f = x - i0
    r, g, b = i0[..., 0], i0[..., 1], i0[..., 2]
    fr, fg, fb = f[..., 0:1], f[..., 1:2], f[..., 2:3]
    c = lambda db, dg, dr: lut[b + db, g + dg, r + dr]
    out = (((c(0, 0, 0) * (1 - fr) + c(0, 0, 1) * fr) * (1 - fg) + (c(0, 1, 0) * (1 - fr) + c(0, 1, 1) * fr) * fg) * (1 - fb)
           + ((c(1, 0, 0) * (1 - fr) + c(1, 0, 1) * fr) * (1 - fg) + (c(1, 1, 0) * (1 - fr) + c(1, 1, 1) * fr) * fg) * fb)
    return (np.clip(out, 0, 1) * 255 + 0.5).astype(np.uint8)


modo, carpeta = sys.argv[1], sys.argv[2]
cubes = sorted(glob.glob(os.path.join(carpeta, '*.cube')))
if modo == 'prueba':
    out, imgs = sys.argv[3], sys.argv[4:]
    tw = 480
    srcs = []
    for p in imgs:
        im = Image.open(p).convert('RGB')
        srcs.append(np.asarray(im.resize((tw, int(im.height * tw / im.width)), Image.LANCZOS)))
    th = max(s.shape[0] for s in srcs)
    rows = [('original', None)] + [(os.path.basename(c)[:-5], c) for c in cubes]
    sheet = Image.new('RGB', (tw * len(srcs) + 200, th * len(rows)), (20, 20, 20))
    d = ImageDraw.Draw(sheet)
    for ri, (name, c) in enumerate(rows):
        lut = leer_cube(c) if c else None
        for ci, s in enumerate(srcs):
            o = s if lut is None else aplicar(lut[1], lut[0], s)
            sheet.paste(Image.fromarray(o), (200 + ci * tw, ri * th))
        d.text((8, ri * th + 8), f'{ri}. {name}', fill=(255, 255, 255))
    sheet.save(out, quality=86)
    print('ok', len(rows))
else:
    os.makedirs(os.path.join(PUB, 'lente'), exist_ok=True)
    for par in sys.argv[3:]:
        nombre_cube, nombre = par.split('=')
        n, lut = leer_cube(os.path.join(carpeta, nombre_cube + '.cube'))
        strip = lut.transpose(1, 0, 2, 3).reshape(n, n * n, 3)  # fila = g, columna = b * n + r
        p = os.path.join(PUB, 'lente', f'lut-{nombre}.png')
        Image.fromarray((np.clip(strip, 0, 1) * 255 + 0.5).astype(np.uint8)).save(p, optimize=True)
        print(p, n, os.path.getsize(p) // 1024, 'KB')
