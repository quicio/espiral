---
id: spec-17
title: Browser de sonidos
status: implementada
version: 0.1.0
updated: 2026-11-10
fase: 5
depends_on: [spec-11, spec-14]
---

# Browser de sonidos

## Objetivo

Convertir el banco de sonidos en un browser más directo y arrastrable.

## Implementación

- El drawer se llama **Browser de sonidos**.
- Tiene búsqueda por nombre, descripción o categoría.
- Los filtros ocultan tarjetas y categorías sin resultados.
- Las tarjetas son `draggable`.
- Cada fila del mixer acepta drop:
  - en tracks editables aplica el preset al track;
  - en tracks de batería muestra un mensaje para usar el kit del wizard.
- El click sigue aplicando al track seleccionado.

## Criterios

- Buscar `acid` deja visible sólo Acid Bass.
- Arrastrar un preset a un track editable lo aplica sin cambiar el track seleccionado.
- El drawer cerrado no ocupa espacio.
- `npm test` y `npm run test:integration` pasan.

## Pendiente

- Preview/audition sin modificar el track.
- Favoritos y recientes.
- Presets de cadenas de dispositivos.
- Drag/drop de dispositivos dentro del rack.
