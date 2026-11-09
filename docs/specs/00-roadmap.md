# Roadmap de Espiral

- **Estado:** base 0.2.0 lista, evolución a motor modular en diseño.
- **Objetivo:** pasar de un instrumento de 7 canales fijos a una plataforma modular de 16 tracks con plugins, buses y routing curado, sin perder la independencia del motor.
- **Principio rector:** cada fase deja la app funcionando. No hay big bang.

## Fases

### Fase 0 — Base y deuda (completada)

- TypeScript estricto y capas `domain` / `application` / `adapters` / `infrastructure` / `presentation`.
- Puertos de audio, reloj, generación, sesiones, presets, archivos y status.
- `ToneAudioEngine` reemplazable detrás de `AudioEnginePort`.
- Master con glue compressor, limitador y meter con clip latch.
- Presets con `feedback`, `delayTime` y `decay`; sesiones con parámetros de efectos.
- Drone con retrigger cada 16 beats.
- Tests de aplicación y adapters.

**Pendiente de la fase 0**

- Test de audio offline determinista (peak, NaN, DC, loudness).
- Loop/crossfade real del drone para todos los tempos.
- Medidores y clip latch por track/bus (hoy hay master).

### Fase 1 — Núcleo modular (en curso)

**Estado:** prototipo de 2 tracks + 1 bus + 1 insert en `/modular.html`, migración de
los 7 tracks, PDC, crossfade de inserts y A/B offline. El motor modular es el default;
`ToneAudioEngine` queda como fallback legacy con `VITE_ENGINE=tone`.

**Entrega:** `ModularAudioEngine` con tracks, buses y master, todavía con las máquinas actuales.

- Grafo de audio con nodos estables y conexiones declarativas.
- Track: source → insert slots → gain → pan → meter → sends.
- Bus: input → inserts → return gain → master.
- Master fijo: HPF → glue → limiter → meter.
- Migración de los 7 canales actuales al nuevo motor.
- Crossfades en cambios de grafo; sin clicks.
- Sesión sigue cargando el formato actual.

**Criterio de aceptación**

- Paridad sonora con 0.2.0.
- Los 7 canales se crean desde datos, no desde código hardcodeado.
- Se puede agregar un track extra en runtime.
- El motor anterior se puede volver a elegir en `main.ts`.

### Fase 2 — Plugin SDK (en curso)

**Estado:** contrato, PluginHost, 5 plugins built-in, un plugin AudioWorklet, UI genérica
de parámetros y rack de inserts persistido en la sesión. Funciona en `/modular.html` y
en la vista Sound de la app. Pendiente: plugins de terceros y UI custom.

**Entrega:** plugins propios con contrato estable.

- `definePlugin` para efectos e instrumentos.
- Parámetros con unidad, rango, curva, smoothing y serialización.
- Plugins nativos (Tone/Web Audio) y plugins AudioWorklet.
- Slots de insert con bypass por crossfade.
- UI genérica generada desde el schema de parámetros.
- 3–5 plugins propios: filtro, drive, compresor, chorus, delay.

**Criterio de aceptación**

- Un plugin nuevo se agrega sin tocar `presentation` ni `application`.
- Bypass, reordenamiento y carga de sesión no producen clicks.
- Un test verifica que el estado del plugin sobrevive round-trip.

### Fase 3 — 16 tracks y modelo Elektron (en curso)

**Estado:** `TrackState`/`KitState`, `PatternState` y `SceneState` implementados. El kit
por defecto tiene 16 tracks y la UI de Performance, Sequencer, Sound, Routing y Mod se
genera desde el kit; tracks de usuario, routing, modulación a control-rate, parameter
locks y dinámica por paso ya funcionan. Hay presets musicales por género con escenas,
pan por track, sends rápidos, Tremolo/Bitcrusher y samples variados en tracks de usuario.
El catálogo de máquinas permite crear tracks con Analog Pad, Bass Synth o Pluck. El grafo
se construye desde el kit, las escenas son snapshots y las sesiones v2 persisten kit,
patrón, escenas, buses, sends, modulación, locks, dinámica y máquina por track con
migración v1. Pendiente: instrument plugins y macros por track.

**Entrega:** instrumento de 16 tracks con kits, patrones y escenas.

- Track collection con roles y máquinas.
- Catálogo de máquinas (pad, bajo, pluck) y fuentes de notas.
- Separación `Kit` / `Pattern` / `Scene`.
- Matriz de routing track × bus.
- Matriz de modulación (LFO, envelopes, random, macros).
- Parameter locks por paso.
- UI data-driven: channel strips, plugin browser, mixer y routing.

**Criterio de aceptación**

- 16 tracks activos sin degradación grave de CPU.
- Cambiar de kit no pierde patrones; cambiar de patrón no pierde sonido.
- Una escena restaura kit + patrón + mezcla.
- Los locks se programan con timestamps de audio, no con timers de UI.

### Fase 4 — Calidad y experimental

**Entrega:** confianza operativa y routing avanzado.

- Render offline en CI con assertions de peak/loudness.
- Compensación de latencia (PDC) para paths paralelos.
- Patch bay opcional con detección de ciclos.
- Export de audio.
- Plugins de terceros (si el producto lo necesita).
- Medición de CPU y límites documentados.

## No objetivos del roadmap

- Ser un DAW completo.
- Cableado libre total en la v1.
- Carga de plugins de terceros en runtime antes de la Fase 4.
- Edición de audio o grabación multipista.

## Riesgos

| Riesgo | Mitigación |
| --- | --- |
| Scope creep del patch bay | Modularidad curada: inserts, sends, mod matrix; patch bay recién en Fase 4 |
| CPU con 16 tracks y worklets | Voice pooling, medir CPU, worklets solo para DSP pesado |
| Latencia en paths paralelos | PDC desde Fase 1; plugins declaran latencia |
| Compatibilidad de sesiones | DTO versionado y migraciones desde el primer cambio |
| El motor nuevo no convence | `AudioEnginePort` permite volver a `ToneAudioEngine` desde `main.ts` |

## Métricas

- Pico de master ≤ −1 dBFS en render offline.
- Sin `NaN`, sin DC audible, sin clicks en bypass/routing.
- Inicio de playback < 1 s en frío (sin presets que regeneren reverbs).
- 16 tracks + 4 inserts por track en tiempo real en una laptop moderna.
- Cobertura de tests de casos de uso y de audio renderizado.
