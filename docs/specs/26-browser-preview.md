---
id: spec-26
title: Preview de sonidos del browser
status: implementada
version: 0.1.0
updated: 2026-11-12
fase: 5
depends_on: [spec-17, spec-25, adr-0002]
---

# Preview de sonidos del browser

## Objetivo

Escuchar un preset del browser antes de aplicarlo, sin modificar el track, la
selección ni el estado de la sesión.

## Decisión

El preview es una capacidad del motor, no un cambio de estado. `AudioEnginePort`
suma:

```ts
previewMachine(
  machine: MachineConfig,
  notes: readonly string[],
  duration?: NoteDuration
): void;
```

`ModularAudioEngine` materializa un **track de preview** fuera de `state.kit` y
fuera del mapa de tracks que sincroniza `MixService`. Ese track:

- se crea la primera vez que se pide un preview;
- va directo al master con `-6 dB`, sin inserts ni sends;
- reemplaza su fuente si cambia la máquina;
- se detiene con `stop()` y se libera con `dispose()`;
- no participa de la mezcla, el routing, los meters de tracks ni la sesión.

El preview no toca `state.kit`, `state.pattern`, `activeClips` ni los recientes.
Aplicar el sonido sigue siendo una acción separada.

## Notas

`BrowserService.preview` traduce el `NoteSource` del preset con la armonía
vigente:

- `fixed` usa la nota del preset;
- `scale-degree` usa `scaleDegreeMidi` + `midiToNote`;
- `chord` usa `chordNotes` con el tamaño del preset.

Para samplers se espera `Tone.loaded()` antes de disparar; para el resto se
dispara después de `Tone.start()`, que aprovecha el gesto del click.

## UI

Cada tarjeta del browser suma un botón `▶` junto a la estrella. El botón:

- tiene `aria-label="Escuchar …"` y `title`;
- funciona aunque el track destino no sea editable;
- no aplica el preset ni registra recientes.

## Fuera de alcance

- Preview con la cadena de inserts del track destino.
- Preview de kits completos o de presets musicales.
- Loop o secuencia de preview.
- Medición de nivel específica del preview.

## Tareas

- [x] Puerto `previewMachine` y tipo `NoteDuration`.
- [x] Track de preview aislado en `ModularAudioEngine`.
- [x] Resolución de notas por `NoteSource` en `BrowserService`.
- [x] Botón de preview en cada tarjeta.
- [x] `FakeAudioEngine` registra previews para tests.
- [x] Test de que el preview no cambia el estado.
- [x] Integración: preview no altera la máquina del track.

## Criterios

- El preview suena sin cambiar el track seleccionado ni su máquina.
- Aplicar después del preview funciona igual que antes.
- El track de preview no aparece en mixer, routing, meters ni sesión.
- `npm run typecheck`, `npm test`, `npm run test:audio` y
  `npm run test:integration` pasan.

## Riesgos

- Un preview de pad con release largo puede seguir sonando al aplicar otro
  sonido; el track de preview es independiente y se detiene en `stop()`.
- Los samples dependen de `Tone.loaded()`; si la red falla, el preview se
  registra como error de consola pero no rompe la app.
- Mantener un track de preview vivo consume una voz más; el costo es fijo y no
  escala con los tracks del usuario.
