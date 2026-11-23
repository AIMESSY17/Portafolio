// Secciones del scroll. height = alto en pantallas (1 = 100vh). Compartido.
//   hero      la Victoria flota arriba de un mar de nubes de día
//   descenso  la caída: atraviesa la capa de nubes, sale el horizonte del atardecer y el mar abajo
//   obras     UNA SALA POR PROYECTO, de 100vh cada una (alto = cantidad de proyectos). Al entrar a una
//             sala la ui emite `sala:change` y los módulos reaccionan (ver CLAUDE.md sección 8).
//   contacto  la orilla a la hora azul, con estrellas
// El guion completo (qué pasa en cada tramo) está en config/historia.js.
import projects from '../data/projects.json';

export const sections = [
  { id: 'hero', height: 1 },
  { id: 'descenso', height: 2 },
  { id: 'obras', height: projects.length },
  { id: 'contacto', height: 1.6 },
];
