# Spec: motor de audio modular

- **Fase:** 1
- **Depende de:** base 0.2.0
- **Reemplaza a:** `ToneAudioEngine` como implementación de `AudioEnginePort`
- **Estado:** implementado; motor legacy retirado

## Objetivo

Implementar un motor de grafo que soporte tracks, buses, inserts y sends, manteniendo el
contrato de eventos actual. La aplicación sigue produciendo `SoundEvent`; el motor nuevo
los enruta a tracks.

## Estado de implementación

- Hecho: `GraphConfig` + `validateGraph`.
- Hecho: `Track`, `Bus`, `MasterBus`, `InsertSlot` con bypass por crossfade.
- Hecho: `ModularAudioEngine` con `AudioEnginePort` y métodos de tracks/buses/sends.
- Hecho: demo `/modular.html` con 2 tracks, 1 bus de reverb, 1 filtro y 1 send.
- Hecho: `createEspiralGraph` construye el grafo desde el kit.
- Hecho: smoke de la app principal con el motor modular.
- Hecho: PDC por track/send con delays de compensación.
- Hecho: crossfade de inserts (`InsertChain` + fade de 30 ms) y rampas en sends.
- Hecho: harness de audio offline con Playwright y CI.
- Hecho: `ModularAudioEngine` es el único motor; `ToneAudioEngine` fue eliminado.
- Hecho: modulación audio-rate, instrument plugins y medidores por nodo.

## No objetivos

- UI de patch bay libre.
- Plugins de terceros.
- Edición de audio.

## Modelo

```ts
interface TrackConfig {
  id: string;
  name: string;
  role?: 'kick' | 'bass' | 'hihat' | 'perc' | 'drone' | 'pad' | 'lead' | 'user';
  gainDb: number;
  pan: number;
  mute: boolean;
  solo: boolean;
  inserts: InsertConfig[];
  sends: SendConfig[];
}

interface BusConfig {
  id: string;
  name: string;
  returnDb: number;
  inserts: InsertConfig[];
}

interface InsertConfig {
  id: string;
  pluginId: string;
  bypass: boolean;
  state: Record<string, number>;
}

interface SendConfig {
  busId: string;
  amount: number;
  preFader: boolean;
}
```

## Señal

```
Source
  │
  ▼
[Insert 1] → [Insert 2] → [Insert N] → [Gain] → [Pan] → [Meter] ──► Master input
                                                   │
                                                   ├── send A (post) ──► Bus A
                                                   └── send B (pre)  ──► Bus B

Bus A/B: [ins] → [return gain] → Master input

Master: [HPF 25Hz] → [Glue] → [Limiter -2] → [Safety clip 0.8] → [Meter] → Destination
```

## API propuesta

El motor nuevo implementa `AudioEnginePort` y agrega una superficie para tracks/buses:

```ts
interface ModularAudioEngine extends AudioEnginePort {
  createTrack(config: TrackConfig): void;
  removeTrack(id: string): void;
  updateTrack(id: string, patch: Partial<TrackConfig>): void;
  createBus(config: BusConfig): void;
  updateBus(id: string, patch: Partial<BusConfig>): void;
  addInsert(ownerId: string, insert: InsertConfig, index: number): void;
  removeInsert(ownerId: string, insertId: string): void;
  setInsertBypass(ownerId: string, insertId: string, bypass: boolean): void;
  setSend(trackId: string, send: SendConfig): void;
  removeSend(trackId: string, busId: string): void;
  getMeter(nodeId: string): MeterReading;
}
```

`SoundEvent` se extiende con `trackId` opcional. Si no viene, se resuelve por `channel`
para mantener compatibilidad con la app actual.

## Scheduling

- El scheduler sigue en `application/PlaybackService` y emite eventos con timestamps de
  `AudioContext`.
- El motor no conoce patrones, armonía ni escenas.
- Los cambios de mezcla usan rampas de 20–50 ms.
- Los cambios de grafo (inserts, routing) usan crossfade de 20–30 ms.

## Reglas de grafo

- IDs estables y únicos.
- Conexiones duplicadas rechazadas.
- Ciclos rechazados salvo que el path incluya un delay.
- Cada plugin declara latencia; el motor calcula PDC en paths paralelos.
- Los nodos no se desconectan en caliente sin crossfade.

## Serialización

- El motor no guarda estado de aplicación.
- `main.ts` reconstruye el grafo desde `InstrumentState`/`SessionDto`.
- Los plugins se restauran por `pluginId` + `state` versionado.

## Migración

1. Crear `ModularAudioEngine` con los 7 tracks actuales.
2. Comparar contra `ToneAudioEngine` con un feature flag en `main.ts`.
3. Migrar sesiones sin cambiar el DTO.
4. Eliminar el engine viejo cuando la paridad esté verificada.

## Criterios de aceptación

- 7 tracks con inserts/sends suenan equivalente al motor anterior.
- Se agrega un track 8 en runtime sin tocar `PlaybackService`.
- Cambiar un insert o un send no produce clicks.
- La sesión actual sigue cargando.
- El render offline no supera −1 dBFS.
- `npm test` y `npm run build` pasan.

## Tareas

- [x] Definir tipos de track/bus/insert/send en `domain`.
- [x] Implementar validación de grafo y crossfade de bypass de inserts.
- [x] Implementar `ModularAudioEngine` con prototipo de 2 tracks.
- [x] Tests de grafo y del demo.
- [x] Migrar los 7 tracks y adaptar `MixService`/`PlaybackService`.
- [x] PDC y tests de audio offline.
- [x] Crossfade de inserts y rampas en sends.
- [x] Promover el motor modular a único motor.
- [x] Eliminar `ToneAudioEngine`, el flag `VITE_ENGINE` y los scripts legacy.
