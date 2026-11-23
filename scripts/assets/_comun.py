# Utilidades compartidas del pipeline de assets (Fase 1 "película").
# Los originales quedan en ASSET/Public; acá solo se generan versiones optimizadas en public/assets.
import os, subprocess, numpy as np

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
ASSET = os.path.abspath(os.path.join(ROOT, '..', 'ASSET', 'Public'))
PUB = os.path.join(ROOT, 'public', 'assets')


def leer_exr(path):
    """EXR → float32 (h, w, 3) lineal. Los EXR de Poly Haven vienen en DWA (ffmpeg no la soporta): se decodifican
    con el EXRLoader de three en Node. Los .hdr se leen con ffmpeg."""
    if path.lower().endswith('.exr'):
        import tempfile
        tmp = os.path.join(tempfile.gettempdir(), 'samotracia_exr.f32')
        wh = subprocess.run(['node', os.path.join(ROOT, 'scripts', 'assets', 'exr2raw.mjs'), path, tmp],
                            capture_output=True, text=True, check=True, cwd=ROOT).stdout.split()
        w, h = int(wh[0]), int(wh[1])
        a = np.fromfile(tmp, dtype=np.float32).reshape(h, w, 3)
        os.remove(tmp)
        return a
    info = subprocess.run(['ffprobe', '-v', 'error', '-show_entries', 'stream=width,height', '-of', 'csv=p=0', path],
                          capture_output=True, text=True, check=True).stdout.strip().split(',')
    w, h = int(info[0]), int(info[1])
    raw = subprocess.run(['ffmpeg', '-v', 'error', '-i', path, '-f', 'rawvideo', '-pix_fmt', 'gbrpf32le', '-'],
                         capture_output=True, check=True).stdout
    a = np.frombuffer(raw, dtype=np.float32).reshape(3, h, w)  # planos G, B, R
    return np.ascontiguousarray(np.stack([a[2], a[0], a[1]], axis=-1))


def srgb(x):
    x = np.clip(x, 0, 1)
    return np.where(x <= 0.0031308, x * 12.92, 1.055 * np.power(x, 1 / 2.4) - 0.055)


def a_8bit(x, seed=7):
    """0..1 → uint8 con tramado (dither) triangular: sin bandas de color en los cielos lisos."""
    rng = np.random.default_rng(seed)
    n = (rng.random(x.shape, dtype=np.float32) - rng.random(x.shape, dtype=np.float32))
    return np.clip(x * 255 + n + 0.5, 0, 255).astype(np.uint8)


def achicar(img, w, h):
    """Reducción con filtro de área (promedio): sin aliasing ni anillos."""
    from PIL import Image
    if img.dtype != np.float32:
        img = img.astype(np.float32)
    chans = [np.asarray(Image.fromarray(img[..., c]).resize((w, h), Image.BOX)) for c in range(img.shape[2])]
    return np.stack(chans, axis=-1)


def guardar_hdr(path, img):
    """Radiance .hdr (RGBE) con compresión RLE por renglón (lo que lee RGBELoader de three)."""
    h, w, _ = img.shape
    mx = img.max(axis=2)
    e = np.zeros((h, w), np.int32)
    ok = mx > 1e-32
    m, ex = np.frexp(mx[ok])
    e[ok] = ex
    scale = np.zeros((h, w), np.float32)
    scale[ok] = 256.0 / np.power(2.0, e[ok])
    rgbe = np.zeros((h, w, 4), np.uint8)
    rgbe[..., :3] = np.clip(img * scale[..., None], 0, 255).astype(np.uint8)
    rgbe[..., 3] = np.where(ok, e + 128, 0).astype(np.uint8)
    out = bytearray(b'#?RADIANCE\nFORMAT=32-bit_rle_rgbe\n\n' + f'-Y {h} +X {w}\n'.encode())
    for y in range(h):
        out += bytes([2, 2, w >> 8, w & 255])
        for c in range(4):
            row = rgbe[y, :, c]
            i = 0
            while i < w:
                # corrida de iguales
                j = i + 1
                while j < w and j - i < 127 and row[j] == row[i]:
                    j += 1
                if j - i >= 3:
                    out += bytes([128 + j - i, int(row[i])])
                    i = j
                    continue
                # tramo de distintos
                j = i
                while j < w and j - i < 128 and not (j + 2 < w and row[j] == row[j + 1] == row[j + 2]):
                    j += 1
                out += bytes([j - i]) + row[i:j].tobytes()
                i = j
    with open(path, 'wb') as f:
        f.write(out)


def webp(path, arr, q=86, method=6, lossless=False):
    from PIL import Image
    Image.fromarray(arr).save(path, 'WEBP', quality=q, method=method, lossless=lossless)
    return os.path.getsize(path)
