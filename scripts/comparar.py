# Arma las comparaciones del control final: arriba ANTES (la versión anterior) y AHORA, abajo las referencias.
#   python scripts/comparar.py
# Lee referencias/resultado/comparacion-*.jpg (versión anterior + referencias) y referencias/resultado/v3/*.png.
from PIL import Image, ImageDraw, ImageFont
import os
R = 'referencias/resultado'
PARTES = [('parte1-cielo', 'parte1-cielo'), ('parte2-arrastrando', 'parte2-alas-arrastrando'), ('parte3-caida', 'parte3-descenso'),
          ('parte4-mar-cromo', 'parte4-mar'), ('parte4-sala', 'parte4-sala'), ('parte5-contacto', 'parte5-contacto')]
ASPECT = {'escritorio': 1440 / 900, 'celular': 390 / 844}
try: font = ImageFont.truetype('arial.ttf', 22)
except Exception: font = ImageFont.load_default()
for nuevo, viejo in PARTES:
    for dev in ('escritorio', 'celular'):
        old = Image.open(f'{R}/comparacion-{viejo}-{dev}.jpg').convert('RGB')
        top = 40
        h = old.height - top
        lw = round(h * ASPECT[dev])
        antes = old.crop((0, top, lw, old.height))
        refs = old.crop((lw, top, old.width, old.height))
        ahora = Image.open(f'{R}/v3/{nuevo}-{dev}.png').convert('RGB').resize((lw, h), Image.LANCZOS)
        rh = round(refs.height * 0.55); refs = refs.resize((round(refs.width * 0.55), rh), Image.LANCZOS)
        W = lw * 2 + 12
        out = Image.new('RGB', (max(W, refs.width), 44 + h + 44 + rh), (18, 15, 12))
        d = ImageDraw.Draw(out)
        d.text((10, 10), 'ANTES — Hecha de luz', fill=(200, 190, 170), font=font)
        d.text((lw + 22, 10), 'AHORA — versión 3 (fotográfica)', fill=(241, 210, 122), font=font)
        out.paste(antes, (0, 44)); out.paste(ahora, (lw + 12, 44))
        d.text((10, 44 + h + 10), 'Referencias', fill=(200, 190, 170), font=font)
        out.paste(refs, (0, 44 + h + 44))
        os.makedirs(f'{R}/v3', exist_ok=True)
        out.save(f'{R}/v3/comparacion-{nuevo}-{dev}.jpg', quality=86)
        print('ok', nuevo, dev)
