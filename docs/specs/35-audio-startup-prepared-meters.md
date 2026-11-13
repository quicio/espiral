---
id: spec-35
title: Arranque de audio y medidores preparados
status: implementada
version: 0.1.0
updated: 2026-11-13
fase: 5
depends_on: [spec-32, spec-34]
---

# Arranque de audio y medidores preparados

## Objetivo

Reducir el trabajo que se paga al iniciar y evitar que abrir Sound/Routing durante
el playback modifique el grafo de audio.

## Cambios

### Medidores preparados antes del transporte

Cada `Track` y `Bus` crea su `Tone.Meter` (AnalyserNode) en `prepare()`, antes de
que el transporte arranque. Antes se creaban en el primer `getLevel()`, que podía
ocurrir mientras sonaba la música al abrir Sound/Routing por primera vez.

- En el render offline no se crean: no hay UI que los lea.
- `prepare()` es idempotente, así que el prewarm y el play comparten el trabajo.
- Los medidores se siguen leyendo en batches de 8 tracks / 4 buses por muestra de
  25 Hz para no leer 16 analizadores en un tick.

### Medidores repartidos por frame

El loop de medidores actualiza como máximo 8 tracks y 4 buses por muestra de
25 Hz, en round-robin. Evita leer 16 analizadores en un solo tick. Cada medidor
se refresca varias veces por segundo; el CPU meter y el master siguen a 25 Hz.

### `prepare()` idempotente

`ModularAudioEngine.prepare()` guarda la promesa en vuelo. Si el prewarm del
armado y el primer play coinciden, el trabajo se hace una vez y ambos esperan la
misma promesa.

### Lookahead por defecto

El buffer de scheduling por defecto pasó de 100 ms a 150 ms. El control sigue
disponible y se persiste por sesión. No cambia el buffer del `AudioContext`.

## Resultado medido (2026-11-13, Chromium headless)

- Playback + cambios por las siete vistas: **cero long tasks** después del
  arranque.
- Long tasks de arranque: **124 ms + 53 ms** (parseo/mount iniciales).
- `test:audio` con el mismo render válido y determinista.
- Integración con 17 respuestas `.wav` únicas (antes 57), sin errores.

## Fuera de alcance

- Cambiar `latencyHint` del `AudioContext`.
- Sampler en AudioWorklet.
- Medidores por compresor o por insert.

## Riesgos

- Los medidores de tracks pueden verse menos frecuentes cuando hay muchos
  tracks; el master y el CPU meter no.
- Los medidores ahora se pagan en `prepare()`; si el usuario nunca abre
  Sound/Routing, es un costo fijo pequeño a cambio de no tocar el grafo en vivo.
- El lookahead mayor agrega latencia de scheduling; sigue siendo configurable.
