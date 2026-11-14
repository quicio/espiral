---
id: handoff
status: vigente
version: 1.2.0
updated: 2026-11-14
---

# Handoff — Espiral

## Qué es

Instrumento generativo de ritmos, escalas y automatización en el navegador.
TypeScript + Vite, arquitectura hexagonal, Tone.js encapsulado detrás de puertos,
AudioWorklet para plugins.

Versión `0.6.0`. Node 22.23.1 en la máquina de referencia.

## Estado medido (2026-11-14)

| métrica | valor | comando |
|---|---|---|
| tests unitarios | **284 pasan / 40 archivos** en ~3 s | `npm test` |
| check del AudioCore | render determinista del kick en Node | `npm run test:core` |
| guard de drum kits | 9 máquinas · 71 one-shots · 3.77 MB | `npm run test:kits` |
| typecheck | limpio, ~3 s | `npm run typecheck` |
| build | ~8 s (Vite, con typecheck previo) | `npm run build` |
| bundle principal | 622.13 kB (159.63 kB gzip) + core 40.92/15.14 kB | salida de `npm run build` |
| samples de batería | 4.0 MB en `public/audio/kits/` | `du -sh public/audio/kits` |
| código | 170 archivos `.ts` en `src/` | `find src -name '*.ts' \| wc -l` |
| specs | 44 en `docs/specs/` | `ls docs/specs` |
| ADRs | 7 en `docs/adr/` | `ls docs/adr` |
| git | cambios locales de AudioCore v0.2 | `git status` |

**Los checks de Playwright ya corren en esta máquina** (Chromium instalado el
2026-11-12). Un clone fresco sigue necesitando `npx playwright install chromium`;
CI usa `npx playwright install --with-deps chromium`.

## Mapa de capas

```
src/domain/          entidades y reglas puras (no conoce nada de afuera)
src/application/     casos de uso, store, servicios; solo conoce puertos
src/infrastructure/  Tone.js, audio, AudioWorklet, fetch, localStorage
src/presentation/    DOM, vistas, controladores
src/main.ts          composition root: elige implementaciones y las inyecta
```

Puertos en `src/domain/ports.ts`: `AudioEnginePort`, `ClockPort`,
`GenerativePort`, `SessionRepositoryPort`, `PresetRepositoryPort`,
`FileGatewayPort`, `StatusPort`.

## Invariantes que no se rompen

1. **Regla de dependencia** (arriba). Es lo que permite reemplazar el motor:
   `ToneAudioEngine` y `ModularAudioEngine` son dos implementaciones del mismo
   puerto y se cambia solo en `main.ts`.
2. **Estado inmutable en el store**; el motor no guarda la mezcla, la recibe.
3. **Eventos genéricos**: `SoundEvent { kind, channel, trackId? }`. El motor no
   conoce patrones, armonía ni escenas.
4. **Determinismo offline**: `OfflineAudioContext` + algoritmo generativo
   determinista. Los tests de audio fallan ante clipping, NaN, DC o silencio, no
   solo ante excepciones.
5. **La UI nunca importa Tone.js.**

## Cómo verificar sin ojos humanos

```bash
npm run typecheck && npm test                 # rápido, sin navegador
npm run test:core                             # render determinista del AudioCore (Node)
npm run test:core:live                        # AudioCore en la app, ?engine=core (Playwright)
npm run test:kits                             # wavs declarados vs public/audio/kits
npm run build                                 # verifica que el bundle arma
npm run test:audio                            # PCM determinista (Playwright)
npm run test:integration                      # app viva: clicks, estado, audio
node scripts/audio-check.mjs                  # equivalente directo
```

Para verificar audio sin escuchar: el script imprime métricas del render (pico,
RMS, DC, silencio). Para UI, `test:integration` recorre la app en Chromium; una
captura manual (`npx playwright screenshot` o el navegador) sigue siendo la
prueba final de lo visual.

Para performance, `docs/performance.md` resume benchmarks, tuning aplicado y opciones de AudioWorklet/WASM.

## AudioCore (spec 43)

El AudioCore es un núcleo DSP puro (sin Tone, sin DOM, sin `AudioContext`) que
renderiza `Float32Array` en Node y en el hilo de audio. v0 implementa kick,
mezcla, master y el harness de métricas (`src/audio-check/core-metrics.ts`); v0.1
suma voces mono, poly, pluck y sampler con pools fijos y tests deterministas;
v0.2 enchufa el core a la app con `?engine=core`; v0.3 suma inserts (delay,
reverb, compressor, drive, filter), buses, sends, output bus y medidores por
track/bus; v0.4 suma sidechain, glue, trim y EQ de master; v0.5 permite editar
los parámetros de esos inserts en vivo; v0.6 suma eq3, tremolo y bitcrusher y
expone los plugins built-in al rack (`supportsInserts=true`); v0.7 agrega preview
de sonidos sin depender del transporte; v0.8 suma modulación audio-rate de
parámetros de inserts; v0.9/0.10 suman patch bay de buses, `supportsRouting=true`
y el instrument plugin FM Synth; v0.11 suma spectrum master/track y el AudioCore
pasa a ser el motor por defecto (`?engine=tone` queda como fallback).

Medición de `npm run test:core` (kick solo, 48 kHz, master −4/limiter −1);
`npm run test:core -- /tmp/kick.wav` escribe el render para escucharlo:

| métrica | valor |
|---|---|
| `peakDb` | −10.40 dBFS |
| `rmsDb` | −27.05 dB |
| `kickTailDb` | −32.92 dB |
| `dc` | 8.1e−11 |
| `maxStep` | 0.112 |

El escenario de mezcla (kick + bajo mono + acorde poly + pluck + sampler, 2 s)
da `peak` −2.05 dBFS, `rms` −16.94 dB, `dc` 1.7e−5 y renderiza en ~128 ms en
Node (~15.6× tiempo real, un solo hilo). El AudioCore es el motor por defecto desde spec 43 v0.11. Desde v0.12 el reloj
y el step scheduler viven en el worklet (`AudioCoreEngine` implementa
`ClockPort`); `PlaybackService` sigue traduciendo estado a eventos. El export WAV usa el core
(`CoreOfflineRenderer`); Tone queda como fallback con `?engine=tone`. La
calidad se elige con `?quality=full|lite|eco` (default `lite`) y el selector del
transporte. En Sound, los tracks de batería fijos (incluido kick) tienen selector
de sonido; antes solo se podían cambiar desde el wizard. `npm run test:core:live` arranca la app, prueba preview, reproduce, cambia de
escena y exporta un WAV verificando master y medidores por track.

Límites del core por defecto: `PlaybackService` sigue generando los eventos
musicales en el main thread; PDC no aplica porque los inserts del core no
declaran latencia. El limiter usa 5 ms de lookahead, drive hace 2× oversampling y
las voces/efectos cachean coeficientes. Tone queda solo como fallback y para el
motor Tone del export opcional. Los locks de gain/pan e insert y la automatización básica de
wet ya funcionan a través de `setInsertParam`/`setEffectWet`. `supportsInserts` y `supportsRouting` siguen en
false para no ofrecer en la UI lo que el core aún no cubre. La UX queda congelada
hasta la paridad completa y el retiro de Tone del camino de audio.

## Mezcla y dinámica (spec 40)

`node scripts/mix-metrics.mjs` mide el set por defecto (Techno/909, 128 BPM,
4 compases) con renders offline deterministas y secuenciales:

| métrica | T0 | final |
|---|---|---|
| `kickTailDb` | −79.23 dB | −26.22 dB |
| `crestDb` | 15.01 dB | 11.87 dB |
| `rmsDb` | −26.01 dB | −23.01 dB |
| `bassDipDb` | 1.04 dB | 3.64 dB |
| `busGrDb` | — | +4.22 dB |
| `peakDb` | −11.01 dBFS | −11.13 dBFS |

El bus de batería (`drum-bus`) usa compresor + drive; el plugin `drive` lleva un
paso alto de 24 Hz para no romper el gate de DC. El master usa glue 5:1 y un
`trimDb` de −5.2 después del glue para cuadrar crest y RMS. El sidechain
(`kick` → `bass`) usa un `Tone.Gain` dedicado (`duckGain`) y `event.time`, nunca
el fader; se edita desde el detalle de Sound (on/off, depth, attack, release).
La escucha subjetiva sigue pendiente: los checks prueban que no está roto, no
que suene mejor.

## Acid 303 (spec 41)

El preset `acid-303` (sierra, filtro Q14, envolvente de filtro y glide 60 ms)
está disponible en el selector de máquina y en el banco de sonidos. El patrón
guarda `accents` y `slides` por paso; el secuenciador los expone en Dinámica y
el motor los aplica con `event.time` (sin reloj real). No es una emulación
circuito a circuito del TB-303.

CPU: `#cpu-value` no se mueve en headless (queda en 0 %). Como proxy se comparó
el render de los 7 escenarios de `test:audio`: **151.4 s en T3 → 139.9 s final
(−7.6 %)**, una corrida por lado.

Los cambios de máquina e inserts durante playback pasan por
`SerialTaskQueue`: una mutación cara por macrotask, con coalescing de máquina
por track. Las notas no se encolan. Los parámetros de las voces mono, membrana y
plugin se actualizan en sitio en vez de reconstruir el nodo. Detalle y límites en
`docs/performance.md`.

## Deuda y drift conocidos

| tema | estado | qué hacer |
|---|---|---|
| Specs sin frontmatter | estados en bullets (`**Estado:** …`), tres specs (10, 11, 12) sin estado declarado | migrar a frontmatter al tocarlas; no reescribir en masa |
| `docs/specs/00-roadmap.md` vs `ROADMAP.md` | el primero es histórico y lo dice; el vigente es el de la raíz | no actualizar el histórico |
| `03-tracks-and-ui` dice **diseño** | el README ya lista 16 tracks, routing, mod matrix y locks como presentes | confirmar con `git log` y actualizar la spec, no el README |
| Specs 02 (plugin SDK) en diseño | el rack de inserts ya existe en la UI | verificar alcance antes de implementar terceros |
| Medidores por track / baseline de performance | pendiente declarado en `architecture.md` | Fase 4 |
| Batería sin round-robin ni velocity | un one-shot por slot, mismo sample en cada golpe | agregar variantes por slot y elegir por paso en una spec nueva |
| Mover clips entre tracks | fuera de alcance en spec 24: el patrón vivo es por instrumento | evaluar en M3 si aparece la necesidad |
| Escenas vacías sin snapshot | `addScene` duplica la escena actual para garantizar un snapshot completo | diseñar en una spec nueva si se pide Session View puro |
| Pitch de bajos con kits de un sample | `bassVoice` calcula contra la tabla MIDI histórica de 6 samples | spec 39 fuera de alcance; corregir si el pitch molesta |

## Qué NO hacer

- No importar Tone.js desde `application/` o `presentation/` «solo para esta
  vista». Ver ADR-0002.
- No meter lógica de dominio en adapters ni en controladores de UI.
- No cambiar el algoritmo generativo sin actualizar el test determinista en el
  mismo commit (ADR-0004).
- No agregar dependencias al bundle por conveniencia: 117 kB gzip es el
  presupuesto actual.
- No commitear `dist/` ni `.opencode/goals/` (ignorados a propósito).
- No reescribir specs viejas para que coincidan con el código: se corrigen con una
  spec nueva que las reemplaza.
