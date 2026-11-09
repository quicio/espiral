# Spec: Plugin SDK

- **Fase:** 2
- **Depende de:** motor modular (Fase 1)
- **Estado:** diseño

## Objetivo

Permitir plugins propios de instrumento y efecto con un contrato estable, parámetros
declarativos y UI generada. Un plugin nuevo no debe requerir cambios en `application` ni
`presentation`.

## Estado de implementación (0.2.0)

- Hecho: contrato `PluginDefinition`/`PluginParam`/`PluginState`.
- Hecho: `PluginHost` con registro, defaults, clamp y latencia declarada.
- Hecho: plugins `filter`, `delay`, `reverb`, `drive`, `compressor`.
- Hecho: plugin AudioWorklet `worklet-drive` con carga lazy.
- Hecho: UI genérica de parámetros y demo de cambio de plugin en caliente.
- Hecho: cadenas de inserts arbitrarias persistidas en el estado y en la sesión.
- Hecho: rack de plugins en la vista Sound (agregar, quitar, reordenar, bypass, params).
- Hecho: compatibilidad con sesiones viejas sin `inserts`.
- Pendiente: plugins de terceros y UI custom.

## Tipos de plugin

| Tipo | Entrada | Salida | Ejemplo |
| --- | --- | --- | --- |
| `effect` | audio | audio | filtro, drive, compresor |
| `instrument` | ninguna | audio | sampler, synth |

Implementaciones soportadas:

1. Web Audio nativo.
2. Tone.js.
3. AudioWorklet para DSP propio.

## Contrato

```ts
interface PluginParam {
  id: string;
  label: string;
  min: number;
  max: number;
  default: number;
  unit?: 'db' | 'hz' | 'ms' | '%' | 'q' | 'ratio' | 'none';
  curve?: 'linear' | 'log';
  smoothing?: number;
  step?: number;
}

interface PluginInstance {
  input: AudioNode;
  output: AudioNode;
  setParam(id: string, value: number, time?: number): void;
  getParam(id: string): number;
  dispose(): void;
  serialize(): Record<string, number>;
}

interface PluginDefinition {
  id: string;
  name: string;
  version: number;
  kind: 'effect' | 'instrument';
  params: PluginParam[];
  latencySamples?: number;
  create(ctx: BaseAudioContext, state: Record<string, number>): PluginInstance;
}
```

## Parámetros

- Se guardan en unidades nativas (dB, Hz, segundos).
- La UI trabaja en 0..1 y aplica la curva.
- Todo cambio de parámetro en vivo usa rampa (`setTargetAtTime` o `linearRampToValueAtTime`).
- Los parámetros sin `AudioParam` se actualizan a control-rate con smoothing.
- Los locks por paso se programan con timestamps de audio.

## AudioWorklet

- Un plugin worklet es un módulo autocontenido o un bundle.
- Se registra una sola vez por contexto.
- Para varios módulos usar `Tone.getContext().rawContext.audioWorklet.addModule(url)`;
  `Context.addAudioWorkletModule` de Tone 14 solo recuerda el primer módulo.
- Parámetros audio-rate vía `AudioParam`; control-rate vía `port.postMessage`.
- El procesador no accede a DOM ni a red.
- El plugin declara latencia en samples.

## Bypass y cambios en caliente

- El slot tiene caminos dry/wet con gains.
- Bypass hace crossfade de 20 ms.
- Reordenar inserts reconstruye en paralelo y hace crossfade.
- Nunca `disconnect()` en seco sobre audio activo.

## UI

- La UI base se genera desde `params`.
- Un plugin puede declarar un `ui` opcional (grupos, orden, colores, controles custom),
  pero el fallback genérico siempre funciona.
- No se acepta HTML arbitrario de plugins.

## Estado y versionado

- `{ pluginId, version, state }`.
- Migración por plugin cuando cambia el schema.
- Un plugin desconocido al cargar una sesión se reemplaza por un slot vacío con warning,
  sin romper el resto del grafo.

## Testing

- Cada plugin declara un test de:
  - rango de parámetros;
  - serialización round-trip;
  - bypass sin clicks;
  - latencia declarada;
  - `dispose()` libera nodos.
- Los plugins de efecto se renderizan offline y se verifica peak/NaN.
- Los plugins de instrumento se testean con eventos deterministas.

## Criterios de aceptación

- Agregar un plugin nuevo solo toca `infrastructure/plugins`.
- La UI aparece automáticamente desde el schema.
- Bypass y reordenamiento no producen clicks.
- El estado sobrevive guardar/cargar sesión.
- Un plugin worklet de prueba pasa el test offline.

## Tareas

- [x] Definir `PluginDefinition`/`PluginParam`/`PluginState` en `domain`.
- [x] Implementar `PluginHost`.
- [x] Implementar `InsertSlot` con crossfade y bypass.
- [x] Implementar controles genéricos de parámetros.
- [x] Crear plugins de ejemplo: filtro, delay, reverb, drive, compresor.
- [x] Crear un plugin AudioWorklet de ejemplo.
- [x] Tests de contrato, defaults y clamp.
- [x] Persistir inserts arbitrarios en la sesión.
- [x] Integrar el editor de plugins en la vista Sound.
