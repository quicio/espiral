---
id: spec-36
title: Cache de vistas limpias al cambiar de pestaña
status: implementada
version: 0.1.0
updated: 2026-11-13
fase: 5
depends_on: [spec-33, spec-35]
---

# Cache de vistas limpias al cambiar de pestaña

## Problema

Aunque `renderActiveView` sólo renderizaba la vista visible, `setView` volvía a
construir la vista destino **cada vez** que se cambiaba de pestaña, incluso si
nada había cambiado desde la última vez. En Sound eso significa mixer, detalle y
banco; en Sequencer, grilla, matriz y automation. Ese trabajo podía caer mientras
sonaba el transporte y producir un corte ocasional.

## Solución

El app mantiene `dirtyViews`:

- todas las vistas nacen sucias;
- un cambio estructural marca todas las vistas sucias y agenda un render de la
  activa;
- al renderizar una vista se marca limpia;
- `setView` renderiza sólo si la vista está sucia;
- si está limpia, sólo sincroniza transporte y playhead.

Los cambios de sólo transporte (`currentStep`, play/stop) no ensucian las vistas:
el playhead se actualiza con `syncPlayhead` incluso en vistas ocultas.

`refreshSession` y `refreshSound` marcan su vista como limpia después de
renderizar.

## Resultado medido (2026-11-13, Chromium headless)

- Playback + dos pasadas por las siete pestañas: **cero long tasks** después del
  arranque.
- Los únicos long tasks medidos fueron parseo/mount inicial (248 y 94 ms).
- La primera pasada por las vistas tampoco generó un long task >50 ms.

## Fuera de alcance

- Virtualizar Sound o el banco de sonidos.
- Cachear por firma parcial de estado: la unidad es “vista sucia/limpia”.
- Congelar el DOM de vistas ocultas mientras se edita otra.

## Riesgos

- Si un cambio de estado no marca la vista correcta como sucia, la vista puede
  quedar vieja. Los cambios estructurales marcan todas; los fast paths hacen
  sync directo sobre el DOM.
- Al cambiar de pestaña limpia no se reconstruyen los medidores; siguen
  actualizándose por el loop de 25 Hz.
- La restauración de foco de Session sólo actúa si el foco se perdió, no si el
  usuario está en un control.
