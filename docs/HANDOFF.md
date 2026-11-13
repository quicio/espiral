---
id: handoff
status: vigente
version: 1.2.0
updated: 2026-11-13
---

# Handoff — Espiral

## Qué es

Instrumento generativo de ritmos, escalas y automatización en el navegador.
TypeScript + Vite, arquitectura hexagonal, Tone.js encapsulado detrás de puertos,
AudioWorklet para plugins.

Versión `0.6.0`. Node 22.23.1 en la máquina de referencia.

## Estado medido (2026-11-13)

| métrica | valor | comando |
|---|---|---|
| tests unitarios | **230 pasan / 33 archivos** en ~4 s | `npm test` |
| guard de drum kits | 9 máquinas · 71 one-shots · 3.77 MB | `npm run test:kits` |
| typecheck | limpio, ~3 s | `npm run typecheck` |
| build | ~8 s (Vite, con typecheck previo) | `npm run build` |
| bundle principal | 561.05 kB (143.31 kB gzip) | salida de `npm run build` |
| samples de batería | 4.0 MB en `public/audio/kits/` | `du -sh public/audio/kits` |
| código | 122 archivos `.ts` en `src/` | `find src -name '*.ts' \| wc -l` |
| specs | 41 en `docs/specs/` | `ls docs/specs` |
| ADRs | 6 en `docs/adr/` | `ls docs/adr` |
| git | árbol limpio al cerrar spec 40 | `git status` |

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

## Mezcla y dinámica (spec 40)

`node scripts/mix-metrics.mjs` mide el set por defecto (Techno/909, 128 BPM,
4 compases) con renders offline deterministas y secuenciales:

| métrica | T0 | final |
|---|---|---|
| `kickTailDb` | −79.23 dB | −22.91 dB |
| `crestDb` | 15.01 dB | 12.37 dB |
| `rmsDb` | −26.01 dB | −19.63 dB |
| `bassDipDb` | 1.04 dB | 3.68 dB |
| `busGrDb` | — | +4.16 dB |
| `peakDb` | −11.01 dBFS | −7.26 dBFS |

El bus de batería (`drum-bus`) usa compresor + drive; el plugin `drive` lleva un
paso alto de 24 Hz para no romper el gate de DC. El sidechain (`kick` → `bass`)
usa un `Tone.Gain` dedicado (`duckGain`) y `event.time`, nunca el fader. La
escucha subjetiva sigue pendiente: los checks prueban que no está roto, no que
suene mejor.

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
