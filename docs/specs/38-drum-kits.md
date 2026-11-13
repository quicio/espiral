---
id: spec-38
title: Drum kits — máquinas con samples de dominio público
status: implementada
version: 1.0.0
updated: 2026-11-13
fase: 6
depends_on: [spec-11, spec-15, spec-37, adr-0006]
---

# Drum kits

## Objetivo

Que las baterías suenen a algo. Antes de esta spec los 8 sound kits eran
permutaciones de 17 sonidos construidos sobre tres wavs (`hihat-0x.wav`,
`perc.wav`, `bass-*.wav`): el kick cambiaba, el resto era el mismo sample con otro
fade. La variedad era nominal.

Ahora cada estilo tiene una **máquina** detrás (909, 808, 505, CR-78, LinnDrum,
Rhythm King, Pearl acústica) con sus propios one-shots, y el usuario puede
cambiar la máquina completa o sonido por sonido.

## Modelo

Dos niveles, separados a propósito:

| nivel | dónde | qué decide |
|---|---|---|
| `DrumKit` | `src/domain/drum-kits.ts` | de qué máquina sale cada slot (kick, snare, hats, perc, rim, shaker) |
| `SoundKit` | `src/domain/sound-kits.ts` | qué drum kit usa y con qué bajo/pad/lead/drone se combina |

`DrumKit` es dato puro: id, código corto, máquina, año, familia, estilos,
licencia, origen y la lista de slots con su archivo. `drum-sounds.ts` deriva de
ahí los `DrumSound` (`909-kick`, `808-clap`, …) y `sound-kits.ts` arma cada kit
de estilo con `drumKitSoundMap()`.

Mapeo fijo slot → track: `kick→kick`, `snare→track-09`, `clap→track-11`,
`hat-closed→hihat`, `hat-open→track-10`, `tom→track-12`, `perc→perc`,
`rim→track-16`, `shaker→track-08`.

## Kits built-in

| kit | máquina | estilos |
|---|---|---|
| Techno Kit | TR-909 (Detroit) | techno, house, trance |
| House Kit | TR-505 | house, electro, breaks |
| Trance Kit | TR-909 SP | trance, house |
| Psy Kit | TR-909 tight | psytrance, techno |
| Dub Kit | CR-78 | dub, triphop, ambient |
| Breaks Kit | LinnDrum LM-2 | breaks, house, electro |
| Ambient Kit | Pearl Master Studio | ambient, triphop, acoustic |
| Trip-Hop Kit | Rhythm King MRK-2 | triphop, dub, lo-fi |
| Hip-Hop Kit | TR-808 | hiphop, trap, electro |

Techno y Psy comparten máquina: la variante tight usa el kick corto, otros hats y
otros toms del mismo pack. La envolvente del kick sigue siendo la misma grabación
recortada (correlación 0.95), así que la diferencia entre esos dos kits está sobre
todo en bajo, pad, lead y percusión. La correlación promedio entre los 9 kicks es
0.63; el par más distinto (808 vs MRK-2) da 0.16.

## Samples

- Origen: [`oramics/sampled`](https://github.com/oramics/sampled) — los metadatos
  de cada máquina declaran `license: Public Domain`.
- 9 máquinas, 71 one-shots, **1.79 MB** en `public/audio/kits/<kit>/<slot>.wav`.
- Formato: mono, 44.1 kHz, PCM 16 bit. Silencio recortado al inicio y al final.
- Un único factor de ganancia por kit (pico a −1 dBFS), para conservar el balance
  interno del pack. El nivel de mezcla lo sigue poniendo el track.
- Se regeneran con `python3 scripts/fetch-drum-kits.py` (idempotente, `--force`
  para rehacer todo). El script documenta la tabla slot → archivo fuente.
- Atribución y links en `public/audio/kits/README.md`.

## UI

El wizard de armado pasa de 5 a 7 secciones:

1. Base · 2. Música · 3. Escena · 4. Elementos · 5. Kit · 6. Batería · 7. Sonidos.

- **6 · Batería**: una tarjeta por máquina (código + estilos). Cambia todos los
  slots de batería de una vez y deja el kit en `Custom`.
- **7 · Sonidos**: un select por track. Ahora el kick ofrece 4 kicks sintetizados
  + 9 de máquina; los hats, 9 + los legacy. Los sonidos viejos ya no se ofrecen
  pero siguen resolviendo si un kit guardado los referencia.
- El estado de la máquina vive en `ArmWizardState.drumKitId` y se muestra en
  `#arm-kit-status`.

## Criterios de aceptación

- [x] `npm run typecheck` limpio.
- [x] `npm test` verde (220 tests).
- [x] `vite-node scripts/check-drum-kits.ts` confirma que cada wav declarado
      existe y que no hay wavs huérfanos (corre antes de `npm test`).
- [x] Cada `SOUND_KIT` built-in apunta a un drum kit distinto y todos sus sonidos
      son opciones válidas para su track.
- [x] `npm run test:audio` verde.
- [x] `npm run test:integration` verde.
- [x] Elegir máquina en el wizard deja los selects de batería en `909-*`,
      `808-*`, etc.; armar el set pide los wavs del kit con 200.

## Riesgos y límites

- Los packs son one-shots secos: sin round-robin ni velocity. Un mismo sample
  suena idéntico en cada golpe.
- No hay variación por acento: el motor dispara un único archivo por slot.
- El reemplazo de máquina toca todas las escenas (`applyKitSound` replica), así
  que no hay batería distinta por escena.
- El bundle creció ~8 kB gzip por los metadatos de los kits (nombres, estilos,
  origen). Los wav no entran al bundle: se sirven desde `public/`.

## Fuera de alcance

- Importar kits de usuario desde archivo (ZIP/JSON) en runtime.
- Editar el mapeo slot → track desde la UI.
- Round-robin, velocity layers y choke entre hats.
- Kits de fábrica con licencia CC-BY que requieran atribución en la UI.
