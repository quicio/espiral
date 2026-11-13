---
id: spec-33
title: Render por vista y coalescing de cambios estructurales
status: implementada
version: 0.1.0
updated: 2026-11-13
fase: 5
depends_on: [spec-32]
---

# Render por vista y coalescing de cambios estructurales

## Objetivo

Evitar que un cambio estructural reconstruya todas las vistas ocultas y que una
ráfaga de cambios dispare varios renders completos. Es el complemento de
`spec-32`: aquel bajó el costo continuo, éste baja los picos.

## Render por vista

`renderActiveView(state, catalog, mix, currentView)` reemplaza a `renderAll`:

- renderiza sólo la vista visible (`performance`, `session`, `arrangement`,
  `sequencer`, `sound`, `routing` o `modulation`);
- mantiene el panel generativo y los selects de escena/loop;
- corre los `sync*` globales (transporte, armonía, params, selección, freeze,
  undo, paste);
- para Sequencer incluye automation y locks;
- sólo recalcula las clases del patrón en Performance o Sequencer.

Las vistas ocultas se renderizan al entrar con `setView`. Eso ya era parte del
flujo; ahora no se mantienen al día en segundo plano.

## Coalescing

Los cambios estructurales se acumulan en `pendingRenderState` y se aplican una
vez por `requestAnimationFrame`. Varias actualizaciones de estado en el mismo
tick (aplicar una cadena, cargar un preset, lanzar una escena) producen un solo
render.

`setView` cancela cualquier render pendiente y renderiza la vista nueva de
inmediato. `dispose` cancela el frame pendiente.

## Foco

Al re-renderizar Session se pierde el foco del clip. Se conserva el último
`{row, col}` y se restaura si el foco quedó fuera de la grilla. Esto mantiene
Enter/Backspace/Escape y la navegación por flechas después de un render
diferido.

## Precalentamiento

`PlaybackService.prepare()` permite preparar el motor. Al terminar el armado del
set se dispara en background; si falla por falta de gesto de audio, el primer
play vuelve a intentarlo.

## Resultado medido (2026-11-13, Chromium headless)

| métrica | antes | después |
|---|---|---|
| long tasks al cargar + armar + cambiar vistas | 262 / 131 / 97 ms | **129 / 62 ms** |
| long tasks durante 16 s de arrangement | 0 | **0** |
| CPU meter durante playback | 0% | 0% |

## Fuera de alcance

- Virtualizar el mixer o el banco de sonidos.
- Code splitting por vista.
- Cambiar `latencyHint` en runtime (requiere crear el `AudioContext` antes del
  singleton de Tone).
- Sampler en AudioWorklet.

## Riesgos

- Una vista oculta no está al día hasta que se entra. Cualquier código que lea
  DOM de una vista oculta debe forzar `setView` o renderizarla.
- Un render diferido puede perder foco si no se restaura; cubierto para Session.
- `requestAnimationFrame` no corre en pestañas ocultas; al volver se aplica el
  último estado pendiente.
