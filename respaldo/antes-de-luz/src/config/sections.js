// Secciones del scroll. height = alto en pantallas (1 = 100vh). Compartido: se cambia con acuerdo.
//   hero      la estatua y los proyectos orbitando
//   obras     UNA SALA POR PROYECTO, de 100vh cada una (alto = cantidad de proyectos). Al entrar a una
//             sala la ui emite `sala:change` y los módulos reaccionan (ver CLAUDE.md sección 8).
//   contacto  cierre
import projects from '../data/projects.json';

export const sections = [
  { id: 'hero', height: 1 },
  { id: 'obras', height: projects.length },
  { id: 'contacto', height: 1 },
];
