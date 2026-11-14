# Rendimiento del motor

Documento de trabajo. No es un ADR: describe el estado medido, las palancas de
tuning y las alternativas de arquitectura con su costo.

## Qué se midió

Chromium headless, 16 tracks, armado por defecto, 128 BPM.

| escenario | antes | después |
|---|---|---|
| long tasks en 16 s de arrangement | 127 ms y 87 ms | **ninguna** |
| long tasks de carga + armado + vistas | 262 / 131 / 97 ms | **124 / 53 ms** |
| long tasks con playback + cambio por 7 vistas | 56 / 59 / 88 ms | **ninguna** |
| sampler en vivo | Tone.Player por voz | **AudioWorklet** |
| CPU meter al cambiar bloque | 45–71% | 0–9% |
| perfil de 8 s: `querySelector*` | base | ~1/3 |
| peticiones `.wav` en integración | 57 | 17 |
| `test:audio` | PCM determinista | determinista |

El CPU meter es una estimación de main thread + underruns del `AudioContext`; no
mide el costo del AudioWorklet. Los long tasks son la señal más útil para
entrecortes: si el hilo principal se bloquea más que el buffer de audio, el
scheduler llega tarde.

## Lo que ya se hizo

1. **No reconstruir cadenas idénticas** en cambios de escena (spec 31).
2. **Medidores a 25 Hz** con nodos cacheados, en vez de `querySelector` por track
   y bus a 60 Hz (spec 32).
3. **Playhead quirúrgico**: en un paso sólo se mueve `is-current`, sin recorrer
   todos los pasos y recalcular locks (spec 32).
4. **Ticker de modulación** sólo cuando está habilitada y a 30 Hz para el camino
   de control (spec 32).
5. **Preview aislado** en un track fuera del estado (spec 26).
6. **Render por vista activa** y coalescing en `requestAnimationFrame`; varias
   actualizaciones de estado producen un solo render (spec 33).
7. **Prewarm del motor** al terminar el armado del set (spec 33).
8. **Debounce de `decay` en el reverb** para no regenerar el impulso en cada
   movimiento del slider.
9. **Buffers de sample compartidos** por URL: la integración pasó de 57 respuestas
   `.wav` a 17 peticiones únicas (spec 34).
10. **Medidores preparados antes del transporte**: se crean en `prepare()` para
    no tocar el grafo de audio al abrir Sound/Routing, y se leen en batches
    (spec 35).
11. **`prepare()` idempotente** para que prewarm y primer play no dupliquen el
    trabajo (spec 35).
12. **Lookahead por defecto de 150 ms** (configurable) (spec 35).
13. **Cache de vistas limpias**: cambiar de pestaña sin cambios estructurales no
    reconstruye el DOM (spec 36).
14. **Sampler en AudioWorklet** con fallback a `Tone.Player`: un nodo por máquina
    sampler mezcla voces en el hilo de audio; el render offline sigue usando el
    fallback (spec 37). Los índices de sample se clampean y el kick sampler ya no
    se dispara como membrana (spec 39).

## Cambios en caliente

Un cambio de escena, de máquina o de insert no es un evento de nota: reconstruye
nodos de Tone (`MonoSynth`, `InsertChain`, buses). Hacerlo 16 veces en el mismo
tick produce un long task y puede cortar el audio.

`SerialTaskQueue` (`infrastructure/audio/modular/serial-task-queue.ts`) resuelve
tres cosas:

- **serializa**: una mutación cara a la vez;
- **cede el hilo**: `setTimeout(0)` entre tareas, para que el navegador pinte y
  procese audio;
- **coalesce máquinas**: si llegan dos cambios para el mismo track, sólo se
  construye el último (`requestedMachines`).

En offline el motor usa el camino directo: la cola no puede introducir
diferencias de PCM. `prepare()` espera a que la cola se vacíe antes de preparar
fuentes.

Medición headless con 8 cambios de escena+máquina durante playback: **0 long
tasks > 50 ms** y frame máximo 17 ms. El escenario no reprodujo el pico en esta
máquina, así que la cola queda como garantía estructural para 16 cambios
simultáneos, no como una mejora medida en ese probe.

Lo que **no** va a la cola: triggers de nota, automatización, faders, pan y mute.
Esos son baratos y necesitan aplicarse ya; encolarlos agregaría latencia
musical.

## Palancas de tuning pendientes (bajo riesgo)

### 1. Virtualizar Sound y el banco

El mixer de 16 filas, el rack y las 23 tarjetas del browser se reconstruyen con
`innerHTML` en cada cambio estructural. Se puede:

- mantener nodos y actualizar sólo valores;
- paginar/colapsar categorías del banco;
- separar el render del mixer del render del detalle.

Impacto: medio. Riesgo: medio.

### 2. Medidores con CSS y menos lecturas de audio

`Tone.Meter.getValue()` por track y bus sigue leyendo el analizador. Alternativas:

- medidores con `AnalyserNode` compartido por bus/master;
- actualizar a 10–15 Hz cuando no hay interacción;
- apagar medidores de tracks ocultos.

Impacto: bajo-medio. Riesgo: bajo.

### 3. Tuning del scheduler

- El `lookAhead` por defecto ya es 150 ms y es configurable. Probá 200–300 ms si
  el equipo tiene picos de main thread que no se pueden eliminar.
- Evaluar `latencyHint: 'balanced'` o `'playback'` en el `AudioContext` como
  “modo seguro”. Aumenta estabilidad y latencia. **No se puede cambiar en
  runtime**: hay que crear el `Tone.Context` antes de que Tone inicialice su
  singleton/Transport. Un reemplazo tardío rompe el scheduler, así que queda
  como cambio de arranque, no como toggle en caliente.
- Evitar cambios de BPM con rampas largas durante transiciones pesadas.

Impacto: alto contra underruns, a costa de latencia. Riesgo: bajo si es opt-in.

### 4. Reverb y drive

- `Tone.Reverb` es un convolver con impulso generado; cada insert de reverb es
  un convolver propio. Ya hay debounce de `decay` para no regenerar el impulso
  en cada movimiento; queda compartir impulso o usar reverb algorítmico.
- `Tone.Distortion` usa `oversample: '2x'`; `'none'` o `'2x'` selectivo baja CPU.

Impacto: alto si hay muchos inserts. Riesgo: bajo-medio (cambia el sonido).

## Cambio de paradigma: sacar DSP del hilo principal

Tone.js arma el grafo en el hilo principal y programa eventos; el DSP corre en el
AudioWorklet nativo del navegador. El próximo salto no es “otra librería”, es
mover **síntesis, samples e inserts** a AudioWorklet/WASM.

### Opción A — Sampler propio en AudioWorklet (implementado)

El sampler ya usa un `AudioWorkletNode` por máquina sampler en vivo (spec 37):

- mezcla voces en el hilo de audio con interpolación y playbackRate;
- evita el grafo de `Tone.Player` por voz;
- comparte la decodificación entre tracks vía `SampleLibrary`;
- cae a `Tone.Player` si el worklet no está disponible;
- el render offline sigue usando el fallback para mantener determinismo.

Lo que queda de esta línea: buffers compartidos entre nodos con
`SharedArrayBuffer` (requiere COOP/COEP), loop/warp/slice en el worklet y un test
de calidad del DSP del worklet.

### Opción B — Grafo completo en AudioWorklet

Librerías a evaluar:

| opción | qué aporta | costo |
|---|---|---|
| **Elementary Audio** | grafo funcional declarativo que renderiza en AudioWorklet; buen fit para synths y samples | reescritura del motor, nueva dependencia, curvas de aprendizaje |
| **SignalFlow** | grafo de audio en Worklet, orientado a procesamiento | madurez y mantenimiento a verificar |
| **Faust + WASM/Worklet** | DSP de alta calidad compilado; ideal para insert/synths | toolchain aparte, integración con parámetros y presets |
| **WAM 2.0** | formato de plugins de audio en Worklet | arquitectura de plugins, no acelera el motor actual por sí solo |
| **AudioWorklet propio** | control total, sin dependencia | más código y mantenimiento |

Recomendación: no reescribir Tone.js de una vez. Hacer A (sampler worklet) y,
si hace falta, un insert pesado (reverb) en worklet. Medir cada corte con el
mismo test de long tasks y `test:audio`.

### Opción C — Web Worker para generación

La generación de patrones y armonía podría calcularse en un Worker y enviar
eventos ya resueltos al scheduler. Reduce trabajo del hilo principal, pero no
resuelve el costo de nodos ni de inserts. Útil si el perfil muestra `generate*`
o `patterns.*` alto.

### Opción D — `SharedArrayBuffer`

Permite comunicación sin copia entre Worker/Worklet. Requiere headers
`Cross-Origin-Opener-Policy` y `Cross-Origin-Embedder-Policy`. En GitHub Pages no
se pueden configurar; habría que mover el deploy a un host con headers. No es un
requisito para el sampler worklet con `postMessage`.

## Librerías y herramientas

- **Perfilado**: Chrome DevTools Performance, `PerformanceObserver` de
  `longtask`, `AudioContext.playbackStats` (ya usado por el CPU meter).
- **Tone.js**: mantener para composición y grafo actual; evaluar upgrade sólo con
  benchmark, no por versión.
- **Extensiones del navegador**: no aceleran el motor. Las DevTools de Web Audio
  sirven para inspeccionar el grafo, no para reducir CPU.
- **Flags de Chrome**: útiles para medir (por ejemplo, desactivar throttling de
  fondo), no para producción.
- **WASM**: buena opción para DSP; no para scheduling ni DOM.

## Cómo decidir el próximo paso

1. Reproducir el entrecortado en la máquina afectada con DevTools Performance.
2. Mirar si el long task viene de render/DOM o de audio.
3. Si el long task es de `render*`/`querySelector`: atacar vistas y medidores.
4. Si el AudioContext reporta underruns con main thread libre: subir
   `latencyHint`/buffer o mover DSP a Worklet.
5. Si el problema aparece con muchos inserts: reverb/drive y cadenas primero.
6. Si aparece con muchos samples: sampler worklet.

El criterio de aceptación de cualquier corte: mismo PCM en `test:audio`, cero
long tasks evitables en 16 s de playback y `test:integration` verde.
