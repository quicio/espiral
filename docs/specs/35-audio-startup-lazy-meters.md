---
id: spec-35
title: Arranque de audio y medidores perezosos
status: implementada
version: 0.1.0
updated: 2026-11-13
fase: 5
depends_on: [spec-32, spec-34]
---

# Arranque de audio y medidores perezosos

## Objetivo

Reducir el trabajo que se paga al iniciar y al abrir vistas, sin cambiar el
sonido ni el modelo de datos.

## Cambios

### Medidores por track/bus perezosos

Cada `Track` y `Bus` creaba un `Tone.Meter` (AnalyserNode) y lo conectaba al
grafo aunque la vista Sound/Routing nunca se abriera. Con 16 tracks más buses,
eso era costo permanente en el hilo de audio.

Ahora el medidor se crea la primera vez que `getLevel()` se llama. La UI sólo
pide niveles cuando hay medidores en el DOM (Sound o Routing). Al abrir esas
vistas se crean una vez y se reutilizan.

### Medidores repartidos por frame

El loop de medidores actualiza como máximo 8 tracks y 4 buses por muestra de
25 Hz, en round-robin. Evita que la primera apertura de Sound cree/lea 16
analizadores en un solo tick. Cada medidor se refresca varias veces por segundo;
el CPU meter y el master siguen a 25 Hz.

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
- Un medidor creado tarde no existe para el motor hasta que la UI lo pide; no
  afecta audio.
- El lookahead mayor agrega latencia de scheduling; sigue siendo configurable.
