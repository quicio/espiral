---
id: spec-27
title: Reordenar la cadena de dispositivos por drag/drop
status: implementada
version: 0.1.0
updated: 2026-11-12
fase: 5
depends_on: [spec-02, spec-09, spec-17]
---

# Reordenar la cadena de dispositivos por drag/drop

## Objetivo

Reordenar los inserts de un track arrastrando un dispositivo dentro del rack,
sin perder los botones ↑/↓ que ya funcionan con teclado.

## Implementación

- Cada fila del rack expone `data-insert-row="trackId:insertId"`.
- El asa `⠿` es el único elemento `draggable`; los sliders y botones de la fila
  no inician drag.
- `MixService.reorderInsert(trackId, insertId, targetIndex)` mueve el insert al
  índice destino y reutiliza `commitInserts`, por lo que el motor recibe la nueva
  cadena igual que con ↑/↓.
- El drop sólo se acepta dentro del mismo rack/track. Arrastrar a otra fila de
  otro track no hace nada.
- El feedback visual usa `is-dragging` e `is-drop-target`.

## Fuera de alcance

- Drag/drop entre tracks distintos.
- Drag/drop de buses o de la cadena completa.
- Presets de cadenas de dispositivos.

## Tareas

- [x] `MixService.reorderInsert` con clamp de índice.
- [x] Asa de drag por fila, sin romper sliders ni botones.
- [x] Binding de dragstart/dragover/drop/dragend en `#sound-channels`.
- [x] Estilos de arrastre y drop.
- [x] Test unitario de reordenamiento por índice.
- [x] Check de integración con dos inserts reales.

## Criterios

- Arrastrar el primer insert sobre el segundo cambia el orden.
- Los botones ↑/↓ siguen funcionando.
- El motor recibe la cadena reordenada.
- Un drop en otro track se rechaza sin cambiar el estado.
- `npm run typecheck`, `npm test` y `npm run test:integration` pasan.

## Riesgos

- El rack se re-renderiza después del cambio; el foco se pierde como en el resto
  de los controles del mixer. La ruta accesible sigue siendo ↑/↓.
- Los parámetros del plugin se conservan porque se mueve el `InsertConfig`
  completo, no se recrea.
