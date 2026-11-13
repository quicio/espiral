# Spec: patch bay de buses

- **Fase:** 4
- **Depende de:** routing matrix, motor modular
- **Estado:** implementado

## Objetivo

Permitir que la salida de un bus alimente la entrada de otro bus, rechazando conexiones que
creen ciclos.

## Modelo

```ts
interface BusState {
  id: string;
  name: string;
  returnDb: number;
  inserts: InsertConfig[];
  sends: SendConfig[];
}
```

- `SendConfig` reutiliza `busId`, `amount` y `preFader` (post-fader para buses).
- Una conexión con `amount: 0` no se guarda.
- Los sends de bus persisten en escena y sesión.

## Detección de ciclos

`wouldCreateCycle(edges, from, to)` recorre el grafo existente y rechaza:

- auto-conexión;
- conexión inversa directa;
- ciclos indirectos A → B → C → A.

`validateGraph` también valida ciclos al construir el grafo.

## Motor

- `Bus.setSend`, `removeSend` y `syncSends`.
- Cada send de bus es un `Tone.Gain` desde la salida del bus origen a la entrada del bus
  destino.
- `ModularAudioEngine.syncBusSends()` reconcilia conexiones sin recrear todas.
- Cambios de cantidad rampean 50 ms.

## UI

- Nueva matriz **Patch bay de buses** en Routing.
- Filas = bus origen; columnas = bus destino.
- La diagonal se muestra con `—`.
- Faders de cantidad por celda.
- Estado con cantidad de conexiones activas.
- Botón `+ bus` para crear buses vacíos.
- Botón `×` por bus para eliminarlo.
- Al quitar un bus se limpian sus sends de tracks y de otros buses.
- Al rechazar un ciclo, el fader vuelve al valor real del estado.

## Tareas

- [x] `BusState.sends`.
- [x] `wouldCreateCycle` y validación de grafo.
- [x] `Bus` con sends y reconciliación.
- [x] `RoutingService.setBusSend`.
- [x] Matriz de patch bay en Routing.
- [x] Crear/eliminar buses desde la UI.
- [x] Persistencia en sesión y escenas.
- [x] Tests de ciclos, routing y sesión.


## Extensión: salida directa de un track a un bus (spec 40)

`TrackConfig` y `TrackState` aceptan `outputBusId?: string`. Si existe, el track
sale por la entrada de ese bus en vez del master; si no existe, el
comportamiento sigue siendo el anterior. El caso de uso actual es el
`drum-bus` del kit por defecto (compresor + drive), con `returnDb: 0` porque
recibe tracks directos y no es un auxiliar.
