---
id: adr-0002
status: aceptada
version: 1.0.0
updated: 2026-11-03
---

# ADR-0002 — Tone.js encapsulado detrás de `AudioEnginePort`

## Contexto

Tone.js resuelve transporte, scheduling, nodos y efectos con una API cómoda, pero
impone su modelo (cadenas de nodos, su reloj, su ciclo de vida). El instrumento
necesita, además: buses, inserts con bypass, parameter locks, modulación a
control-rate, máquinas de synth y export offline.

Mezclar el modelo musical con el modelo de Tone.js haría imposible cambiar de
motor sin reescribir la aplicación — y ya se cambió una vez (legacy → modular).

## Decisión

1. `AudioEnginePort` (en `domain/ports.ts`) es la única superficie que la
   aplicación conoce: preparar audio, disparar eventos, aplicar mezcla y efectos.
2. La aplicación produce **eventos genéricos** (`SoundEvent { kind, channel,
   trackId? }`, kinds `kick`, `synth`, `sample`). El motor no sabe de patrones,
   armonía ni escenas.
3. **El estado es la fuente de verdad**: el motor no guarda la mezcla, la recibe
   desde `MixService`. `PlaybackService` traduce estado musical a eventos.
4. Tone.js y los AudioWorklets viven exclusivamente en `infrastructure/`.

## Consecuencias

Buenas:

- Cambiar de motor = nuevo adapter + una línea en `main.ts` (spec 01 lo hizo con el
  motor modular, sin tocar dominio ni UI).
- `PlaybackService` se testea con un `AudioEnginePort` falso, sin audio real.
- El export WAV reutiliza el mismo camino offline del motor.

Malas:

- Cada capacidad nueva del motor necesita un verbo en el puerto y su traducción de
  evento; el puerto crece y hay que resistir la tentación de filtrarlo.
- Los parámetros que sólo existen en el adapter (p. ej. un nodo concreto) no son
  accesibles desde la aplicación por diseño.

## Alternativas no elegidas

- **Web Audio puro sin librería**: control total del grafo, pero se paga en
  scheduling, transporte y efectos que hoy resuelve Tone.js.
- **UI acoplada a Tone.js**: prototipado veloz, incompatible con la regla de
  dependencia de ADR-0001.
- **Puerto con tipos de Tone.js en su firma**: anula el beneficio; el puerto debe
  hablar el idioma del instrumento, no el de la librería.
