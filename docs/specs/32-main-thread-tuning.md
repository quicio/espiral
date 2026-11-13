---
id: spec-32
title: Tuning del hilo principal durante playback
status: implementada
version: 0.1.0
updated: 2026-11-13
fase: 5
depends_on: [spec-31, spec-21]
---

# Tuning del hilo principal durante playback

## Objetivo

Bajar el trabajo continuo del hilo principal para que el scheduler de audio y el
AudioWorklet tengan margen. No cambia el modelo de audio ni el sonido.

## Cambios

### Medidores a 25 Hz

El loop de `requestAnimationFrame` sigue activo para el CPU meter, pero los
medidores de master, tracks y buses se actualizan cada 40 ms en lugar de cada
frame. También se pausan con la pestaña oculta.

Los nodos DOM de medidores se cachean y se invalidan cuando se vuelve a renderizar
Sound o Routing. Antes cada frame hacía `querySelector`/`querySelectorAll` para
cada track y bus.

### Playhead sin recorrer todo el patrón

Cuando sólo cambia `transport.currentStep`, el render usa `syncPlayhead`:

- quita `is-current` de los elementos que lo tenían;
- lo pone en los `[data-pattern-step="N"]` y `[data-pulse-step="N"]`;
- actualiza sólo los readouts de paso.

`updatePatternClasses` queda para cambios reales de patrón, selección o render
completo. Antes cada paso recorría todos los pasos de todos los tracks y
recalculaba clases y locks.

### Modulación apagada no consume ticker

`ModulationService.start()` no suscribe el ticker si la modulación está
deshabilitada. `setEnabled(true/false)` arranca o detiene el ticker. El control
rate bajó de 60 Hz a 30 Hz; los LFO de audio siguen en el grafo Web Audio.

## Resultado medido (2026-11-13, Chromium headless)

- 16 s de arrangement, 4 bloques, 16 tracks: **cero long tasks**.
- CPU meter durante el playback: **0–9%** con un pico aislado en el cambio de
  bloque, contra 45–71% antes de spec 31.
- Perfil de 8 s: `querySelectorAll`/`querySelector` bajan a un tercio.
- `test:audio` sigue dando el mismo PCM determinista.

La comparación de CPU es orientativa: el propio medidor cambió de frecuencia de
muestreo.

## Fuera de alcance

- Mover síntesis/samples a AudioWorklet.
- Renderizar sólo la vista activa.
- Cambiar `latencyHint` del `AudioContext`.
- Reemplazar Tone.js.

## Riesgos

- Los medidores pueden verse un poco menos fluidos; 25 Hz es suficiente para
  nivel.
- Si un render reemplaza los nodos de medidor y no marca la caché como sucia, los
  medidores quedan congelados. La invalidación está en `renderAll`,
  `refreshSound` y `setView`.
- El ticker de modulación a 30 Hz puede perder cambios de macro muy rápidos; los
  LFO de audio no se ven afectados.
