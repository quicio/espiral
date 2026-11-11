---
id: spec-18
title: Arrangement de escenas
status: implementada
version: 0.1.0
updated: 2026-11-10
fase: 5
depends_on: [spec-13, spec-15]
---

# Arrangement de escenas

## Objetivo

Convertir una performance de Session en una secuencia reproducible de escenas.

## Modelo

`ArrangementState`:

- `enabled`;
- `blocks: { id, sceneId, bars }[]`;
- `blockIndex`;
- `bar`.

El estado inicial trae cuatro bloques de cuatro compases, uno por escena. La sesión v2
persiste el arrangement con validación de escenas y compases.

## Playback

`ArrangementService.onStep(stepCount)` se ejecuta antes de disparar cada paso:

- en cada frontera de compás incrementa `bar`;
- al terminar los compases del bloque avanza al siguiente y aplica su escena;
- al final vuelve al primer bloque.

`PlaybackService` recibe el servicio como dependencia opcional, por lo que los tests de
playback no necesitan el arrangement.

## UI

Nueva vista **Arrange**:

- toggle Activar/Detener;
- readout de bloque y compás;
- timeline horizontal de bloques;
- agregar bloque con selector de escena;
- editar compases;
- mover izquierda/derecha;
- eliminar bloque;
- volver al inicio.

## Criterios

- Activar arrangement aplica la primera escena y mantiene el transporte.
- Un bloque de 1 compás cambia de escena al paso 16.
- Agregar, mover y eliminar bloques funciona.
- El arrangement sobrevive al round-trip de sesión.
- `npm test`, `npm run test:audio` y `npm run test:integration` pasan.

## Pendiente

- Grabación de performance a arrangement.
- Locators, loop y automatización por bloque.
- Bloques por track/clip en la timeline.
- Export del arrangement.
