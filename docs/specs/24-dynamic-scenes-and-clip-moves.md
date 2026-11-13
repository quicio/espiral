---
id: spec-24
title: Escenas dinámicas y movimiento de clips
status: implementada
version: 0.1.0
updated: 2026-11-12
fase: 5
depends_on: [spec-13, spec-16, adr-0005]
---

# Escenas dinámicas y movimiento de clips

## Objetivo

Cerrar el primer corte de M1: que la grilla de clips no esté limitada a las cuatro
escenas base. El usuario puede agregar filas, reordenarlas y eliminarlas, y puede
mover un clip a otro slot del mismo track sin recrearlo.

## Modelo

`SceneId` deja de ser una unión cerrada de cuatro literales y pasa a ser un id de
texto. Los cuatro ids base (`umbral`, `deriva`, `pulso`, `caos`) se conservan como
`BUILTIN_SCENE_IDS` para presets, grooves y catálogo. El orden vigente de las
escenas es el orden de claves de `state.scenes`, no `CLIP_SCENE_ORDER`.

Consecuencias:

- `createClipsFromScenes` y `addClipsForTrack` recorren las escenas presentes en el
  estado, no la constante de cuatro.
- `clipColorForScene` resuelve un color estable para ids nuevos con una paleta
  extendida.
- `SessionDto` sube a `version: 3` y persiste las escenas en su orden real.
  Las versiones 1 y 2 siguen cargando con las cuatro escenas base.
- `clipsForTrack` recibe el orden de escenas para que las follow actions sigan el
  orden visual.

## Operaciones de escena

`SceneService` suma:

- `addScene()`: duplica la escena actual (kit, patrón, armonía, semilla y clips)
  como una fila nueva al final. No cambia la escena activa.
- `moveScene(sceneId, offset)`: reordena la fila en `state.scenes`.
- `removeScene(sceneId)`: elimina la escena, sus clips y sus bloques de
  arrangement. No permite eliminar la escena activa ni la última escena.

La fila de cada escena en Session ofrece aplicar, mover arriba/abajo y eliminar.
El botón `Duplicar escena` del encabezado crea la fila nueva.

## Operaciones de clip

`ClipService.moveClip(clipId, targetSceneId)` mueve un clip dentro del mismo track:

- si el slot destino está vacío, el clip cambia de escena e id;
- si está ocupado, los dos clips intercambian posición;
- si el clip estaba activo, `activeClips` y las acciones pendientes apuntan al id
  nuevo;
- el patrón vivo se materializa antes de mover para no perder la edición.

En la UI se arrastra un clip sobre una celda de su misma columna (mismo track). Las
celdas de otros tracks rechazan el drop. Como alternativa accesible,
`Alt+↑` / `Alt+↓` mueve el clip enfocado a la escena anterior o siguiente.

## Fuera de alcance

- Mover clips entre tracks distintos.
- Crear escenas vacías sin snapshot.
- Renombrar escenas desde la UI.
- Editar la descripción de una escena dinámica.

## Tareas

- [x] Abrir `SceneId` y centralizar `BUILTIN_SCENE_IDS`.
- [x] Crear clips desde las escenas presentes y ordenar por `state.scenes`.
- [x] Paleta de color con fallback para ids nuevos.
- [x] `SceneService.addScene`, `moveScene`, `removeScene`.
- [x] `ClipService.moveClip` con swap y remapeo de ids.
- [x] Render de filas dinámicas y controles de escena.
- [x] Drag/drop de clips y atajo `Alt+↑/↓`.
- [x] Persistencia `version: 3` con orden de escenas.
- [x] Selects de arrangement y export con escenas dinámicas.
- [x] Tests de dominio, aplicación y mapper.

## Criterios

- Agregar una escena crea una fila al final con los clips de la escena actual.
- Eliminar una escena no activa borra sus clips y deja la grilla coherente.
- Mover un clip a un slot vacío conserva su patrón y su estado activo.
- Mover un clip a un slot ocupado intercambia ambos sin duplicar ids.
- Una sesión con escenas dinámicas sobrevive a guardar y cargar, incluso el orden.
- Una sesión `version: 1` o `2` sigue cargando.
- `npm run typecheck`, `npm test` pasan. Los checks de Playwright quedan
  sujetos a tener Chromium instalado.

## Riesgos

- `SceneId` abierto puede dejar pasar ids inválidos desde JSON; el mapper valida
  contra las escenas realmente presentes y descarta clips huérfanos.
- Duplicar una escena completa puede crecer la sesión; el modelo de clips ya
  comparte la estructura de tracks, así que el costo es por patrón, no por audio.
- El drag/drop horizontal entre tracks queda explícitamente fuera de alcance para
  no mezclar patrones vivos entre instrumentos.
