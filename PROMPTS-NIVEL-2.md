# Samotracia: prompts para el Nivel 2

Prompts listos para pegar en Claude Code, uno por fase y en orden.
Cada uno arranca pidiendo que lea `CLAUDE.md`. Las fases que tocan partes de los dos dicen quién tiene que estar de acuerdo.

| Fase | Qué cambia | De quién es | Rama |
|---|---|---|---|
| 1 | Fondo más fluido y más lindo | Tuyo (fondo) | `fondo/n2-fluidez` |
| 2 | Ventanas: órbita propia, giro solo de la estatua y páginas reales | De tu amigo (estatua): **que lo apruebe él** | `estatua/n2-orbita` |
| 3 | Interfaz sin tarjetones: Proyectos, Nosotros y Contacto | De los dos (ui + index.html) | `core/n2-interfaz` |
| 4 | Resplandor (bloom) en el oro y las brasas | De los dos (núcleo) | `core/n2-bloom` |
| 5 | Links reales de las 7 páginas | De los dos (data) | `core/n2-links` |

Antes de la Fase 5, completá los links que faltan (ver al final).

---

## Fase 1: Fondo más fluido y más lindo (tuyo)

```
Leé CLAUDE.md entero. Soy el dueño del módulo FONDO (src/modules/fondo/). Trabajá solo ahí y en public/assets/fondo/. Rama: fondo/n2-fluidez.

Objetivo: que el fondo "Claroscuro" vaya a 60 fps en una PC común y a 30+ en celular, sin perder lo que lo hace lindo. Medí antes y después: agregá en modo desarrollo (import.meta.env.DEV) un panel chico con fps, draw calls y triángulos (renderer.info), que se prenda con ?stats.

Cambios de rendimiento:
1. templo.js: hoy son ~280 mil puntos (20 columnas × 14.000). Bajá a 6.000 por columna en high, 3.000 en medium y 1.500 en low (con setQuality). Con 14 columnas alcanza: sacá las 2 de cada punta del anillo de atrás.
2. luz.js: la sombra del sol cuesta mucho y casi no se ve. Dejala solo en high, con mapa de 512, y que se recalcule solo cuando el sol se mueve (shadow.autoUpdate = false y needsUpdate = true mientras gira).
3. obsidiana.js: reflejo al 50% de resolución en high y al 33% en medium. Si la bajada automática de calidad baja a medium, que no se note el salto (fundido de 0,4 s).
4. cielo.js: el shader del cielo calcula fbm en cada píxel de la pantalla. Que el humo de tinta solo se calcule si uInk > 0.01, la disolución solo mientras uMix < 1 y la visión nocturna solo si uScan > 0.01 (usá if en el shader). Bajá fbm a 4 octavas.
5. polvo.js: en reposo dibujá solo 20.000 partículas. Las 90.000 completas solo mientras hay un emblema (hover), con fundido.
6. tipografia.js: curveSegments 6 y bevelSegments 2. Las palabras que no se ven (target 0 y v < 0,01) tienen que quedar con visible = false.
7. Ninguna creación de objetos dentro de update() (Vector3, Color): todo reutilizado.
8. Con la pestaña oculta no se hace nada (el core ya pausa, verificalo).

Cambios visuales:
9. Al cambiar de sección, que las letras nuevas entren con un leve brillo dorado que recorre el filo (un destello que pasa de izquierda a derecha en 0,8 s, con una uniform en el material del borde).
10. Las brasas: que algunas (10%) dejen una estela corta (alargar el punto en la dirección del movimiento en el shader).
11. El haz de luz: agregale "rayos de Dios" dentro del cono (2 o 3 bandas más densas que se mueven muy lento).
12. Al pasar de una sección a otra, que el piso de obsidiana suelte una onda grande que sale desde la base de la estatua.

Probá en ?only=fondo, completo y en vista de celular (?quality=low). Al terminar decime fps antes/después en cada calidad.
```

---

## Fase 2: Ventanas que orbitan solas y estatua que gira sola (de tu amigo: pedile permiso)

> Esto es todo de `src/modules/estatua/`. Según el contrato no lo podés tocar sin que él esté de acuerdo. Lo ideal es que corra este prompt él, o que te dé el ok.

```
Leé CLAUDE.md entero. Este cambio es del módulo ESTATUA (src/modules/estatua/) y está acordado con su dueño. Rama: estatua/n2-orbita. No toques otras carpetas.

Hoy la estatua y los proyectos están en el mismo grupo "estatua_giro" (turntable): al arrastrar giran juntos. Queremos separarlos:

1. Arrastrar (mouse o dedo, horizontal) gira SOLO la estatua (con su placa). Mantené la inercia y el suavizado de ROTATE, pero sacá el "snap" a proyecto: la estatua queda donde la suelta el usuario.
2. Las ventanas orbitan solas, siempre, alrededor de la estatua. No dependen del giro de la estatua. Velocidad bastante más rápida que ahora (una vuelta cada ~60 s en escritorio). Al hacer hover sobre una, la órbita se frena suave hasta casi parar y retoma al salir.
3. Que "giren entre sí": cada ventana en su propia órbita elíptica con altura que sube y baja lento (onda), radios entre 3 y 5 (contrato), y con fases distintas para que se crucen por delante y por detrás de la estatua sin chocar. Con 7 proyectos repartilos parejo (360/7) y alterná dos anillos: uno más bajo y cerca (r ≈ 3.4, y ≈ 0.6–1.4) y otro más alto y lejos (r ≈ 4.6, y ≈ 2.4–3.4).
4. Cada ventana mira siempre a la cámara con un giro leve hacia afuera. Las que pasan por detrás de la estatua bajan un poco de tamaño y de brillo (profundidad).
5. La ventana "destacada" pasa a ser la que está más cerca de la cámara en cada momento: marco dorado y la placa del pedestal muestra su nombre. Las flechas ← → adelantan o atrasan la órbita para traer la siguiente al frente.
6. Ventanas más lindas: bordes de 18 px, barra de navegador más fina y oscura con la URL en Hanken Grotesk, sombra suave abajo y un reflejo de vidrio diagonal muy sutil que se mueve con el mouse.
7. Celular: órbita más cerrada (r ≈ 1.6), una sola fila que pasa por delante y por detrás, ventanas angostas.
8. Mantené la API pública: setRotation pasa a girar solo la estatua, y agregá setOrbitSpeed(v). Actualizá README y el comentario de la API.
9. Mantené la perforación del canvas para los iframes (sección 5b), el raycast para hover y clic, y la apertura en segunda capa.

Probá en ?only=estatua, completo y en celular. Verificá que el clic sobre una ventana que pasa por detrás de la estatua no la abra (la estatua bloquea).
```

---

## Fase 3: Interfaz sin tarjetones (de los dos)

```
Leé CLAUDE.md entero. Cambio en src/ui/ e index.html, acordado entre los dos. Rama: core/n2-interfaz. No toques los módulos.

Hoy "Sobre nosotros" y "Contacto" son tarjetas rectangulares con fondo (.panel). Las sacamos: el texto va directo sobre la escena, como en una revista, con tipografía grande y un velo de sombra sin bordes para que se lea. Tipografías y paleta del contrato (sección 7).

1. Legibilidad sin cajas: detrás de cada bloque de texto, un degradé radial muy suave (#14100B al 70% → transparente) sin bordes visibles. Nada de border, border-radius ni fondo sólido.
2. Hero: dejá "Victoria / de lo construido" pero con las líneas entrando con máscara (cada línea sube desde abajo, escalonadas), con GSAP.
3. Proyectos: a la izquierda, un índice vertical 01–07 con los nombres en Inter Tight mayúsculas, chiquitos y en dorado tenue. Al pasar el mouse por un nombre, llamá a apis.estatua.focusProject(id) y el nombre se pone en oro brillo con una línea fina que crece. El que tiene hover en 3D también se resalta en la lista (escuchá project:hover en el bus).
4. Sobre nosotros (sin tarjeta):
   - Título grande en Instrument Serif: "Dos manos," y debajo en Cormorant itálica "una sola obra."
   - Dos columnas separadas por una línea vertical dorada de 1 px: [NOMBRE_1] (fondo, luz, movimiento) y [NOMBRE_2] (estatua, código, interacción), cada uno con una línea de bio.
   - Una fila de números en cifras tabulares: "07 proyectos · 02 desarrolladores · 01 diosa".
   - El texto entra línea por línea al llegar a la sección.
5. Contacto (sin tarjeta):
   - Enorme, en Instrument Serif: "Hablemos."
   - Debajo, el WhatsApp y el mail como links grandes en Cormorant itálica, con un subrayado dorado que se dibuja al hacer hover. Al lado del mail, un botón chico "Copiar" (navigator.clipboard, con fallback de seleccionar).
   - Redes en Inter Tight mayúsculas chiquitas.
   - El crédito del modelo 3D sigue visible en el pie (obligatorio, sección 14).
6. Menú de arriba: el de la sección actual con un punto dorado al lado.
7. Celular: todo a una columna, textos al pie de la pantalla con el velo abajo, para que no tapen la estatua.
8. prefers-reduced-motion: sin animaciones de entrada (aparecen directo).

Probá que nada tape los clics a las ventanas (pointer-events) y que el scroll siga igual.
```

---

## Fase 4: Resplandor en el oro (de los dos, toca el núcleo)

```
Leé CLAUDE.md entero. Cambio en src/core/composer.js, acordado entre los dos. Rama: core/n2-bloom.

Agregá un bloom (UnrealBloomPass) que haga brillar el oro de la estatua, el filo de las letras y las brasas, sin velar todo lo demás:
1. Bloom selectivo: solo lo que está en la capa 1 (camera.layers). Documentá en CLAUDE.md que cualquier módulo puede poner un objeto en la capa 1 para que brille.
2. IMPORTANTE (sección 5b): el post-procesado tiene que conservar el canal alpha, si no se rompen las ventanas con iframes. Usá render targets RGBA con HalfFloat y un pase final que copie el alpha original. Probalo con un iframe real antes de dar el ok.
3. Intensidad por calidad: high 0.9, medium 0.6, low apagado.
4. Si los fps bajan del objetivo, que la bajada automática de calidad lo apague primero.
Actualizá la tabla de calidad del contrato.
```

---

## Fase 5: Las páginas reales en las ventanas (de los dos)

```
Leé CLAUDE.md entero. Cambio en src/data/projects.json, acordado entre los dos. Rama: core/n2-links.

1. Completá "url" de cada proyecto con estos links: [PEGAR LISTA].
2. Corré npm run check-embeds y decime cuáles bloquean iframes.
3. Para los que son nuestros y están en Vercel, agregá en el repo de ESE proyecto un vercel.json con el encabezado
   Content-Security-Policy: frame-ancestors 'self' https://<dominio-del-portfolio>
   y sacá X-Frame-Options. Para Cloudflare Workers (Casa De Muffin), el encabezado equivalente en el worker.
   No intentes saltear bloqueos de sitios que no son nuestros (sección 9): esos van con "embed": "local".
4. Volvé a correr check-embeds hasta que estén todos en ✓ o en "local".
```

**Links que tengo:**
- Tinta Negra: https://tinta-negra-sandy.vercel.app
- Casa De Muffin: https://casa-de-muffin.javierbaezmvsss.workers.dev

**Faltan:** Mantra Estética, Aura Aika, ZURKLIMA, La Pastoril y Chufas Accesorios.
