---
id: adr-0003
status: aceptada
version: 1.0.0
updated: 2026-11-03
---

# ADR-0003 — Plugins declarados por schema de parámetros

## Contexto

Los inserts necesitan parámetros editables, persistencia en la sesión, bypass sin
clicks y una UI que no se escriba a mano por plugin. Un plugin de terceros con UI
propia implicaría cargar código arbitrario (iframe, AudioWorklet ajeno) y un
contrato que hoy no existe.

## Decisión

1. Un plugin se define por un **schema de parámetros** en `src/domain/plugin.ts`
   (contrato, definición y normalización), no por código de UI.
2. `PluginHost` + `InsertSlot` hospedan el plugin; el bypass se hace por
   **crossfade**, no por corte seco (evita clicks).
3. La UI de parámetros se genera desde el schema (`presentation/plugin-controls.ts`).
4. El estado guarda `inserts` por canal y la sesión los persiste; el rack permite
   agregar, quitar, reordenar, bypassear y editar.
5. **Plugins de instrumento y de terceros quedan fuera de alcance** hasta que
   exista un contrato de carga (hoy el loader de AudioWorklet es interno).

## Consecuencias

Buenas:

- Un plugin nuevo es datos + DSP, no una pantalla nueva.
- Persistencia y normalización son únicas para todos los plugins.
- Bypass por crossfade sobrevive a cambios en vivo sin artefactos.

Malas:

- Los parámetros quedan limitados a lo que el schema puede expresar (sin UI
  arbitraria por plugin).
- Cargar AudioWorklet de terceros exige revisar seguridad y versionado del
  contrato antes de abrirlo.

## Alternativas no elegidas

- **Plugin = archivo JS con su propia UI**: máxima flexibilidad, sin contrato ni
  persistencia uniforme; además abre ejecución de código ajeno.
- **Insert hardcodeado por tipo**: simple al principio, obliga a tocar la UI por
  cada efecto nuevo.
- **Bypass por desconexión del nodo**: más barato, produce clicks audibles.
