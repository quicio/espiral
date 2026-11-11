---
id: spec-20
title: Importación de audio
status: implementada
version: 0.1.0
updated: 2026-11-10
fase: 5
depends_on: [spec-03, spec-13]
---

# Importación de audio

## Objetivo

Permitir que un archivo de audio entre al instrumento como un track sampler con su clip.

## Implementación

- `FileGatewayPort.readFileAsDataUrl(file)` lee el archivo en el browser.
- `TrackService.addAudioTrack(name, dataUrl)`:
  - crea un track sampler de usuario;
  - usa el data URL como único sample;
  - crea un patrón de un paso en el step 0;
  - crea clips en las cuatro escenas y activa el de la escena actual;
  - agrega la fuente al motor.
- La barra de sesión expone `+ audio` y un file input `audio/*`.
- El nombre del track sale del nombre del archivo.

## Criterios

- Importar un WAV agrega un track y lo deja seleccionado.
- El track aparece en Session con clip activo.
- El step 0 dispara el sample.
- El track importado se puede mezclar, mutear y guardar en sesión.
- `npm test` y `npm run test:integration` pasan.

## Pendiente

- Warp markers y modos de warp.
- Waveform, inicio/fin, loop y pitch.
- Slice a sampler o pads.
- Límite de tamaño y almacenamiento de audio fuera de localStorage.
