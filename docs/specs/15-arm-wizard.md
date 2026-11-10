---
id: spec-15
title: Armado inicial (wizard)
status: implementada
version: 0.1.0
updated: 2026-11-10
fase: 5
depends_on: [spec-11, spec-13, spec-14]
---

# Armado inicial (wizard)

## Objetivo

Evitar que la app arranque directamente con un estado por defecto que el usuario no
eligió. Al abrir Espiral, el usuario arma su comienzo: elige una base, una escena y qué
elementos quiere escuchar. Nada suena hasta que entra.

## Flujo

El wizard aparece como overlay modal sobre la app. El shell queda `inert` para que no se
pueda tocar el instrumento detrás.

Pasos:

1. **Base**: Techno, Dub, Ambient o Breaks.
2. **Escena**: Umbral, Deriva, Pulso o Caos contenido.
3. **Elementos**: Kick, Bass, Hi-Hat, Perc, Shaker 08, Perc 09, Track 10, Drone, Pad y Lead.

Acciones:

- **Armar set**: carga el preset, aplica la escena, mutea los elementos no elegidos y
  entra a Session.
- **Cargar última sesión**: disponible si hay una sesión guardada; carga y entra.
- **Cancelar**: sólo aparece cuando el wizard se abre manualmente después del primer
  armado.

El transporte queda detenido. El usuario decide cuándo reproducir.

## Implementación

- `PresetService.load` devuelve `boolean` para que el wizard sepa si la carga funcionó.
- `SessionService.load` devuelve `boolean` y expone `hasSaved()`.
- `MixService.setTrackMuted` mutea el track en el kit actual y en todas las escenas, para
  que la selección de elementos sobreviva al cambio de escena.
- El estado del wizard es presentación-local. No se persiste: cada apertura vuelve a
  proponer Techno/Umbral/todos los elementos.
- Después de armar, el botón **Armar set** de la barra de sesión permite reabrir el wizard.

## UI

- Overlay con backdrop y panel de una sola pantalla.
- Cards de base, escena y elementos con estado seleccionado.
- El footer muestra `Base · Escena · N elementos`.
- El botón de armar se deshabilita si no hay elementos seleccionados.

## Criterios de aceptación

- Al cargar la app, el wizard cubre el instrumento y el shell no es interactivo.
- Armar con Techno/Umbral/todos carga el preset y entra a Session con transporte detenido.
- Desmarcar un elemento lo deja muteado en el kit y en todas las escenas.
- Cargar una sesión guardada desde el wizard cierra el overlay.
- Reabrir el wizard permite cancelar sin cambiar el set actual.
- `npm test`, `npm run test:audio` y `npm run test:integration` pasan.
- El detector Impeccable no reporta findings.

## Fuera de alcance

- Crear una base desde cero sin preset.
- Elegir un sonido distinto por elemento dentro del wizard.
- Guardar el armado como preset propio.
- Wizard paso a paso con páginas separadas.
