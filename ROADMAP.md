# Roadmap de Espiral

**Norte:** que una idea musical se convierta en una performance y de ahí en una canción,
con la fluidez de Ableton Live pero con ADN generativo, browser-first y sin convertirnos en
un DAW genérico.

**Estado actual:** 0.6.x con motor modular, 16 tracks, escenas, patrones, mezcla, routing,
inserts, modulación, parameter locks, export WAV, banco de sonidos y tracks generativos
editables.

**Principio rector:** cada milestone deja la app funcionando. No hay big bang. Cada corte
se especifica, se implementa y se valida con tests unitarios, de audio e integración.

---

## Lo mejor de Ableton que vamos a rescatar

| Idea de Ableton | Traducción a Espiral |
| --- | --- |
| Session View | Grilla de clips por track y escena, lanzamiento cuantizado y follow actions. |
| Browser | Buscador de sonidos, instrumentos, efectos, presets y samples con preview y drag/drop. |
| Device chains | Cadena de dispositivos por track, presets, bypass, reordenamiento y macros. |
| Scenes | Filas de clips que se lanzan juntas y se pueden capturar como canción. |
| Arrangement | Timeline para ordenar clips, escenas, locators y automatización. |
| Capture | Grabar la performance, resamplear y exportar stems o loops. |
| Warping | Clips de audio con warp, loop, pitch y slice. |
| MIDI | Entrada MIDI, mapping y control de parámetros en vivo. |
| Undo / history | Historial no destructivo para editar sin miedo. |

### Lo que no vamos a copiar

- Un DAW completo con edición multipista avanzada.
- VST/AU nativos.
- Colaboración en tiempo real.
- Comping, edición espectral o postproducción.
- Complejidad de Ableton que no aporte a la performance generativa.

---

## Mapa de milestones

| # | Milestone | Resultado | Depende de | Esfuerzo |
| --- | --- | --- | --- | --- |
| M0 | Base actual | Instrumento modular, 16 tracks, escenas, banco y export. | — | Completado |
| M1 | Clip Grid | Session View real: clips independientes, launch quantize y follow actions. | M0 | L |
| M2 | Browser + Devices | Explorar y arrastrar sonidos, instrumentos y efectos; cadenas de dispositivos. | M0 | L |
| M3 | Arrangement + Automation | Convertir performances en canciones con timeline y automatización. | M1, M2 | XL |
| M4 | Capture + MIDI + Undo | Grabar, resamplear, tocar con MIDI y editar con historial. | M1–M3 | L |
| M5 | Audio Clips + Warp | Importar audio, warpear, slicear y resamplear a clips. | M2, M4 | XL |
| M6 | Hardening + Scale | Performance, accesibilidad, onboarding y confiabilidad. | M1–M5 | M |

M2 puede arrancar en paralelo con M1 porque el browser depende más del catálogo que del
modelo de clips. M3 en cambio necesita que M1 y M2 estén estables.

---

## M0 — Base actual (completada)

Ya existe:

- motor modular único con tracks, buses, inserts, PDC y modulación;
- 16 tracks con máquinas sampler, pad, bass, lead, pluck y plugins de instrumento;
- patrones, escenas, armonía, generación, freeze y evolución;
- routing track × bus, patch bay de buses y detección de ciclos;
- parameter locks, velocity, probabilidad, ratchets y macros;
- export WAV offline y sesiones versionadas;
- banco de sonidos e instrumentos;
- drone, pad y lead con sonido editable y modo patrón;
- tests unitarios, audio check e integración Playwright.

Specs relacionadas: `docs/specs/01` a `docs/specs/12`.

---

## M1 — Clip Grid / Session View

**Resultado:** cada track puede tener clips independientes en una grilla. Lanzar un clip
o una escena no reinicia el resto de la música.

**Estado:** M1.1, M1.2 y M1.3 implementados (specs 13, 16 y 24 / ADR-0005). Clips con
patrón propio, creación, duplicado, rename, color, delete, escenas dinámicas
(agregar, reordenar, eliminar) y drag/drop vertical de clips dentro de un track.
Pendiente: mover clips entre tracks y crear escenas vacías sin snapshot.

### Alcance

- Entidad `ClipState`: id, track, slot de escena, patrón, longitud, loop, nombre, color y
  modo de lanzamiento.
- Grilla de clips: tracks en columnas, escenas en filas, slots vacíos y botón de stop.
- Lanzamiento de clip y de escena con cuantización: inmediato, 1 beat, 1 compás, 2 compases.
- Follow actions: siguiente, anterior, aleatorio, stop; después de N compases.
- Duplicar, renombrar, colorear y eliminar clips.
- Migración del modelo actual de escenas/patrones a clips sin perder sesiones.
- Los tracks generativos pueden tener clips generativos o clips con patrón.

### Criterios de aceptación

- Dos clips del mismo track pueden alternarse sin detener el transporte.
- Lanzar una escena mantiene el resto de los tracks en fase.
- Un follow action cambia de clip después de la longitud configurada.
- Los clips se guardan y cargan en sesión y escenas.
- `npm test`, `npm run test:audio` y `npm run test:integration` pasan.

### Fuera de alcance

- Arrangement, clips de audio, warping y MIDI.

### Riesgos

- Migrar de snapshots de escena a clips puede romper sesiones viejas.
- La grilla no debe multiplicar fuentes de audio por clip: una fuente por track.

---

## M2 — Browser + Devices

**Resultado:** explorar el instrumento se siente como abrir el browser de Ableton:
buscar, escuchar y arrastrar.

**Estado:** M2 completo para el alcance actual (specs 17, 25, 26, 27 y 28).
Búsqueda, drag/drop de sonidos, drawer compacto, favoritos, recientes persistidos
en sesión, preview sin aplicar, reordenamiento del rack y presets de cadenas.
Las macros ya funcionan como fuentes de la matriz de modulación; queda como deuda
menor un mapeo directo macro→parámetro.

### Alcance

- Panel de browser con categorías: sonidos, instrumentos, efectos, presets y samples.
- Búsqueda, tags, favoritos y recientes.
- Preview/audition antes de aplicar.
- Drag/drop a un track, a un clip o a una cadena de dispositivos.
- Cadena de dispositivos por track: reordenar, bypass, eliminar y guardar preset.
- Mapeo de macros a parámetros de dispositivos.
- Contenido inicial desde `MACHINE_PRESETS`, `SOUND_BANK`, plugins built-in y presets
  musicales.

### Criterios de aceptación

- Encontrar y aplicar un sonido requiere pocos pasos y no reinicia el transporte.
- El preview suena sin cambiar el estado del track.
- Un dispositivo se puede arrastrar, reordenar y bypasear sin clicks.
- Favoritos y recientes persisten en sesión.
- Tests de browser, drag/drop y persistencia.

### Fuera de alcance

- Tienda de plugins de terceros, contenido en la nube y marketplace.

### Riesgos

- El browser puede crecer demasiado; necesita búsqueda y jerarquía desde el día uno.
- El drag/drop debe funcionar con teclado y accesibilidad.

---

## M3 — Arrangement + Automation

**Resultado:** una performance se puede grabar y ordenar en una canción.

**Estado:** primer corte implementado (spec 18). Secuencia de bloques de escena con
compases, playback y persistencia. Pendiente: grabación de performance, locators/loop y
automatización por bloque.

### Alcance

- Timeline de arrangement con compases, beats, zoom y scroll.
- Bloques de escenas y clips en el timeline.
- Grabación de una performance a arrangement y overdub.
- Locators, loop brace y ciclo.
- Automatización por track, dispositivo y macro.
- Edición de automatización con puntos y curvas simples.
- Clip envelopes.
- Cambio entre modo Session y modo Arrangement sin cortar audio.

### Criterios de aceptación

- Grabar 8 compases de una performance produce un arrangement reproducible.
- El loop y los locators sobreviven al guardado.
- Una automatización de dispositivo suena igual en playback y en export.
- Cambiar entre Session y Arrangement no produce clicks.
- Tests de timeline, grabación y export del arrangement.

### Fuera de alcance

- Comping, edición de audio multipista y automatización de tempo avanzada.

### Riesgos

- Es el milestone más grande; conviene partirlo en cambios OpenSpec pequeños.
- La UI de timeline puede degradar performance si renderiza todo el proyecto.

---

## M4 — Capture + MIDI + Undo

**Resultado:** tocar y capturar la performance sin fricción.

**Estado:** undo global y entrada MIDI implementados (specs 19 y 22). Capture real-time
sigue pendiente; el export WAV offline cubre el render actual.

### Alcance

- Grabar master y resamplear a un clip.
- Export de stems y de loop.
- Entrada Web MIDI: notas, CC y clock.
- MIDI mapping/learn para parámetros y acciones.
- Atajos de teclado, command palette y acciones cuantizadas.
- Historial undo/redo no destructivo.
- Autosave y recuperación de sesión.

### Criterios de aceptación

- Un teclado MIDI puede tocar el track seleccionado y mapear un parámetro.
- El mapping persiste en sesión.
- Grabar/resamplear produce audio reproducible y exportable.
- Undo/redo cubre edición de patrones, mezcla y dispositivos.
- Tests de MIDI simulado, undo/redo y recuperación.

### Fuera de alcance

- Export MIDI, MPE avanzado y sincronización con hardware externo.

### Riesgos

- Web MIDI no está disponible en todos los browsers; debe haber fallback claro.
- El historial puede explotar en memoria si guarda estados completos; necesita diseño.

---

## M5 — Audio Clips + Warp

**Resultado:** el audio entra al instrumento y se comporta como un clip de Ableton.

**Estado:** importación de audio como track sampler implementada (spec 20). Pendiente:
warp, waveform, slice y pitch/loop del clip.

### Alcance

- Importar WAV/MP3 por drag/drop o file picker.
- Waveform, inicio, fin, loop, gain y pitch.
- Warp markers y modos básicos: beats, tones, texture.
- Slice a sampler o a pads.
- Resamplear un clip o una escena a audio.
- Integración con el browser y con el clip grid.

### Criterios de aceptación

- Importar un loop y warpearlo al BPM del proyecto.
- Un clip de audio se puede lanzar, loopear y slicear.
- El audio importado persiste en la sesión.
- La calidad y la CPU están documentadas y testeadas.

### Fuera de alcance

- Time-stretch de calidad de estudio, comping y edición espectral.

### Riesgos

- El warping de calidad es costoso; evaluar `Tone.GrainPlayer` vs AudioWorklet.
- Memoria y decodificación de archivos grandes en el browser.

---

## M6 — Hardening + Scale

**Resultado:** la experiencia se siente confiable, rápida y accesible.

**Estado:** performance mode implementado (spec 21). Pendiente: fullscreen, mobile,
compatibilidad amplia y auditoría de accesibilidad completa.

### Alcance

- Presupuestos de CPU, freeze de tracks y modos de rendimiento.
- Compatibilidad Chromium, WebKit y Firefox.
- Accesibilidad: teclado, foco, contraste, ARIA y lectores de pantalla.
- Onboarding, proyecto demo y documentación de usuario.
- Manejo de errores, autosave y recuperación.
- Versionado de sesión y migraciones.
- Evaluación de plugins de terceros si el producto lo necesita.

### Criterios de aceptación

- Los flujos principales funcionan sin mouse.
- No hay errores de consola en los flujos críticos.
- Los presupuestos de CPU y latencia están documentados y medidos.
- La app pasa tests en los browsers soportados.
- Un usuario nuevo puede hacer sonar algo en menos de un minuto.

### Fuera de alcance

- Apps nativas, colaboración en tiempo real y marketplace.

---

## OpenSpec: cómo se relaciona con este roadmap

El roadmap es dirección de producto. OpenSpec es la capa de especificación y ejecución de
cada cambio.

### El modelo de OpenSpec

```text
openspec/
  specs/                 Qué hace el sistema hoy (fuente de verdad)
  changes/
    add-clip-grid/       Un cambio = una unidad de trabajo
      proposal.md        Por qué
      specs/             Delta de lo que cambia
      design.md          Cómo
      tasks.md           Checklist verificable
  changes/archive/       Historial de cambios ya mergeados
```

El flujo por cambio es:

```text
proposal → specs → design → tasks → implement → archive
```

Las specs de `openspec/specs/` describen el sistema actual. Las specs dentro de un cambio
son un delta: `ADDED`, `MODIFIED` o `REMOVED`. Al archivar, el delta se fusiona con la spec
principal.

### Cómo lo usaríamos en Espiral

- `ROADMAP.md` define los milestones y el norte.
- Cada milestone se parte en cambios chicos, no en un único cambio gigante.
- Cada cambio tiene su propuesta, delta spec, diseño y tareas verificables.
- `docs/specs/` queda como documentación histórica y de diseño hasta que toquemos cada
  capability. No hace falta reescribir todo de golpe.

Capabilities propuestas:

```text
openspec/specs/
  clip-grid/
  browser/
  device-chain/
  arrangement/
  automation/
  capture/
  midi/
  audio-clips/
  persistence/
  performance/
```

Ejemplos de cambios:

- `add-clip-entity`
- `add-session-launch-quantize`
- `add-follow-actions`
- `add-browser-search`
- `add-device-chain-ui`
- `add-arrangement-timeline`
- `add-undo-history`
- `add-web-midi`
- `add-audio-warp`

### Comandos de trabajo

```bash
openspec init --tools opencode
openspec new change add-clip-entity --description "Modelo base de clips"
openspec status --change add-clip-entity
openspec validate add-clip-entity --strict
openspec archive add-clip-entity
```

### Recomendación

Adoptar OpenSpec de forma incremental:

1. Inicializarlo en el repo.
2. Empezar por un cambio real y chico de M1, por ejemplo `add-clip-entity`.
3. No convertir `docs/specs/` completo a OpenSpec de una vez.
4. A medida que cada capability se toca, mover su spec a `openspec/specs/`.

---

## Decisiones pendientes

- ¿El clip grid reemplaza el modelo de escenas o convive con él?
- ¿Los clips de audio van antes o después de Arrangement?
- ¿El browser incluye samples del usuario en M2 o recién en M5?
- ¿Adoptamos OpenSpec ahora o después de M1?
- ¿Cuál es el browser objetivo principal para performance en vivo?

## Métricas del roadmap

- Un usuario nuevo hace sonar algo en menos de 60 segundos.
- Cambiar de clip o escena no produce clicks ni desfase.
- La app mantiene 16 tracks + inserts en tiempo real en una laptop moderna.
- Un proyecto de 8 escenas × 16 tracks guarda y carga en menos de 2 segundos.
- El flujo principal se puede completar con teclado.
- Los tests de audio, integración y unitarios pasan en cada milestone.
