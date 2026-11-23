# Samotracia — "Hecha de luz"

La Victoria de Samotracia, hecha de luz, baja del cielo al mar. El scroll cuenta el viaje: nubes de día que se derriten en píxeles, un atardecer dorado sobre el mar con una sala por proyecto, y la orilla a la hora azul para hablar.

## Arrancar
```bash
npm install
npm run dev          # http://localhost:5173 (también desde el celular en la misma red)
npm run build        # genera dist/ para Vercel
npm run capturas     # captura 1440x900 (webp) de cada proyecto con URL → public/assets/capturas/
npm run check-embeds # qué sitios se pueden mostrar en iframe
```

## Probar
| URL | Qué muestra |
|---|---|
| `/` | todo junto |
| `/?quality=low` | fuerza calidad (también `medium`, `high`) |
| `/?stats` | (desarrollo) fps, peor cuadro, draw calls |
| `/?p=3.1` | (desarrollo) salta a ese punto del guion: 0,5 hero · 1,0 derretido · 2,3 mar · 2,6+ salas · 10,7 contacto |
| `/?sala=zurklima` | (desarrollo) fuerza el tono de una sala |
| `/?contacto=demo` | (desarrollo) muestra los links de Contacto aunque falten los datos |
| `/?only=fondo`, `/?only=estatua` | cada módulo por separado |

## Dónde se ajusta cada cosa
- **El guion del scroll** (qué pasa en cada tramo): `src/config/historia.js`.
- **Dónde va la ventana grande y su texto** en cada pantalla: `src/config/layout.js`.
- **Los colores de cada momento y de cada sala** (cielo, nubes, mar, sol): `src/modules/fondo/luz-estados.js`.
- **La estatua, sus encuadres, las alas de luz y el tótem**: `src/modules/estatua/config.js` (`ESCENA`, `ALAS`, `TOTEM`, `GOLD`).
- **Proyectos**: `src/data/projects.json` (`title`, `rubro`, `linea`, `url`, `captura`). Sin captura, la pantalla muestra un cartel con el nombre.
- **Contacto**: `src/config/contacto.js` (WhatsApp y mail; vacío = no se muestra).

## Interacción
- Arrastrar en horizontal gira la estatua (con inercia). Arrastrando salen más alas de luz.
- El mouse mueve un poco el sol (y su camino en el agua) y deja ondas en el mar.
- Clic en una pantalla del tótem: va a su sala. Clic en la ventana de la sala: abre el sitio real (iframe) en un visor; se cierra con ✕, Esc o clic afuera, y el iframe se destruye.

## Control de calidad (con `npm run dev` corriendo)
```bash
node scripts/qa-luz.mjs http://localhost:5173 referencias/resultado hero:0.5 sala:3.1   # capturas escritorio + celular
node scripts/qa-rendimiento.mjs http://localhost:5173 salida.json high,medium,low       # fps y peor cuadro
node scripts/qa-tirones.mjs http://localhost:5173 high 22                                # dónde están los cuadros lentos
node scripts/qa-impacto.mjs http://localhost:5173 referencias/resultado/impacto escritorio # intro, fragmentos, sala con desenfoque, entrar a un proyecto
node scripts/qa-carga.mjs http://localhost:5173                                         # cuánto tarda cada parte de la carga
node scripts/qa-peso.mjs http://localhost:4199                                          # peso real (con npm run build + npx vite preview --port 4199)
python scripts/comparar.py                                                              # comparaciones antes / ahora / referencias
# Atajos de la URL (solo desarrollo): ?p=<posición en pantallas> salta a ese punto del guion · ?intro fuerza la intro · ?nointro la saltea · ?quality=low|medium|high · ?stats
```

## Créditos
Modelo 3D: "Nike of Samothrace" by p_moraiti (Sketchfab), CC BY 4.0, optimizado para web. El crédito es obligatorio y está en el pie de Contacto.
