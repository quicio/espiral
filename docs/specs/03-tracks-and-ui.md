# Spec: 16 tracks, modelo Elektron y UI

- **Fase:** 3
- **Depende de:** motor modular + plugin SDK
- **Estado:** diseño

## Estado de implementación (segundo corte)

- Hecho: `TrackState` y `KitState` con máquina, inserts, gain, pan, mute, solo y sends.
- Hecho: `createDefaultKit()` con 16 tracks: 7 con rol fijo + 9 tracks de usuario sampler.
- Hecho: `TrackState.hasPattern` distingue tracks editables de tracks generativos.
- Hecho: el grafo modular se construye desde el kit.
- Hecho: sesión v2 con kit completo y migración automática desde v1.
- Hecho: `PatternState` (pasos, pulsos, freeze) como fuente de verdad.
- Hecho: `SceneState` como snapshot de kit + patrón + armonía + seed + mezcla.
- Hecho: cambiar de escena captura la actual y restaura la destino.
- Hecho: sesión v2 persiste las escenas, incluidos los patrones de los 16 tracks.
- Hecho: Performance, Sequencer y Sound renderizan los 16 tracks desde el kit.
- Hecho: los tracks de usuario tienen patrón editable, fader, mute/solo, freeze, inserts y disparo de sample.
- Hecho: crear y eliminar tracks de usuario desde Performance; los 7 tracks del núcleo son fijos.
- Hecho: la colección de tracks se replica en todas las escenas y persiste en sesión.
- Hecho: routing matrix track × bus con cantidad 0..1, PRE/POST y retorno por bus.
- Hecho: dos buses por defecto (reverb y delay) con inserts; el routing persiste en escena y sesión.
- Hecho: mod matrix con LFO, macros y fuente de paso, apuntando a parámetros de inserts.
- Hecho: modulación a control-rate 60 Hz con restauración del valor base al apagar o quitar una ruta.
- Hecho: el estado de modulación persiste en la sesión.
- Hecho: parameter locks por track y paso sobre parámetros de inserts, con marcas en la grilla.
- Hecho: los locks se aplican cuando el paso está activo y se restauran al paso siguiente o al detener.
- Hecho: los locks persisten en escenas y sesión.
- Hecho: presets musicales por género (Techno, Dub, Ambient, Breaks) con escenas, patrones, armonía, mezcla, pan y sends.
- Hecho: velocity, probabilidad y ratchets por paso, con editor de dinámica en Sequencer.
- Hecho: paneo por track y sends rápidos en la vista Sound.
- Hecho: plugins Tremolo y Bitcrusher; tracks de usuario con samples variados.
- Hecho: los presets cargan contenido en tracks de usuario.
- Hecho: catálogo de máquinas, instrument plugins y editores de parámetros.
- Hecho: dos macros por track como fuentes del mod matrix.
- Hecho: presets y escenas pueden definir máquinas por track.
- Hecho: destinos AudioParam a audio-rate para rutas LFO sobre parámetros de plugins.
- Pendiente: locks sobre parámetros que no sean de plugins.

## Objetivo

Pasar de 7 canales fijos a 16 tracks con máquinas, kits, patrones, escenas, routing y
modulación, con una UI generada desde el estado.

## Modelo

### Track

```ts
interface Track {
  id: string;
  name: string;
  role?: 'kick' | 'bass' | 'hihat' | 'perc' | 'drone' | 'pad' | 'lead' | 'user';
  machine: MachineState;       // sampler, synth, generativo
  inserts: InsertState[];
  gainDb: number;
  pan: number;
  mute: boolean;
  solo: boolean;
  sends: SendState[];
  color?: string;
}
```

### Kit / Pattern / Scene

- **Kit:** máquinas, inserts, mezcla, sends, parámetros de sonido.
- **Pattern:** trigs, velocity, duración, locks por paso, semilla.
- **Scene:** snapshot de kit + pattern + armonía + mezcla.

Reglas:

- Cambiar de kit no pierde patrones.
- Cambiar de patrón no pierde sonido.
- Una escena restaura los tres.
- El seed y la armonía viven en la escena.

### Routing

Matriz track × bus:

- `post` por defecto.
- `pre` opcional.
- Cantidad 0..1.
- Buses con inserts y return gain.

### Modulación

```ts
interface ModulationRoute {
  id: string;
  source: { kind: 'lfo' | 'envelope' | 'random' | 'macro' | 'step'; id: string };
  target: { trackId?: string; busId?: string; pluginId?: string; paramId: string };
  amount: number;
  bipolar: boolean;
}
```

- Destinos `AudioParam` en audio-rate.
- Destinos sin `AudioParam` a control-rate (60–120 Hz) con rampas.
- Macros pueden apuntar a varios destinos con rangos.

**Implementado:** fuentes LFO 1/2, Macro 1/2 y Paso; destinos de parámetros de plugins.
Las rutas LFO cuyos destinos exponen `AudioParam` se conectan a audio-rate con `Tone.LFO`.
El resto (macros, paso, parámetros sin AudioParam) se evalúa a control-rate 60 Hz. La UI
indica `audio-rate` o `control-rate` por ruta.

### Parameter locks

- Cada paso puede fijar uno o más parámetros.
- Se programan con `setValueAtTime`/`linearRampToValueAtTime` en el timestamp del step.
- La UI muestra los locks como marcas en el paso.

**Primer corte implementado:** locks por track/paso sobre parámetros de inserts. Playback
los aplica en el timestamp del paso activo y restaura el valor base en el paso siguiente o
al detener el transporte. La UI los muestra con un punto en el anillo, la matriz y la fila
de Performance.

## Estado y comandos

- El `Store` sigue siendo la fuente de verdad.
- Comandos: `addTrack`, `removeTrack`, `setTrackGain`, `setSend`, `addInsert`,
  `setPluginParam`, `setLock`, `applyKit`, `applyScene`.
- La UI no muta el estado directamente.

## UI

Vistas mínimas:

1. **Performance:** tracks + escenas + macros.
2. **Sequencer:** pasos, locks, probabilidad, longitud.
3. **Sound:** channel strip del track seleccionado, inserts, sends, medidor.
4. **Routing:** matriz track × bus.
5. **Modulation:** rutas y macros.
6. **Plugins:** browser + editor genérico.

Requisitos:

- Componentes data-driven, sin hardcodear 16 tracks.
- Virtualización o paginación si la grilla no entra.
- Medidores por track/bus/master.
- Los controles se generan desde `PluginParam`.
- Teclado consistente con la app actual.

## Migración

1. Convertir `InstrumentState` actual a `KitState` + `PatternState` + `SceneState`.
2. Mapear los 7 canales a tracks con roles.
3. Mantener el DTO de sesión actual y agregar migración.
4. Recién después agregar tracks 8–16 a la UI.

## Criterios de aceptación

- 16 tracks visibles y editables.
- Agregar/quitar track no reinicia el audio.
- Cambiar kit/pattern/escena es instantáneo y sin clicks.
- La matriz de routing y la de modulación persisten en sesión.
- Los locks se escuchan en el paso correcto sin drift.

## Tareas

- [x] Modelo `Kit`/`Track` en `domain`.
- [x] Grafo desde el kit.
- [x] Migración de sesión v1 → v2.
- [x] Tests de migración y de comandos.
- [x] Modelo `PatternState` y `SceneState`.
- [x] Escenas snapshot y persistencia en sesión.
- [x] 16 tracks en UI y sequencer.
- [x] Channel strip reutilizable para 16 tracks.
- [x] Crear/eliminar tracks desde la UI.
- [x] Matriz de routing.
- [x] Matriz de modulación (control-rate).
- [x] Editor de parameter locks.
- [x] Velocity, probabilidad y ratchets por paso.
- [x] Presets musicales por género con escenas.
- [x] Pan y sends rápidos por track.
- [x] Macros por track.
- [x] Destinos AudioParam a audio-rate.
- [ ] Locks sobre parámetros que no sean de plugins.
