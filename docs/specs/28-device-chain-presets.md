---
id: spec-28
title: Presets de cadenas de dispositivos
status: implementada
version: 0.1.0
updated: 2026-11-13
fase: 5
depends_on: [spec-02, spec-09, spec-27]
---

# Presets de cadenas de dispositivos

## Objetivo

Guardar el rack de inserts de un track como una cadena con nombre y volver a
aplicarla en cualquier track editable, conservando plugins, orden, bypass y
parámetros.

## Modelo

`DeviceChainPreset`:

```ts
interface DeviceChainPreset {
  readonly id: string;
  readonly name: string;
  readonly inserts: readonly InsertConfig[];
}
```

`cloneInsertChain` copia el arreglo y los `params` para que el preset no
comparta referencias con el estado vivo.

## Persistencia

`DeviceChainPresetRepositoryPort` se implementa con
`LocalDeviceChainPresetRepository` sobre `localStorage`
(`quicio-espiral-device-chains-v1`). Al cargar:

- se descartan registros sin id, nombre o inserts;
- se validan `pluginId`, `bypass`, `params` numéricos y `latencySamples`;
- un JSON corrupto devuelve lista vacía.

Las cadenas son del usuario y sobreviven a recargas y sesiones; no viajan en
`SessionDto`.

## Servicio

`DeviceChainService`:

- `list()`: cadenas guardadas.
- `saveCurrent(name)`: guarda el rack del track seleccionado. Un nombre vacío
  usa `Cadena N`; un nombre existente (sin distinguir mayúsculas) actualiza esa
  cadena y conserva su id. Un rack vacío no se guarda.
- `apply(id)`: reemplaza el rack del track seleccionado.
- `remove(id)`: elimina la cadena.

`MixService.replaceInserts` filtra plugins desconocidos, clona los parámetros y
elimina rutas de modulación que apuntaban a inserts que ya no están.

## UI

Bajo el rack, en Sound:

- selector de cadenas guardadas;
- `Aplicar` y `×` para eliminar;
- input de nombre y `Guardar cadena`.

Los controles se re-renderizan al guardar o eliminar sin esperar un cambio de
estado; aplicar sí cambia el estado y sigue el flujo normal del mixer.

## Fuera de alcance

- Cadenas de buses o del master.
- Export/import de cadenas entre dispositivos.
- Presets de fábrica.
- Mapeo macro→parámetro como entidad propia; las macros ya son fuentes de la
  matriz de modulación.

## Tareas

- [x] Tipo de dominio y clonado profundo.
- [x] Puerto e implementación en `localStorage`.
- [x] `DeviceChainService` con guardar, actualizar por nombre, aplicar y borrar.
- [x] `MixService.replaceInserts` con filtrado y limpieza de rutas.
- [x] Controles en el rack y refresco sin cambio de estado.
- [x] Tests de servicio, reemplazo de cadena y persistencia de parámetros.
- [x] Integración: guardar, borrar un insert y restaurar la cadena.

## Criterios

- Guardar una cadena con nombre la deja disponible en el selector.
- Volver a guardar el mismo nombre actualiza la existente, no duplica.
- Aplicar una cadena restaura cantidad, orden y parámetros de inserts.
- Los plugins desconocidos se descartan sin romper el rack.
- Las cadenas sobreviven a recargar la página.
- `npm run typecheck`, `npm test` y `npm run test:integration` pasan.

## Riesgos

- `localStorage` puede no estar disponible; en ese caso la cadena vive sólo en
  memoria durante la sesión.
- Aplicar una cadena pisa el rack actual sin confirmación; la acción es explícita
  y el estado previo sigue cubierto por undo global.
- Nombres con HTML se escapan al renderizar las opciones.
