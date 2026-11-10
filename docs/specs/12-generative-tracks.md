# Tracks generativos editables

## Objetivo

Drone, pad y lead dejan de ser cajas negras. Se puede explorar su sonido y, cuando hace
falta, convertirlos en tracks con patrón sin perder el modo generativo.

## Sonido

Los tres tracks ahora aceptan:

- selector de máquina;
- parámetros de máquina;
- banco de sonidos;
- cambio de nota y registro cuando el preset lo define.

Las máquinas por defecto son:

| Track | Máquina | Comportamiento |
| --- | --- | --- |
| Drone | `drone-sampler` | sample de drone |
| Pad | `soft-pad` | poli-sinte de seno |
| Lead | `lead-synth` | poli-sinte de triángulo |

El motor adapta el disparo generativo al tipo de máquina:

- sampler: dispara el sample del track;
- poly/mono/pluck/plugin: dispara una nota o acorde de synth.

También se agregaron `drone-sampler`, `soft-pad` y `lead-synth` al catálogo de máquinas
para tracks de usuario.

## Patrón

Cada track generativo tiene un botón `+P` / `−P`:

- **+P** crea un patrón semilla, lo agrega al estado y a todas las escenas, y selecciona
  el track.
- **−P** elimina el patrón del estado y de todas las escenas, y vuelve al modo generativo.

Patrones semilla:

| Track | Pasos |
| --- | --- |
| Drone | 1 y 9 |
| Pad | 1, 7 y 13 |
| Lead | 3, 7, 11 y 15 |

En modo patrón el track usa la ruta general de disparo:

- sampler → sample del track;
- synth/mono/pluck/plugin → `noteSource` + máquina.

En modo generativo se mantienen las reglas originales:

- drone cada 16 negras;
- pad cada 8 negras con acorde de la progresión;
- lead probabilístico por negra.

## UI

- **Performance**: botón `+P` / `−P` en drone, pad y lead.
- **Sequencer**: los tracks generativos aparecen en las pestañas; si no tienen patrón,
  muestran un estado vacío con **+ agregar patrón**.
- **Sound**: máquina y parámetros editables; el banco de sonidos incluye los tres tracks
  en **Destino**.

## Criterios

- Un track generativo sin patrón no permite editar pasos ni controles de patrón.
- Agregar un patrón lo replica en todas las escenas y permite editarlo como cualquier otro.
- Quitar el patrón restaura el disparo generativo.
- Cambiar la máquina no borra el patrón, la mezcla, los inserts ni los sends.
- La sesión conserva `hasPattern`, la máquina y los patrones agregados.
