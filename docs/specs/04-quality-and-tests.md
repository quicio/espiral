# Spec: calidad de audio, medición y tests

- **Fase:** transversal (arranca en Fase 0 y acompaña todo el roadmap)
- **Estado:** parcialmente implementado
- **Objetivo:** que “no clipea” y “suena bien” sean propiedades verificables, no algo que se descubre de oído.

## Ya implementado

- Master: `Tone.Volume → HPF 25 Hz → Compressor → Limiter(-2) → Safety clip 0.8 → Destination`.
- `Tone.Meter` de master y clip latch en la UI.
- Rampas en volumen, mute y efectos.
- Fades en `Tone.Player`.
- Reverb con `decay` real y presets con `feedback`/`delayTime`/`decay`.
- PDC por track/send en el motor modular.
- Harness offline `npm run test:audio`: 8 compases, escenarios inicial y con automatización,
  para `ToneAudioEngine` y `ModularAudioEngine`.
  Verifica peak ≤ −1 dBFS, sin NaN, DC < 0.001 y que el render no sea silencio.
- A/B formal con tolerancia de 6 dB en peak/RMS. En las corridas locales el RMS difiere
  < 0.3 dB y el peak entre 0.1 y 1.0 dB, porque la IR de reverb de Tone usa ruido aleatorio.
- Workflow de CI `Audio check` con Chromium.
- Tests de casos de uso y adapters.

## Gain staging objetivo

| Punto | Objetivo |
| --- | --- |
| Track nominal | −18 dBFS RMS |
| Track peak | ≤ −6 dBFS |
| Bus return | −12 a −6 dBFS |
| Master pre-limiter | ≤ −3 dBFS |
| Master output | ≤ −1 dBFS |
| True peak | ≤ −1 dBTP |

Reglas:

- El fader de track no compensa un source mal ganado.
- Los samples se normalizan por loudness, no solo por peak.
- El limiter es la última red, no la mezcla.

## Medición

- Peak y RMS por track, bus y master.
- Clip latch por nodo, no solo master.
- Medidor de CPU si el navegador lo permite.
- La UI lee medidores con `requestAnimationFrame` y no bloquea el audio.
- Opcional: LUFS integrado para comparar presets.

## Test offline determinista

**Herramienta:** Playwright + navegador real, `OfflineAudioContext` o `Tone.Offline`.

**Flujo**

1. Cargar una sesión determinista (seed fija, patrones fijos).
2. Renderizar 8 compases con el motor real.
3. Calcular:
   - peak absoluto;
   - RMS;
   - DC offset;
   - NaN/Infinity;
   - duración no silenciosa.
4. Assertions:
   - `peak <= 0.891` (−1 dBFS);
   - sin NaN;
   - `abs(dc) < 0.001`;
   - RMS dentro de un rango esperado;
   - el render no es silencio.

**Casos**

- Sesión inicial.
- Preset `ambient` (reverbs largas).
- Todos los canales al máximo.
- Automatización de reverb al 82%.
- Solo + mute combinados.
- Cambio de escena a mitad del render.

## Test de integración en tiempo real

- Playwright levanta Vite.
- Carga la app, reproduce 2 compases.
- Verifica:
  - sin errores de consola;
  - todos los samples responden 200;
  - el pulso avanza;
  - el clip latch no se enciende;
  - play/stop cambia el estado.
- No reemplaza al render offline; detecta regresiones de integración.

## CI

- `npm ci`.
- `npm test` (unitarios).
- `npm run build`.
- Job separado de audio con Playwright y Chromium.
- Cachear browsers de Playwright.
- Falla el job si peak > −1 dBFS, hay NaN o error de consola.

## Performance

- 16 tracks + 4 inserts: medir tiempo de render offline y CPU en tiempo real.
- Worklets solo para DSP pesado.
- Voice pooling en samplers.
- Evitar crear nodos por nota.
- Evitar trabajo de UI en callbacks de audio.
- Cachear IRs de reverb por `decay` y regenerarlas en idle. Hoy cargar el preset
  `ambient` regenera 4 IRs largas y puede demorar el arranque varios segundos.

## Criterios de aceptación

- El render offline de la sesión inicial pasa con peak ≤ −1 dBFS.
- El test cubre al menos 5 escenarios de mezcla.
- El CI falla ante clipping o NaN.
- La UI muestra clip latch por master y por track.
- Existe un baseline de CPU documentado.

## Tareas

- [x] Renderer offline con detección de contexto offline.
- [x] Script de render + métricas.
- [x] Test Playwright offline.
- [x] Job de CI de audio.
- [x] A/B formal entre motores.
- [ ] Test Playwright de integración de la app principal.
- [ ] Medidores por track/bus.
- [ ] Clip latch por nodo.
- [ ] Baseline de performance.
- [ ] Escenarios adicionales: preset `ambient`, todo al máximo, solo+mute combinados.
