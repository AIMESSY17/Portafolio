# Silueta de la estatua para la apertura: máscara (render de victoria.glb en negro sobre blanco, silueta.html)
# → contorno suavizado → trazo SVG con curvas (Catmull-Rom → Bézier). El SVG va inline en index.html: aparece al
# instante, antes de que cargue el 3D, y se dibuja con stroke-dashoffset (pathLength = 1).
#   python -I scripts/assets/silueta.py <mascara.png> <salida.svg> [corte_y]
import sys, numpy as np
from PIL import Image
from scipy.ndimage import gaussian_filter, binary_fill_holes, label

src, out = sys.argv[1], sys.argv[2]
im = np.asarray(Image.open(src).convert('L'), np.float32) / 255
mask = im < 0.5
H, W = mask.shape
corte = int(sys.argv[3]) if len(sys.argv) > 3 else int(H * 0.86)
mask[corte:] = False                                   # la base deformada del escaneo se corta recta (pedestal)
lab, n = label(mask)
mask = lab == (np.bincount(lab.ravel())[1:].argmax() + 1)  # solo la pieza más grande
mask = binary_fill_holes(mask)
m = gaussian_filter(mask.astype(np.float32), 3.2) > 0.5   # borde suave, sin los serruchos del escaneo

# contorno exterior: seguimiento de Moore
ys, xs = np.nonzero(m)
start = (ys.min(), xs[ys == ys.min()].min())
D = [(-1, 0), (-1, 1), (0, 1), (1, 1), (1, 0), (1, -1), (0, -1), (-1, -1)]
pts = [start]
cur, back = start, 6
for _ in range(200000):
    found = False
    for k in range(8):
        d = (back + 1 + k) % 8
        ny, nx = cur[0] + D[d][0], cur[1] + D[d][1]
        if 0 <= ny < H and 0 <= nx < W and m[ny, nx]:
            back = (d + 4) % 8
            cur = (ny, nx)
            found = True
            break
    if not found or cur == start:
        break
    pts.append(cur)
P = np.array(pts, np.float32)[:, ::-1]  # (x, y)


def rdp(p, eps):
    if len(p) < 3:
        return p
    a, b = p[0], p[-1]
    ab = b - a
    nrm = np.hypot(*ab) or 1e-6
    d = np.abs(ab[0] * (p[:, 1] - a[1]) - ab[1] * (p[:, 0] - a[0])) / nrm
    i = int(d.argmax())
    if d[i] > eps:
        return np.vstack([rdp(p[: i + 1], eps)[:-1], rdp(p[i:], eps)])
    return np.vstack([a, b])

# suavizado del recorrido y simplificación
k = 5
Ps = np.vstack([P[-k:], P, P[:k]])
ker = np.ones(2 * k + 1) / (2 * k + 1)
Ps = np.stack([np.convolve(Ps[:, 0], ker, 'valid'), np.convolve(Ps[:, 1], ker, 'valid')], 1)
mid = len(Ps) // 2  # recorrido cerrado: se simplifica en dos mitades
S = np.vstack([rdp(Ps[: mid + 1], 1.6)[:-1], rdp(np.vstack([Ps[mid:], Ps[:1]]), 1.6)[:-1]])
# encuadre: la caja de la silueta con margen
x0, y0 = S.min(0) - 8
x1, y1 = S.max(0) + 8
S = S - [x0, y0]
w, h = x1 - x0, y1 - y0

# Catmull-Rom cerrado → cúbicas
n = len(S)
d = [f'M{S[0][0]:.1f} {S[0][1]:.1f}']
for i in range(n):
    p0, p1, p2, p3 = S[(i - 1) % n], S[i], S[(i + 1) % n], S[(i + 2) % n]
    c1 = p1 + (p2 - p0) / 6
    c2 = p2 - (p3 - p1) / 6
    d.append(f'C{c1[0]:.1f} {c1[1]:.1f} {c2[0]:.1f} {c2[1]:.1f} {p2[0]:.1f} {p2[1]:.1f}')
path = ''.join(d) + 'Z'
svg = f'<svg viewBox="0 0 {w:.0f} {h:.0f}" xmlns="http://www.w3.org/2000/svg"><path d="{path}" pathLength="1"/></svg>'
open(out, 'w').write(svg)
print('puntos', len(P), '->', n, 'caja', round(w), 'x', round(h), 'bytes', len(svg))
