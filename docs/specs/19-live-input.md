---
id: spec-19
title: Entrada MIDI en vivo
status: implementada
version: 0.1.0
updated: 2026-11-10
fase: 5
depends_on: [spec-03, spec-12]
---

# Entrada MIDI en vivo

## Objetivo

Tocar el track seleccionado desde un teclado MIDI y mapear dos controles a sus macros.

## Implementación

- `ClockPort.now()` expone el tiempo del audio para disparar notas fuera del scheduler.
- `WebMidiInput` (infraestructura) pide `navigator.requestMIDIAccess()` y conecta todos
  los inputs disponibles, incluyendo cambios de estado.
- `LiveInputService`:
  - note-on dispara el track seleccionado;
  - sampler usa pitch por playbackRate;
  - membrane dispara kick;
  - poly/plugin usan canal pad;
  - mono/pluck usan canal lead;
  - CC1 y CC2 escriben las macros 1 y 2.
- La barra de sesión tiene un botón `MIDI` que alterna conexión y muestra `MIDI on`.

## Criterios

- El botón indica si MIDI está conectado.
- Note-on en un track synth dispara una nota.
- Note-on en un track sampler ajusta el pitch.
- CC1/CC2 actualizan las macros del track seleccionado.
- Si el navegador no da permiso, se informa sin romper la app.

## Pendiente

- MIDI clock y transporte.
- MIDI learn por parámetro.
- Notas con note-off y duración real.
- Grabación de la performance MIDI en clips.
