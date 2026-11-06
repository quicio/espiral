# Espiral

Instrumento generativo de ritmos, escalas y automatización.

- 7 canales: kick, bass, hi-hat, perc, drone, pad y lead.
- Performances por escenas: `Umbral`, `Deriva`, `Pulso`, `Caos contenido`.
- Semilla reproducible, Euclid, densidad, mutación, freeze y evolución.
- Tonalidad: 12 raíces, 7 escalas y 4 progresiones.
- Duración de notas para pad, lead y bass.
- Automatización de 16 pasos para reverb/delay.
- Sesiones locales y exportación/importación JSON.

## Desarrollo

```bash
npm install
npm run dev
```

Abrir la URL que imprime Vite. La app usa `@quicio/umbral-tone` como motor y `tone` para el audio.

## Build

```bash
npm run build
npm run preview
```

La build se publica en GitHub Pages en `https://quicio.github.io/espiral/`.

## Arquitectura

- `src/app.js` — instrumento, estado, UI, audio, sesiones y atajos.
- `src/espiral.css` — sistema visual del instrumento.
- `src/base.css` — base tipográfica, color y shell de la página.
- `public/audio/` — samples de batería y bajo.
- Motor: [`@quicio/umbral-tone`](https://github.com/quicio/umbral-tone).

## Licencia

MIT.
