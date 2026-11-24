# Samotracia — una película interactiva

La Victoria de Samotracia baja del cielo al mar y se transmuta en oro; las obras forman su corona. La página es una
película en cuatro capítulos: **I — El cielo**, **II — La caída** (automática), **III — Las obras** (una sala por
proyecto) y **IV — Los créditos** (a la hora azul, con "Hablemos.").

## Arrancar
```bash
npm install
npm run dev          # http://localhost:5173 (también desde el celular en la misma red: http://<ip-de-la-pc>:5173/?debug)
npm run build        # genera dist/ para Vercel
npx vite preview --port 4199   # prueba el build de producción
npm run capturas     # captura 1440x900 (webp) de cada proyecto con URL → public/assets/capturas/
```

## Subir a GitHub (pendiente: el repo todavía no existe)
El proyecto ya tiene historia de git local (primer commit: "antes de la película"). Para subirlo:
1. Crear el repositorio vacío `samotracia` en https://github.com/new (privado, sin README).
2. En esta carpeta:
   ```bash
   git remote add origin https://github.com/AIMESSY17/samotracia.git
   git push -u origin main
   ```
3. En Vercel: importar el repo, y en el proyecto activar **Analytics** (el script ya está en `index.html`).

## Probar (parámetros de la URL)
| URL | Qué muestra |
|---|---|
| `/` | la película completa (la apertura sale solo la primera vez) |
| `/?debug` | fps, peor cuadro, calidad, resolución y tiempo de placa en pantalla (sirve en el celular por la red local) |
| `/?quality=low` | fuerza la calidad (también `medium`, `high`) |
| `/?lite` | la versión liviana de respaldo |
| `/?nointro` | sin la apertura |
| `/?resfija` | resolución fija (para medir) |
| `/?p=3.5` | (desarrollo) salta a ese punto del guion: 0,5 cielo · 1,5 nube · 2,3 transmutación · 2,92 mar · 3,5–9,5 salas · 11,1 créditos |
| `/?sinui` | sin interfaz (capturas limpias) |
| `/?demo` | (desarrollo) muestra los "Resultado" vacíos para ver el diseño |
| `/?modelo=stw` | (desarrollo) la estatua de Scan The World (licencia sin verificar, no se publica) |
| `/?post=nobloom,norays,nodof,nolut,nograin,vermascara` | apaga piezas del post para medir |

## Dónde se ajusta cada cosa
- **Tu nombre o marca**: `data-marca` en la etiqueta `<html>` de `index.html` y los títulos (`<title>`, `og:title`).
- **Proyectos**: `src/data/projects.json` (`title`, `rubro`, `unica`, `necesitaba`, `hicimos`, `resultado`, `url`, `captura`).
- **Contacto**: `src/config/contacto.js` (WhatsApp, mail y el mensaje inicial).
- **El guion** (qué pasa en cada tramo del scroll): `src/config/historia.js`. **La caída**: `src/core/caida.js`.
- **Colores de cada momento y de cada sala**: `src/modules/fondo/luz-estados.js`. **LUT de cada sala**: `SALA_LUT` en `src/modules/fondo/index.js`.
- **Post de cine** (bloom, grano, viñeta, fuerza de las LUT por calidad): `POST` en `src/core/composer.js`.
- **Estatua, anillos y corona**: `src/modules/estatua/config.js` (`STATUE`, `ANILLOS`, `CORONA`, `ESTATUA_MODELO`).
- **Textos de la película** (capítulos, créditos): `src/ui/pelicula.js`.

## Control de calidad (con el servidor de desarrollo corriendo)
```bash
node scripts/qa-luz.mjs http://localhost:5173 salida hero:0.5:nointro sala:3.5:nointro   # capturas 1920x1080 + celular
node scripts/qa-pelicula.mjs http://localhost:5173 salida apertura,capitulo,creditos     # la película (cuadros exactos)
EXTRA=resfija node scripts/qa-rendimiento.mjs http://localhost:5173 salida.json high,medium,low
node scripts/qa-caida-traza.mjs http://localhost:5173 celular low                        # la caída medida desde la página
node scripts/qa-tirones.mjs http://localhost:5173 high 24                                # dónde están los cuadros lentos
node scripts/qa-peso.mjs http://localhost:4199                                           # peso real del build
```
Para medir: cerrá juegos y otras pestañas con 3D (comparten la placa de video y falsean los números).

## Assets
Los originales viven en `../ASSET/Public`; acá solo hay versiones optimizadas. Cada una se regenera con un script de
`scripts/assets/` (cielos, estrellas, texturas, LUTs, fuente, sonidos, silueta, STL→GLB). Licencias y créditos:
`public/assets/CREDITOS.txt`.

## Créditos obligatorios
"Nike of Samothrace" de p_moraiti (Sketchfab), CC BY 4.0 · Vía Láctea: Y. Beletsky (LCO)/ESO, CC BY 4.0. Están en
los créditos finales de la página: no sacarlos.
