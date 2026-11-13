---
id: spec-25
title: Favoritos y recientes del browser
status: implementada
version: 0.1.0
updated: 2026-11-12
fase: 5
depends_on: [spec-17, spec-23]
---

# Favoritos y recientes del browser

## Objetivo

Que el browser de sonidos recuerde lo que el usuario usa. Los presets aplicados
aparecen en **Recientes** y se pueden marcar como **Favoritos**, sin duplicar el
estado del catálogo ni tocar el motor de audio.

## Modelo

`InstrumentState` suma:

- `favorites: readonly string[]`: ids de presets marcados, en orden de marcado.
- `recentSounds: readonly string[]`: últimos ids aplicados, del más nuevo al más
  viejo, sin duplicados y con un máximo de 8.

Ambos son datos de sesión: viajan en `SessionDto` como campos opcionales y las
sesiones viejas cargan con listas vacías. Los ids desconocidos se descartan al
cargar para tolerar catálogos que cambien.

## Servicio

`BrowserService` (aplicación) expone:

- `toggleFavorite(presetId)`: agrega o quita un favorito.
- `recordPlayed(presetId)`: mueve el preset al frente de recientes.
- `clearRecent()`: vacía recientes sin tocar favoritos.

El servicio valida contra `SOUND_BANK`; un id desconocido no entra al estado.

## UI

El browser agrega dos secciones al principio, cuando tienen contenido:

- **Favoritos**, en orden de marcado.
- **Recientes**, del más nuevo al más viejo.

Cada tarjeta tiene un botón `☆/★` separado (no anidado dentro del botón de
aplicar) con `aria-pressed`. El click en la tarjeta aplica el sonido y registra
el uso; el click en la estrella sólo alterna el favorito. El buscador filtra
también las secciones de favoritos y recientes.

## Fuera de alcance

- Preview/audition sin aplicar.
- Sincronizar favoritos entre dispositivos.
- Favoritos de kits de batería o presets musicales.

## Tareas

- [x] Campos `favorites` y `recentSounds` en el estado inicial.
- [x] `BrowserService` con validación, tope y orden.
- [x] Render de secciones Favoritos/Recientes y botón de estrella.
- [x] Registrar uso al aplicar por click o drag/drop.
- [x] Persistencia opcional en `SessionDto`.
- [x] Filtro de búsqueda sobre las secciones nuevas.
- [x] Tests de servicio, mapper e integración.

## Criterios

- Aplicar un sonido lo deja primero en Recientes y sin duplicados.
- Marcar/desmarcar favorito actualiza la sección y sobrevive a guardar/cargar.
- Recientes se limita a 8 elementos.
- Un id desconocido no aparece en el estado.
- `npm run typecheck`, `npm test`, `npm run test:integration` pasan.

## Riesgos

- Duplicar tarjetas puede confundir el conteo del buscador; el filtro trabaja
  sobre el contenedor de cada tarjeta y no sobre el botón.
- El estado de sesión crece sólo con ids cortos; el costo es despreciable.
