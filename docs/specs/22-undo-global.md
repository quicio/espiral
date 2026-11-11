---
id: spec-22
title: Undo global
status: implementada
version: 0.1.0
updated: 2026-11-10
fase: 5
depends_on: [spec-03]
---

# Undo global

## Objetivo

Deshacer y rehacer cambios de instrumento sin depender de cada servicio.

## Implementación

`HistoryService` escucha el store y guarda snapshots del estado anterior:

- ignora cambios efímeros de transporte (`playing`, `preparing`, `currentStep`);
- registra cambios musicales, incluyendo BPM, swing, humanize y lookAhead;
- coalesce acciones en una ventana de 250 ms;
- mantiene hasta 50 pasos;
- limpia redo ante un cambio nuevo.

`undo()` y `redo()` preservan el estado de transporte actual y restauran el resto del
estado. La UI tiene botones `Deshacer`/`Rehacer` y `Cmd/Ctrl+Z` / `Cmd/Ctrl+Shift+Z`.

## Criterios

- Deshacer un cambio de volumen, track, preset o clip restaura el estado previo.
- Los cambios de `playing`/`currentStep` no generan pasos de historial.
- Rehacer vuelve a aplicar el cambio deshecho.
- El historial se limita a 50 pasos.
- `npm test` y `npm run test:integration` pasan.

## Pendiente

- Etiquetas de acción por paso (`Deshacer: eliminar track`).
- Historial agrupado por transacción explícita.
- Persistencia del historial entre sesiones.
