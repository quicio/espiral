# Spec: máquinas de sintetizador y fuentes de notas

- **Fase:** 3.5
- **Depende de:** motor modular, tracks, plugin SDK
- **Estado:** primer corte implementado

## Objetivo

Permitir que un track use distintos tipos de sintetizador —pad, bajo, pluck, sampler—
sin hardcodear canales ni reescribir la reproducción.

## Modelo

### MachinePreset

```ts
interface MachinePreset {
  id: string;
  name: string;
  description: string;
  machine: MachineConfig;
  noteSource: NoteSource;
}
```

Catálogo inicial:

- `sampler`
- `analog-pad` (poly, sierra, envolvente larga)
- `bass-synth` (mono, filtro, envolvente corta)
- `pluck` (Tone.PluckSynth)

`TrackState` guarda:

```ts
machineId: string;
machine: MachineConfig;
noteSource: NoteSource;
```

### NoteSource

```ts
type NoteSource =
  | { kind: 'fixed'; note: string }
  | { kind: 'scale-degree'; degree: number; octave: number }
  | { kind: 'chord'; degreeOffset: number; octave: number; size: number };
```

- `fixed`: una nota fija.
- `scale-degree`: grado de la escala actual.
- `chord`: acorde de la progresión; `size: 1` sirve para bajos.

## Motor

- `MachineConfig.kind` agrega `mono` y `pluck`.
- `ModularAudioEngine` crea:
  - `Tone.MonoSynth` para `mono`.
  - `Tone.PluckSynth` para `pluck`.
  - `Tone.PolySynth` sobre `Tone.MonoSynth` para `poly`.
  - `SampleVoicePool` para `sampler`.
- `AudioEnginePort.setTrackMachine()` reemplaza la fuente de un track en caliente.
- El motor legacy no soporta cambio de máquina y la UI lo deshabilita.

### Voces poly

`poly` usa `PolySynth(Tone.MonoSynth)`, no `PolySynth(Tone.Synth)`: cada voz lleva
**filtro propio y envolvente de filtro** (`filterEnvelope`), además del ADSR de
amplitud. Con `Tone.Synth` el pad era un oscilador pelado —sin armónicos que
mover— y sonaba a juguete al lado del bajo, que sí tenía filtro.

`MachineConfig.filter` y `MachineConfig.filterEnvelope` son opcionales; sin ellos
el motor aplica un barrido por defecto (`baseFrequency` 1400, 2.5 octavas) para
que ninguna voz quede plana.

Un seno filtrado sigue siendo un seno: si el oscilador no tiene armónicos, el
filtro no tiene qué morder. Por eso los presets de pad usan triángulo o sierra, y
el seno queda como opción explícita del usuario.

## Reproducción

- Cualquier track de usuario con patrón puede sonar como sampler o sintetizador.
- Para máquinas sintetizadas, `PlaybackService` calcula las notas desde `noteSource`.
- Se reutilizan velocity, probabilidad y ratchets.
- `Drum`/`membrane` sigue siendo el caso especial del kick.

## UI

- En Sound, cada track de usuario tiene un selector de máquina.
- Debajo aparecen parámetros editables generados desde el schema de la máquina:
  - oscilador;
  - attack, decay, sustain y release;
  - cutoff y resonancia para bajos;
  - noise, dampening, resonancia y release para pluck.
- Los cambios de parámetros reconstruyen la fuente del track en caliente.
- Los tracks del núcleo muestran su máquina como etiqueta fija.
- En Performance, el alta de track permite elegir la máquina inicial.
- El nombre del track nuevo incorpora la máquina: `Analog Pad 17`, `Bass Synth 18`, etc.

## Instrument plugins

- `InstrumentPluginFactory` define `definition`, `create()` y opcional `load()`.
- `InstrumentPluginInstance` expone `trigger()`, `release()`, `setParam()`, `getParam()` y `dispose()`.
- `InstrumentPluginHost` registra instrumentos por `id`.
- Built-in `FM Synth` (`fm-synth`) como referencia.
- `MachineConfig.kind: 'plugin'` guarda `pluginId` y `params`.
- El motor modular crea el instrumento, lo conecta al track y lo dispara con `trigger()`.
- Los parámetros del instrumento aparecen en el editor de máquina de Sound.

## Presets y escenas

- Un preset puede declarar `machines` por track con un `MachinePreset` del catálogo.
- Las máquinas de track se aplican a todas las escenas del preset.
- Cada escena puede sobrescribir la máquina de un track existente.
- Si la máquina apunta a un `track-N` inexistente, el preset crea ese track de usuario.
- Los patrones del preset se alinean con los tracks creados.

## Persistencia

- La sesión v2 guarda `machineId`, `machine` y `noteSource`.
- Los presets y escenas clonan la máquina del track.
- Las sesiones anteriores caen a `sampler` o a la máquina actual.

## Criterios de aceptación

- Se puede crear un track con pad, bajo o pluck.
- Se puede cambiar la máquina de un track de usuario.
- El track suena desde su patrón con la máquina elegida.
- La máquina sobrevive guardar/cargar y cambios de escena.
- El motor legacy sigue funcionando sin cambio de máquina.

## Tareas

- [x] Catálogo `MachinePreset` y `NoteSource`.
- [x] `mono` y `pluck` en `MachineConfig`.
- [x] Crear fuentes mono/pluck en el motor modular.
- [x] `setTrackMachine` en el puerto de audio.
- [x] Reproducción genérica de tracks de usuario sintetizados.
- [x] Selector de máquina en Sound.
- [x] Selector de máquina al crear track.
- [x] Persistencia de máquina y fuente de notas.
- [x] Editor de parámetros de máquina en Sound.
- [x] Instrument plugins de terceros.
- [x] Máquinas por preset/escena.
