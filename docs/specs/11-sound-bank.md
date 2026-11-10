# Banco de sonidos e instrumentos

## Objetivo

Cargar un sonido completo en un track de usuario sin tener que configurar máquina,
oscilador, envolvente, nota y rango a mano.

## Catálogo

`src/domain/sound-bank.ts` define `SOUND_BANK` con presets agrupados en:

- **Ritmo**: shaker, rim, hats y clap.
- **Bajos**: sub, acid y rubber.
- **Teclados**: pads, keys y pluck.
- **Texturas**: FM bell, FM brass y drone.

Cada preset declara:

- `machineId` para resolver los parámetros editables;
- `machine` con el sonido concreto;
- `noteSource` con el registro y la fuente de notas;
- nombre y descripción para la UI.

Los presets de sampler usan los samples existentes en `public/audio/`. Los presets FM
usan el instrument plugin `fm-synth`.

## UI

En **Sound** aparece el bloque **Banco de sonidos**:

- selector **Destino** con los tracks de usuario;
- tarjetas por categoría;
- estado `Activo: <sonido> · <track>` cuando el track usa exactamente ese preset;
- las tarjetas quedan deshabilitadas si el track seleccionado es del núcleo.

Aplicar un preset:

- cambia `machineId`, `machine` y `noteSource`;
- conserva nombre, patrón, gain, pan, inserts y sends del track;
- actualiza el motor con el crossfade de máquina existente;
- queda persistido en la sesión y en la escena actual.

## Criterios

- Un preset se aplica sin detener el transporte.
- Los tracks del núcleo no aceptan presets del banco.
- El preset aplicado sobrevive al round-trip de sesión.
- La UI marca el preset activo sólo si máquina y nota coinciden exactamente.
