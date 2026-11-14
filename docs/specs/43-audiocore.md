---
id: spec-43
title: AudioCore propio y harness de calidad
status: aprobada
version: 0.1.0
updated: 2026-11-14
fase: 7
depends_on: [spec-01, adr-0007]
---

# AudioCore propio y harness de calidad

## Objetivo

Reemplazar el camino de audio de Tone.js por un núcleo DSP propio, determinista
y de presupuesto fijo, sin tocar la UX ni el estado de la aplicación.

El AudioCore es la base para mejorar la calidad del sonido antes de rediseñar la
interfaz:

- osciladores y filtros con anti-aliasing controlado;
- envelopes sin clicks y retrigger predecible;
- voces fijas con robo de voz y mute que apaga voces;
- FX compartidos y master con gain staging real;
- render offline en Node, sin navegador, para medir y comparar.

## Principios

1. **El core no conoce Tone, DOM ni `AudioContext`.** Recibe eventos y renderiza
   `Float32Array`.
2. **Un solo camino de render** para vivo, offline y tests.
3. **Presupuesto fijo:** máximo de tracks y voces; sin allocations ni sorting en
   el loop de audio.
4. **Migración por paridad:** el core se enchufa detrás de `AudioEnginePort` y se
   elige con un flag hasta que las voces, la mezcla y los FX estén a la par.
5. **Medir antes de declarar mejora:** cada cambio de DSP tiene una métrica
   (peak, RMS, crest, DC, clicks, cola de kick, CPU) y un golden test.
6. **La UX se congela durante esta fase.** No se agregan pestañas ni features
   musicales nuevas.

## Arquitectura

```
main.ts
  │  elige AudioCoreEngine (flag) o ModularAudioEngine
  ▼
PlaybackService ──► SoundEvent con tiempo en segundos
  │
  ▼
AudioCore
  ├─ reloj interno (frame actual)
  ├─ cola de eventos ordenada
  ├─ tracks: gain, pan, mute, solo
  ├─ voces: pools fijos, robo de voz
  ├─ buses y FX (fases siguientes)
  └─ master: volumen, DC block, limiter/clipper
  │
  ├─ AudioWorkletProcessor (vivo)
  └─ renderOffline() (Node / tests)
```

El core mantiene su propio contador de frames. Los eventos se programan en
segundos relativos al inicio del core y se redondean a frame; el adapter vivo
convierte el tiempo de `AudioContext` a esa línea de tiempo.

## Alcance de v0

Implementado en este corte:

- [x] `AudioCore` puro con render estéreo determinista.
- [x] Voz de kick sintetizada (pitch envelope + amp envelope + click).
- [x] Mezcla por track: gain, pan equal-power, mute y solo.
- [x] Master: volumen, DC blocker y limiter suave.
- [x] Métricas offline reutilizables (peak, RMS, crest, DC, NaN, max step,
      cola de kick).
- [x] Tests de determinismo, mute/solo, limiter y cola de kick.
- [x] Script `npm run test:core` que imprime las métricas del kick; con un
      argumento, escribe el render a WAV (`npm run test:core -- /tmp/kick.wav`).

Además, corte v0.1 (paridad de voces):

- [x] MonoVoice con oscilador anti-alias, ADSR, filtro SVF, envelope de filtro,
      acento y glide.
- [x] PolyInstrument con pool fijo y robo de voz.
- [x] PluckInstrument Karplus-Strong.
- [x] SamplerInstrument con interpolación lineal, duración y fade.
- [x] Tests de las cuatro familias de voces.
- [x] Escenario de mezcla con kick, bajo, acorde, pluck y sampler en `test:core`.

Corte v0.2 (adapter vivo):

- [x] `AudioCoreEngine` implementa `AudioEnginePort` y se elige con
      `?engine=core`; Tone sigue siendo el default.
- [x] Worklet propio (`audio-core.worklet.ts`) empaquetado por Vite; el core
      corre en el hilo de audio.
- [x] Samples cargados en el hilo principal y enviados al worklet.
- [x] Sincronización de tracks, cambios de máquina, mezcla y master.
- [x] `npm run test:core:live`: arranca la app, reproduce, cambia de escena y
      verifica que el master siga sonando.

Corte v0.3 (FX, buses y medidores):

- [x] Buses con return y cadena de inserts.
- [x] Sends por track (pre/post fader) y salida a bus (`outputBusId`).
- [x] Inserts de delay, reverb, compressor, drive y filter.
- [x] Medidores por track y por bus en la UI.
- [x] Tests de efectos, routing y envío post-fader.

Corte v0.4 (master y dinámica):

- [x] Sidechain kick → bass con puntos de attack/release sample-accurate.
- [x] Glue, trim y EQ de 3 bandas en el master.
- [x] `setSidechain` y `setMasterEq` aplicados en vivo.
- [x] Test de ducking del bajo por kick.

Corte v0.5 (parámetros de inserts):

- [x] `setInsertParam` aplica wet/feedback/time/decay/threshold/ratio/attack/
      release/drive/mix/cutoff/q en el core.
- [x] `setEffectWet` mapea al primer insert del efecto en el track.
- [x] Bypass de inserts reconstruye la cadena.
- [x] `setBusInsertParam` disponible en el core (la UI de buses aún no lo usa).

Corte v0.6 (plugins built-in):

- [x] eq3, tremolo y bitcrusher implementados en el core.
- [x] `listPlugins` expone los efectos built-in (sin worklet-drive).
- [x] `supportsInserts` pasa a true: el rack puede agregar, quitar, reordenar y
      bypasear inserts sobre el core.

Corte v0.7 (preview):

- [x] `previewMachine` carga samples y crea un track `__preview__` temporal.
- [x] El preview suena sin transporte y se limpia solo.
- [x] `test:core:live` verifica el preview antes de arrancar el transporte.

Corte v0.8 (modulación audio-rate):

- [x] Rutas LFO sobre parámetros de inserts (`sine`, `triangle`, `square`, `saw`).
- [x] Rango por descriptor de plugin, base del insert y restauración al quitar la ruta.
- [x] Aplicación cada 128 frames; `supportsAudioModulation` ahora resuelve el target.
- [x] Test de modulación de cutoff sobre un kick.

Corte v0.9 (patch bay):

- [x] Bus-to-bus sends con orden topológico y protección ante ciclos.
- [x] `setBusSend`, `syncBusSends`, `supportsRouting=true`.
- [x] Test de bus A → bus B.
- [x] PDC no aplica: los inserts del core no declaran latencia.

Corte v0.10 (instrument plugins):

- [x] FM Synth (dos operadores, harmonicity, index, ADSR) en el core.
- [x] `listInstruments` expone el plugin y `setTrackMachine` aplica cambios.
- [x] Test de render del FM Synth.

Corte v0.11 (spectrum y default):

- [x] FFT de 128 puntos en el worklet y spectrum master/track en la UI.
- [x] Fade de transición de master en cambios estructurales.
- [x] AudioCore pasa a ser el motor por defecto; `?engine=tone` queda como fallback.
- [x] Integración corre por defecto sobre el core; el fallback Tone sigue verde.

Corte v0.12 (reloj en el core):

- [x] El worklet programa pasos de 16avos con BPM, lookahead y step scheduler.
- [x] `AudioCoreEngine` implementa `ClockPort`; `ToneClock` queda como fallback.
- [x] `PlaybackService` sigue traduciendo estado a eventos en el main thread.
- [x] Integración completa por defecto sobre el core y fallback Tone.

Corte v0.13 (export con el core):

- [x] `CoreOfflineRenderer`: simula `PlaybackService` con un motor colector y
      renderiza el estado con `AudioCore` en bloques de 128 frames.
- [x] Sample loading con `SampleLibrary` y WAV a 48 kHz.
- [x] `npm run test:core:live` exporta un WAV y verifica que no esté vacío.

Corte v0.14 (calidad y CPU):

- [x] Limiter de master con 5 ms de lookahead.
- [x] Drive con 2× oversampling.
- [x] Modos `full` / `lite` / `eco` para poly, pluck y sampler; default `lite`;
      selector en el transporte y `?quality=`.
- [x] Caché de coeficientes de ADSR, SVF y compresor; FFT reutilizable.
- [x] Parser de notas y decodificación de samples nativos (sin Tone en el core).

Fuera de v0.14:

- PDC (no hay inserts con latencia declarada en el core);
- pulido de anti-aliasing/oversampling en más etapas no lineales;
- retiro definitivo de Tone del fallback/export Tone.

## API de v0

```ts
interface CoreGraph {
  readonly tracks: readonly CoreTrackConfig[];
  readonly buses?: readonly CoreBusConfig[];
  readonly master: CoreMasterConfig;
}

interface CoreTrackConfig {
  readonly id: string;
  readonly machine: MachineConfig;
  readonly samples?: readonly CoreSample[];
  readonly inserts?: readonly InsertConfig[];
  readonly sends?: readonly SendConfig[];
  readonly outputBusId?: string;
  readonly gainDb: number;
  readonly pan: number;
  readonly mute: boolean;
  readonly solo: boolean;
}

interface CoreBusConfig {
  readonly id: string;
  readonly returnDb: number;
  readonly inserts: readonly InsertConfig[];
}

type CoreEvent =
  | { type: 'kick'; trackId: string; time: number; velocity?: number }
  | {
      type: 'synth';
      trackId: string;
      time: number;
      notes: readonly number[];
      duration: number;
      velocity?: number;
      accent?: boolean;
      slide?: boolean;
    }
  | {
      type: 'sample';
      trackId: string;
      time: number;
      sampleIndex?: number;
      playbackRate?: number;
      duration?: number;
      gainDb?: number;
    };

class AudioCore {
  constructor(graph: CoreGraph, sampleRate: number, seed?: number);
  schedule(event: CoreEvent): void;
  render(left: Float32Array, right: Float32Array): void;
  addTrack(track: CoreTrackConfig): void;
  removeTrack(trackId: string): void;
  setTrackMachine(trackId: string, machine: MachineConfig, samples?: readonly CoreSample[]): void;
  updateTrack(trackId: string, patch: Partial<Pick<CoreTrackConfig, 'gainDb' | 'pan' | 'mute' | 'solo' | 'inserts' | 'sends'>> & { outputBusId?: string | null }): void;
  addBus(bus: CoreBusConfig): void;
  removeBus(busId: string): void;
  setBusInserts(busId: string, inserts: readonly InsertConfig[]): void;
  setBusReturn(busId: string, db: number): void;
  setMaster(config: CoreMasterConfig): void;
  stop(): void;
  reset(): void;
  readonly currentFrame: number;
  readonly currentTime: number;
}
```

## Calidad: qué se mide

El harness (`src/audio-check/core-metrics.ts`) devuelve:

- `peakDb`, `rmsDb`, `crestDb`;
- `dc`, `nan`, `silent`;
- `maxStep` (proxy de clicks);
- `kickTailDb` en una ventana configurable.

Criterios de v0 para un kick solo:

- sin NaN ni Infinity;
- `dc < 0.001`;
- `peakDb <= -1 dBFS` con el master por defecto;
- `kickTailDb` entre 300 y 400 ms mayor a −45 dBFS;
- dos renders idénticos dan exactamente el mismo PCM;
- mute deja silencio; solo deja pasar únicamente el track aislado.

## Fases

1. **v0 — vertical slice.** Core puro + kick + mezcla + master + harness + tests.
2. **v1 — paridad de voces (implementado).** Membrane, mono, poly, pluck y sampler
   con tests deterministas.
3. **v2 — adapter vivo (implementado como preview).** `AudioCoreEngine`
   implementa `AudioEnginePort` y corre en AudioWorklet con `?engine=core`.
4. **v3 — FX, inserts y buses (primer corte implementado).** Buses/sends,
   inserts de delay/reverb/compressor/drive/filter y medidores. Faltan
   parámetros en vivo y el resto de plugins.
5. **v4 — master y dinámica (implementado).** Sidechain, glue, trim y EQ de
   master.
6. **v5 — parámetros de inserts (implementado).** Edición en vivo de los
   efectos soportados.
7. **v6 — plugins built-in (implementado).** eq3, tremolo, bitcrusher y rack
   completo.
8. **v7 — preview (implementado).** Sonidos del banco sin transporte.
9. **v8 — modulación audio-rate (implementado).** LFOs sobre inserts.
10. **v9 — patch bay (implementado).** Bus-to-bus sin ciclos; PDC no aplica.
11. **v10 — instrument plugins (implementado).** FM Synth.
12. **v11 — spectrum y default (implementado).** FFT, transición y core por
    defecto; Tone fallback.
13. **v12 — reloj en el core (implementado).** Step scheduler en worklet;
    `AudioCoreEngine` es `ClockPort`. Eliminar `ToneClock` del camino de
   audio y dejar `PlaybackService` como traductor de estado a eventos.
14. **v13 — calidad final y export con el core.** Anti-aliasing, oversampling selectivo, gain staging,
   limiter con lookahead, métricas de THD/aliasing y modos de CPU.

## Riesgos

- **Regresión de sonido:** el kick nuevo no tiene que sonar igual que Tone; tiene
  que sonar mejor y medirse. Los presets existentes pueden cambiar de carácter.
- **Dos motores conviviendo:** el flag y la paridad deben tener una fecha de
  corte; si no, la deuda se duplica. El adapter todavía usa Tone para contexto,
  decodificación y conversión de notas/tiempos; el DSP del core sigue puro.
- **Scope creep:** este spec no incluye UX ni el producto de 6 tracks. Cualquier
  cambio de producto se decide después.
- **Plugins de terceros:** no entran en el core; si se mantienen, serán un
  adapter aparte.

## Criterios de salida

- `npm test` verde con los tests del core.
- `npm run test:core` imprime métricas y falla si el kick queda fuera de rango.
- `npm run typecheck` y `npm run build` limpios.
- El motor actual sigue siendo el default; el core no rompe la app.
- `docs/README.md` y `HANDOFF.md` reflejan el estado.
