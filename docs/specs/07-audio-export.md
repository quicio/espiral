# Spec: export de audio

- **Fase:** 4
- **Depende de:** motor modular, render offline
- **Estado:** implementado

## Objetivo

Exportar la performance actual a un archivo WAV sin capturar audio en tiempo real.

## Flujo

1. El usuario pulsa **Exportar WAV** en la barra de sesión.
2. `ExportService` toma el `InstrumentState` actual.
3. `ToneOfflineRenderer` renderiza la cantidad de compases y cola elegidas en un
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
- Selector de escena: `Actual` o cualquiera de las escenas del catálogo.
- Selector de compases: 1, 2, 4, 8 o 16.
- Selector de cola: 0, 1, 2 o 4 segundos.
- El botón se deshabilita mientras renderiza.
- Estado: `Renderizando audio…` → `Audio exportado.` / error.

## Límites

- Exporta una escena por vez.
- La escena `Actual` usa el estado vivo; las demás usan su snapshot.
- La duración se elige entre opciones fijas.
- El render corre offline, no en tiempo real.

## Tareas

- [x] `AudioExportPort`.
- [x] Renderer offline con motor modular.
- [x] Codificador WAV PCM 16-bit.
- [x] Descarga binaria en `FileGatewayPort`.
- [x] Botón y estados de UI.
- [x] Duración configurable y selección de escena.
- [x] Tests de WAV, ExportService y smoke de descarga.
- [ ] Exportar todas las escenas en un solo lote.
