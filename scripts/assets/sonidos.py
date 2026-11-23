# Olas (jasinski, "alkaibeach", Freesound #18363, CC0) → loops sin corte, mono, en OGG (Vorbis) y MP3.
# El viento y el brillo mágico de la transmutación se generan en vivo con Web Audio (0 KB): no hay un viento CC0
# confiable que se pueda bajar sin cuenta.
#   python -I scripts/assets/sonidos.py
import os, sys, subprocess, numpy as np, soundfile as sf
sys.path.insert(0, os.path.dirname(__file__))
from _comun import ASSET, PUB

OUT = os.path.join(PUB, 'sonido')
os.makedirs(OUT, exist_ok=True)
FUENTES = {'olas-1': 'wave_01_cc0-18363__jasinski__alkaibeach.flac', 'olas-2': 'wave_02_cc0-18363__jasinski__alkaibeach.flac'}
for nombre, archivo in FUENTES.items():
    x, sr = sf.read(os.path.join(ASSET, archivo), dtype='float32', always_2d=True)
    x = x.mean(axis=1)
    dur = len(x) / sr
    # golpes sueltos (duran 2–4 s: en loop se notaría la repetición). Web Audio los dispara al azar, con tono y
    # volumen variables, sobre un fondo de mar generado. Entrada y salida suaves para que no hagan clic.
    fi, fo = int(0.04 * sr), int(0.6 * sr)
    loop = x.copy()
    loop[:fi] *= np.linspace(0, 1, fi, dtype=np.float32)
    loop[-fo:] *= np.linspace(1, 0, fo, dtype=np.float32) ** 1.5
    loop /= max(1e-6, np.abs(loop).max()) / 0.89
    tmp = os.path.join(OUT, f'{nombre}.wav')
    sf.write(tmp, loop, sr)
    for ext, args in (('ogg', ['-c:a', 'libvorbis', '-q:a', '1']), ('mp3', ['-c:a', 'libmp3lame', '-b:a', '56k'])):
        subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', tmp, '-ar', '32000', '-ac', '1', *args, os.path.join(OUT, f'{nombre}.{ext}')], check=True)
    os.remove(tmp)
    print(nombre, f'{dur:.1f} s -> loop {len(loop) / sr:.1f} s', {e: os.path.getsize(os.path.join(OUT, f'{nombre}.{e}')) // 1024 for e in ('ogg', 'mp3')}, 'KB')
