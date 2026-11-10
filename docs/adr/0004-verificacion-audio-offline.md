---
id: adr-0004
status: aceptada
version: 1.0.0
updated: 2026-11-03
---

# ADR-0004 — Verificación de audio por render offline determinista + Playwright

## Contexto

Los bugs de audio no se ven en un test de unidad: clipping, NaN, DC offset,
silencio, orden de eventos, clicks por crossfade. Escuchar cada cambio no escala y
no corre en CI. Mockear `AudioContext` verifica llamadas, no sonido.

## Decisión

Dos niveles, ambos automatizables:

1. **Render offline determinista** (`OfflineAudioContext` real): se renderiza el
   estado actual y se valida el PCM resultante. Los checks fallan ante **clipping,
   NaN, DC y silencio**, no sólo ante excepciones. Mismo estado + misma seed →
   mismo resultado.
2. **Integración en tiempo real** con Playwright + Chromium: la app viva se
   ejercita de punta a punta (clicks, estado, arranque de audio).

Ambos corren en CI (`.github/workflows/audio.yml`) con
`npx playwright install --with-deps chromium`, y localmente vía
`npm run test:audio` / `npm run test:integration`.

## Consecuencias

Buenas:

- CI detecta regresiones audibles sin oídos humanos.
- El export WAV reutiliza el mismo camino offline, así que el test cubre también
  el export.
- Obliga a que el algoritmo generativo sea determinista: hoy lo es.

Malas:

- **Prerequisito local**: sin `npx playwright install chromium` los dos scripts
  abortan (pasa en un clone fresco; ver `docs/HANDOFF.md` — es el primer tropiezo del agente
  nuevo).
- Los tests son más lentos que vitest (segundos vs milisegundos) y más sensibles
  al entorno (versión de Chromium).
- Cambiar el DSP cambia el PCM: el test hay que actualizarlo a conciencia, nunca
  "para que pase".

## Alternativas no elegidas

- **Sólo mocks de `AudioContext`**: rápidos, no detectan clipping ni NaN reales.
- **Sólo test manual en el navegador**: no corre en CI y depende de oído.
- **Comparar espectrogramas**: más sofisticado, más frágil ante cambios legítimos
  de timbre.
