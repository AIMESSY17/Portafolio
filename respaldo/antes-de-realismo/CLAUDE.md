# CLAUDE.md — Portafolio "Samotracia"

Este archivo es el CONTRATO del proyecto. Lo leen los dos desarrolladores y sus Claude Code.
Claude Code: leé este archivo entero antes de cualquier cambio y respetalo siempre. Si algo que te piden choca con este contrato, NO lo hagas: avisá y proponé cómo resolverlo.

> **Versión 2.0 — "Hecha de luz"** (noviembre 2026). Transformación completa; donde este bloque choca con lo de abajo, manda este bloque:
> - **Guion único** en `src/config/historia.js` (cielo de día → las nubes se derriten y la cámara las atraviesa → atardecer sobre el mar con las salas → orilla a la hora azul). Secciones: `hero`, `descenso`, `obras`, `contacto` (`config/sections.js`).
> - **Diagramación compartida** en `src/config/layout.js`: rectángulo de la ventana grande de cada sala y de su ficha de texto (la estatua y la ui usan el mismo).
> - **Fondo** = cielo, nubes horneadas, mar con reflejo por CubeCamera (solo al cambiar de sala), destellos, luces y entornos por sala (`fondo/luz-*.js`). El fondo viejo "Claroscuro" queda en `fondo/claroscuro.js` (`FONDO_VIEJO = false`).
> - **Estatua** = Victoria + alas de luz (`alas.js`) + tótem de pantallas con capturas como texturas WebGL (`totem.js`) + figura de luz en Contacto. La v6 queda en `index-v6.js` (`ESTATUA_V6 = false`). Ya no se usan iframes en CSS3D: el iframe real vive solo en el visor (al hacer clic) y se destruye al cerrar.
> - **Cámara:** sí se mueve con el scroll (encuadres por momento y un ángulo distinto por sala), siempre vía `cameraRig.set()`, que acepta `minWidth` por pose.
> - **shared.sol** `{ dir, color, noche }`: ESCRIBE fondo, LEE estatua.
> - **Tipografía:** Instrument Serif (nombres y títulos) + Inter Tight fina y chica (datos). Sin mayúsculas apretadas, sin Hanken ni Cormorant.
> - **Una sola curva:** `expo.out` para entradas, `power3.inOut` para transiciones (también en CSS: `--ease-entrada`, `--ease-mov`).
> - **Rendimiento:** `core.prewarm()` compila y sube todo antes de sacar el velo de carga. Ningún material cambia de transparente a opaco ni cambia la cantidad de luces en vivo (recompila). Bloom: high 0,62 · medium 0,40 · low apagado. Partículas de alas: 6000/3000/1000. Destellos: 4200/2600/900. Low: 2 capas de nubes, sin olas en el vértice, fundido en vez de pixel sorting.
> - Decisiones y porqués: `referencias/DECISIONES.md`. Control de calidad: `scripts/qa-*.mjs`.

## 1. Qué es el proyecto
Portafolio web 3D. La Victoria de Samotracia, hecha de luz, baja del cielo al mar (la original se posa sobre la proa de un barco). Las obras son sitios web **reales**: sus capturas arman un tótem de pantallas y cada una tiene su sala; el sitio real se abre en un visor al hacer clic.

Concepto: "Hecha de luz". Todo el brillo es dorado. Imponente, soñado, elegante; nada de videojuego.

## 2. Dueños de cada parte
| Parte | Dueño | Carpeta |
|---|---|---|
| Fondo, luces globales, viento, partículas, ambiente | [NOMBRE_1] | `src/modules/fondo/` |
| Estatua + navegadores orbitando + apertura de proyectos | [NOMBRE_2] | `src/modules/estatua/` |
| Núcleo compartido (renderer, capa HTML, cámara, scroll, loop, calidad) | LOS DOS (cambios acordados) | `src/core/` |
| Datos de proyectos, config de secciones | LOS DOS | `src/data/`, `src/config/` |
| Capa de texto HTML (títulos, contacto, menú) | LOS DOS | `src/ui/`, `index.html` |

Regla de oro: cada uno edita SOLO su carpeta de módulo. `src/core/`, `src/data/`, `src/config/`, `src/ui/`, `index.html` y `package.json` se tocan solo con acuerdo de los dos (ver sección 12).

## 3. Stack (fijo, no cambiar sin acuerdo)
- Vite (vanilla JS, módulos ES). Sin React.
- Three.js con WebGLRenderer (máxima compatibilidad). Una eventual migración a WebGPU se decide en conjunto.
- **CSS3DRenderer** (de three/examples) para la capa HTML 3D de los iframes. Lo administra el core (sección 5b).
- GSAP + ScrollTrigger para animaciones. **El ticker de GSAP es el loop único** del sitio.
- Lenis para scroll suave (lo actualiza el loop del core).
- Post-procesado: EffectComposer de three/examples/jsm (lo administra el core, hoy vacío).
- Modelos en .glb comprimidos (Meshopt o Draco). Texturas en .webp o .ktx2. Los decodificadores están en `public/libs/`.
- Deploy: GitHub → Vercel.

### Pipeline de modelos (escaneos pesados)
Los escaneos suelen pesar decenas de MB. Antes de subirlos:
1. Simplificar (meshoptimizer `simplify`, o Blender → Decimate) a ~100–200k triángulos.
2. Si no hay texturas, sacar UV y normales: el runtime recalcula normales.
3. `quantize` + `meshopt` (compresión) con `@gltf-transform`.
4. Generar además una versión liviana (`-lod0`, ~25k triángulos) para mostrar algo enseguida.
Así se hizo `victoria.glb` (583 KB, 180k triángulos) y `victoria-lod0.glb` (87 KB) a partir de un original de 32 MB.

## 4. Estructura de carpetas
```
/
├─ CLAUDE.md                ← este contrato
├─ README.md                ← cómo correr, probar y deployar
├─ index.html               ← capas: #stage (3D), #content (texto), #overlay (módulos)
├─ vite.config.js
├─ package.json
├─ scripts/
│  └─ check-embeds.mjs      ← dice qué proyectos se pueden embeber en iframe
├─ public/
│  ├─ libs/ (draco, basis)  ← decodificadores
│  └─ assets/
│     ├─ fondo/             ← assets de [NOMBRE_1]
│     └─ estatua/           ← assets de [NOMBRE_2] (victoria.glb, victoria-lod0.glb)
└─ src/
   ├─ main.js               ← arma todo: crea el core y monta los módulos; ?only=; sin-WebGL
   ├─ core/
   │  ├─ index.js           ← createCore(): junta todo y monta módulos
   │  ├─ renderer.js        ← único renderer y único <canvas> (alpha: true)
   │  ├─ htmlLayer.js       ← capa HTML 3D (CSS3DRenderer) debajo del canvas
   │  ├─ camera.js          ← única cámara + cameraRig (parallax, ajuste mobile, focus)
   │  ├─ loop.js            ← único loop (ticker de GSAP)
   │  ├─ scroll.js          ← Lenis + ScrollTrigger, expone scrollState, lock/unlock
   │  ├─ quality.js         ← detecta 'high' | 'medium' | 'low' y baja si faltan fps
   │  ├─ loader.js          ← GLTFLoader con Draco/Meshopt/KTX2
   │  ├─ bus.js             ← eventos entre módulos
   │  ├─ shared.js          ← estado compartido (viento, mouse, etc.)
   │  └─ composer.js        ← post-procesado
   ├─ modules/
   │  ├─ fondo/index.js     ← export default createFondo(ctx)
   │  └─ estatua/
   │     ├─ index.js        ← export default createEstatua(ctx) + API pública
   │     ├─ config.js       ← TODO lo ajustable (posiciones, órbitas, tiempos, luces)
   │     ├─ statue.js       ← modelo, mármol, flotación
   │     ├─ windows.js      ← ventanas con iframe, órbita, hover
   │     ├─ viewer.js       ← segunda capa (proyecto abierto)
   │     └─ estatua.css
   ├─ data/projects.json    ← lista de proyectos (compartido)
   ├─ config/sections.js    ← secciones del scroll (compartido)
   └─ ui/                   ← HTML/CSS de la capa de texto
```

## 5. La interfaz de módulo (LO MÁS IMPORTANTE)
Cada módulo exporta por defecto una función que recibe `ctx` y devuelve un objeto con estos métodos:

```js
// src/modules/<nombre>/index.js
export default function createModulo(ctx) {
  const root = ctx.root;   // THREE.Group propio del módulo. TODO lo WebGL del módulo va acá.
  return {
    update(time, delta, scrollState) {}, // cada frame, desde el loop del core
    resize(width, height) {},            // al cambiar el tamaño de ventana
    setQuality(tier) {},                 // 'high' | 'medium' | 'low'
    dispose() {},                        // liberar geometrías, materiales, texturas, DOM y listeners
    api: {},                             // OPCIONAL: funciones públicas (ver 5c)
  };
}
```

El `ctx` que entrega el core:
```js
ctx = {
  THREE,          // misma instancia de Three.js para todos
  scene,          // la escena única (NO agregar cosas directo: usar root)
  camera,         // SOLO LECTURA
  cameraRig,      // para mover la cámara: set() (scroll), focus()/release() (aperturas)
  renderer,       // SOLO LECTURA (salvo excepciones de la sección 7)
  root,           // THREE.Group exclusivo del módulo (escena WebGL)
  htmlRoot,       // THREE.Group exclusivo del módulo en la capa HTML 3D (CSS3DObject)
  overlay,        // <div> fijo por encima de todo, para DOM del módulo (etiquetas, visores)
  bus,            // eventos: bus.on(nombre, fn) → devuelve "off", bus.emit(nombre, datos), bus.off(...)
  shared,         // estado compartido (ver sección 8)
  scroll,         // lock()/unlock()/scrollTo(): para bloquear el scroll con algo abierto
  apis,           // APIs públicas de los módulos montados: apis.estatua, apis.fondo
  quality,        // tier inicial
  loader,         // GLTFLoader ya configurado con Draco/Meshopt/KTX2
  assetsPath,     // '/assets/<nombre-del-modulo>/'
  isMobile, reducedMotion,
}
```

### Prohibido dentro de un módulo
- Crear otro renderer WebGL, otro `<canvas>`, otra cámara u otro `requestAnimationFrame` (usar `update`).
- Escuchar `scroll` o `wheel` por su cuenta (usar `scrollState`). Escuchar `pointer*` está permitido.
- Mover la cámara directo (usar `cameraRig`).
- Tocar `scene.background`, `scene.fog`, `scene.environment` (salvo el módulo fondo).
- Tocar `renderer.toneMapping` u `outputColorSpace` (nadie). El fondo puede tocar `renderer.toneMappingExposure` (ej. oscurecer en `project:open`).
- Modificar objetos que no estén dentro de su propio `root` / `htmlRoot` / su DOM.
- Editar archivos de la carpeta del otro módulo.
- Instalar dependencias sin avisar.

### 5b. Capa HTML 3D y "perforación" del canvas (para iframes)
WebGL no puede dibujar una página web. Por eso:
- Debajo del canvas hay una capa CSS3D (`htmlLayer`) que usa **la misma cámara**: un `CSS3DObject` y un mesh con la misma matriz coinciden al píxel.
- El canvas WebGL es transparente (`alpha: true`). Cada ventana tiene un mesh "perforador" con `blending: NoBlending` y opacidad 0: escribe alpha 0 y deja ver el iframe de abajo. Como escribe profundidad, lo que esté delante (la estatua, partículas) se dibuja encima normalmente.
- Consecuencias para todos:
  - El bloom selectivo del core (capa 1: `obj.layers.enable(1)`) suma luz con `blendFuncSeparate(DST_ALPHA, ONE, ZERO, ONE)`: no toca el alpha y no ilumina las ventanas perforadas.
  - El post-procesado debe **conservar el canal alpha**. Si un efecto no lo conserva, rompe las ventanas: se prueba antes de mergear.
  - Nadie dibuja quads de pantalla completa opacos *después* de la escena (taparían los iframes).
  - Partículas delante de las ventanas: se ven bien (se dibujan encima del agujero).
- Las ventanas de la órbita y de las salas muestran una CAPTURA del sitio (imagen). El iframe real se carga SOLO al hacer clic en la ventana (en el visor) y se destruye al cerrarlo. Las ventanas no reciben clics del DOM (`pointer-events: none`): la interacción es por raycast, y solo cuentan las ventanas visibles.
- Arrastrar en horizontal gira SOLO la estatua (grupo `estatua_giro`); los proyectos orbitan por su cuenta. Por eso `html, body` tienen `touch-action: pan-y`: el gesto horizontal es para girar y el vertical sigue siendo scroll. Nadie más usa el arrastre horizontal.

### 5c. APIs públicas de módulos
Un módulo puede devolver `api`. El core la publica en `ctx.apis.<nombre>`. Sirve para que el sistema de scroll (fondo) controle la estatua sin tocar su código. La API de estatua está documentada en el README y en `src/modules/estatua/index.js`:
`apis.estatua.set({ statue, projects, intensity, visible, camera }, { duration, ease })`, `setStatue`, `setProjects`, `setIntensity`, `setVisible`, `setCamera`, `setRotation` (giro de la estatua sola; los proyectos orbitan por su cuenta), `setOrbitSpeed`, `setReveal` (dibujo dorado a mano), `focusProject(id)` (lo trae al frente de la órbita), `open(id)`, `close()`, `getState()`, `ready`.

## 6. Sistema de coordenadas y escala (acordado, no cambiar)
- Unidades: 1 unidad = 1 metro.
- Estatua centrada en (0, 0, 0), apoyada en y ≈ 0 (flota hasta +0.25), mirando hacia +Z (vista de tres cuartos). Altura aprox. 3 unidades.
- Cámara por defecto en (0, 1.6, 9), mirando a (0, 1.5, 0), FOV 35 (FOV 42 en celular).
- **Ajuste por pantalla angosta:** el `cameraRig` aleja la cámara hasta que se vea un ancho mínimo en z = 0 (10 m en escritorio, 4.1 m en celular vertical). Sin esto, en celular los navegadores quedaban fuera de cuadro.
- La cámara casi no se mueve. Solo parallax suave con mouse/giroscopio (máx. ±0.3) que maneja el core. El efecto de "bajar" al scrollear se logra moviendo el contenido del fondo (o vía `apis.estatua`), no la cámara. Excepción: `cameraRig.focus()` al abrir un proyecto.
- Zona reservada para la estatua y los navegadores: cilindro de radio 6 alrededor del eje Y, de y = -1 a y = 6.
  - El fondo no pone objetos sólidos dentro de esa zona.
  - Solo pueden atravesarla partículas livianas (polvo, pétalos, hojas) con opacidad baja.
  - Escritorio: los navegadores orbitan entre radio 3 y radio 5.
  - **Celular vertical:** órbita más cerrada (radio ~1.5), dos ventanas arriba de la estatua (y ≈ 4.3) y dos abajo (y ≈ 0.2).
- El fondo vive principalmente en z < -6 (detrás) y en los laterales fuera del cilindro.

## 7. Luces, materiales y color
- El módulo fondo es dueño de la iluminación global: luz ambiente, luz principal, la "vela" que sigue al cursor, `scene.environment`, `scene.background` y `scene.fog`.
- El módulo estatua NO agrega luces globales. Usa MeshStandardMaterial o MeshPhysicalMaterial para que la luz del fondo la ilumine de verdad.
- Acabado de la estatua: mármol marfil pulido con detalles en oro (puntas y crestas de las alas, corte del cuello, cinta bajo el pecho, filetes del pedestal, toques en los pliegues y grietas tipo kintsugi). Es todo procedural, en `src/modules/estatua/gilding.js`, sin texturas. Las zonas se ajustan en `GOLD` (config.js) y se ven en rojo con `/?only=estatua&gold=debug`. El oro es metal (metalness 1): brilla según `scene.environment`, así que si el fondo cambia el mapa de entorno, conviene revisarlo junto.
- Luces de contorno de la estatua (acordadas): dos `PointLight` dentro de su root, con nombre `estatua_rim_*`, apagadas en calidad low.
- Color y tono (lo configura el core, **nadie lo cambia**):
  - `renderer.outputColorSpace = THREE.SRGBColorSpace`
  - `renderer.toneMapping = THREE.ACESFilmicToneMapping`
  - El fondo puede ajustar `renderer.toneMappingExposure`.
  - Texturas de color en sRGB, el resto (normal, roughness) en lineal.
- Paleta compartida (usar estos hex, no inventar otros sin acuerdo):
  - Mármol: #EDE6DA · Mármol sombra: #B9AE9C
  - Oro: #C9A227 · Oro brillo: #F1D27A
  - Sepia tinta: #5B3A1E · Pergamino: #E8D9B5
  - Azul fresco: #5D7FA3 · Rojo terracota: #A4472E
  - Fondo oscuro: #14100B
- Tipografías: Inter Tight en mayúsculas y apretada (marca, menú, títulos de sección y nombres de proyectos, `--font-grotesk`), Instrument Serif (título principal), Cormorant Garamond itálica (cursivas, `--font-italic`) + Hanken Grotesk (textos chicos y UI).

## 8. Comunicación entre módulos
### scrollState (llega en cada update)
```js
scrollState = {
  progress,        // 0 a 1, todo el recorrido
  velocity,        // velocidad del scroll (positiva bajando)
  section,         // índice de la sección actual (de config/sections.js)
  sectionProgress, // 0 a 1 dentro de la sección actual
}
```
### shared (lectura para todos, escritura solo por su dueño)
```js
shared = {
  wind:   { x, y, z, strength }, // ESCRIBE: fondo. LEE: estatua (los navegadores tiemblan)
  pointer:{ x, y },              // ESCRIBE: core. Normalizado -1 a 1, suavizado
  tilt:   { x, y },              // ESCRIBE: core. Giroscopio en celular
  focusProjectId: null,          // ESCRIBE: estatua. Proyecto con hover
  reducedMotion: false,          // ESCRIBE: core. prefers-reduced-motion
}
```
### Eventos del bus
| Evento | Lo emite | Datos | Uso sugerido |
|---|---|---|---|
| `project:hover` | estatua | `{ id }` o `{ id: null }` | el fondo puede enfocar la luz o atenuar |
| `project:open` | estatua | `{ id }` | el fondo puede oscurecerse / hacer transición |
| `project:close` | estatua | `{}` | volver al estado normal |
| `estatua:ready` | estatua | `{}` | la estatua ya es visible (el fondo puede arrancar su intro) |
| `section:change` | core | `{ index, id }` | ambos reaccionan |
| `wind:gust` | fondo | `{ strength }` | ráfaga: la estatua sacude navegadores |
| `sala:change` | ui | `{ id, progress }`: `id` = proyecto de la sala actual, o `null` en el hero y en contacto; `progress` = 0–1 dentro de la sala | la estatua se corre y la ventana del proyecto queda grande; el fondo cambia de mundo. Se emite al entrar/salir de una sala y mientras `progress` cambia (≥ 0.004); el objeto del payload se reutiliza, no lo guardes |
| `quality:change` | core | `{ tier }` | (además se llama `setQuality`) |
| `precompile` | estatua, fondo | `{ on: true }` al empezar a precompilar shaders/geometrías, `{ on: false }` al terminar | el core no mide fps mientras tanto |

Para agregar un evento nuevo: se agrega a esta tabla primero.

Precompilado: cada módulo debe dejar sus piezas ocultas (torsos, partes de oro, etc.) compiladas y subidas a la placa de video al terminar de cargar (`renderer.compileAsync` recorre también los objetos ocultos), para que ninguna se compile en medio del scroll. Avisa con `precompile` mientras lo hace.

## 9. Datos compartidos
`src/data/projects.json`:
```json
[
  {
    "id": "armando-medialunas",
    "title": "Armando Medialunas",
    "author": "[NOMBRE]",
    "url": "https://...",
    "embed": "iframe",
    "localPath": "",
    "description": "Aplicación empresarial orientada a la gestión y evaluación de empleados.",
    "rubro": "Estudio de tatuajes",
    "linea": "Una línea de qué hicimos.",
    "tags": ["app", "gestión"],
    "accent": "#C9A227"
  }
]
```
- `rubro` y `linea`: el rubro del cliente (cursiva) y una línea de qué hicimos; salen en el panel de la sala.
- `captura` (se completa sola con `npm run capturas`): imagen de la ventana, `/assets/capturas/<id>.webp` (1440×900, ≤ 150 KB, generada con Playwright desde `url`). Sin captura (proyecto sin URL) la ventana muestra un placeholder con el nombre y el rubro. Si cambia un sitio: `npm run capturas` (o `npm run capturas -- <id>`).
- `year` (opcional): si está, se muestra en la placa del pedestal.
- `embed`: `"iframe"` (el sitio real por `url`), `"local"` (una vista propia del portfolio en `localPath`, ej. `/demos/zurklima/index.html` dentro de `public/`) o `"none"` (sin vista: se muestra el nombre y la descripción, sin inventar nada).
- Antes de publicar: `npm run check-embeds` dice qué sitios bloquean iframes (X-Frame-Options / CSP `frame-ancestors`). **No se intenta saltear esos bloqueos.** Si el sitio es nuestro, se permite el dominio del portfolio en `frame-ancestors`; si no, se usa `"local"`.
- Los navegadores leen de acá. Nadie hardcodea proyectos dentro de su módulo.

`src/config/sections.js`: lista de secciones del scroll con su id y su alto en pantallas: `hero`, `obras` (UNA SALA de 100vh por proyecto: su alto es la cantidad de proyectos) y `contacto`. Los módulos reaccionan a `sala:change` (sección 8) y a `section:change`. `src/config/contacto.js`: WhatsApp y mail de la sección Contacto (si un campo está vacío, ese link no se muestra).

## 10. Calidad y rendimiento (obligatorio)
El core detecta un tier y llama `setQuality(tier)` en cada módulo. Cada módulo DEBE implementar los tres.
**Calidad adaptativa** (`core/quality.js`): no mide en los primeros 4 s después de cargar ni mientras algún módulo precompila (evento `precompile`). Baja UN tier solo si los fps están debajo del objetivo 3 s seguidos (nunca de high a low de golpe) y avisa (`quality:change`). Puede volver a subir un tier si anda sobrado (≥ 57 fps) 10 s seguidos, hasta el tier con el que arrancó; si esa subida falla, la próxima espera el doble. Con `?quality=low|medium|high` queda fija y el monitor no la mueve.

| | high (PC buena) | medium (PC común) | low (celular) |
|---|---|---|---|
| Objetivo | 60 fps | 60 fps | 30+ fps |
| Partículas fondo | hasta 4000 | hasta 1500 | hasta 400 |
| Sombras | sí | suaves/limitadas | no |
| Post-procesado | completo | básico | ninguno o mínimo |
| Pixel ratio | min(devicePixelRatio, 1.5) | min(devicePixelRatio, 1.25) | 1 |
| Luces rim estatua | sí | sí | no |
| Vetas del mármol | sí | sí | suaves |
| Grietas doradas (kintsugi) | sí | sí | no |
| Bloom selectivo (oro de la estatua, capa 1) | 0.4 | 0.25 | apagado |

Presupuestos de peso (comprimido):
- Estatua: ≤ 3 MB (modelo + texturas). Hoy: 670 KB.
- Fondo: ≤ 6 MB en total.
- Cada thumbnail de proyecto: ≤ 150 KB (.webp).

Otras reglas: las ventanas usan capturas (no hay iframes cargando en segundo plano); el iframe real se crea solo al abrir un proyecto y al cerrarlo se destruye (`about:blank` + remove). Con la pestaña oculta el loop se pausa. Con `prefers-reduced-motion` no hay flotación, órbita ni parallax, y las transiciones son fundidos cortos. Sin WebGL se muestra la capa de texto con una lista de proyectos que abre el mismo visor.

Si un efecto no entra en el presupuesto, se recorta o se apaga en low. Fluidez antes que detalle.

## 11. Modo aislado (para trabajar cada uno por su lado)
`main.js` soporta el parámetro `?only=`:
- `?only=fondo` → monta solo el fondo + un placeholder de la estatua (cápsula gris de 3 de alto en el origen) para ver la escala real.
- `?only=estatua` → monta solo la estatua + un placeholder de luz (luz ambiente + direccional neutra) y fondo #14100B.
- Sin parámetro → todo junto.

En desarrollo hay atajos en la consola del navegador: `window.core` y `window.estatua` (la API). No existen en producción.

## 12. Flujo de Git
- Repo único en GitHub. Rama `main` siempre funciona y está deployada en Vercel.
- Ramas de trabajo: `fondo/<fase>` (ej. `fondo/f1-escena`) y `estatua/<fase>` (ej. `estatua/e1-modelo`).
- Antes de empezar cada día: `git pull origin main` y mergear `main` en la rama propia.
- Cambios al core / data / config / ui / index.html / package.json: rama `core/<descripcion>`, Pull Request, y el otro lo revisa antes de mergear.
- Commits chicos con prefijo: `fondo:`, `estatua:`, `core:`, `ui:`, `data:`.
- Nunca forzar push a `main`.

## 13. Instrucciones para Claude Code (ambos)
1. Leé este CLAUDE.md completo antes de tocar algo.
2. Preguntá (o deducí por la rama) de qué módulo es dueño quien te habla, y trabajá solo en esa carpeta y su carpeta de assets.
3. Si para hacer lo pedido necesitás cambiar el core, data, config, ui o dependencias: no lo hagas. Explicá qué cambio haría falta y por qué, para que se acuerde entre los dos.
4. Respetá la interfaz de módulo (sección 5), la capa HTML (5b), las coordenadas (6), la iluminación (7) y los eventos (8).
5. Implementá siempre los tres tiers de calidad y `dispose()`.
6. Probá en modo aislado (`?only=`) y en modo completo antes de dar algo por terminado.
7. Probá en vista de celular. Mobile primero.
8. Explicá las decisiones en criollo, sin jerga innecesaria.

## 14. Créditos obligatorios
El modelo de la estatua es "Nike of Samothrace" de p_moraiti (Sketchfab), licencia CC BY 4.0. El crédito tiene que quedar visible en el sitio (está en el pie de la sección Contacto). No sacarlo.
