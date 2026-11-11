---
id: spec-23
title: Tracks dinámicos, presets y catálogo
status: implementada
version: 0.1.0
updated: 2026-11-10
fase: 5
depends_on: [spec-03, spec-11, spec-15, spec-17]
---

# Tracks dinámicos, presets y catálogo

## Objetivo

Romper la sensación de layout fijo: una base de 8 tracks de ritmo y 8 de melodía,
tracks reordenables/renombrables y más material musical para arrancar.

## Layout base

El kit por defecto ahora se ordena así:

1–8 (ritmo): Kick, Shaker, Snare, Hat Closed, Hat Open, Perc, Clap, Tom.
9–16 (melódico/texturas): Bass, Drone, Pad, Lead, Synth, Texture, Sampler, Aux.

`public/audio/snare.wav` se genera como sample sintético para que el track Snare tenga un
sonido propio. Tracks 10/11/12 dejan de ser “Track NN” y pasan a ser Hat Open, Clap y Tom.
El wizard lista los 16 elementos reales del kit.

Los roles de playback siguen siendo los mismos; lo dinámico es el orden, el nombre y la
posibilidad de agregar/quitar tracks de usuario.

## Reordenar y renombrar

- `TrackService.moveTrack(trackId, offset)` reordena el track en el kit actual y en todas
  las escenas.
- `TrackService.renameTrack(trackId, name)` actualiza kit, escenas y clips cuyo nombre
  coincidía con el anterior.
- Performance muestra flechas ↑/↓ por track.
- Sound muestra el nombre del track como input editable.

## Presets nuevos

Se agregaron:

- House (124 BPM);
- Trance (138 BPM);
- Psytrance (145 BPM);
- Trip-Hop (86 BPM).

Cada uno incluye mezcla, patrones, escenas y armonía. El wizard los lista en Base.

## Sonidos y kits

- `DRUM_SOUNDS` suma variantes de kick, bass, hats y percusión.
- `SOUND_BANK` suma toms, hats, shakers, Reese bass, órgano, campanas, FM metal y dark
  drone.
- `SOUND_KITS` suma House Kit, Trance Kit, Psy Kit y Trip-Hop Kit.

## Criterios

- El kit por defecto muestra Kick, Shaker, Snare, Hat Closed, Hat Open, Perc, Clap y Tom
  en los primeros 8 tracks.
- Mover un track cambia el orden en kit y escenas.
- Renombrar actualiza el track y sus clips por defecto.
- El wizard lista 8 bases.
- Trip-Hop carga a 86 BPM desde el preset.
- `npm test`, `npm run test:audio` y `npm run test:integration` pasan.

## Pendiente

- Convertir roles core entre drum/synth en runtime.
- Filas/columnas totalmente dinámicas en Session.
- Duplicar/eliminar roles core.
- Búsqueda remota o packs de sonidos.
