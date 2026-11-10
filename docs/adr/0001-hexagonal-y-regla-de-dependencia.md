---
id: adr-0001
status: aceptada
version: 1.0.0
updated: 2026-11-03
---

# ADR-0001 — Hexagonal con regla de dependencia y composition root único

## Contexto

Espiral depende de tecnologías que cambian rápido y que arrastran su propio
modelo: Tone.js para audio, `AudioWorklet` para DSP, DOM para la UI,
`localStorage`/`fetch` para persistencia y catálogo. Si esas tecnologías se
mezclan con las reglas del instrumento (patrones, escenas, routing, locks,
macros), cada migración toca todo el código.

Ya hubo una prueba concreta: el motor pasó de `ToneAudioEngine` a
`ModularAudioEngine` (spec 01) y el motor legacy se retiró.

## Decisión

Capas con una única dirección de dependencia:

```
presentation ──► application ──► domain
      │                ▲
      └──► infrastructure ──┘     (se conectan sólo en main.ts)
```

- `domain` no importa nada de las otras capas ni del navegador.
- `application` conoce únicamente puertos declarados en `domain/ports.ts`.
- `infrastructure` implementa esos puertos (Tone.js, worklets, storage, fetch).
- `presentation` consume servicios de aplicación y el catálogo ya adaptado.
- `main.ts` es el único composition root: elige implementaciones y las inyecta.

## Consecuencias

Buenas:

- El motor es reemplazable de verdad: se cambia el adapter y una línea en `main.ts`.
- 132 tests corren en 2.5 s **sin navegador** porque el dominio y la aplicación no
  necesitan Web Audio.
- La UI puede migrar vista por vista a un framework sin tocar las capas internas
  (deuda declarada en `architecture.md`).

Malas:

- Más archivos y una indirección por cada operación (puerto + adapter + wiring).
- Tentación permanente de "importar Tone.js acá nomás": el costo de una violación
  no se ve hasta la próxima migración.

## Alternativas no elegidas

- **Framework-céntrico** (componentes hablando con Tone.js directo): arranque más
  rápido, pero cada cambio de motor o de librería arrastra toda la app.
- **Estado mutable global** compartido entre UI y motor: menos ceremonia, sin
  trazabilidad de quién cambió la mezcla.
