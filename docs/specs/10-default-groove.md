# Default groove

## Objetivo

Que la sesión inicial suene como una performance y no como una demo vacía. El default
usa grooves curados por escena y capas de percusión con mezcla propia.

## Patrones por escena

`src/domain/default-groove.ts` define patrones de 16 pasos para:

- `kick`, `bass`, `hihat` y `perc`;
- `track-08` (shaker) y `track-09` (percusión).

Cada escena (`umbral`, `deriva`, `pulso`, `caos`) tiene su propio groove. Los tracks de
usuario sin groove curado quedan en blanco para que el usuario los llene.

`pulses` se calcula con `countSteps(pattern)` para que el valor de Euclid refleje el
patrón real y no un seed genérico.

## Dinámica inicial

El estado inicial incluye:

- velocity con acentos y ghost notes;
- probabilidad menor en pasos de relleno;
- ratchets en shaker y percusión.

Esto se aplica a cada escena al crear el estado, no sólo al preset `Umbral`.

## Capas

El kit por defecto agrega dos capas de percusión:

| Track | Nombre | Gain | Pan | Sends |
| --- | --- | --- | --- | --- |
| `track-08` | Shaker 08 | −15 dB | +0.24 | reverb 0.22, delay 0.10 |
| `track-09` | Perc 09 | −13 dB | −0.26 | delay 0.18, reverb 0.12 |

Los tracks del núcleo también tienen paneo sutil para abrir la mezcla (hi-hat a la
derecha, percusión a la izquierda, pad y lead levemente desplazados).

## Lead

La probabilidad de nota del lead sube de 24% a 32% para que la escena no quede sólo en
pad y drone.

## Criterios

- Cualquier escena arranca con groove audible y no con un patrón vacío.
- Los tracks sin groove curado permanecen en blanco.
- Los patrones curados, `pulses`, velocity, probabilidad y ratchets sobreviven al
  round-trip de sesión.
- `npm run test:audio` sigue pasando sin clipping.
