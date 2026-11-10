---
id: spec-13
title: Clip Grid / Session View
status: implementada
version: 0.1.0
updated: 2026-11-10
fase: 5
depends_on: [spec-03, spec-12, adr-0005]
---

# Clip Grid / Session View

## Objetivo

Llevar la performance de Espiral a una grilla de clips: lanzar por track o por escena,
cuantizar el cambio y dejar que los tracks sigan sonando mientras otros cambian.

Este es el primer corte de M1. Prioriza el comportamiento de performance sobre la
creación libre de slots.

## Modelo

Un `ClipState` es un slot de performance con metadata:

- `id`: estable, `clip-<escena>-<track>`.
- `trackId` y `sceneId`.
- `name`, `color`.
- `followAction`: `none`, `next`, `previous`, `random` o `stop`.
- `followAfter`: compases antes de disparar el follow.

Los patrones siguen viviendo en las escenas. La performance usa `state.pattern` como
patrón vivo:

- `state.activeClips[trackId]` apunta al clip activo.
- `null` significa track detenido.
- al cambiar de clip, el patrón vivo saliente se guarda en su escena de origen y se carga
  el patrón de la escena destino.
- `materializeScenes()` copia los patrones vivos de todos los clips activos antes de
  guardar/exportar, sin contaminar escenas de otros clips.

La grilla usa las cuatro escenas actuales como filas (`umbral`, `deriva`, `pulso`, `caos`)
y los tracks con patrón como columnas.

## Lanzamiento

`ClipService` agenda acciones en `PlaybackRuntime`:

- `launchClip(clipId, quantize)`.
- `launchScene(sceneId, quantize)`.
- `stopTrack(trackId, quantize)`.
- `stopAll(quantize)`.

Cuantizaciones: inmediato, 1 beat, 1 compás y 2 compases. Si el transporte está detenido,
la acción se aplica en el acto. Si está sonando, se aplica en el próximo borde cuantizado
antes de disparar el paso.

## Follow actions

Cada clip puede disparar otro clip del mismo track después de N compases:

- `next` y `previous` recorren la columna del track.
- `random` elige otro clip de la columna.
- `stop` detiene el track.

El follow se evalúa al comienzo del paso, antes de los disparos de audio.

## UI

Nueva vista **Session**:

- ocupa todo el ancho disponible y oculta el panel Generativo mientras está activa;
- grilla escena × track con la columna de escenas fija al hacer scroll horizontal;
- cada clip muestra una miniatura de 16 pasos y su estado, sin repetir el nombre del track;
- botón de lanzamiento por clip;
- botón de escena por fila, con estado de cola;
- stop por track y stop all;
- selector global de cuantización;
- inspector del clip activo o en cola, con follow action y compases;
- readout con cuenta regresiva de lanzamientos pendientes;
- navegación por teclado: flechas mueven foco, Enter lanza, Shift+Enter selecciona,
  Backspace/Delete detiene, Escape cancela la cola;
- `Space` controla el transporte globalmente, incluso con foco en un botón;
- un solo tab stop para la grilla de clips (roving tabindex), además de headers y escenas;
- tempo con entrada numérica exacta además del slider.

Estados visuales:

- `armed`: clip activo con transporte detenido;
- `queued`: lanzamiento pendiente, con borde ámbar y countdown en el readout;
- `playing`: clip sonando;
- `stopped`: track detenido;
- `clip`: clip inactivo.

Los tracks generativos sin patrón no aparecen en la grilla. Cuando se les agrega un patrón
con `+P`, se crean sus clips y aparecen como una columna más.

## Persistencia

La sesión v2 agrega campos opcionales:

- `clips`: metadata de clips.
- `activeClips`: track → clip activo o `null`.
- `clipQuantize`: cuantización global.

Si una sesión vieja no los trae, se derivan clips desde las escenas y se activa la fila de
la escena actual. Al guardar, `SessionMapper` materializa los patrones vivos en sus escenas
antes de escribir el DTO.

## Integración con tracks

- `addTrack` crea clips en las cuatro escenas y activa el de la escena actual.
- `removeTrack` elimina clips y el estado activo del track.
- `attachPattern` de drone/pad/lead crea clips en todas las escenas.
- `detachPattern` elimina sus clips y vuelve a modo generativo.
- `SceneService.apply` activa la fila de la escena destino.

## Criterios de aceptación

- Dos clips del mismo track se alternan sin detener el transporte.
- Lanzar una escena mantiene los tracks en fase.
- Un follow action cambia de clip después de los compases configurados.
- Stop por track y stop all silencian sin borrar el patrón vivo.
- Los estados `armed`, `queued`, `playing`, `stopped` reflejan transporte y cola reales.
- Los 13 tracks con patrón se ven completos a 1440 px; la columna de escenas queda fija al scrollear.
- `Space` inicia/detiene el transporte después de clickear cualquier botón.
- La grilla se navega con flechas; Enter lanza, Shift+Enter selecciona, Backspace detiene y Escape cancela.
- Clips, activos y follow settings sobreviven al round-trip de sesión.
- `npm test`, `npm run test:audio` y `npm run test:integration` pasan.

## Pendiente para M1.2

- Crear, duplicar, renombrar, colorear y eliminar clips fuera de las cuatro escenas.
- Slots independientes por track, sin depender de una escena completa.
- Edición de un track detenido que persista en su último clip.
- Cancelar explícitamente un lanzamiento pendiente desde la grilla.

## Riesgos

- El modelo actual usa escenas como backing store; migrar a clips con patrón propio requiere
  una migración de sesión.
- Editar un track detenido no actualiza su clip hasta que se vuelve a lanzar.
- La grilla con 13 columnas requiere scroll horizontal en pantallas chicas.
