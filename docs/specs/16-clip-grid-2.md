---
id: spec-16
title: Clip Grid 2 — clips independientes
status: implementada
version: 0.1.0
updated: 2026-11-10
fase: 5
depends_on: [spec-13, adr-0005]
---

# Clip Grid 2 — clips independientes

## Objetivo

Desacoplar el patrón de cada clip del snapshot de escena. Cada clip guarda su propio
patrón, por lo que editar un clip no modifica los demás.

## Modelo

`ClipState.pattern: TrackPatternData` contiene:

- steps, pulses, frozen;
- locks;
- velocity, probability, ratchets.

`materializeClips(state)` copia el patrón vivo de cada clip activo a su `ClipState`.
SessionMapper usa esta función antes de serializar.

Al cambiar de clip:

1. el patrón vivo saliente se guarda en el clip saliente;
2. se carga `clip.pattern` en el patrón vivo;
3. se actualiza `activeClips`.

`SceneService.apply` reconstruye el patrón vivo desde los clips de la escena destino y
mantiene las escenas como fuente de kit/armonía.

## Edición

`ClipService` ahora permite:

- crear un clip en un slot vacío;
- duplicar a un slot libre del mismo track;
- renombrar;
- cambiar color;
- eliminar.

La UI muestra un botón `+` en slots vacíos y un inspector con nombre, color, duplicar y
eliminar.

## Criterios

- Editar un clip activo, cambiar a otro y volver conserva el patrón.
- Crear/duplicar/renombrar/colorear/eliminar funciona sin tocar otros clips.
- La sesión conserva el patrón de cada clip.
- `npm test`, `npm run test:audio` y `npm run test:integration` pasan.

## Pendiente

- Slots y filas dinámicas más allá de las cuatro escenas.
- Longitud/loop por clip.
- Drag/drop de clips entre slots.
