---
id: spec-40
title: Glue, sidechain y dinámica — que la batería pegue
status: aprobada
version: 1.0.0
updated: 2026-11-13
fase: 6
depends_on: [spec-01, spec-09, spec-38, spec-39, adr-0004]
---

# Glue, sidechain y dinámica

## Objetivo

El instrumento ya tiene samples reales de nueve máquinas (spec 38) y voces poly
con filtro (spec 05), y sin embargo **sigue sonando chico**. No es masterización:
faltan tres cosas de mezcla que están ausentes por diseño, no por falta de
presets.

Esta spec cierra esas tres:

1. **Glue** — compresión y saturación de grupo sobre la batería, más un master
   que sí comprima.
2. **Dinámica por golpe** — variantes de sample elegidas por paso (round-robin) y
   colas que no se corten.
3. **Sidechain** — el kick hace ducking sobre el bajo.

Criterio rector: un render offline verde prueba que **no está roto**, no que
suena mejor. El cierre de esta spec incluye una escucha del usuario.

## Diagnóstico medido (no reinterpretar, verificar)

Todo esto se comprobó en el código y en el audio renderizado el 2026-11-13:

| hecho | evidencia |
|---|---|
| El kick con sample se corta a un octavo | `playback.ts:306` → `duration: '8n'` en la rama sampler del kick |
| El perc se corta a una blanca | `playback.ts:386` → `duration: '2n'` |
| Los tracks sampler se cortan a un octavo | `playback.ts:402` → `duration: '8n'` |
| Nunca se elige variante: siempre el primer archivo | `sampleIndex: 0` fijo en `playback.ts:303`, `:399` y `:470` |
| No hay bus de batería: todo va directo al master | `TrackConfig` no tiene salida a bus; `createDefaultBuses()` sólo trae `reverb-bus` y `delay-bus` |
| El glue del master casi no actúa | `espiral-graph.ts:11` → `threshold: -14, ratio: 1.5` |
| No hay ducking | no existe ningún concepto de sidechain en `domain/` |
| La velocity sólo escala ganancia | `playback.ts:534` → `velocityGainDb()` y nada más |

Los samples **no** son el problema: el recorte de cola a −60 dB se corrigió en
`6815168` y las envolventes de los originales ya estaban muertas por debajo de
−80 dB donde se recortaba.

## Alcance

**Dentro:**

- Colas de one-shots sin corte artificial.
- Round-robin determinista por slot, con variantes bajadas del pack.
- Salida de track hacia un bus (`outputBusId`) y bus de batería con compressor +
  drive.
- Glue de master más firme.
- Sidechain kick → bajo, declarado en el dominio y ejecutado por el motor.
- Un script de métricas de mezcla para comparar antes/después sin oído.

**Fuera:**

- Masterización, limitadores multibanda, LUFS targets.
- Reverb por convolución nueva o IRs.
- Compresión multibanda o sidechain entre buses arbitrarios.
- Edición de la cadena de sidechain desde la UI (se configura en el dominio; la
  UI puede quedar para una spec posterior).
- Velocity como capa tímbrica por sample (no hay layers en los packs; ver
  T3 para el alcance real).

## Modelo de datos

### T2 — variantese por slot

`src/domain/drum-kits.ts`:

```ts
export interface DrumKitSound {
  readonly slot: DrumSlot;
  /** 1..4 variantes. La primera es la principal; el resto entra por round-robin. */
  readonly files: readonly string[];
}
```

`drumSlotMachine()` pasa a construir `samples: files.map(...)` en orden, para que
el `sampleIndex` del `SoundEvent` sea el índice de la variante.

### T4 — salida a bus

`src/domain/graph.ts` y `src/domain/kit.ts`:

```ts
// TrackConfig y TrackState
readonly outputBusId?: string;
```

Si está ausente, el track va al master (comportamiento actual). El `returnDb` del
bus pasa a ser el nivel del grupo cuando el bus recibe tracks directos: para
`drum-bus` va en `0` (unidad), no en −14 (eso era para un auxiliar).

### T6 — sidechain

`src/domain/kit.ts`:

```ts
export interface SidechainConfig {
  readonly enabled: boolean;
  readonly sourceTrackId: string;   // 'kick'
  readonly targetTrackId: string;   // 'bass'
  readonly depthDb: number;         // cuánto baja el target, positivo (3 = −3 dB)
  readonly attack: number;          // s
  readonly release: number;         // s
}

// KitState
readonly sidechain?: SidechainConfig;
```

Regla dura: el ducking **no** toca `track.gainDb`, `muted` ni `solo`. Va sobre un
`Tone.Gain` propio en la cadena del target (nombre sugerido: `duckGain`), así el
fader del usuario y la automatización no se pisan.

## Tareas

Cada tarea es un commit propio, con la spec actualizada si cambia el modelo.

### T0 · Medir antes de tocar

Crear `scripts/mix-metrics.mjs` (Node + Playwright, mismo patrón que
`scripts/audio-check.mjs`: levanta Vite, abre `offline-test.html` o una página
nueva, renderiza el set por defecto) que imprima por escenario:

- `kickTailDb`: nivel RMS del kick entre 300 y 400 ms después del golpe.
- `crestDb`: 20·log10(pico / RMS) del mix completo.
- `rmsDb`: RMS integrado.
- `busGrDb`: reducción de ganancia del compresor del bus de batería (si existe).

Guardar la salida en el mensaje del commit como línea base. **Sin esto, el resto
de la spec no es verificable.**

Aceptación: `node scripts/mix-metrics.mjs` corre en < 90 s e imprime JSON.

### T1 · Dejar sonar los one-shots

`src/application/playback.ts`:

- Rama sampler del kick (`playback.ts:306`): quitar `duration: '8n'`.
- Perc (`playback.ts:386`): quitar `duration: '2n'`.
- Tracks sampler de usuario (`playback.ts:402`) y el sampler genérico de
  `triggerGenerative` (`playback.ts:470`): quitar `duration: '8n'`.
- El bajo mantiene su `noteDuration('bass', sustain)`: es una nota, no un one-shot.

`SamplerVoiceSource.play()` ya acepta `duration?: NoteDuration`; `undefined`
significa “hasta el final del buffer” en la rama pool y en el worklet
(`total = buffer.length / rate`).

Aceptación:

- `mix-metrics` muestra `kickTailDb` ≥ −45 dBFS (antes del cambio, el kick está
  cortado a 8n, que a 120 BPM son 250 ms).
- `npm run test:audio` verde y **peak ≤ −1 dBFS** en los siete escenarios. Si el
  peak se pasa, bajar el glue o el gain del track; no tocar el limiter.

### T2 · Round-robin determinista

1. `scripts/fetch-drum-kits.py`: por slot, aceptar una lista de archivos fuente.
   Empezar por los kits que tienen variantes reales en el pack:
   - `808`: `05.`, `06.`, `07.` de cada instrumento (el pack trae 16 variantes).
   - `909` / `909t` / `909sp`: sólo donde el pack tenga más de un archivo por
     instrumento (`clap-1`/`clap-2`, `hihat-open-1`/`-2`, `hihat-close`/`closed`).
   - El resto queda con una variante. No inventar variantes por pitch shift.
2. `DrumKitSound.files` (ver modelo) y `drumSlotMachine()`.
3. `src/application/playback.ts`: en las cuatro ramas de batería, elegir
   `sampleIndex` con el hash existente, nunca con `Math.random()`:

   ```ts
   const variants = sampleCountFor(track);           // de la machine o del drum kit
   const pick = Math.floor(
     this.generative.hash01(state.seed, `${trackId}-rr`, stepCount, 17) * variants
   );
   ```

   `generative.hash01(seed, key, step, salt)` ya se usa para `probability`
   (`playback.ts:504`), así que el determinismo por (seed, track, step) ya está
   probado en el proyecto. El worklet clampea el índice al tamaño real de la
   máquina desde la spec 39, así que un índice de más no deja el track mudo.
4. Tests de dominio: `hash` estable para la misma seed, índice siempre en rango,
   y distribución que cubra todas las variantes en 64 pasos.

Aceptación:

- Dos golpes del mismo slot en pasos distintos suenan con variantes distintas
  (`sampleIndex` distinto al menos en 1 de cada 3 pasos del patrón por defecto).
- Mismo estado + misma seed ⇒ mismo PCM: `npm run test:audio` produce los mismos
  valores que la corrida anterior, salvo el kick por T1.
- `npm run test:kits` sigue verde (los wavs declarados existen).

### T3 · Velocidad con consecuencia

`src/application/playback.ts` y `src/domain/drum-kits.ts`:

- En batería, la velocity **no** cambia el timbre: cambia la ganancia (ya lo hace)
  y **sesga la elección de variante**: los golpes con velocity < 0.6 evitan la
  variante 0 (la más brillante/fuerte del pack). Documentarlo en el código.
- En sintetizadores (`type: 'synth'`), la velocity ya entra a `triggerAttackRelease`
  de Tone. No tocar más: el ADSR de Tone escala la ganancia por nota.
- En `src/domain/default-groove.ts`, subir el contraste de los acentos de
  `kick` (1.0 en el pulso, 0.55–0.7 en los demás) y de `hihat` (0.55 acentuado vs
  0.25–0.35). Mantener los valores dentro de [0.15, 1].

Aceptación: un test que verifique que `velocity < 0.6` nunca elige `sampleIndex 0`
cuando hay más de una variante; `patterns.test.ts` sigue verde.

### T4 · Bus de batería con glue y saturación

1. `graph.ts` + `kit.ts`: `outputBusId?: string` (ver modelo) y `trackToConfig()`
   lo propaga.
2. `src/infrastructure/audio/modular/modular-audio-engine.ts`: resolver el routing
   en `addTrack()` / `syncTracks()` (que ya reciben `TrackConfig`): si `outputBusId`
   existe y el bus existe, `track.output → bus.input`; si no, `track.output →
   master.input`. `syncTracks()` ya es incremental para no reconstruir cadenas
   (spec 31): reusar ese camino, no recrear fuentes. Si hace falta un setter en
   vivo, agregar `setTrackOutput(trackId, busId)` a `AudioEnginePort`
   (`src/domain/ports.ts`) e implementarlo también en `FakeAudioEngine`
   (`src/test/fakes.ts:177`) para no romper los tests de aplicación.
3. `src/domain/default-kit.ts` → `createDefaultBuses()`: agregar

   ```ts
   {
     id: 'drum-bus',
     name: 'Drums',
     returnDb: 0,
     inserts: [
       compressorInsert({ threshold: -16, ratio: 4, attack: 0.008, release: 0.12 }),
       driveInsert({ drive: 0.35, mix: 0.3 })
     ],
     sends: []
   }
   ```

   `compressorInsert` y `driveInsert` nuevos en `src/domain/channels.ts`, al lado
   de `delayInsert` y `reverbInsert`. Los plugins `compressor` y `drive` ya existen
   en `infrastructure/audio/plugins/builtins.ts`: no hace falta plugin nuevo.
4. Asignar `outputBusId: 'drum-bus'` a los tracks de batería del kit por defecto
   (`kick`, `track-08`, `track-09`, `hihat`, `track-10`, `perc`, `track-11`,
   `track-12`, `track-16`). Dejar `bass`, `drone`, `pad`, `lead`, `track-13`,
   `track-14`, `track-15` en master.

Aceptación:

- `espiral-graph.test.ts`: todo track de rol de batería apunta a `drum-bus` y el
  bus existe.
- `mix-metrics`: `crestDb` baja (más pegada) y `rmsDb` sube 2–4 dB respecto de
  T0, con peak ≤ −1 dBFS.
- El CPU (`#cpu-meter-fill`) no sube más de 10 % en `npm run test:integration`.

### T5 · Glue de master

`src/infrastructure/audio/modular/espiral-graph.ts`:

```ts
glue: { threshold: -18, ratio: 2.5, attack: 0.02, release: 0.18, knee: 8 }
```

El limiter queda en −2 dBFS y el `safety-clipper` sigue siendo la última red. Si el
peak medido supera −1 dBFS, subir el threshold del glue, no el limiter.

Aceptación: `npm run test:audio` verde con los siete escenarios bajo −1 dBFS y sin
clipping en `#master-clip` durante `npm run test:integration`.

### T6 · Sidechain kick → bajo

1. `SidechainConfig` + `KitState.sidechain` (ver modelo). En `createDefaultKit()`:
   `{ enabled: true, sourceTrackId: 'kick', targetTrackId: 'bass', depthDb: 4, attack: 0.006, release: 0.16 }`.
2. `src/application/playback.ts`: cuando dispara el kick (membrane o sample), el
   evento debe llevar la info que el motor necesita. Ya existe `time`; agregar al
   `SoundEvent` de tipo `kick` y al `sample` con `trackId: 'kick'` nada nuevo: el
   motor sabe que es el kick y lee `state.sidechain` del `KitState` que ya tiene.
3. `modular-audio-engine.ts`: en `trigger()` para el kick, si
   `kit.sidechain?.enabled` y el target existe, programar sobre el `duckGain` del
   target:

   ```ts
   duck.gain.setValueAtTime(1, event.time);
   duck.gain.linearRampToValueAtTime(dbToGain(-depthDb), event.time + attack);
   duck.gain.linearRampToValueAtTime(1, event.time + attack + release);
   ```

   Nunca `rampTo()` con reloj real: el render offline exige tiempos del evento.
4. Función pura testeable en `domain/`: `sidechainPoints(time, depthDb, attack, release)`
   → `[{ time, gain }, …]`, usada por el motor.

Aceptación:

- Test unitario de `sidechainPoints`: 3 puntos, ganancia mínima exacta
  `dbToGain(-depthDb)`, tiempos monótonos.
- `mix-metrics`: el RMS del bajo en la ventana del kick es ≥ 3 dB menor que en la
  ventana sin kick.
- Con `enabled: false`, el render es idéntico al de antes de T6 (mismo PCM).

## Criterios de aceptación globales

- [ ] `npm run typecheck` limpio.
- [ ] `npm test` verde, sin `.skip` nuevos.
- [ ] `npm run test:kits` verde.
- [ ] `npm run test:audio` verde, **siete escenarios, peak ≤ −1 dBFS**.
- [ ] `npm run test:integration` verde.
- [ ] `node scripts/mix-metrics.mjs` con la tabla antes/después en el commit.
- [ ] Spec 39 marcada `implementada`, spec 09 actualizada con el routing a bus.
- [ ] Un commit por tarea, mensaje convencional en español con las cifras.
- [ ] **Escucha del usuario**: el agente cierra preguntando si el resultado suena
      mejor, no afirmándolo.

## Riesgos

| riesgo | mitigación |
|---|---|
| El bus con compresión sube el nivel y rompe el gate de −1 dBFS | medir peak en cada tarea; ajustar threshold/gain del bus, no el limiter |
| `drive` satura y agrega DC | `test:audio` ya falla con DC ≥ 0.001; si pasa, bajar `mix` del drive |
| Round-robin rompe el determinismo | hash de (seed, track, step), nunca azar; test de estabilidad |
| El sidechain pelea con mutes y faders | `duckGain` dedicado, jamás sobre `gainDb` |
| CPU: bus extra + compresor + drive por insert | comparar `#cpu-meter-fill` antes/después en `test:integration` |
| Las sesiones guardadas no tienen `outputBusId` ni `sidechain` | ambos opcionales; sin ellos el comportamiento es el actual |
| El offline usa otra ruta que el vivo (pool vs worklet) | verificar T1 y T2 en los dos caminos: `test:audio` cubre pool, `test:integration` cubre worklet |

## Criterio de salida medible

Con el set por defecto (Techno Kit, 909):

| métrica | antes (T0) | objetivo |
|---|---|---|
| `kickTailDb` a 300–400 ms | cortado (−120 dB, el sample no llega) | ≥ −45 dB |
| `crestDb` del mix | ~13 dB | 9–12 dB |
| `rmsDb` integrado | línea base | +2 a +4 dB |
| dip del bajo por kick | 0 dB | ≥ 3 dB |
| peak del render | −1.94 dBFS | ≤ −1 dBFS |
| CPU en playback | línea base | ≤ +10 % |

Números fuera de rango = la tarea no está terminada, aunque los tests estén verdes.

## Notas para el agente que implemente

- No cambiar samples ni osciladores en esta spec: el material ya está elegido. Si
  algo sigue sonando mal después de T1–T6, se abre otra spec con medición nueva.
- Un cambio por tarea, y correr `mix-metrics` después de cada una. Si la métrica
  objetivo no se mueve, revertir la tarea antes de seguir: apilar cambios sin
  efecto medible es lo que hace que el sonido empeore sin que nadie sepa por qué.
- No podés juzgar timbre. Podés medir colas, crest factor, reducción de ganancia y
  peaks. La última palabra la tiene una escucha del usuario.
