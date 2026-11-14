---
id: adr-0007
title: AudioCore propio con render puro y un adapter de AudioWorklet
status: aceptada
version: 1.0.0
updated: 2026-11-14
---

# ADR-0007 — AudioCore propio con render puro y un adapter de AudioWorklet

## Contexto

El motor actual (`ModularAudioEngine` + `ToneClock`) usa Tone.js para construir
el grafo de audio y `Tone.Transport` para el reloj. Funciona, pero tiene tres
techos:

1. **Calidad:** el DSP y los envelopes son los de Tone; no controlamos
   anti-aliasing, oversampling, respuesta de filtros ni el gain staging fino.
2. **Rendimiento:** el grafo se construye y se muta desde el hilo principal; cada
   track con inserts suma nodos, y las cadenas de reverb/delay se multiplican por
   track.
3. **Testabilidad:** el render offline depende de `Tone.Offline` y de Playwright.
   No podemos testear una voz o un master en Node con PCM determinista.

La referencia de producto (JIANT/VIBE) confirma que el camino no es “otra
librería de nodos”: es un motor de presupuesto fijo cuyo render no dependa del
DOM ni del hilo principal.

## Decisión

1. **Crear un AudioCore propio en TypeScript**, sin Tone, sin DOM y sin
   `AudioContext` dentro del núcleo.
2. **El core es puro:** recibe eventos con timestamp, renderiza buffers
   `Float32Array` y expone su estado de transporte. Se puede ejecutar en Node,
   en un `AudioWorkletProcessor` o en un render offline.
3. **Adapter de AudioWorklet:** el core corre en el hilo de audio; el hilo
   principal solo envía eventos y recibe medidores/estado. En una fase posterior
   se evalúa Worker + ring buffer, si el deploy permite `SharedArrayBuffer`.
4. **Presupuesto fijo:** máximo de tracks y voces, robo de voces, mute que apaga
   voces y cero allocations en el render.
5. **Migración detrás de `AudioEnginePort`:** el core se enchufa como una
   implementación más y se elige en `main.ts` con un flag. La UI, el estado y
   `PlaybackService` no se tocan durante la paridad.
6. **Tone.js queda encapsulado y se retira del camino de audio** cuando haya
   paridad de máquinas, mezcla, inserts y buses. La dependencia puede seguir para
   herramientas puntuales, pero no para producir samples.

## Consecuencias

- **Positivas:** control total del DSP y del gain staging; render determinista en
  Node; tests de calidad medibles (aliasing, THD, DC, clicks, cola de kick);
  menos trabajo en el hilo principal; base para voces fijas y modos de CPU.
- **Negativas:** es un motor nuevo, no un tuning. Hay que portar voces, FX,
  inserts, buses y PDC; durante la migración conviven dos motores. El riesgo de
  regresión de sonido es real y exige A/B medido, no solo tests de “no silencio”.
- **Neutras:** el contrato de eventos (`SoundEvent`) se mantiene; el core nuevo
  recibe eventos ya resueltos. El secuenciador sigue en `PlaybackService` en v0 y
  se evalúa moverlo al core después de la paridad.

## Alternativas consideradas

- **Seguir optimizando Tone:** bajo riesgo, pero no resuelve el techo de calidad
  ni la construcción de grafo en el hilo principal.
- **Reescribir todo en WebAssembly desde el día uno:** máximo control, pero
  multiplica el coste y el toolchain antes de saber si el modelo de voces y FX es
  el correcto.
- **Elementary Audio u otro motor declarativo:** buen fit para synths en
  AudioWorklet, pero es una dependencia nueva, una reescritura igual y menos
  control sobre el DSP de detalle.
- **Worker + ring buffer como único camino:** deseable para aislar draws largos,
  pero depende de COOP/COEP. El core puro permite empezar en AudioWorklet y
  agregar el Worker después sin reescribir el DSP.

## Referencias

- `docs/specs/43-audiocore.md`
- `docs/performance.md`
- `docs/architecture.md`
