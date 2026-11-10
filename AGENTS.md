# AGENTS.md

Punto de entrada para cualquier agente que trabaje en Espiral. Leer en este orden:

1. **`docs/HANDOFF.md`** — estado real medido, invariantes, cómo verificar.
2. **`docs/README.md`** — índice de specs y ADRs con sus estados.
3. **`ROADMAP.md`** — el roadmap de producto vigente (no `docs/specs/00`).
4. **`docs/architecture.md`** — capas, puertos, modelo de ejecución.
5. La spec del área que vas a tocar, en `docs/specs/`.
6. Los ADR del área: `docs/adr/`.

## Comandos

```bash
npm ci                                  # instalación reproducible
npx playwright install chromium         # una sola vez, requerido por los checks

npm run dev                             # Vite con HMR
npm run typecheck                       # tsc --noEmit        (~3 s)
npm test                                # vitest              150 tests, ~2.5 s
npm run build                           # typecheck + bundle  (~10 s)

npm run test:audio                      # render offline determinista (Playwright)
npm run test:integration                # app viva en Chromium (Playwright)
```

## Reglas duras

- **Regla de dependencia.** `domain` no importa nada de las otras capas;
  `application` solo conoce puertos; `infrastructure` los implementa;
  `presentation` no importa Tone.js. El único módulo que conoce implementaciones
  concretas es `main.ts`. Romperla «para probar rápido» es el error caro.
- **Tone.js vive solo en `infrastructure/`.** Ni en `application`, ni en
  `presentation`, ni en tests de dominio.
- **El estado es la fuente de verdad**: el motor de audio recibe la mezcla, no la
  guarda. `PlaybackService` traduce estado musical a `SoundEvent`.
- **Los tests offline son deterministas.** Mismo estado + misma seed → mismo PCM.
  Si cambia el resultado sin cambiar el test, es un bug, no una mejora.
- Dependencia nueva = ADR obligatorio (peso del bundle, licencia, alternativa).
- `dist/` no se versiona: lo construye el deploy.
- No reescribir una spec implementada: se crea la siguiente y se marca
  `reemplaza_a`.
- Nada de `any` nuevo en `domain/` ni en `application/`.

## Definición de terminado

- [ ] `npm run typecheck` limpio.
- [ ] `npm test` verde (150+ tests, sin `.skip` nuevos).
- [ ] Si tocó audio: `npm run test:audio` verde (requiere Chromium instalado).
- [ ] Si tocó UI: `npm run test:integration` verde y captura revisada.
- [ ] Spec actualizada (estado y decisiones) en el mismo commit.
- [ ] Commit convencional en español: `feat: …`, `fix: …`, `docs: …`.
