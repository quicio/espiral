---
id: spec-21
title: Performance mode
status: implementada
version: 0.1.0
updated: 2026-11-10
fase: 5
depends_on: [spec-03, spec-14]
---

# Performance mode

## Objetivo

Reducir el chrome de la app para tocar en vivo sin perder el transporte.

## Implementación

- Botón `Perf` en el transporte.
- Alterna `body.is-performance`.
- Oculta:
  - header;
  - intro;
  - barra de sesión;
  - leyenda de atajos.
- Mantiene:
  - transporte;
  - tabs de contexto;
  - stage y paneles del instrumento.
- El botón queda visible y conserva `aria-pressed`.

## Criterios

- Activar Perf oculta header, intro y barra de sesión.
- El transporte y los tabs siguen utilizables.
- Desactivar Perf restaura el layout.
- No hay cambios de estado musical al entrar o salir.
- `npm run test:integration` pasa.

## Pendiente

- Fullscreen API.
- Controles agrandados por contexto.
- Modo de pantalla completa con ocultamiento de tabs.
- Layout mobile de performance.
