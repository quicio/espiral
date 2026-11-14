---
id: spec-42
title: EQ de 3 bandas y analizador espectral
status: implementada
version: 1.0.0
updated: 2026-11-14
fase: 6
depends_on: [spec-01, spec-02, spec-35]
---

# EQ de 3 bandas y analizador espectral

## Objetivo

Dar herramientas de mezcla visibles sin salir del instrumento:

- EQ de 3 bandas para cualquier track o bus, como insert;
- EQ de 3 bandas dedicado al master;
- analizador espectral del track seleccionado y del master.

El analizador del track seleccionado evita 16 gráficos simultáneos; el master
siempre está visible en el transporte.

## Modelo

```ts
// domain/graph.ts
interface EqSettings {
  readonly low: number;  // dB
  readonly mid: number;  // dB
  readonly high: number; // dB
}

// MasterConfig
readonly eq?: EqSettings;

// InstrumentState
readonly masterEq?: EqSettings;
```

El EQ de tracks/buses es el plugin `eq3` (`Tone.EQ3`) y se agrega desde el rack
de inserts. El master tiene un EQ fijo en `MasterBus` y se persiste en sesión.

## Implementación

- `eq3Plugin` en `infrastructure/audio/plugins/builtins.ts`: Low/Mid/High,
  crossover Low X / High X, con parámetros expuestos al rack.
- `MasterBus`: `Tone.EQ3` entre el glue y el trim, con `setEq()` y rampas de
  50 ms.
- `MixService.setMasterEq()` actualiza estado y motor; `syncAll()` lo reaplica.
- `Track.getSpectrum()` y `MasterBus.getSpectrum()` crean un `Tone.Analyser`
  FFT de 256 de forma lazy y devuelven 32 barras normalizadas 0..1.
- UI:
  - `EQ master` colapsable en el transporte;
  - canvas del master en el transporte;
  - canvas del track seleccionado en Sound.
- El analizador se dibuja a 25 Hz junto a los medidores; si el canvas no existe
  o la pestaña está oculta, no se lee el FFT.

## Criterios de aceptación

- [x] `eq3` aparece en el rack de inserts de tracks y buses.
- [x] El master tiene Low/Mid/High y persiste en sesión.
- [x] El track seleccionado y el master muestran espectro en playback.
- [x] `npm test` verde (244 tests).
- [x] `npm run test:audio` verde.
- [x] `npm run test:integration` verde.
- [x] `npm run build` verde.

## Riesgos

| riesgo | mitigación |
|---|---|
| FFT por track consume CPU | sólo track seleccionado + master, lectura a 25 Hz |
| EQ en el master altera el PCM | por defecto flat; test:audio sigue verde |
| Canvas oculto sigue leyendo audio | se chequea `document.hidden` y existencia del canvas |
| Sesiones viejas sin `masterEq` | campo opcional; default flat |

## Criterio de salida medible

- Mover Low/Mid/High del master cambia el audio y el valor persiste al recargar
  la sesión.
- El analizador del track responde al playback y se detiene al salir de Sound.
- `test:audio` conserva el render determinista con el EQ flat.
