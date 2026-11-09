# Spec: macros por track

- **Fase:** 3.6
- **Depende de:** tracks, mod matrix
- **Estado:** implementado

## Objetivo

Cada track tiene dos macros propios que pueden usarse como fuentes de modulación sin
ocupar los macros globales.

## Modelo

```ts
interface TrackState {
  macros: readonly number[]; // [M1, M2], rango 0..1
}
```

- Valor inicial `[0.5, 0.5]`.
- Se persisten en la sesión y se clonan con el kit/escenas.
- Al eliminar un track se eliminan las rutas que usaban sus macros.

## Fuente de modulación

Las macros de track se identifican con:

```text
track-macro:<trackId>:<0|1>
```

- `ModulationService` resuelve el valor desde `state.kit.tracks[trackId].macros[index]`.
- Se pueden usar en el mod matrix como cualquier otra fuente.
- Aceptan cantidad bipolar/unipolar y todos los destinos de parámetros de inserts.

## UI

- En Sound, cada track muestra `M1` y `M2` con slider y porcentaje.
- En Mod, el selector de fuente incluye:
  - macros globales `Macro 1/2`;
  - `Track M1` y `Track M2` de cada track.
- Las rutas muestran el nombre legible de la macro de track.

## Criterios de aceptación

- Cambiar M1/M2 modula los destinos asignados.
- Las macros sobreviven guardar/cargar y cambios de escena.
- Eliminar un track limpia sus rutas de macro.
- La UI no rompe las macros globales existentes.

## Tareas

- [x] `TrackState.macros`.
- [x] Persistencia y clonado.
- [x] Resolución de `track-macro:*` en `ModulationService`.
- [x] Sliders M1/M2 en Sound.
- [x] Fuentes de track en el selector de Mod.
- [x] Limpieza de rutas al eliminar tracks.
