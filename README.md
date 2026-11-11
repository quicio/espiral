# Espiral

Instrumento generativo de ritmos, escalas y automatización.

[![Espiral](docs/espiral.png)](https://quicio.github.io/espiral/)

- 16 tracks: kick, bass, hi-hat, perc, drone, pad, lead y 9 tracks de usuario sampler.
- Wizard de armado inicial: base, escala, tempo, kit y elementos antes de reproducir.
- Los tracks de usuario se pueden crear y eliminar; los 7 tracks del núcleo son fijos.
- Routing matrix track × bus con envíos PRE/POST, retorno por bus y dos buses por defecto.
- Mod matrix con LFO, macros y paso, aplicada a parámetros de plugins a control-rate.
- Parameter locks por paso con marcas en el secuenciador y persistencia en sesión.
- Locks sobre parámetros de inserts y sobre gain/pan de cada track.
- Medidores y clip latch por track/bus, además del master.
- Sound con mixer compacto de 16 canales, detalle del track y banco en drawer.
- Medidor de CPU estimada y motor modular único, sin fallback legacy.
- CPU normal/warning/critical con límites documentados.
- Export WAV offline de la performance actual, con escena y duración configurables.
- Cambios de máquina/track con crossfade para evitar clicks y cortes.
- Cambios de preset/escena con duck breve de master y BPM rampeado.
- Buffer/lookahead configurable de 20–300 ms.
- Patch bay de buses con detección de ciclos y creación/eliminación de buses.
- Presets musicales por género con escenas, patrones, armonía, mezcla, pan y sends.
- Grooves curados por escena con velocity, probabilidad y ratchets desde el estado inicial.
- Capas de shaker y percusión con paneo y sends propios en el kit por defecto.
- Velocity, probabilidad y ratchets por paso; paneo y sends rápidos por track.
- Máquinas por track: sampler, drone sampler, pad, bajo, lead y pluck, con editor de parámetros.
- Banco de 15 sonidos e instrumentos por categoría para tracks editables.
- Drone, pad y lead con sonido editable y modo patrón conmutable (`+P` / `−P`).
- Instrument plugins con `FM Synth` built-in y dos macros de track para el mod matrix.
- Modulación audio-rate para parámetros de plugins que exponen `AudioParam`.
- Los presets pueden definir máquinas por track y variarlas por escena.
- Performances por escenas: `Umbral`, `Deriva`, `Pulso`, `Caos contenido`.
- Session / Clip Grid con lanzamiento cuantizado, follow actions y stop por track.
- Clips independientes con patrón propio, crear, duplicar, renombrar, colorear y eliminar.
- Browser de sonidos con búsqueda y drag/drop a tracks editables.
- Arrangement de escenas por bloques de compases.
- Entrada MIDI para tocar el track seleccionado y mapear macros.
- Importación de audio como track sampler.
- Undo/redo global y modo Performance.
- Semilla reproducible, Euclid, densidad, mutación, freeze y evolución.
- Tonalidad: 12 raíces, 7 escalas y 4 progresiones.
- Duración de notas para pad, lead y bass.
- Automatización de 16 pasos para reverb/delay.
- Sesiones locales y exportación/importación JSON.

## Desarrollo

```bash
npm install
npm run dev
```

Abrir la URL que imprime Vite. La app usa TypeScript, `@quicio/umbral-tone/generative`
para las reglas musicales y el motor modular de 16 tracks por defecto.

### Motor

El motor modular es el único motor. Implementa `AudioEnginePort` y vive en
`src/infrastructure/audio/modular/`. Incluye tracks, buses, inserts, PDC, instrument
plugins y modulación audio-rate.

También se puede abrir `/modular.html` con `npm run dev`: es el experimento aislado de
2 tracks + 1 bus + 1 insert, con selector de plugins, parámetros generados desde el
schema y un plugin AudioWorklet. No entra en la build de producción.

## Build y tests

```bash
npm run build
npm run preview
npm test
npm run test:audio
npm run test:integration
```

`test:audio` renderiza 7 escenarios en un `OfflineAudioContext` real y verifica peak,
NaN, DC, silencio y tiempos de render. `test:integration` levanta Vite, reproduce la app
y verifica tracks, transporte, presets, samples y errores de consola. La primera vez requiere:

```bash
npx playwright install chromium
```

La build se publica en GitHub Pages en `https://quicio.github.io/espiral/`.

## Roadmap

El norte es llevar lo mejor de Ableton Live a una experiencia web generativa: clip grid,
browser, device chains, arrangement, capture, MIDI y audio clips. Los milestones y el
encaje con OpenSpec están en [`ROADMAP.md`](ROADMAP.md).

## Arquitectura

La regla de dependencia apunta hacia adentro: el dominio no conoce Tone.js, el DOM,
`localStorage` ni `fetch`. Ver [`docs/architecture.md`](docs/architecture.md) y los
specs del roadmap en [`docs/specs/`](docs/specs/).

Para trabajar en el repo (humano o agente): [`AGENTS.md`](AGENTS.md) tiene comandos
y reglas, y [`docs/README.md`](docs/README.md) es el índice de specs, ADRs y
handoff.

- `src/domain/` — entidades, patrones, automatización y puertos. Sin frameworks.
- `src/application/` — casos de uso, store inmutable y servicios de reproducción/mezcla.
- `src/adapters/` — mapeo entre el estado y los formatos de sesión/preset.
- `src/infrastructure/` — Tone.js, audio, fetch, `localStorage` y descarga de archivos.
  El motor modular vive en `src/infrastructure/audio/modular/`; el PluginHost y los
  plugins built-in en `src/infrastructure/audio/plugins/`.
- `src/presentation/` — vistas DOM, controladores y presentadores.
- `src/main.ts` — composition root: elige las implementaciones y las inyecta.
- `src/espiral.css` — sistema visual del instrumento.
- `src/base.css` — base tipográfica, color y shell de la página.
- `public/audio/` — samples de batería y bajo.

El motor modular implementa `AudioEnginePort`. Para reemplazarlo por otro motor solo hay
que crear otro adapter y cambiarlo en `src/main.ts`.

## Licencia

MIT.
