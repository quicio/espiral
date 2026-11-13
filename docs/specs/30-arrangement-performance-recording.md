---
id: spec-30
title: Grabación de performance a arrangement
status: implementada
version: 0.1.0
updated: 2026-11-13
fase: 5
depends_on: [spec-18, spec-29]
---

# Grabación de performance a arrangement

## Objetivo

Convertir una performance de Session en bloques de arrangement mientras suena
el transporte, sin salir de la vista.

## Modelo

`ArrangementState` suma `recording: boolean`. No se persiste como activo: al
cargar una sesión siempre vuelve en `false`.

Al empezar a grabar:

- se descarta el take anterior (`blocks: []`);
- se desactiva el playback del arrangement (`enabled: false`);
- se desactiva el loop;
- se arma `recording: true`.

## Captura

`ArrangementService.recordScene(sceneId)`:

- sólo actúa si `recording` y el transporte está reproduciendo;
- calcula el compás absoluto con `runtime.absoluteStep / 16`;
- ignora la escena si es la misma que el último bloque (extiende su duración);
- al cambiar de escena, cierra el bloque anterior con la diferencia de compases
  (mínimo 1) y agrega el nuevo con `bars: 1` provisorio;
- actualiza la timeline en vivo.

`stopRecording()` cierra el último bloque con el compás actual (mínimo 1),
mantiene los bloques grabados y deja `loopStart/loopEnd` cubriendo el take.

`PlaybackService.stop()` llama a `stopRecording()`, así detener el transporte
termina la toma sin dejar el estado armado.

## Disparadores

La grabación escucha lanzamientos de escena hechos por el usuario:

- `launchScene` desde la grilla de Session;
- aplicar escena desde los controles de fila;
- cambiar de escena en el panel generativo.

El playback interno del arrangement no se auto-graba: usa `SceneService.apply`
directamente.

## UI

En Arrange:

- botón `Grabar` / `Detener grabación` con `aria-pressed`;
- readout `Grabando · N bloques`;
- la timeline muestra los bloques a medida que se capturan.

## Fuera de alcance

- Overdub sobre un arrangement existente.
- Captura de lanzamientos por track/clip.
- Cuantización distinta de compases.
- Automatización por bloque.
- Undo dedicado del take; el undo global sigue cubriendo cambios de estado.

## Tareas

- [x] `recording` en el estado y estado inicial.
- [x] `startRecording`, `stopRecording`, `toggleRecording` y `recordScene`.
- [x] Cierre de duraciones por compás y deduplicación de escena repetida.
- [x] Hook en lanzamientos/aplicaciones de escena.
- [x] Auto-stop al detener el transporte.
- [x] Persistencia con `recording` siempre en false.
- [x] Tests de duración, deduplicación y take limpio.
- [x] Integración de grabación con playback real.

## Criterios

- Grabar y lanzar dos escenas produce dos bloques reproducibles.
- La duración de cada bloque refleja los compases transcurridos.
- La misma escena repetida no duplica el bloque.
- Detener el transporte termina la grabación.
- La sesión no se carga con una grabación armada.
- `npm run typecheck`, `npm test` y `npm run test:integration` pasan.

## Riesgos

- La captura depende del reloj del transporte; sin playback no se graba nada.
- Empezar a grabar descarta el take anterior sin confirmación. Es intencional
  para mantener el flujo de performance y el estado previo queda en undo.
- Lanzar escenas muy rápido dentro del mismo compás produce bloques de 1 compás
  como mínimo.
