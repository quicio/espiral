---
id: spec-29
title: Loop y locators del arrangement
status: implementada
version: 0.1.0
updated: 2026-11-13
fase: 5
depends_on: [spec-18]
---

# Loop y locators del arrangement

## Objetivo

Repetir un tramo del arrangement sin reiniciar el transporte ni reconstruir los
bloques. El loop se define por bloques, se ve en la timeline y sobrevive a la
sesión.

## Modelo

`ArrangementState` suma:

- `loop: boolean`;
- `loopStart: number` (índice de bloque, inclusivo);
- `loopEnd: number` (índice de bloque, exclusivo).

El rango se normaliza siempre a `0 <= loopStart < loopEnd <= blocks.length`.
Al agregar un bloque con el loop cubriendo todo el final, el rango se extiende.
Al eliminar bloques, el rango se recorta.

## Playback

`ArrangementService.onStep` mantiene la lógica de compases por bloque y agrega:

- al terminar un bloque, calcula el próximo índice circular;
- si el loop está activo y el próximo índice cae fuera de
  `[loopStart, loopEnd)`, salta a `loopStart`;
- si el bloque actual quedó fuera del rango (por ejemplo, al mover locators en
  vivo), el próximo salto entra al rango.

`reset()` y la activación del arrangement arrancan en `loopStart` cuando el loop
está activo. `toggle()` no cambia el transporte ni corta el audio.

## UI

En Arrange:

- botón `Loop` con `aria-pressed`;
- selects `Desde` y `Hasta` con número y nombre de bloque;
- los bloques dentro del rango llevan `is-loop` y una marca superior;
- el readout muestra `loop a–b` cuando está activo.

## Persistencia

El arrangement se sigue persistiendo dentro de `SessionDto`; `readArrangement`
lee y recorta `loop`, `loopStart` y `loopEnd`, con fallback para sesiones viejas
(sin loop, rango completo).

## Fuera de alcance

- Locators por compás/beat dentro de un bloque.
- Loop de una selección de clips o de una pista.
- Grabación de performance.
- Automatización por bloque.

## Tareas

- [x] Campos de loop en `ArrangementState` y estado inicial.
- [x] `setLoop` y `setLoopRange` con normalización.
- [x] Ciclo en `onStep`, `reset` y `toggle`.
- [x] Extensión/recorte del rango al agregar o eliminar bloques.
- [x] Controles y marcadores en la timeline.
- [x] Lectura/escritura en sesión.
- [x] Tests de ciclo, arranque y recorte.
- [x] Integración de controles y clases visuales.

## Criterios

- Un loop sobre dos bloques de un compás vuelve al primero al terminar el segundo.
- Reset y activación arrancan en el bloque inicial del loop.
- El rango se recorta al eliminar bloques.
- La sesión guarda y carga el loop.
- `npm run typecheck`, `npm test` y `npm run test:integration` pasan.

## Riesgos

- Definir el loop por bloques es menos flexible que por compases; se eligió para
  no introducir todavía una regla de tiempo absoluto.
- Cambiar los locators en vivo puede producir un salto en la próxima frontera de
  compás; es intencional y no corta el transporte.
