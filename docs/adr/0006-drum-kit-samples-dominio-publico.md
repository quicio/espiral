---
id: adr-0006
title: Drum kits desde packs de dominio público, normalizados por kit
status: aceptada
version: 1.0.0
updated: 2026-11-13
---

# ADR-0006 — Drum kits desde packs de dominio público

## Contexto

Los sonidos de batería eran permutaciones de tres wavs: los 8 kits built-in
diferían en el kick (sintetizado) y en el `fadeOut` de un mismo hat o un mismo
`perc.wav`. La app promete variedad por estilo y no la tenía.

Para que la variedad sea real hacen falta one-shots de máquinas distintas. Eso
abre tres decisiones: **de dónde salen** los samples, **cómo entran al repo** y
**cómo se mantienen** cuando alguien quiere cambiar un kit.

Restricciones del proyecto: presupuesto de bundle declarado (~117 kB gzip de JS;
los assets de `public/` no cuentan), trazabilidad de licencias, determinismo en
los tests de audio, y ninguna dependencia nueva sin justificar.

## Decisión

1. **Fuente única: `oramics/sampled`.** Los `sampled.instrument.json` de cada
   máquina declaran `license: Public Domain`, lo que evita cualquier obligación de
   atribución en runtime. Cubre 909 (dos tomas), 808, 505, CR-78, LM-2, MRK-2 y
   una batería acústica Pearl: nueve identidades tímbricas reales para nueve kits.
2. **Los wav viven en `public/audio/kits/<kit>/<slot>.wav`**, uno por slot, con
   nombre de slot (no de archivo original). Un kit es una carpeta; agregar un kit
   es agregar una carpeta y un bloque de datos.
3. **Normalización por kit, no por archivo.** Se recorta silencio, se pasa a mono
   44.1 kHz/16 bit y se aplica **un solo factor de ganancia** (pico del kit a
   −1 dBFS). Normalizar archivo por archivo igualaría un hat con un kick y
   rompería el balance que el pack trae de fábrica; el nivel final lo pone el track.
4. **El dataset se reconstruye con un script versionado**
   (`scripts/fetch-drum-kits.py`), que declara la tabla slot → archivo fuente. No
   se commitean archivos "a mano": si un wav no está en la tabla, no existe.
5. **Un guard en `npm test`.** `scripts/check-drum-kits.ts` (vite-node) valida que
   cada wav declarado exista, que no haya huérfanos y que ninguno esté vacío. Los
   tests de dominio no usan `node:fs` para no meter tipos de Node en `src/`.
6. **Separación `DrumKit` / `SoundKit`.** El drum kit dice *cómo suena la
   batería*; el sound kit dice *qué batería + qué bajo/pad/lead*. Así una máquina
   puede reusarse en dos estilos (909 y 909 tight) sin duplicar datos.

## Consecuencias

- **Positivas**: la variedad es audible y verificable; licencias sin ambigüedad;
  1.79 MB de assets para 9 máquinas; agregar un kit es carpeta + bloque de datos
  + un test que ya existe; los tests de audio siguen deterministas porque el
  sampler reproduce archivos fijos.
- **Negativas**: +1.79 MB en el repo; sin round-robin ni velocity, un golpe suena
  igual siempre; si un pack fuente desaparece de GitHub, el script falla (los wav
  ya están versionados, así que la app no se rompe); el bundle JS creció ~8 kB
  gzip por los metadatos.
- **Neutras**: los sonidos legacy (`hat-tight`, `perc-room`, …) quedan marcados
  `legacy: true`: siguen resolviendo para kits guardados, pero no se ofrecen.

## Alternativas consideradas

- **Sintetizar todo** (kicks por membrana, hats por ruido filtrado). Sin muestras
  ni licencias, pero el techo tímbrico es bajo y el coste de DSP por voz sube.
- **Freesound CC0 suelto**: calidad variable, sin coherencia de kit y descarga
  manual; cada muestra requiere verificar licencia una por una.
- **Packs comerciales "royalty-free"** (Samples from Mars, Goldbaby, MusicRadar):
  mejor sonido, pero la licencia típica prohíbe redistribuir las muestras, y acá
  se distribuyen como parte del repo.
- **Dirt-Samples (TidalCycles)**: buen catálogo, pero el repo no declara licencia
  única por carpeta; inaceptable para algo versionado.
- **Cargar kits en runtime desde JSON/ZIP del usuario**: descartado por ahora;
  agrega validación, cuotas de tamaño y un formato que mantener (fuera de alcance
  en spec 38).
