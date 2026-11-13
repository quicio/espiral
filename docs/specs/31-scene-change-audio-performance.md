---
id: spec-31
title: Evitar la reconstrucción de cadenas en cambios de escena
status: implementada
version: 0.1.0
updated: 2026-11-13
fase: 5
depends_on: [spec-01, spec-18]
---

# Evitar la reconstrucción de cadenas en cambios de escena

## Síntoma

Con el arrangement reproduciendo, cada cambio de bloque producía un pico de CPU
y un corte audible. Medido en Chromium headless:

- long task de **127 ms** en la transición de bloque;
- muestreo de CPU del **45–71%** en el frame del cambio;
- sin arrangement no se reproducía.

## Causa

`SceneService.apply` llama a `MixService.syncAll(next, true)`. Ese flag fuerza
`setTrackInserts` y `setBusInserts` para **todos** los tracks y buses en cada
cambio de escena, aunque la cadena fuera idéntica.

`ModularAudioEngine.setTrackInserts` construía un `InsertChain` nuevo, lo
preparaba, conectaba, hacía crossfade y programaba el dispose de la cadena
anterior. Multiplicado por 16 tracks y los buses, el trabajo caía en el hilo
principal justo en la frontera de compás.

## Decisión

Antes de reconstruir, comparar la configuración vigente del `InsertChain` con la
solicitada:

```ts
insertConfigsEqual(current, next)
```

Compara longitud, id, plugin, bypass, `latencySamples` y todos los parámetros.
Si son iguales, `setTrackInserts`/`setBusInserts` retornan sin tocar el grafo de
audio.

El helper vive en `domain/graph.ts` y tiene tests propios. No cambia la API ni
la semántica de los inserts: si cambia cualquier parámetro o el orden, la cadena
se reconstruye como antes.

## Resultado medido (2026-11-13, Chromium headless)

| métrica | antes | después |
|---|---|---|
| long tasks durante 16 s de arrangement | 127 ms y 87 ms | **ninguna** |
| pico de CPU en cambio de bloque | 45–71% | ~2–7% |
| long tasks sin arrangement | ninguna | ninguna |

La medición es del hilo principal; el audio sigue renderizándose en el
AudioWorklet. `npm run test:audio` confirma que el PCM determinista no cambió.

## Fuera de alcance

- Cambiar el scheduler de audio o el lookahead.
- Reemplazar Tone.js.
- Optimizar el render de la UI en general.
- Cambios de escena que sí modifican inserts: siguen reconstruyendo la cadena.

## Tareas

- [x] Extraer `insertConfigsEqual` a dominio con comparación completa.
- [x] Guard en `setTrackInserts`.
- [x] Guard en `setBusInserts`.
- [x] Tests del helper.
- [x] Reproducir y medir con `PerformanceObserver` y muestreo de CPU.
- [x] Verificar que el render offline no cambia.

## Criterios

- Un cambio de escena con inserts idénticos no crea cadenas nuevas.
- Un cambio real de parámetros, bypass, plugin, orden o latencia sí reconstruye.
- Desaparecen los long tasks en la transición de bloque del arrangement.
- `npm run typecheck`, `npm test`, `npm run test:audio` y
  `npm run test:integration` pasan.

## Riesgos

- La comparación recorre parámetros una vez por track y cambio de escena; es
  barata frente a construir el grafo.
- `InsertChain.configs` es un snapshot; si un parámetro se modifica sólo en el
  audio y no en el estado, la próxima sincronización puede reconstruir la cadena
  una vez. Es el comportamiento conservador correcto.
