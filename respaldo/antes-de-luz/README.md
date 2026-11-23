# Samotracia — Portfolio 3D

La Victoria de Samotracia flotando en el centro y nuestros proyectos web reales orbitando alrededor. Al hacer clic en uno, se abre adelante sin salir del portfolio.

## Arrancar
```bash
npm install
npm run dev          # http://localhost:5173 (también accesible desde el celular en la misma red)
npm run build        # genera dist/ para Vercel
npm run check-embeds # revisa qué proyectos se pueden mostrar en iframe
npm run preview:file # genera preview/index.html: vista previa en un solo archivo (doble clic, sin servidor)
```

## Probar
| URL | Qué muestra |
|---|---|
| `/` | todo junto |
| `/?only=estatua` | solo estatua + ventanas, con luz neutra |
| `/?only=fondo` | solo fondo + cápsula de 3 m donde va la estatua |
| `/?quality=low` | fuerza calidad de celular (también `medium`, `high`) |

En celular: abrí la URL "Network" que muestra `npm run dev` desde el teléfono (misma Wi-Fi).

## Cargar los proyectos (lo primero que hay que hacer)
Todo sale de **`src/data/projects.json`**: `title`, `rubro` (cursiva), `linea` (qué hicimos), `url` y `accent`. La sección Obras arma **una sala por proyecto** sola.
- **Capturas:** las ventanas muestran una imagen del sitio. `npm run capturas` las genera con Playwright (usa tu Chrome instalado) en `public/assets/capturas/<id>.webp`, 1440×900. Para uno solo: `npm run capturas -- tinta-negra`. Los proyectos sin `url` quedan con un placeholder con el nombre.
- El sitio real (iframe) solo se carga al hacer clic en la ventana. Antes de publicar: `npm run check-embeds` dice cuáles bloquean iframes.
- **Contacto:** completá WhatsApp y mail en `src/config/contacto.js`.

## Ajustar la escena
Todo lo ajustable de la estatua y las ventanas está en **`src/modules/estatua/config.js`**: posición, escala, flotación, giro, órbitas (por separado escritorio y celular), tamaños, velocidades, hover, luces de contorno y tiempos de apertura.

## Órbita de proyectos y giro de la estatua
- **Los proyectos orbitan solos, siempre**: una vuelta por minuto, repartidos parejo. En escritorio van en dos anillos que se cruzan (uno bajo y cerca, r 3,4, y otro alto y lejos, r 4,6) con una onda vertical lenta; en celular, un solo anillo cerrado (r 1,6) por encima de la cabeza de la estatua. Todo en `WINDOWS` (config.js).
- Miran siempre a la cámara con un leve giro hacia afuera. Los que pasan por detrás se achican y se apagan un poco; los que pasan por detrás de la estatua no se pueden clickear.
- **Hover**: la órbita se frena suave, ese navegador se agranda y se ilumina, el resto se atenúa. Al salir retoma.
- El **destacado** es el más cercano a la cámara. Las flechas ← → traen el siguiente o el anterior al frente (queda un poco corrido a la derecha para no tapar la estatua).
- **Arrastrar** (mouse o dedo, en horizontal) gira SOLO la estatua, con inercia y sin "snap". Los navegadores no giran con ella. Un clic corto sigue abriendo el proyecto. Se ajusta en `ROTATE`.
- La órbita sigue a la estatua si se mueve (scroll o API) pero no copia su giro.

## Placa del pedestal
Una placa de oro grabada en el frente del pedestal muestra el proyecto destacado (o el que tiene hover), con un destello al cambiar. Si un proyecto tiene `"year"` en `projects.json`, el año aparece en la placa. Tamaño y posición en `PLAQUE` (config.js).

## Mármol marfil y oro
El acabado se arma en el shader (sin texturas, no suma peso). Las zonas doradas se ajustan en `GOLD` dentro de `src/modules/estatua/config.js`:
- `wing`: crestas de las plumas y puntas de las alas · `neck`: corte del cuello · `belt`: cinta bajo el pecho
- `base`: filetes del pedestal · `drapery`: pan de oro en las crestas del manto · `kintsugi`: grietas doradas
- `amount`: 0 apaga todo el oro, 1 lo deja completo.
- `legs`: hilos de oro que suben por las piernas (coreografía de scroll) · `wing.span`: dónde termina la punta del ala al "pintarla".
Para ver exactamente dónde cae el oro: `/?only=estatua&gold=debug` (se pinta en rojo).

## Qué hace la estatua con el scroll (v6)
Es automático: lo calcula el módulo con `scrollState` (no hace falta llamar a la API). Los tiempos están en `REVEAL` (config.js) y usan los índices de `config/sections.js`.
- **Proyectos → Contacto**: el dibujo dorado avanza con el scroll. Primero el boceto de la silueta (`SKETCH`), después la cabeza y los brazos (`partes-oro.glb`, `PARTS`) aparecen flotando separados, primero como líneas y después rellenos de oro; las alas se pintan desde la punta y el oro sube por las piernas.
- **Sobre nosotros**: las ventanas se apartan y la cámara se acerca a la cabeza dorada, con un dibujo de detección (círculos, regla, corchetes y un barrido) en líneas doradas.
- **Contacto**: la estatua baja y aparecen dos torsos de mármol partidos en diagonal que el metal se va comiendo (`TORSOS`, el segundo viene de `torso-2.glb`). Arrastrar gira los torsos.
- Para forzarlo a mano: `estatua.setReveal(0..1)` (`null` vuelve a seguir al scroll).

## Resplandor (bloom)
Lo hace el core (`src/core/composer.js`), solo sobre el **oro de la estatua** y sus partes de oro (capa 1 de la cámara). High 0,4 · medium 0,25 · low apagado. Es una suma de luz sobre la pantalla que **no toca el alpha**: las ventanas perforadas siguen mostrando sus iframes. Para que algo brille: `obj.layers.enable(1)`.

## API para el sistema de scroll (para [NOMBRE_1])
Desde el módulo fondo (o cualquier módulo): `ctx.apis.estatua`. En la consola de desarrollo: `estatua`.

```js
const e = ctx.apis.estatua;

// Todo junto, animado 1.2 s
e.set({
  statue:   { position: { y: 1 }, rotation: { y: 0.4 }, scale: 0.8 },
  projects: { position: { y: -0.5 }, radiusScale: 1.2, visible: true },
  intensity: 0.5,                                   // 0 = quieto, 1 = normal
  camera:   { position: { x: 0, y: 2, z: 10 }, target: { y: 1.8 } },
}, { duration: 1.2, ease: 'power2.inOut' });

e.setStatue({ position: { x: -1.5 } }, { duration: 0.8 });
e.setProjects({ visible: false });
e.setIntensity(0);
e.setVisible(false);       // oculta todo el módulo
e.setRotation(Math.PI, { duration: 1.5 }); // gira SOLO la estatua (lo mismo que arrastrar); los proyectos siguen orbitando
e.setOrbitSpeed(0.5, { duration: 1 });    // velocidad de la órbita de proyectos (1 = una vuelta por minuto)
e.setReveal(0.5);          // dibujo dorado a mano (null = sigue al scroll)
e.focusProject('ginashop'); // lo trae al frente de la órbita (sin abrirlo)
e.open('ginashop');        // abre un proyecto
e.close();
e.getState();              // posiciones, giro, proyecto abierto, hover y destacado
await e.ready;             // la estatua ya se ve
```
Ejemplo con scroll (dentro de `update` del fondo): `e.setStatue({ position: { y: scrollState.progress * 2 } })` — sin `duration` es inmediato y no reinicia nada.

Eventos que emite: `project:hover`, `project:open`, `project:close`, `estatua:ready` (tabla en CLAUDE.md, sección 8).

## Cómo funcionan las ventanas con sitios reales
- El canvas WebGL va **encima** de una capa HTML 3D (CSS3DRenderer) que usa la misma cámara.
- Cada ventana "perfora" el canvas (escribe transparencia) y deja ver su iframe real debajo. Por eso la estatua puede pasar por delante de un sitio.
- Al hacer clic se abre la "segunda capa": un panel grande con el sitio funcionando (scroll, botones, formularios). La cámara se acerca a la ventana elegida, la órbita sigue de fondo más lenta y el scroll de la página se bloquea. Al cerrar (✕, Esc o clic afuera) todo vuelve exactamente a donde estaba.
- El sitio abierto no puede sacar al visitante del portfolio (sandbox sin navegación de la página principal). El botón ↗ lo abre en otra pestaña, solo si el visitante lo elige.

## Créditos
Modelo 3D: "Nike of Samothrace" por p_moraiti (Sketchfab), CC BY 4.0, optimizado para web. El crédito es obligatorio y está en el pie del sitio.
