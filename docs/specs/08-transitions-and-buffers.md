# Spec: transiciones y buffers de audio

- **Fase:** 4
- **Depende de:** motor modular
- **Estado:** implementado (primer corte)

## Objetivo

Evitar clicks, cortes y saltos abruptos cuando cambian máquinas, tracks, inserts, escenas
o presets durante la reproducción.

## Estrategias

### Crossfade de fuente por máquina

- Cada track tiene su fuente conectada a un `Gain` propio.
- Al cambiar de máquina:
  - se crea la nueva fuente con gain 0;
  - se rampa a 1 en 40 ms;
  - la fuente anterior se rampa a 0 en 40 ms;
  - se detiene y destruye después de 80 ms.
- La máquina se compara por firma (`JSON.stringify`) para no reconstruir si no cambió.

### Crossfade de inserts

- `InsertChain` ya intercambia cadenas con fade de 30 ms.
- El bypass y los sends también rampean.

### Volumen, pan y mute

- Cambios de volumen: rampa de 50 ms.
- Pan: rampa de 50 ms.
- Mute/solo: rampa de 20 ms.

### Reconciliación de tracks

- `AudioEnginePort.syncTracks()` compara la colección deseada con la del motor.
- Agrega tracks nuevos, elimina los que ya no están y actualiza máquinas.
- Se llama al cargar presets, escenas y sesiones.
- Eliminar un track rampa su gain a 0 y lo destruye después de 80 ms.

### Seguridad de master

- La cadena mantiene HPF, glue compressor, limiter y safety clipper.
- Los cambios de master usan rampas de 50 ms.
- Presets, escenas y sesiones hacen un **duck** de master de 6 ms y restauran en 30 ms
  con 10 ms de margen para que el cambio estructural no se escuche como click.
- El BPM se rampa en 80 ms al cargar un preset o sesión.

### Lookahead configurable

- `TransportState.lookAhead` guarda el lookahead en segundos.
- Control **Buffer** en el transporte: 20–300 ms.
- Se aplica a `Tone.getContext().lookAhead`.
- Se persiste en la sesión.
- Un lookahead mayor da más margen al scheduler; uno menor reduce la latencia percibida.

## Límites

- No hay buffer de notas propio: el scheduling sigue en `Tone.Loop`.
- El crossfade protege transiciones de fuente y cadena, no cambios musicales de patrón.
- Cambios masivos de preset pueden seguir generando trabajo de CPU; el medidor estimado
  ayuda a detectarlos.

## Criterios de aceptación

- Cambiar máquina mientras suena no corta la señal de forma abrupta.
- Cargar un preset con tracks nuevos los agrega al motor.
- Quitar un track no produce click.
- La reproducción sigue activa durante el cambio.
- El render offline sigue sin clipping.

## Tareas

- [x] Crossfade de fuente al cambiar máquina.
- [x] Fade-out al eliminar track.
- [x] `syncTracks` para presets/escenas/sesiones.
- [x] Firma de máquina para evitar rebuilds innecesarios.
- [x] Fade global de master durante cambios estructurales masivos.
- [x] BPM rampeado al cargar presets/sesiones.
- [x] Buffer/lookahead configurable y persistente.
