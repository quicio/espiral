---
id: docs-index
status: vigente
version: 1.1.0
updated: 2026-11-12
---

# Documentación

Orden de lectura para un agente nuevo:

| documento | para qué |
|---|---|
| [`../AGENTS.md`](../AGENTS.md) | comandos y reglas duras (leer primero) |
| [`HANDOFF.md`](HANDOFF.md) | estado medido, invariantes, deuda, qué no hacer |
| [`../ROADMAP.md`](../ROADMAP.md) | roadmap de producto vigente (M0–M6) |
| [`architecture.md`](architecture.md) | capas, puertos, modelo de ejecución |
| [`adr/`](adr/) | decisiones con contexto y alternativas |
| [`specs/`](specs/) | especificaciones por fase |

## Specs

Estado según lo declarado en cada archivo. Si el código contradice la tabla, gana
el código y la spec se corrige.

| id | spec | estado declarado |
|---|---|---|
| [00](specs/00-roadmap.md) | Roadmap histórico | histórico (vigente: `ROADMAP.md`) |
| [01](specs/01-modular-audio-engine.md) | Motor de audio modular | implementado; motor legacy retirado |
| [02](specs/02-plugin-sdk.md) | Plugin SDK | diseño |
| [03](specs/03-tracks-and-ui.md) | 16 tracks, modelo Elektron y UI | diseño *(ver drift en HANDOFF)* |
| [04](specs/04-quality-and-tests.md) | Calidad de audio, medición y tests | parcialmente implementado |
| [05](specs/05-machines-and-synths.md) | Máquinas de sintetizador | primer corte |
| [06](specs/06-track-macros.md) | Macros por track | implementado |
| [07](specs/07-audio-export.md) | Export de audio | implementado |
| [08](specs/08-transitions-and-buffers.md) | Transiciones y buffers | primer corte |
| [09](specs/09-bus-patch-bay.md) | Patch bay de buses | implementado |
| [10](specs/10-default-groove.md) | Default groove | sin estado declarado |
| [11](specs/11-sound-bank.md) | Banco de sonidos | sin estado declarado |
| [12](specs/12-generative-tracks.md) | Tracks generativos editables | sin estado declarado |
| [13](specs/13-clip-grid.md) | Clip Grid / Session View | implementada (primer corte) |
| [14](specs/14-sound-mixer.md) | Sound compacto y mixer | implementada |
| [15](specs/15-arm-wizard.md) | Armado inicial (wizard) | implementada |
| [16](specs/16-clip-grid-2.md) | Clip Grid 2 — clips independientes | implementada |
| [17](specs/17-browser.md) | Browser de sonidos | implementada |
| [18](specs/18-arrangement.md) | Arrangement de escenas | implementada |
| [19](specs/19-live-input.md) | Entrada MIDI en vivo | implementada |
| [20](specs/20-audio-import.md) | Importación de audio | implementada |
| [21](specs/21-performance-mode.md) | Performance mode | implementada |
| [22](specs/22-undo-global.md) | Undo global | implementada |
| [23](specs/23-dynamic-tracks-and-presets.md) | Tracks dinámicos, presets y catálogo | implementada |
| [24](specs/24-dynamic-scenes-and-clip-moves.md) | Escenas dinámicas y movimiento de clips | implementada |

## ADR

| id | decisión | estado |
|---|---|---|
| [0001](adr/0001-hexagonal-y-regla-de-dependencia.md) | Hexagonal con regla de dependencia y composition root único | aceptada |
| [0002](adr/0002-tone-detras-de-puerto.md) | Tone.js encapsulado detrás de `AudioEnginePort` | aceptada |
| [0003](adr/0003-plugins-con-schema.md) | Plugins por schema de parámetros, terceros fuera de alcance | aceptada |
| [0004](adr/0004-verificacion-audio-offline.md) | Verificación por render offline determinista + Playwright | aceptada |
| [0005](adr/0005-clips-respaldados-por-escenas.md) | Clips respaldados por escenas y patrón vivo | aceptada |

## Cómo agregar una spec o un ADR

**Spec**: número siguiente libre (nunca reutilizar), nombre
`NN-tema-en-kebab.md`, frontmatter:

```yaml
---
id: spec-NN
title: …
status: draft | aprobada | implementada | historico
version: 0.1.0
updated: YYYY-MM-DD
fase: N
depends_on: [spec-NN, adr-NNNN]
reemplaza_a: spec-NN      # sólo si corresponde
---
```

Cuerpo: Objetivo · Alcance (dentro/fuera) · Tareas con archivos exactos y
criterio de aceptación · Riesgos · Criterio de salida medible.

**ADR**: `NNNN-titulo.md` con **Contexto / Decisión / Consecuencias /
Alternativas**. Nunca se reescribe una aceptada: se supersede con
`supersedes: NNNN`.
