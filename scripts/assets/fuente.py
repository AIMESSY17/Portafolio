# Cinzel (Google Fonts, SIL Open Font License 1.1) → woff2 recortado a los caracteres que usa la página.
# Se usa la variable (un solo archivo para todos los pesos que se usen: 400 y 600).
#   <venv>/python -I scripts/assets/fuente.py <Cinzel-VariableFont_wght.ttf>
import os, sys
from fontTools.ttLib import TTFont
from fontTools import subset

ttf = sys.argv[1]
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
out = os.path.join(ROOT, 'public', 'assets', 'fuentes', 'cinzel.woff2')
os.makedirs(os.path.dirname(out), exist_ok=True)
f = TTFont(ttf)
cmap = f.getBestCmap()
griego = 'ΑΒΓΔΕΖΗΘΙΚΛΜΝΞΟΠΡΣΤΥΦΧΨΩ'
print('griego en la fuente:', sum(ord(c) in cmap for c in griego), '/', len(griego))
texto = ('ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
         'ÁÉÍÓÚÜÑáéíóúüñ¿¡.,:;—–-·’\'"“”()&/↗+ ' + ''.join(c for c in griego if ord(c) in cmap))
opts = subset.Options()
opts.flavor = 'woff2'
opts.layout_features = ['kern', 'liga', 'calt']
opts.name_IDs = ['*']
opts.notdef_outline = True
s = subset.Subsetter(opts)
s.populate(text=texto)
s.subset(f)
f.flavor = 'woff2'
f.save(out)
print(out, os.path.getsize(out) // 1024, 'KB')
