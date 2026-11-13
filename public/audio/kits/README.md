# Samples de batería

One-shots de máquinas de ritmo usados por los drum kits de Espiral. Un
subdirectorio por kit, un `.wav` por slot (`kick`, `snare`, `clap`,
`hat-closed`, `hat-open`, `tom`, `perc`, `rim`, `shaker`).

Todos los archivos provienen de [`oramics/sampled`](https://github.com/oramics/sampled),
donde el `sampled.instrument.json` de cada máquina declara **`license: Public
Domain`**. No requieren atribución; esta nota existe para trazabilidad.

| kit | máquina | año | fuente |
|---|---|---|---|
| `909` | Roland TR-909 (Detroit) | 1983 | [DM/TR-909](https://github.com/oramics/sampled/tree/master/DM/TR-909) |
| `909t` | Roland TR-909 (Detroit, variante) | 1983 | [DM/TR-909](https://github.com/oramics/sampled/tree/master/DM/TR-909) |
| `909sp` | Roland TR-909 (toma SP) | 1983 | [DM/TR-909/SP](https://github.com/oramics/sampled/tree/master/DM/TR-909/SP) |
| `808` | Roland TR-808 | 1980 | [DM/TR-808](https://github.com/oramics/sampled/tree/master/DM/TR-808) |
| `505` | Roland TR-505 | 1986 | [DM/TR-505](https://github.com/oramics/sampled/tree/master/DM/TR-505) |
| `cr78` | Roland CompuRhythm CR-78 | 1978 | [DM/CR-78](https://github.com/oramics/sampled/tree/master/DM/CR-78) |
| `linn` | LinnDrum LM-2 | 1982 | [DM/LM-2](https://github.com/oramics/sampled/tree/master/DM/LM-2) |
| `mrk2` | Maestro Rhythm King MRK-2 | 1968 | [DM/MRK-2](https://github.com/oramics/sampled/tree/master/DM/MRK-2) |
| `pearl` | Pearl Master Studio (acústica) | — | [DRUMS/pearl-master-studio](https://github.com/oramics/sampled/tree/master/DRUMS/pearl-master-studio) |

## Formato

- Mono, 44.1 kHz, PCM 16 bit.
- Silencio recortado al inicio (1 ms de margen) y al final (10 ms).
- Un único factor de ganancia por kit: el pico más alto del kit queda en −1 dBFS.
  Así se conserva el balance interno del pack original.

## Regenerar

```bash
python3 scripts/fetch-drum-kits.py          # sólo lo que falta
python3 scripts/fetch-drum-kits.py --force  # rehace todo
```

El script escribe `kits.json` con la tabla `slot → archivo fuente`, el pico
medido y el tamaño resultante. Requiere `ffmpeg` y `curl`.
