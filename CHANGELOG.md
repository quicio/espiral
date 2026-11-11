# Changelog

## Unreleased

- Export WAV offline desde el estado actual: 8 compases + 2 s de cola.
- Selector de escena, compases y cola para el export WAV.
- Renderer offline reutiliza `ModularAudioEngine` y `PlaybackService`.
- Codificador WAV PCM 16-bit y descarga binaria.
- Botón `Exportar WAV` con estados de render/exportación.
- Crossfade de fuente al cambiar máquinas y fade-out al eliminar tracks.
- `syncTracks` reconcilia altas, bajas y máquinas al cargar presets/escenas/sesiones.
- Duck de master de 6 ms y restauración de 30 ms en cambios estructurales.
- BPM rampeado al cargar presets, escenas y sesiones.
- Buffer/lookahead configurable (20–300 ms) y persistente en la sesión.
- Patch bay de buses con detección de ciclos y matriz dedicada en Routing.
- Crear y eliminar buses desde Routing; al quitarlos se limpian sus sends.
- Conexiones bus → bus persistentes en sesión y escenas.
- Medidor de CPU con estados normal/warning/critical y límites documentados.
- Grooves curados por escena para el estado inicial, con `pulses` derivados del patrón.
- Capas de shaker y percusión con paneo y sends propios en el kit por defecto.
- Velocity, probabilidad y ratchets iniciales; el lead aparece más seguido.
- Banco de 15 sonidos e instrumentos por categoría para tracks editables.
- El banco aplica máquina, nota y registro conservando mezcla, inserts y patrón.
- Drone, pad y lead aceptan máquina, parámetros y sonidos del banco.
- Drone, pad y lead pueden alternar entre modo generativo y patrón (`+P` / `−P`).
- Nuevas máquinas `drone-sampler`, `soft-pad` y `lead-synth`.
- Roadmap de producto con milestones hacia una experiencia Ableton web y encaje con OpenSpec.
- Session / Clip Grid: clips por track y escena, launch cuantizado, follow actions y stop.
- Los clips activos usan el patrón vivo y se materializan en sus escenas antes de guardar.
- Persistencia de clips, clips activos y cuantización en sesión v2.
- Session a pantalla completa, columna de escenas fija, miniaturas de patrón y estados armed/queued/playing/stopped.
- Feedback de lanzamientos pendientes con countdown y fix del status bar en anchos intermedios.
- Navegación de Session por teclado, roving tabindex y Space global para transporte.
- Tempo con entrada numérica exacta además del slider.
- Sound compacto: mixer de 16 filas, detalle del track seleccionado y banco en drawer.
- Sound ocupa todo el ancho y reduce su página de ~6.100 px a ~1.000 px.
- Wizard de armado inicial: base, escena y elementos; no reproduce hasta entrar.
- Wizard con raíz, escala, progresión, BPM y sonido por elemento.
- Kits pre-hechos (Techno, Dub, Breaks, Ambient) y kits propios persistidos en local.
- Aplicación de sonidos de kick, bass, hats y percusión en todas las escenas.
- El armado mutea los elementos no elegidos en todas las escenas.
- El Pad arranca desmarcado en el armado por defecto para limpiar el Techno.
- Clips con patrón propio; crear, duplicar, renombrar, colorear y eliminar.
- Browser de sonidos con búsqueda y drag/drop a tracks editables.
- Arrangement de escenas por bloques con compases, playback y persistencia.
- Entrada MIDI: notas al track seleccionado y CC1/CC2 a macros.
- Importación de audio como track sampler con clip y patrón de un paso.
- Undo/redo global con botones y Cmd/Ctrl+Z.
- Modo Performance que oculta header, intro y barra de sesión.
- 174 tests unitarios.

## 0.6.0 — 2026-11-09

- Parameter locks sobre gain y pan del track, además de parámetros de inserts.
- Los locks de track se programan en el timestamp del paso y se restauran al siguiente o al detener.
- Persistencia de locks de track en sesión y escenas.
- Medidores por track en Sound y por bus en Routing.
- Clip latch por nodo con reset individual.
- Test Playwright de integración de la app principal (`npm run test:integration`).
- El workflow de audio ejecuta también la integración.
- Audio check ampliado a 7 escenarios: initial, automation, ambient, max, solo+mute, scene change y stress.
- Nuevo escenario `modular-stress` con 4 inserts extra por track.
- Cada escenario reporta `renderMs`; baseline offline documentado.
- Motor modular único: `ToneAudioEngine`, `VITE_ENGINE`, `dev:tone` y el A/B offline fueron retirados.
- Medidor de CPU estimada en la UI (jitter del hilo principal + underruns de audio).
- 97 tests unitarios.

## 0.5.0 — 2026-11-09

- Modulación audio-rate: rutas LFO hacia parámetros de plugins que exponen `AudioParam`.
- `PluginInstance.getAudioParam()` y conexión directa con `Tone.LFO` en el motor modular.
- Fallback automático a control-rate para macros, paso y parámetros sin `AudioParam`.
- La UI indica `audio-rate` o `control-rate` por ruta.
- 90 tests unitarios.

## 0.4.0 — 2026-11-09

- Editor de parámetros de máquina en Sound: oscilador, envelope, filtro y pluck.
- Instrument plugins: `InstrumentPluginHost`, instancia con trigger/release y `FM Synth` built-in.
- Las máquinas `plugin` guardan `pluginId`, estado de parámetros y se editan en Sound.
- Los presets declaran máquinas por track y las escenas pueden sobrescribirlas.
- Los presets pueden crear tracks de synth y alinear sus patrones.
- Dos macros por track como fuentes de modulación (`track-macro:*`).
- Las macros de track persisten en sesión y se limpian al eliminar el track.
- 88 tests unitarios.

## 0.3.0 — 2026-11-09

- Fase 3, primer corte: modelo `TrackState`/`KitState` como fuente de verdad del sonido.
- El motor modular construye el grafo desde el kit, no desde canales hardcodeados.
- `PatternState`: patrones, pulsos y freeze agrupados y separados del kit.
- `SceneState`: escenas como snapshots de kit + patrón + armonía + seed + mezcla.
- Cambiar de escena ahora captura la escena actual y restaura la destino.
- Sesiones v2 con kit, patrón y escenas; migración automática desde sesiones v1.
- Kit por defecto de 16 tracks: 7 con rol fijo y 9 tracks de usuario con máquina sampler.
- `TrackState.hasPattern` separa tracks editables de tracks generativos.
- Performance, Sequencer y Sound se generan desde el kit, sin listas fijas de canales.
- Los tracks de usuario tienen patrón, fader, mute/solo, freeze, inserts y disparo de sample.
- Sesión v2 persiste los patrones de los 16 tracks y la selección de tracks de usuario.
- Crear y eliminar tracks de usuario desde Performance, sin detener el transporte.
- La colección de tracks se comparte entre escenas y se persiste en la sesión.
- El motor legacy deshabilita la gestión de tracks en vez de simularla.
- Routing matrix track × bus con cantidad 0..1 y PRE/POST por celda.
- Dos buses por defecto (reverb y delay) con retorno y inserts; el routing se guarda en escenas y sesión.
- Nueva vista Routing con switches de bus, matriz y retornos; deshabilitada en el motor legacy.
- Mod matrix con LFO 1/2, Macro 1/2 y Paso apuntando a parámetros de inserts.
- Modulación a control-rate 60 Hz, con restauración del valor base al apagar o quitar rutas.
- Nueva vista Mod con fuentes, formulario de ruta, cantidad bipolar y lista de rutas.
- La modulación persiste en la sesión y se limpia al eliminar tracks o inserts.
- Parameter locks por track y paso sobre parámetros de inserts, con editor en Sequencer.
- Los locks se aplican en el timestamp del paso activo y se restauran al paso siguiente o al detener.
- Las marcas de lock aparecen en el anillo, la matriz y la fila de Performance.
- Los locks persisten en escenas y sesión.
- Presets musicales por género: Techno, Dub, Ambient y Breaks.
- Cada preset define escenas con patrones, armonía, seed, mezcla, pan y sends.
- Los presets cargan contenido en tracks de usuario.
- Pan por track y sends rápidos por track en la vista Sound.
- Velocity, probabilidad y ratchets por paso con editor de dinámica.
- Nuevos plugins Tremolo y Bitcrusher.
- Los tracks de usuario usan samples variados de percusión y hi-hats.
- Catálogo de máquinas de track: Sampler, Analog Pad, Bass Synth y Pluck.
- `NoteSource` por track: nota fija, grado de escala o acorde de la progresión.
- Motor modular con `MonoSynth` y `PluckSynth`; cambio de máquina en caliente.
- Selector de máquina en Sound y al crear un track.
- Persistencia de máquina y fuente de notas en sesión y escenas.
- 76 tests unitarios.
- Tests unitarios de casos de uso, grafos, mapper de sesiones/presets y reglas de voces.

## 0.2.0 — 2026-11-08

- Reescritura arquitectónica en TypeScript con capas `domain`, `application`,
  `infrastructure`, `adapters` y `presentation`.
- Composition root único en `src/main.ts` y puertos para audio, reloj, generación,
  sesiones, presets y archivos.
- Motor de audio desacoplado: `PlaybackService` produce `SoundEvent` y `ToneAudioEngine`
  los ejecuta.
- Master con compresor y limitador de seguridad, fades en samples, reverb con `decay`
  real de Tone 14 y rampas de volumen.
- Medidor de master con clip latch en la UI.
- Presets aplican `feedback`, `delayTime` y `decay`; las sesiones guardan esos parámetros.
- El drone reintenta cada 16 beats en vez de dejar un hueco de ~8 s.
- Re-render granular: editar patrones o seleccionar canales no reconstruye la vista Sound.
- Prototipo de motor modular: `GraphConfig`, `Track`, `Bus`, `MasterBus`, `InsertSlot`
  con bypass por crossfade y `ModularAudioEngine`.
- Página de experimento `/modular.html`: 2 tracks, 1 bus de reverb, 1 insert de filtro,
  1 send y master con meter.
- Migración de los 7 tracks al motor modular detrás de `VITE_ENGINE=modular`.
  El default sigue siendo `ToneAudioEngine`; `npm run dev:modular` prueba el motor nuevo.
- PDC: plan de latencia por track/send y delays de compensación en el motor modular.
- Crossfade de inserts: `InsertChain` intercambia cadenas con fade de 30 ms.
  Los sends nuevos/eliminados también rampean.
- Safety clipper después del limiter (techo 0.8 ≈ −1.94 dBFS) en ambos motores.
- HPF de master y panner central en `ToneAudioEngine` para paridad con el modular.
- Harness de audio offline con Playwright: render de 8 compases, peak ≤ −1 dBFS,
  sin NaN, DC bajo y detección de silencio. Workflow de CI dedicado.
- A/B offline formal entre `ToneAudioEngine` y `ModularAudioEngine`: diferencias
  de peak y RMS dentro de tolerancia.
- `ModularAudioEngine` pasa a ser el motor default. `ToneAudioEngine` queda como
  fallback legacy con `VITE_ENGINE=tone` / `npm run dev:tone`.
- Plugin SDK: `PluginDefinition`, `PluginParam`, `PluginHost`, registro de plugins y
  estado por parámetros.
- Plugins built-in: filtro, delay, reverb, drive y compresor.
- Plugin AudioWorklet de ejemplo (`worklet-drive`) con carga lazy.
- UI genérica de parámetros en `/modular.html` y demo de cambio de plugin en caliente.
- Rack de inserts en la vista Sound de la app: agregar, quitar, reordenar, bypass y
  editar parámetros desde el schema del plugin.
- Los inserts arbitrarios se guardan en el estado y en la sesión; las sesiones viejas
  siguen cargando con delay/reverb legacy.

## 0.1.1 — 2026-11-06

- Standalone Vite app, self-contained audio samples and mix presets.
- Brand header: Espiral, instrumento generativo.
- Session key and export renamed to Espiral.
- GitHub Pages deployment.
- Relative asset paths for subpath hosting.

## 0.1.0 — 2026-11-06

- Initial split from `kndl000`.
- Uses `@quicio/umbral-tone`.
