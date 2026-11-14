# Arquitectura de Espiral

Este documento describe la base arquitectónica sobre la que evoluciona el instrumento.
La regla central es la **regla de dependencia**: el código de las capas internas no conoce
Tone.js, el DOM, `localStorage` ni `fetch`. Esas tecnologías viven en la periferia y se
inyectan desde un único composition root.

## Capas

```
src/
  domain/          Entidades, valores y reglas puras del instrumento
  application/     Casos de uso, store y servicios de aplicación
  infrastructure/  Tone.js, audio, fetch, localStorage, filesystem del navegador
  presentation/    DOM, vistas, controladores y presentadores
  main.ts          Composition root: elige implementaciones y las inyecta
```

Dependencias permitidas:

```
presentation ──► application ──► domain
      │                ▲
      └──► infrastructure ──┘   (solo en main.ts se conectan)
```

- `domain` no importa nada de `application`, `infrastructure` ni `presentation`.
- `application` solo conoce puertos definidos en `domain/ports.ts`.
- `infrastructure` implementa esos puertos. Puede importar Tone.js, fetch, etc.
- `presentation` consume servicios de aplicación y un catálogo ya adaptado. No importa Tone.js.
- `main.ts` es el único módulo que conoce implementaciones concretas.

## Modelo de ejecución

```
UI (presentation)
  │  comandos
  ▼
Servicios de aplicación ──► Store (estado inmutable)
  │                            │
  │ puertos                    │ notificación
  ▼                            ▼
AudioEnginePort / ClockPort   UI
  ▲
  │ implementados por
AudioCoreEngine (default) / ModularAudioEngine + ToneClock (fallback)
```

- El estado de la aplicación es la fuente de verdad. El motor de audio no guarda la mezcla:
  la recibe desde `MixService`.
- `PlaybackService` escucha el `ClockPort` y traduce el estado musical a eventos de sonido
  (`SoundEvent`). El motor solo ejecuta eventos: no conoce patrones ni armonía.
- La UI nunca habla con Tone.js. Solo llama comandos de aplicación y lee el store.

## Cadena de audio actual

Por defecto `AudioCoreEngine` construye el render desde el kit:

```
fuente → insert chain → gain → pan → mute ─┬→ bus(es) → inserts → return ─┐
                                           └→ master                       ├→ master
master: gain → DC block → glue → EQ3 → trim → limiter/clipper → Destination
```

El fallback `?engine=tone` usa `ModularAudioEngine`:

```
fuente → insert chain → Tone.Volume → Pan → Mute ─┐
                                                 ├→ master
master: Tone.Volume → HPF(25Hz) → Compressor (glue) → Limiter(-2) → Safety clip(0.8) → Destination
```

La UI no conoce esta cadena. El motor es reemplazable detrás de `AudioEnginePort` sin tocar
`application` ni `presentation`.

El composition root usa `AudioCoreEngine` por defecto; `?engine=tone` carga
`ModularAudioEngine`. El fallback Tone tiene tracks, buses, inserts, sends, PDC,
instrument plugins y modulación audio-rate. Los cambios de máquina usan crossfade de
fuente; los inserts cambian con crossfade y los tracks se reconcilian con `syncTracks`
al cargar presets, escenas o sesiones. Los cambios estructurales hacen un duck breve de
master para evitar clicks. El lookahead del scheduler es configurable y se persiste en
el transporte. El patch bay de buses conecta salidas de bus a entradas de otros buses con
validación de ciclos; los buses se pueden crear y eliminar desde Routing.

El estado guarda un `KitState` con `TrackState` por track (máquina, inserts, gain, pan,
mute, solo, sends, `hasPattern`) y un `PatternState` (pasos, pulsos, freeze). El kit por
defecto tiene 16 tracks y dos buses; la UI los renderiza desde el kit, sin listas fijas.
Las escenas son snapshots de kit + patrón + armonía + seed + mezcla; cambiar de escena
captura la actual y restaura la destino. La sesión v2 persiste todo y migra automáticamente
sesiones v1 basadas en canales.

La modulación vive en `ModulationState` (fuentes, rutas y enable) y es global, no parte de
la escena. `ModulationService` evalúa a control-rate 60 Hz las fuentes macro/paso y los
destinos sin `AudioParam`. Las rutas LFO hacia parámetros de inserts se aplican audio-rate en el core cada
128 frames; el fallback Tone usa `Tone.LFO`.

Los parameter locks viven en `PatternState.locks` (track → 16 pasos → parámetros). Pueden
apuntar a parámetros de inserts o al gain/pan del track. Playback los aplica en el
timestamp del paso activo mediante el puerto de audio y restaura el valor base en el paso
siguiente o al detener el transporte.

La dinámica por paso vive junto al patrón (`velocity`, `probability`, `ratchets`). Playback
usa esos valores para escalar la ganancia, omitir pasos de forma determinista y subdividir
el disparo en hasta cuatro ratchets.

Los presets musicales incluyen BPM, mezcla, pan, sends, armonía y patrones por escena. El
`PresetMapper` los convierte en un snapshot completo que reemplaza el estado musical actual.

Las máquinas de track viven en un catálogo (`MachinePreset`) con configuración de motor y
`NoteSource`. `TrackState` guarda `machineId`, `machine`, `noteSource` y dos macros.
El fallback Tone crea `PolySynth`, `MonoSynth`, `PluckSynth`, sampler o un instrument
plugin (`InstrumentPluginHost`) según la máquina. El core crea sus propias voces
(membrane, mono, poly, pluck, sampler, FM Synth) y reemplaza la fuente con
`setTrackMachine`.

Las macros de track (`track-macro:<trackId>:<0|1>`) son fuentes de la mod matrix. Se
resuelven desde el estado del track y se persisten en la sesión.

La calidad de audio se verifica con `npm run test:audio`: renderiza 8 compases en un
`OfflineAudioContext` real y falla si hay clipping, NaN, DC o silencio.

### AudioCore

`AudioCoreEngine` (spec 43) implementa el mismo `AudioEnginePort` y `ClockPort`
con un núcleo DSP propio en un AudioWorklet. Es el motor por defecto;
`?engine=tone` carga el motor Tone como fallback. El clock, los pasos de 16avos
y el export WAV (`CoreOfflineRenderer`) viven del lado del core. El core no conoce Tone, DOM ni `AudioContext`: recibe eventos
con timestamp y renderiza `Float32Array`. Inserts, buses, routing, sidechain y
medidores por track todavía no están implementados en este adapter.

El export WAV reutiliza ese camino offline: `ToneOfflineRenderer` renderiza el estado actual,
`encodeWav` lo convierte a PCM 16-bit y `BrowserFileGateway` descarga el archivo.

## Plugins

- `src/domain/plugin.ts` — contrato de parámetros, definición y normalización.
- `src/infrastructure/audio/plugins/` — `PluginHost`, plugins built-in y loader de
  AudioWorklet.
- `InsertSlot` hospeda un plugin y maneja bypass por crossfade.
- `src/presentation/plugin-controls.ts` — UI genérica generada desde el schema.
- El estado guarda `inserts` por canal y la sesión los persiste; la vista Sound tiene el
  rack para agregar, quitar, reordenar, bypass y editar parámetros.
- Los plugins de instrumento y terceros quedan para fases posteriores.

## Puertos principales

- `AudioEnginePort`: preparar audio, disparar eventos, aplicar mezcla y efectos.
- `ClockPort`: tempo, transporte y ticks de 16avos.
- `GenerativePort`: catálogo y algoritmos generativos deterministas.
- `SessionRepositoryPort`: persistencia local de sesiones.
- `PresetRepositoryPort`: catálogo y carga de presets de mezcla.
- `FileGatewayPort`: exportar/importar JSON.
- `StatusPort`: salida de mensajes para la UI (puerto de salida, implementado en presentación).

## Por qué esta base permite reemplazar el motor

`PlaybackService` produce eventos genéricos (`kick`, `synth`, `sample`) con `channel` y,
para tracks de usuario, `trackId`. `ModularAudioEngine` y `AudioCoreEngine` son implementaciones de
`AudioEnginePort`. Para cambiar de motor se cambia únicamente en `main.ts`.

## Deuda deliberada

- El catálogo de escenas/raíces/escalas se sigue mostrando con el markup actual de `index.html`
  y se sincroniza desde `GenerativePort`.
- La UI es DOM directo. Se puede migrar vista por vista a un framework sin tocar las capas internas.
- El kit modela 16 tracks y dos buses; el motor modular construye el grafo desde él.
  La UI se genera desde el kit y permite crear/eliminar tracks, editar routing, modulación
  a control-rate, parameter locks, dinámica, máquinas de synth e instrument plugins.
  Las máquinas pueden venir de presets y variar por escena; las rutas LFO usan audio-rate
  cuando el destino expone `AudioParam`; los locks alcanzan inserts y gain/pan. Pendiente:
  calidad de Fase 4 (medidores por track, baseline de performance y A/B humano).
