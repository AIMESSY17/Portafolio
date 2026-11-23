// Secciones del scroll. height = alto en pantallas (1 = 100vh). Compartido.
//   hero      la Victoria flota entre nubes de día
//   descenso  las nubes se derriten, la cámara las atraviesa y cae la tarde sobre el mar
//   obras     UNA SALA POR PROYECTO, de 100vh cada una (alto = cantidad de proyectos). Al entrar a una
//             sala la ui emite `sala:change` y los módulos reaccionan (ver CLAUDE.md sección 8).
//   contacto  la orilla a la hora azul
// El guion completo (qué pasa en cada tramo) está en config/historia.js.
import projects from '../data/projects.json';

export const sections = [
  { id: 'hero', height: 1 },
  { id: 'descenso', height: 1.6 },
  { id: 'obras', height: projects.length },
  { id: 'contacto', height: 1.6 },
];
