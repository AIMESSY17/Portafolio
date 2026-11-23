// ============================================================
//  CONFIGURACIÓN DEL MÓDULO ESTATUA — todo lo ajustable está acá
//  Unidades: metros. Ángulos: radianes. Tiempos: segundos.
// ============================================================

export const STATUE = {
  // Modelo: primero carga el liviano (aparece rápido) y después lo cambia por el detallado.
  models: { preview: 'victoria-lod0.glb', full: 'victoria.glb' },
  height: 3,                      // alto final de la estatua
  position: { x: 0, y: 0.15, z: 0 }, // posición base (el flotado se suma encima)
  orientationFix: { x: -Math.PI / 2, y: 0, z: 0 }, // endereza el escaneo (viene acostado)
  rotationY: 0.9,                 // vista de tres cuartos (la clásica del Louvre)
  scale: 1,                       // multiplicador extra sobre `height`
  float: { amplitude: 0.09, speed: 0.42 }, // flotación vertical lenta
  sway: { amount: 0.035, speed: 0.11 },     // rotación casi imperceptible
  pointerReaction: { yaw: 0.07, pitch: 0.025 }, // cuánto "mira" hacia el cursor
  material: {
    color: '#EDE6DA',            // mármol marfil
    shadowTint: '#B9AE9C',       // nubes del mármol
    veinColor: '#7A746B',        // vetas grises finas
    roughness: 0.38,             // pulido
    clearcoat: 0.55,             // brillo de laca, como las referencias
    clearcoatRoughness: 0.18,
    sheen: 0.25,
    sheenColor: '#F1D27A',
    envMapIntensity: 1.3,        // más reflejo del entorno (el oro lo necesita para brillar)
    veins: 0.85,                 // intensidad de vetas (0 = sin vetas)
  },
  // Luces de contorno propias (permitidas por contrato: nombre estatua_rim, se apagan en low)
  rim: [
    { color: '#F1D27A', intensity: 14, position: [-2.6, 3.4, -2.4], distance: 9 },
    { color: '#BCC8D8', intensity: 9, position: [2.8, 2.2, -2.2], distance: 8 },
  ],
};

// Detalles en ORO sobre el mármol (ver gilding.js). Las medidas están en metros, en el
// "espacio estatua" (y = 0 en la base, estatua de 3 m). Son propias de ESTE modelo:
// si se cambia el GLB, se reajustan mirando /?only=estatua&gold=debug (el oro se ve en rojo).
export const GOLD = {
  color: '#C9A227',          // Oro
  highlight: '#F1D27A',      // Oro brillo
  amount: 1,                 // 0 = sin oro, 1 = completo
  torsoAxis: [-0.36, 0.33],  // centro del torso (x, z)
  wing: { radius: 0.42, startY: 1.75, tipFrom: 0.78, ridge: 1, span: 1.2 }, // alas: crestas de plumas + puntas (span = radio de la punta)
  base: { top: 0.445, trim: 0.026, bottom: 0.255 },              // filetes: borde superior e inferior del pedestal
  neck: { y: 2.47, radius: 0.17 },                                // corte del cuello
  belt: { y: 2.07, width: 0.055 },                               // cinta bajo el pecho
  drapery: 0.55,             // pan de oro en las crestas más marcadas del manto
  // piernas "consumidas" por el oro (coreografía de scroll): hilos que suben desde la base
  legs: { top: 1.75, ridge: -0.16, cracks: 7, width: 1.6 },
  kintsugi: 0.8,             // grietas doradas (0 = sin grietas)
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
      { r: 1.6, y: 4.2, width: 0.95, wave: 0.1, waveSpeed: 0.35, tilt: 0.3 }, // tilt: el frente baja
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
