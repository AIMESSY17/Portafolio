// Una sola mano para todo el fondo: el mismo "ritmo" en cada suavizado y en cada transición.
//  · damp(velocidad, dt): suavizado independiente de los fps. Úsalo siempre así:
//        valor += (objetivo - valor) * damp(4, dt)
//    (nunca `delta * K`: con un frame lento da saltos y con fps altos queda distinto).
//  · MAX_DT: ningún cuadro cuenta como más de 1/30 s, así un frame lento no produce un salto.
//  · EASE: la única curva de las transiciones con GSAP (power3.inOut, la misma que usa el polvo).
export const MAX_DT = 1 / 30;
export const EASE = 'power3.inOut';
export const damp = (speed, dt) => 1 - Math.exp(-speed * dt);
