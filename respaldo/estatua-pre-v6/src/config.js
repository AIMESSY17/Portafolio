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
  wing: { radius: 0.42, startY: 1.75, tipFrom: 0.78, ridge: 1 }, // alas: crestas de plumas + puntas
  base: { top: 0.445, trim: 0.026, bottom: 0.255 },              // filetes: borde superior e inferior del pedestal
  neck: { y: 2.47, radius: 0.17 },                                // corte del cuello
  belt: { y: 2.07, width: 0.055 },                               // cinta bajo el pecho
  drapery: 0.55,             // pan de oro en las crestas más marcadas del manto
  kintsugi: 0.8,             // grietas doradas (0 = sin grietas)
};

// Giro con el mouse / dedo: la estatua y los proyectos giran juntos 360°
export const ROTATE = {
  enabled: true,
  fullTurnScreens: 1.1, // cuántos anchos de pantalla hay que arrastrar para una vuelta completa
  friction: 2.6,        // inercia al soltar (más alto = frena antes)
  smoothing: 12,        // suavizado del giro (más alto = sigue al dedo más pegado)
  snap: true,           // al soltar, se acomoda solo dejando un proyecto de frente
  snapDuration: 1.1,
  // dónde queda el proyecto elegido: ángulo desde el frente hacia la derecha (radianes).
  // 0 = justo delante de la estatua (la tapa); PI/4 = adelante a la derecha. Con las ventanas
  // separadas cada 90°, las demás quedan en las diagonales y ninguna tapa a la estatua.
  featuredAngle: { desktop: Math.PI / 4, mobile: Math.PI / 4 },
  featuredGlow: 0.22,   // brillo extra de la ventana que quedó de frente
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
  barHeight: 40,               // alto de la barra tipo navegador (px)
  radius: 26,                  // redondeo de esquinas (px)
  // Órbita: velocidad angular base (rad/s). 0.022 ≈ una vuelta cada ~5 minutos.
  orbitSpeed: 0.022,
  // Una entrada por proyecto (en el orden de projects.json). Si hay más proyectos que
  // posiciones, se reparten automáticamente.
  //   angle: posición inicial en la órbita (0 = derecha, PI/2 = adelante)
  //   rx/rz: radios de la elipse (contrato: entre 3 y 5)
  //   y: altura · width: ancho de la ventana · speed: multiplicador de órbita
  slots: {
    desktop: [
      { angle: 0.785, rx: 3.6, rz: 3.0, y: 2.6, width: 1.35, speed: 1.0, bob: 0.07 },
      { angle: 2.356, rx: 3.8, rz: 3.0, y: 0.75, width: 1.45, speed: 1.0, bob: 0.09 },
      { angle: 3.927, rx: 3.3, rz: 3.0, y: 3.1, width: 1.2, speed: 1.0, bob: 0.06 },
      { angle: 5.498, rx: 3.7, rz: 3.0, y: 0.5, width: 1.3, speed: 1.0, bob: 0.08 },
    ],
    // celular vertical: dos ventanas arriba de la estatua y dos abajo, órbita más cerrada
    mobile: [
      { angle: 0.785, rx: 1.45, rz: 1.6, y: 4.45, width: 1.0, speed: 1.0, bob: 0.05 },
      { angle: 3.927, rx: 1.45, rz: 1.6, y: 4.25, width: 0.95, speed: 1.0, bob: 0.05 },
      { angle: 2.356, rx: 1.5, rz: 1.6, y: 0.15, width: 1.0, speed: 1.0, bob: 0.06 },
      { angle: 5.498, rx: 1.5, rz: 1.6, y: 0.3, width: 0.95, speed: 1.0, bob: 0.06 },
    ],
  },
  hover: { scale: 1.07, forward: 0.3, duration: 0.6 },
  // Las ventanas miran a la cámara con un leve giro hacia afuera (perspectiva real)
  outwardYaw: 0.09,
  frame: { color: '#1B1A19', glow: '#F1D27A' },
  // Carga escalonada de los iframes (ms entre uno y otro) para no trabar el arranque
  iframeStagger: 450,
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
