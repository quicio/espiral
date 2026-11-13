---
id: spec-34
title: Buffers de sample compartidos entre tracks
status: implementada
version: 0.1.0
updated: 2026-11-13
fase: 5
depends_on: [spec-01, spec-04]
---

# Buffers de sample compartidos entre tracks

## Problema

Cada `SampleVoicePool` construía varios `Tone.Player`, y cada `Tone.Player`
descargaba y decodificaba su propio WAV. Un mismo archivo usado por varios
tracks o voces se decodificaba muchas veces.

En el set por defecto, la integración pasó de **57 respuestas `.wav`** a **6
peticiones únicas** después del cambio. El costo se pagaba al iniciar
(decodificación) y en memoria.

## Solución

`SampleLibrary` mantiene un `Tone.ToneAudioBuffer` por URL:

- `load(url)` devuelve el buffer ya cargado si existe;
- comparte la promesa mientras está en vuelo para evitar cargas duplicadas;
- `dispose()` libera todos los buffers.

`SampleVoicePool` pide el buffer compartido en `prepare()` y lo asigna a todas
sus voces con `player.buffer = buffer`. Las voces siguen siendo persistentes:
no se crea un nodo por nota.

`ModularAudioEngine.prepare()` espera la preparación de todos los pools sampler,
además de inserts e instrumentos. El preview de un sampler también espera su
pool antes de disparar.

## Por qué no AudioWorklet todavía

Se evaluó un pool nativo con `AudioBufferSourceNode`, pero mezclar nodos nativos
con el contexto estandarizado de Tone rompía las conexiones
(`A value with the given key could not be found`). La solución compartida con
`ToneAudioBuffer` reduce decodificación y memoria sin salir del contexto de Tone.

El sampler en AudioWorklet sigue siendo el siguiente salto si hace falta bajar
CPU de reproducción, no sólo decodificación.

## Fuera de alcance

- Sampler en AudioWorklet.
- Streaming de samples largos.
- Compartir buffers entre contextos de audio distintos.
- Cambiar la calidad o el pitch de reproducción.

## Tareas

- [x] `SampleLibrary` con cache por URL y promesas en vuelo.
- [x] `SampleVoicePool` usa buffer compartido.
- [x] `prepare()` del motor espera samples.
- [x] Preview espera el buffer antes de disparar.
- [x] `dispose()` libera la librería.
- [x] `test:audio` verde con el render determinista.
- [x] Integración verde y menos peticiones de samples.

## Criterios

- Un WAV usado por más de un track se descarga/decodifica una vez.
- El motor queda listo después de `prepare()`.
- El preview de sampler no dispara antes de tener buffer.
- `npm run typecheck`, `npm test`, `npm run test:audio` y
  `npm run test:integration` pasan.

## Riesgos

- Un `ToneAudioBuffer` compartido no debe mutarse por track; los players sólo lo
  referencian y cambian `playbackRate`, no el buffer.
- El cache vive por instancia de motor; en el render offline cada escenario usa
  su propio contexto y su propia librería.
