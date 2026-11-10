---
id: spec-14
title: Sound compacto y mixer
status: implementada
version: 0.1.0
updated: 2026-11-10
fase: 5
depends_on: [spec-03, spec-11, spec-13]
---

# Sound compacto y mixer

## Objetivo

Convertir Sound en una superficie de mezcla práctica: ver y corregir los 16 tracks
rápido, editar el track seleccionado y dejar el banco de sonidos fuera del camino.

El diseño anterior mostraba 16 strips expandidos con todos sus controles. La página
llegaba a ~6.100 px y el primer fader quedaba a ~1.380 px. La acción más frecuente
—bajar el bajo, mutear el pad— requería demasiado scroll.

## Estructura

Sound ahora tiene tres bloques:

1. **Mixer compacto**: una fila por track con nombre, meter, fader, valor, pan, mute,
   solo y freeze.
2. **Track seleccionado**: detalle del track actual con máquina, parámetros, macros,
   sends e inserts.
3. **Banco de sonidos**: `<details>` cerrado por defecto. Se abre cuando el usuario
   quiere explorar presets.

El panel Generativo se oculta en Sound para darle ancho a la mezcla.

## Interacción

- Click en el nombre de una fila selecciona el track y actualiza el detalle.
- El detalle conserva los mismos `data-*` que usaba el strip anterior, así que faders,
  pan, macros, sends, inserts y máquina siguen funcionando con los bindings existentes.
- El banco mantiene su target, estado del preset activo y categorías.
- El drawer no se cierra al cambiar de track.
- En <=1080 px el layout pasa a una columna: mixer y detalle debajo.

## Layout medido

A 1440×1000:

- 16 filas de mixer;
- primer fader en y≈680;
- página de ~995 px;
- detalle del track seleccionado visible a la derecha;
- banco cerrado ocupa ~52 px.

A 1024×900:

- una columna;
- mixer de 960 px;
- detalle debajo;
- página de ~1.277 px.

## Criterios de aceptación

- Los 16 tracks se ven y mezclan sin abrir el banco.
- Seleccionar una fila actualiza el detalle del track.
- El banco está cerrado por defecto y se abre con un click.
- Aplicar un preset desde el drawer actualiza máquina y detalle.
- Faders, pan, mute, solo, freeze, macros, sends e inserts conservan su comportamiento.
- `npm test`, `npm run test:audio` y `npm run test:integration` pasan.
- El detector Impeccable no reporta findings.

## Fuera de alcance

- Meters verticales estilo consola.
- Reordenar tracks desde el mixer.
- Edición de nombre o color del track.
- Favoritos o búsqueda dentro del banco.
