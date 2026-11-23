// ============================================================
//  CONFIGURACIÓN DEL MÓDULO ESTATUA — todo lo ajustable está acá
//  Unidades: metros. Ángulos: radianes. Tiempos: segundos.
// ============================================================

// ---------- Versión 3 (fotográfica) ----------
// Vuelve la estatua v6 (boceto dorado, cabeza y brazos de oro, oro que se dibuja con el scroll) con las
// ventanas orbitando, ahora en WebGL con marco de cromo. Sin alas de luz ni tótem (alas.js y totem.js
// quedan en el repo, sin usarse). Con ESTATUA_V6 = true vuelve la v6 vieja tal cual era (index-v6.js).
export const ESTATUA_V6 = false;

export const STATUE = {
  // Modelo: primero carga el liviano (aparece rápido) y después lo cambia por el detallado.
  models: { preview: 'victoria-lod0.glb', full: 'victoria.glb' },
  height: 3,                      // alto final de la estatua
  position: { x: 0, y: 0.15, z: 0 }, // posición base (el flotado se suma encima)
  orientationFix: { x: -Math.PI / 2, y: 0, z: 0 }, // endereza el escaneo (viene acostado)
  rotationY: 0.9,                 // vista de tres cuartos (la clásica del Louvre)
  scale: 1,                       // multiplicador extra sobre `height`
  smoothNormals: 3,               // pasadas de suavizado de normales del escaneo (worker, gilding-bake.js). Con 6 el worker tarda más que la espera de carga y el modelo llegaba en medio del scroll
  float: { amplitude: 0.04, period: 6 }, // sube y baja ±4 cm cada 6 s
  sway: { amount: 0.03, speed: 0.09 },   // rotación casi imperceptible
  pointerReaction: { yaw: 0.06, pitch: 0.02 }, // cuánto "mira" hacia el cursor
  material: {
    color: '#F4F0E9',            // mármol blanco (apenas cálido)
    shadowTint: '#CFC6B8',       // nubes del mármol
    veinColor: '#8E877D',        // vetas grises finas
    roughness: 0.36,             // pulido
    clearcoat: 0.5,
    clearcoatRoughness: 0.2,
    sheen: 0.2,                  // terciopelo dorado en los bordes: "iluminada en dorado"
    sheenColor: '#F1D27A',
    envMapIntensity: 0.95,
    veins: 0.5,                  // vetas suaves (0 = sin vetas)
  },
  // Luces de contorno propias (contrato: nombre estatua_rim). Su color lo da el sol del fondo.
  // En calidad baja no se crean (celular); si la calidad baja a low en vivo, quedan en intensidad 0
  // (cambiar la cantidad de luces recompila todos los shaders).
  rim: [
    { color: '#F1D27A', intensity: 16, position: [-2.6, 3.4, -2.4], distance: 9 },
    { color: '#C9D8EC', intensity: 7, position: [2.8, 2.2, -2.2], distance: 8 },
  ],
  // Contacto: la estatua se vuelve una figura de luz blanca-dorada (emisiva, con halo) reflejada en la arena
  light: { color: '#FFF3DC', reflection: 0.24, stretch: 1.55, streak: 0.55, halo: 0.5 },
};

// Detalles en ORO sobre el mármol (ver gilding.js). Las medidas están en metros, en el
// "espacio estatua" (y = 0 en la base, estatua de 3 m). Son propias de ESTE modelo:
// si se cambia el GLB, se reajustan mirando /?only=estatua&gold=debug (el oro se ve en rojo).
export const GOLD = {
  color: '#C9A227',          // Oro
  highlight: '#F1D27A',      // Oro brillo
  amount: 1,                 // 0 = sin oro, 1 = completo
  torsoAxis: [-0.36, 0.33],  // centro del torso (x, z)
  wing: { radius: 0.42, startY: 1.75, tipFrom: 0.92, ridge: 0.4, span: 1.2 }, // alas: crestas de plumas + puntas (span = radio de la punta)
  base: { top: 0.445, trim: 0.026, bottom: 0.255 },              // filetes: borde superior e inferior del pedestal
  neck: { y: 2.47, radius: 0.17 },                                // corte del cuello
  belt: { y: 2.07, width: 0.055 },                               // cinta bajo el pecho
  drapery: 0.25,             // pan de oro en las crestas más marcadas del manto (sutil: la luz es el oro)
  // piernas "consumidas" por el oro (coreografía de scroll): hilos que suben desde la base
  legs: { top: 1.75, ridge: -0.16, cracks: 7, width: 1.6 },
  kintsugi: 0,               // grietas doradas: apagadas en "Hecha de luz" (0 = sin grietas)
  trims: 0,                  // filetes del pedestal y cinta del pecho: apagados (se veían como neón)
};

// ---------- "Hecha de luz" ----------
// Encuadres de cada momento. La cámara se arma sola para que la estatua quede en `screen` (fracción de
// pantalla: x desde la izquierda, y desde arriba) con alto `h` (fracción del alto). az = ángulo alrededor
// de la estatua (rad, + = desde la derecha) · alt = altura de la cámara respecto del centro de la estatua (m).
// En las salas la posición en pantalla sale de config/layout.js (estatua a un lado, ventana grande al otro).
export const ESCENA = {
  center: 1.5,                 // altura del centro de la estatua sobre su base (m)
  bodyH: 3.15,                 // alto que se encuadra (estatua + pedestal)
  hero: {
    desktop: { screen: [0.5, 0.57], h: 0.52, az: 0, alt: 0.35 },   // un poco más abajo y chica: arriba entra la corona
    mobile: { screen: [0.5, 0.58], h: 0.4, az: 0, alt: 0.3 },
  },
  mar: { // al llegar al mar, antes de la primera sala: estatua y tótem
    desktop: { screen: [0.34, 0.6], h: 0.5, az: 0.14, alt: 0.05 },
    mobile: { screen: [0.5, 0.58], h: 0.36, az: 0.1, alt: 0.2 },
  },
  contacto: { // la orilla: la figura de luz de un lado y "Hablemos." del otro
    desktop: { screen: [0.68, 0.6], h: 0.56, az: -0.18, alt: -0.95 },
    mobile: { screen: [0.5, 0.36], h: 0.34, az: -0.1, alt: -0.7 },
  },
  // un ángulo distinto por sala (en el orden de projects.json; si hay más proyectos, se repiten).
  // La cámara nunca queda por debajo del centro de la estatua: así el horizonte sube y el texto de la sala
  // cae sobre el mar (oscuro) y no sobre el cielo claro del horizonte.
  salas: [
    { az: -0.24, alt: 0.3, zoom: 1.0 },    // de frente, a la altura del pecho: monumental
    { az: 0.22, alt: 1.35, zoom: 1.06 },   // desde arriba y de la derecha
    { az: -0.06, alt: 0.5, zoom: 0.93 },   // más cerca
    { az: 0.32, alt: 0.85, zoom: 1.02 },
    { az: -0.36, alt: 1.15, zoom: 0.97 },  // desde la izquierda
    { az: 0.08, alt: 0.4, zoom: 1.09 },    // más lejos
  ],
  // giro de la estatua hacia la ventana en las salas (rad) y en Contacto
  yawSala: 0.42,
  yawContacto: -0.3,
  // la estatua se posa en la orilla en Contacto (y de la base)
  landY: -1.13,
  saleDur: 0.8, // transición entre salas (s)
  // la caída: el campo de visión se abre al atravesar las nubes y la cámara tiembla con la velocidad
  caida: { fov: 6, shake: 0.05 },
  orbitaHero: 1,  // (la corona tiene siempre el mismo tamaño)
};

// Ventanas en órbita (WebGL) — ver orbita.js. Los anillos y el hover están en WINDOWS.
export const ORBITA = {
  bezel: 0.012,          // grosor del bisel de cromo (m, para una ventana de 1,4 m)
  radius: 0.03,          // redondeo de esquinas (fracción del alto)
  chromeRoughness: 0.07,
  frontDist: 2.4,        // a qué distancia de la cámara queda la ventana de la sala (m)
  dimOthers: 0.75,       // brillo de las demás mientras una está al frente
  enter: 0.9,            // la cámara vuela hasta la ventana al abrir el proyecto (s)
};


// ---------- Alquimia (alquimia.js): anillos de oro alrededor de la estatua, polvo de oro y el hilo de la corona ----------
// Estilo astrolabio / esfera armilar: bandas finas de oro con marcas grabadas y letras griegas, cada una con su
// inclinación, su giro propio (spin, rad/s) y la precesión de su eje (prec, rad/s). Medidas en metros, centradas
// en el medio de la estatua (y = center). `mobile` achica todo para que entre en pantallas angostas.
export const ANILLOS = {
  center: 1.55,
  band: 0.085,                   // alto de la banda
  tube: 0.0,                     // (reservado)
  rings: [
    { r: 1.18, tilt: 0.66, spin: 0.26, prec: -0.12, tex: 'simbolos' },
    { r: 1.42, tilt: 1.14, spin: -0.16, prec: 0.09, tex: 'alfabeto' },
    { r: 1.66, tilt: 1.33, spin: 0.2, prec: 0.06, tex: 'nike' },       // lleva "ΝΙΚΗ" y brilla cerca del mouse
    { r: 1.90, tilt: 0.28, spin: -0.1, prec: -0.07, tex: 'escala' },
  ],
  mobile: 0.62,                  // factor de tamaño en celular
  alpha: { hero: 0.5, alq: 1 },  // opacidad: tenue arriba de las nubes, plena con la transmutación
  dust: { high: 240, medium: 130, low: 50, falling: 0.4 },
  nikeGlowDist: 110,             // px: a qué distancia del anillo del mouse empieza a brillar "ΝΙΚΗ"
};

// Corona de ventanas (orbita.js): un aro parejo arriba de la cabeza de la estatua, inclinado, que gira lento.
export const CORONA = {
  period: 40,                    // s por vuelta
  tilt: -0.35,                   // rad: inclinación (el frente sube un poco; se ve en perspectiva)
  desktop: { r: 1.3, y: 3.2, width: 0.95 },
  mobile: { r: 0.98, y: 3.12, width: 0.8 },
  back: { scale: 0.56, opacity: 0.42 },
  front: { scale: 1.06 },
  hoverScale: 1.38,              // la ventana sobre la que está el mouse crece
  thread: { color: '#F1D27A', opacity: 0.7 },
};

// Fragmentos de cromo durante la caída (fragmentos.js). from = qué pieza (0 torso Victoria, 1 torso 2,
// 2 y 3 brazos). angle/radius/y = dónde flota · orbit = vuelta lenta (rad/s) · delay = cuándo cae al agua.
export const FRAGMENTOS = {
  low: 2,
  items: [
    { from: 0, size: 0.95, angle: 0.6, radius: 2.6, y: 2.6, orbit: 0.05, spin: [0.11, 0.17, 0.05], delay: 0.0 },
    { from: 1, size: 0.85, angle: 3.6, radius: 3.0, y: 1.2, orbit: 0.04, spin: [-0.08, 0.13, 0.09], delay: 0.18 },
    { from: 2, size: 0.55, angle: 2.1, radius: 2.2, y: 3.3, orbit: 0.06, spin: [0.2, -0.12, 0.1], delay: 0.3 },
    { from: 3, size: 0.5, angle: 5.0, radius: 2.4, y: 0.6, orbit: 0.05, spin: [-0.14, 0.22, -0.07], delay: 0.1 },
    { from: 1, size: 0.45, angle: 4.4, radius: 3.6, y: 3.0, orbit: 0.03, spin: [0.09, 0.1, 0.16], delay: 0.42 },
    { from: 0, size: 0.4, angle: 1.4, radius: 3.4, y: 0.2, orbit: 0.045, spin: [0.15, -0.09, 0.12], delay: 0.24 },
  ],
};

// Intro de la primera visita (intro.js): la silueta se dibuja en oro sobre negro y se abre el cielo
export const INTRO = { draw: 2, flash: 0.25, open: 1.3, key: 'samotracia.intro.v1' };

// Alas de luz: partículas que se desprenden de las puntas de las alas y se lleva el viento.
// Ciclo de vida: blanca → dorada → ámbar → se apaga. Leve iridiscencia (dorado → rosado → celeste).
export const ALAS = {
  count: { high: 6000, medium: 3000, low: 1000 },
  life: 4,              // segundos (cada una vive entre 0,65 y 1,35 de esto)
  rest: 0.36,           // fracción de partículas vivas en reposo
  dragBoost: 0.9,       // arrastrando: casi todas
  speed: 0.3,           // velocidad de salida (m/s)
  fling: 0.85,          // cuánto las revolea el giro de la estatua
  wind: 0.42,           // empuje del viento (m/s²): se van en hilos, no se amontonan
  size: 0.075,          // tamaño en el mundo (m)
  // dónde nacen (espacio estatua): puntas y bordes de arriba de las alas
  emit: { minR: 0.72, minY: 1.85, take: 1400 },
  colors: { white: '#FFF8EA', gold: '#F0BD55', amber: '#DC8A33', deep: '#8E4520', iriA: '#F4CC78', iriB: '#EFA9BE', iriC: '#9FD2EE' },
  iridescence: 0.32,
};

// Tótem: las 7 ventanas encastradas en ángulos distintos alrededor de un eje de luz, girando juntas
// como una sola escultura (ref07). La ventana de cada sala se suelta y pasa al frente, grande y quieta.
export const TOTEM = {
  width: { desktop: 1.3, mobile: 0.95 }, // ancho de cada pantalla en el tótem (m)
  bezel: 0.006,                           // hilo de luz del marco (m, a ese ancho)
  radius: 0.03,                           // redondeo de esquinas (fracción del alto)
  spacing: 0.66,                          // separación vertical entre pantallas (m)
  reach: 0.6,                             // distancia del eje al centro de cada pantalla (m)
  turn: Math.PI * 2 / 48,                 // giro del tótem (rad/s): una vuelta cada 48 s
  // dónde se para: al llegar al mar, en el mundo al lado de la estatua. En las salas se corre atrás de
  // la estatua, del otro lado de la ventana: `sala` = [x, y] en pantalla (fracción) y distancia a la cámara.
  place: {
    desktop: { mar: [3.2, 0.95, -2.4], sala: { screen: [0.095, 0.47], dist: 15, scale: 0.78 } },
    mobile: { mar: [1.7, 1.15, -1.4], sala: { screen: [0.86, 0.15], dist: 24, scale: 0.75 } },
  },
  frontDist: 2.4,                         // a qué distancia de la cámara queda la ventana de la sala (m)
  dimOthers: 0.8,                         // brillo de las demás mientras una está al frente
  frame: { color: '#EBD7A6' },
};

// Boceto dorado: la silueta de la estatua que se dibuja sola con el scroll (sketch.js)
export const SKETCH = {
  color: '#C9A227',
  tip: '#F1D27A',
  jitter: 0.007,
  drawSpeed: 0.55,
  body: { axis: [-0.36, 0.45], feetY: 0.46, headTopY: 2.92, shoulderY: 2.42 },
};

// Partes de oro: cabeza y brazos de la "segunda figura", flotando separados (parts.js).
// `explode` ubica cada pieza: dónde engancha (attachAt), cuánto se separa (offset) y su anillo guía.
export const PARTS = {
  model: 'partes-oro.glb',
  position: [-0.36, 2.4, 0.45],
  rotation: [0, 0, 0],
  scale: 1.45,
  color: '#C9A227',
  glow: '#F1D27A',
  roughness: 0.24,
  envMapIntensity: 1.6,
  rings: 46,
  explode: {
    cabeza: { attachAt: 'bottom', offset: [0, 0.26, 0], rot: [0, 0, 0], ring: 0.08, scale: 1.2 },
    brazo_der: { attachAt: 'top', offset: [-0.13, 0.02, -0.07], rot: [0, 0, -0.1], ring: 0.05 },
    brazo_izq: { attachAt: 'top', shift: [0.02, -0.09, 0.07], offset: [0.1, 0, 0.03], rot: [-0.3, -0.12, 0.16], ring: 0.05 },
  },
  closeIn: 0.3, // cuánto se acercan las piezas al terminar de rellenarse
  float: 0.012,
};

// Coreografía con el scroll. Los números de las secciones son los de config/sections.js
// (0 hero, 1 proyectos, 2 sobre-nosotros, 3 contacto). `x` = sección + progreso dentro de ella.
export const REVEAL = {
  // Versión 3: el dibujo avanza con la caída (TRAMOS.oro de config/historia.js), no con las salas
  // El dibujo avanza con el scroll de `from` hasta el inicio de `to` (ids de config/sections.js)
  sections: { from: 'obras', to: 'contacto' },
  frame: [0, 0.25],             // boceto de la silueta
  partsLines: [0.06, 0.36],     // cabeza y brazos: solo líneas
  partsFill: [0.22, 0.5],       // cabeza y brazos: relleno de oro
  wingLines: [0.45, 0.75],      // alas: líneas
  wingFill: [0.55, 1],          // alas: relleno
  legs: [0.06, 1],              // el oro sube por las piernas
  speed: 0.5,                   // cuánto tarda en seguir al scroll (1/s)
  // Zoom a la cabeza dorada: solo existe si hay una sección 'sobre-nosotros' (hoy no). Rangos en
  // pantallas (100vh) respecto del inicio de esa sección, medidos en el centro de la pantalla.
  about: { section: 'sobre-nosotros', in: [-0.3, 0.15], out: [0.8, 1.2] },
  // Contacto: la estatua baja y aparecen dos torsos. Rango en pantallas respecto del inicio de Contacto.
  contact: { section: 'contacto', range: [-0.2, 0.8] },
  contactDrop: 4.6,             // cuánto baja la estatua en Contacto (metros)
};

// Salas (sección "obras"): al entrar a la sala de un proyecto la estatua se desliza a un costado y baja de
// brillo, y la ventana de ese proyecto queda grande y quieta. Escritorio: estatua a la izquierda, ventana
// al centro-derecha y el texto entre las dos. Celular: estatua chica arriba, ventana abajo y texto debajo.
// Posiciones en metros (la cámara mira a (0, 1.5, 0)); `bright` = brillo del mármol (1 = normal).
export const SALA = {
  duration: 1.2,
  desktop: {
    statue: { x: -3.75, y: 0, scale: 0.8, bright: 0.45 },
    window: { pos: [1.95, 1.75, 1.0], width: 4.2 },
  },
  mobile: {
    statue: { x: 0, y: 3.9, scale: 0.46, bright: 0.45 },
    window: { pos: [0, 1.85, 0.6], width: 2.45 },
  },
};

// Los dos torsos de Contacto (torsos.js). pos/size = escritorio; posM/sizeM = celular vertical.
export const TORSOS = {
  victoria: {
    name: 'contacto_torso_victoria', normal: [0.62, 1, 0.28], cutY: 0, silver: 0.25, seed: 0, metal: '#AEB4BC', eat: 0.3,
    size: 2.6, sizeM: 1.5, pos: [-0.15, 1.6, 0], posM: [-0.72, 1.95, 0], gap: 0.06, tilt: -0.03, delay: 0, spin: 0.32,
    // recorte del torso sobre el modelo de la estatua (espacio estatua)
    cut: { axis: [-0.36, 0.38], y: [1.42, 2.62], radius: 0.47 },
  },
  figura: {
    name: 'contacto_torso_figura', model: 'torso-2.glb', normal: [-0.7, 1, 0.2], cutY: 0.22, silver: 1, seed: 4.7, metal: '#C3C8CE', eat: 0.42,
    yaw: -0.35, size: 2.35, sizeM: 1.4, pos: [2.35, 1.65, -0.3], posM: [0.78, 1.95, -0.2], gap: 0.05, tilt: 0.03, delay: 0.12, spin: -0.28,
  },
};

// Giro con el mouse / dedo: gira SOLO la estatua (los proyectos orbitan por su cuenta)
export const ROTATE = {
  enabled: true,
  fullTurnScreens: 1.1, // cuántos anchos de pantalla hay que arrastrar para una vuelta completa
  friction: 2.6,        // inercia al soltar (más alto = frena antes)
  smoothing: 12,        // suavizado del giro (más alto = sigue al dedo más pegado)
  featuredAngle: Math.PI / 6, // al traer un proyecto al frente con ← →, queda así de corrido a la derecha
  featuredGlow: 0.22,   // brillo extra de la ventana destacada
  featuredScale: 1.04,
};

// Placa de oro en el frente del pedestal (espacio estatua, metros)
export const PLAQUE = {
  size: { w: 0.62, h: 0.14, d: 0.016 },
  position: [-0.335, 0.35, 0.735], // centro de la placa
  faceAngle: 0,                     // hacia qué lado del pedestal mira (radianes)
  glow: '#F1D27A',
};

// Ventanas de proyectos
export const WINDOWS = {
  // Tamaño del "viewport" del iframe (px). Escritorio muestra la versión desktop del sitio;
  // en celular, ventanas angostas que muestran la versión mobile.
  viewport: { desktop: { w: 1280, h: 800 }, mobile: { w: 390, h: 560 } },
  barHeight: 22,               // alto de la barra tipo navegador (px): muy fina
  radius: 18,                  // redondeo de esquinas (px)
  // Órbita automática: TODOS los proyectos giran solos, siempre, repartidos parejo.
  period: { desktop: 60, mobile: 60 }, // segundos por vuelta (se frena con el hover)
  // Anillos: los proyectos se reparten alternando entre ellos (el 1º en el anillo 0, el 2º en el 1...).
  //   r = radio · y = altura · width = ancho de la ventana (m) · wave = onda vertical lenta
  // Escritorio: uno bajo y cerca (r 3.4) y otro alto y lejos (r 4.6) que se cruzan al girar.
  // Celular vertical: una sola órbita cerrada (r 1.6) por encima de la cabeza de la estatua.
  rings: {
    desktop: [
      { r: 3.4, y: 0.9, width: 1.35, wave: 0.12, waveSpeed: 0.35 },
      { r: 4.6, y: 2.9, width: 1.5, wave: 0.16, waveSpeed: 0.28 },
    ],
    mobile: [
      { r: 1.6, y: 3.85, width: 0.9, wave: 0.1, waveSpeed: 0.35, tilt: 0.3 }, // tilt: el frente baja
    ],
  },
  // Los que pasan por detrás se achican y se apagan un poco
  back: { scale: 0.78, opacity: 0.55 },
  // Hover: la órbita se frena suave, ese navegador crece y se ilumina, el resto se atenúa
  hover: { scale: 1.12, forward: 0.35, duration: 0.6, slow: 0.04, dim: 0.5 },
  // Las ventanas miran siempre a la cámara con un leve giro hacia afuera
  outwardYaw: 0.09,
  frame: { color: '#1B1A19', glow: '#F1D27A' },
};

// Apertura de proyecto (segunda capa)
export const VIEWER = {
  openDuration: 1.0,
  closeDuration: 0.8,
  camera: { approach: 0.38, duration: 1.2 }, // cuánto se acerca la cámara a la ventana elegida
  orbitSlowdown: 0.15,                       // la órbita sigue, pero más lenta, de fondo
  // Permisos del iframe abierto: navegar, scroll, formularios. Sin top-navigation:
  // el sitio nunca puede sacar al visitante del portfolio.
  sandbox: 'allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox allow-modals allow-downloads',
};
