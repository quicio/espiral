---
id: spec-37
title: Sampler en AudioWorklet con fallback
status: implementada
version: 0.1.0
updated: 2026-11-13
fase: 5
depends_on: [spec-04, spec-34, spec-35]
---

# Sampler en AudioWorklet con fallback

## Objetivo

Sacar la reproducción de samples del grafo de `Tone.Player` por voz. Un solo
`AudioWorkletNode` por máquina sampler mezcla las voces en el hilo de audio, sin
crear un nodo de Tone por nota.

## Arquitectura

- `SamplerVoiceSource` es la interfaz que usa el motor: `prepare`, `play`,
  `stop`, `dispose`.
- `WorkletSamplerSource`:
  - carga el módulo `espiral-sampler`;
  - descarga/decodifica los WAV con `SampleLibrary`;
  - copia los canales a `Float32Array` y los transfiere al processor;
  - crea un `AudioWorkletNode` (0 inputs, 2 outputs) conectado al input del
    track;
  - envía `play` con tiempo, índice, rate, duración, gain y fades.
- `PoolSamplerSource` es el fallback con los `Tone.Player` de siempre.
- `createSamplerSource` elige fallback en render offline. En vivo intenta
  Worklet y, si falla el módulo/nodo, cae al fallback con un `console.warn`.

## Processor

`src/infrastructure/audio/worklets/sampler.worklet.js`:

- guarda buffers por índice;
- programa voces por delay de frames;
- mezcla con interpolación lineal y `playbackRate`;
- aplica fade in/out y gain lineal;
- respeta `maxVoices`;
- compacta el arreglo de voces en el mismo buffer para no asignar por bloque.

## Verificación

- `test:audio` sigue usando el fallback offline, por lo que el PCM determinista
  no depende del worklet.
- La integración verifica `window.__espiralSamplerMode === 'worklet'` al empezar
  a reproducir; si cae al fallback, falla el check.
- `npm run build` emite `sampler.worklet-*.js`.

## Fuera de alcance

- Loop, warp o slicing en el worklet.
- Compartir buffers entre nodos con `SharedArrayBuffer`.
- Efectos por voz dentro del worklet.
- Usar el worklet en el render offline.

## Riesgos

- Si el navegador no soporta AudioWorklet o falla `addModule`, se usa el
  fallback de Tone.Player.
- El worklet no está cubierto por `test:audio` (offline). La integración cubre
  que se active, no la calidad subjetiva.
- Los buffers se copian una vez por track sampler; no se comparten entre nodos.
- Un nodo worklet por máquina sampler queda procesando bloques aunque no haya
  voces; el costo es bajo frente a un nodo por voz.
