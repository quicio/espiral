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
2. **Música**: raíz, escala, progresión y BPM.
3. **Escena**: Umbral, Deriva, Pulso o Caos contenido.
4. **Elementos**: Kick, Bass, Hi-Hat, Perc, Shaker 08, Perc 09, Track 10, Drone, Pad y Lead.
5. **Kit y sonidos**: kits pre-hechos, kit custom y sonido por elemento.

Acciones:

- **Armar set**: carga el preset, aplica música y escena, aplica los sonidos elegidos,
  mutea los elementos no elegidos y entra a Session.
- **Cargar última sesión**: disponible si hay una sesión guardada; carga y entra.
- **Cancelar**: sólo aparece cuando el wizard se abre manualmente después del primer
  armado.

El transporte queda detenido. El usuario decide cuándo reproducir.

## Implementación

- `PresetService.load` devuelve `boolean` para que el wizard sepa si la carga funcionó.
- `SessionService.load` devuelve `boolean` y expone `hasSaved()`.
- `MixService.setTrackMuted` mutea el track en el kit actual y en todas las escenas, para
  que la selección de elementos sobreviva al cambio de escena.
- `TrackService.applyKitSound` aplica sonidos de kit a tracks core y editables, y replica
  la máquina en todas las escenas.
- `PatternService.setHarmony` aplica raíz, escala y progresión a la escena actual y a
  todas las escenas.
- Los kits propios se guardan en `localStorage` vía `SoundKitRepositoryPort` y
  `LocalSoundKitRepository`; los kits built-in viven en `sound-kits.ts`.
- El estado del wizard es presentación-local. Cada apertura vuelve a proponer
  Techno/Umbral/todos los elementos y el Techno Kit.
- Después de armar, el botón **Armar set** de la barra de sesión permite reabrir el wizard.

## UI

- Overlay con backdrop y panel de una sola pantalla.
- Cards de base, escena, elementos, kits y sonidos con estado seleccionado.
- La música usa selects de raíz, escala y progresión, más BPM numérico.
- Los kits incluyen Techno, Dub, Breaks, Ambient, Custom y los kits guardados.
- Los sonidos por elemento se deshabilitan cuando el elemento no está seleccionado.
- El botón de armar se deshabilita si no hay elementos seleccionados.

## Criterios de aceptación

- Al cargar la app, el wizard cubre el instrumento y el shell no es interactivo.
- Armar con Techno/Umbral/todos carga el preset y entra a Session con transporte detenido.
- La raíz, escala, progresión y BPM elegidos se aplican al set y a todas las escenas.
- Elegir un kit o cambiar un sonido aplica la máquina correspondiente en todas las escenas.
- Guardar un kit propio lo agrega a la lista y sobrevive a un reload.
- Desmarcar un elemento lo deja muteado en el kit y en todas las escenas.
- Cargar una sesión guardada desde el wizard cierra el overlay.
- Reabrir el wizard permite cancelar sin cambiar el set actual.
- `npm test`, `npm run test:audio` y `npm run test:integration` pasan.
- El detector Impeccable no reporta findings.

## Fuera de alcance

- Crear una base desde cero sin preset.
- Guardar el armado completo (música + escena + elementos) como preset propio.
- Wizard paso a paso con páginas separadas.
