---
id: adr-0005
status: aceptada
version: 1.0.0
updated: 2026-11-10
---

# ADR-0005 — Clips respaldados por escenas y patrón vivo

## Contexto

La performance actual usa escenas como snapshots completos de kit, patrón, armonía y
mezcla. Para acercarnos a una Session View necesitamos lanzar clips por track sin cambiar
el resto de la música.

Había dos caminos:

1. Introducir un `ClipState` con patrón propio y migrar todas las sesiones.
2. Reutilizar las escenas y el patrón vivo como backing store de los clips.

El primer camino es el destino de M1.2, pero en este corte implicaba una migración grande
y tocaba todos los caminos de edición de patrones antes de validar la performance.

## Decisión

Adoptar un modelo intermedio:

- `ClipState` es metadata de un slot `(track, escena)`.
- El patrón del clip vive en la escena de origen.
- `state.pattern` es el patrón vivo de todos los clips activos.
- `state.activeClips[trackId]` apunta al clip activo o a `null` si el track está detenido.
- Al cambiar de clip:
  1. el patrón vivo saliente se guarda en su escena;
  2. se carga el patrón de la escena destino en el patrón vivo;
  3. se actualiza `activeClips`.
- Antes de guardar o exportar, `materializeScenes()` copia el patrón vivo de cada clip
  activo a su escena.
- El lanzamiento cuantizado se agenda en `PlaybackRuntime` y `PlaybackService` lo aplica
  antes de disparar el paso.

## Consecuencias

Buenas:

- La grilla funciona sin migrar sesiones ni duplicar el almacenamiento de patrones.
- Editar un clip activo sigue usando el mismo `PatternService` y el mismo secuenciador.
- El round-trip de sesión es compatible: los campos nuevos son opcionales.
- Permite implementar launch quantize y follow actions con bajo riesgo.

Malas:

- Los clips dependen de las cuatro escenas actuales; no hay slots libres todavía.
- Editar un track detenido no actualiza su último clip hasta relanzarlo.
- `materializeScenes()` debe ejecutarse en todos los caminos de persistencia/export.
- La UI no puede mostrar lanzamientos pendientes sin consultar el runtime.

## Alternativas no elegidas

- **Clip con patrón propio desde el día uno**: más limpio a largo plazo, pero migración y
  refactor de edición demasiado grandes para el primer corte.
- **Lanzar clips copiando la escena completa**: sencillo, pero no permite que un track
  cambie de clip sin cambiar el resto.
- **Reproducir directo desde snapshots sin patrón vivo**: evita edición en vivo y rompe
  el secuenciador actual.
