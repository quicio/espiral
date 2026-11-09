# Spec: export de audio

- **Fase:** 4
- **Depende de:** motor modular, render offline
- **Estado:** implementado

## Objetivo

Exportar la performance actual a un archivo WAV sin capturar audio en tiempo real.

## Flujo

1. El usuario pulsa **Exportar WAV** en la barra de sesión.
2. `ExportService` toma el `InstrumentState` actual.
3. `ToneOfflineRenderer` renderiza 8 compases + 2 s de cola con un
   `OfflineAudioContext`.
4. Se usa el mismo `ModularAudioEngine` y `PlaybackService` que en vivo.
5. El buffer se codifica como WAV PCM 16-bit.
6. `BrowserFileGateway` descarga `espiral-export.wav`.

## Arquitectura

- `AudioExportPort`: `render(state, { bars, tailSeconds }) → Promise<Blob>`.
- `ToneOfflineRenderer`: implementación con Tone.Offline.
- `ExportService`: coordina render, descarga y estado.
- `encodeWav`: codificador PCM puro, testeable sin navegador.
- `FileGatewayPort.downloadBlob`: descarga binaria reutilizable.

## UI

- Botón `Exportar WAV` junto a las acciones de sesión.
- Se deshabilita mientras renderiza.
- Estado: `Renderizando audio…` → `Audio exportado.` / error.

## Límites

- Exporta la escena y el estado actuales.
- No exporta escenas múltiples ni automatización fuera de la ventana.
- La duración es fija: 8 compases + 2 s.
- El render corre offline, no en tiempo real.

## Tareas

- [x] `AudioExportPort`.
- [x] Renderer offline con motor modular.
- [x] Codificador WAV PCM 16-bit.
- [x] Descarga binaria en `FileGatewayPort`.
- [x] Botón y estados de UI.
- [x] Tests de WAV, ExportService y smoke de descarga.
- [ ] Duración configurable desde la UI.
- [ ] Exportar todas las escenas.
