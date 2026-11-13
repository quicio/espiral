---
id: spec-39
title: Fixes de integración entre drum kits y sampler Worklet
status: implementada
version: 0.1.0
updated: 2026-11-13
fase: 5
depends_on: [spec-34, spec-37, spec-38]
---

# Fixes de integración entre drum kits y sampler Worklet

La llegada de los drum kits cambió las máquinas de batería de varios tracks:
ahora cada slot tiene **un** sample (`909-kick`, `808-clap`, …), mientras que las
voces generativas todavía pedían índices de los bancos viejos.

## Bug 1 — índices de sample sin clamp en el Worklet

`hihatVoice` devuelve `sampleIndex` 0..7 y `bassVoice` 0..5, asumiendo los bancos
de 8 hats y 6 bajos. Con una máquina de un solo sample, el fallback
(`PoolSamplerSource`) clampeaba el índice a 0, pero `WorkletSamplerSource`
enviaba el índice crudo y el processor no encontraba buffer: esos tracks quedaban
mudos sólo en el camino Worklet.

Fix: `WorkletSamplerSource.play` normaliza el índice a
`[0, urls.length - 1]` antes de postear el mensaje. Si no hay URLs, no postea.

## Bug 2 — kick sampler disparado como membrana

`PlaybackService.triggerStep` enviaba siempre `type: 'kick'`. `AudioEngine.trigger`
resuelve ese evento sólo contra una fuente `membrane`. Con los kits nuevos el kick
es `sampler`, así que el kick quedaba mudo.

Fix: si la máquina del track kick es `sampler`, se emite un evento `sample` con
`trackId: 'kick'`, `sampleIndex: 0`, gain por velocity y duración `8n`. Si no, se
mantiene el evento `kick` histórico.

## Tests y verificación

- Test nuevo en `playback.test.ts`: un kick sampler produce un evento `sample`,
  no un evento `kick`.
- Integración: `window.__espiralSamplerMode === 'worklet'`.
- `test:audio`: el offline usa fallback y sigue determinista.
- Medición manual: kick, perc, snare/track-09, bass y track-08 tienen nivel
  después de los fixes. El hihat a −14 dB queda por debajo de la resolución del
  medidor; subido a 0 dB aparece, no está mudo.

## Fuera de alcance

- Elegir el sample correcto según pitch para bajos de un solo sample.
  `bassVoice` sigue calculando el pitch contra la tabla MIDI histórica.
- Re-mapear los índices de hats a variantes por kit.
- Cambiar el nivel por defecto de hihat.

## Riesgos

- El clamp hace que todos los golpes de un track con un solo sample usen ese
  sample; es correcto pero pierde la variación de sample del banco viejo.
- El kick sampler ignora `sampleIndex > 0`; hoy los kits tienen un solo kick.
