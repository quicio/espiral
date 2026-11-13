#!/usr/bin/env python3
"""Construye los one-shots de batería de Espiral desde packs de dominio público.

Fuente única: https://github.com/oramics/sampled (metadatos por kit declaran
`license: Public Domain`).

  DM/TR-909/Detroit   Roland TR-909 grabada por API + Neve
  DM/TR-909/SP        Roland TR-909 (segunda toma)
  DM/TR-808           Roland TR-808
  DM/TR-505           Roland TR-505
  DM/CR-78            Roland CompuRhythm CR-78
  DM/LM-2             LinnDrum LM-2
  DM/MRK-2            Maestro Rhythm King MRK-2
  DRUMS/pearl-master  Pearl Master Studio (acústica)

Salida: public/audio/kits/<kit>/<slot>.wav
  mono, 44.1 kHz, 16 bit, silencio recortado, un único factor de ganancia por kit
  (mantiene el balance interno del pack original; el nivel de mezcla lo pone la app).

Uso: python3 scripts/fetch-drum-kits.py [--force]
"""
from __future__ import annotations

import json
import os
import subprocess
import sys
import urllib.parse

RAW = "https://raw.githubusercontent.com/oramics/sampled/master"
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "public", "audio", "kits")
STAGE = os.path.join(os.path.expanduser("~"), ".hermes", "cache", "scratch", "kits-raw")

# kit -> (directorio en el repo fuente, {slot: archivo})
KITS: dict[str, tuple[str, dict[str, list[str]]]] = {
    "909": ("DM/TR-909/Detroit/samples", {
        "kick": ["kick.wav", "kick-short.wav"],
        "snare": ["snare.wav"],
        "clap": ["clap-1.wav", "clap-2.wav"],
        "hat-closed": ["hihat-closed.wav", "hihat-close.wav"],
        "hat-open": ["hihat-open-1.wav", "hihat-open-2.wav"],
        "tom": ["tom-h.wav", "tom-l.wav"],
        "perc": ["rim.wav"],
    }),
    # Variante cerrada del mismo 909: otro orden de tomas.
    "909t": ("DM/TR-909/Detroit/samples", {
        "kick": ["kick-short.wav", "kick.wav"],
        "snare": ["snare.wav"],
        "clap": ["clap-2.wav", "clap-1.wav"],
        "hat-closed": ["hihat-close.wav", "hihat-closed.wav"],
        "hat-open": ["hihat-open-2.wav", "hihat-open-1.wav"],
        "tom": ["tom-l.wav", "tom-h.wav"],
        "perc": ["rim.wav"],
    }),
    "909sp": ("DM/TR-909/SP/samples", {
        "kick": ["kick-2.wav", "kick.wav"],
        "snare": ["snare.wav", "snare-short.wav"],
        "clap": ["clap2.wav", "clap1.wav"],
        "hat-closed": ["hihat-closed-2.wav", "hihat-closed-1.wav"],
        "hat-open": ["hihat-open-2.wav", "hihat-open-1.wav"],
        "tom": ["tom-m.wav", "tom-h.wav", "tom-l.wav"],
        "perc": ["rim.wav"],
    }),
    "808": ("DM/TR-808/samples", {
        "kick": ["05.BD.808.wav", "06.BD.808.wav", "07.BD.808.wav"],
        "snare": ["05.SD5.808.wav", "06.SD5.808.wav", "07.SD5.808.wav"],
        "clap": ["05.CP.808.wav", "06.CP.808.wav", "07.CP.808.wav"],
        "hat-closed": ["05.CH.808.wav", "06.CH.808.wav", "07.CH.808.wav"],
        "hat-open": ["05.OH.808.wav", "06.OH.808.wav", "07.OH.808.wav"],
        "tom": ["05.MT.808.wav", "06.MT.808.wav", "07.MT.808.wav"],
        "perc": ["05.CB.808.wav", "06.CB.808.wav", "07.CB.808.wav"],
        "rim": ["05.RS.808.wav", "06.RS.808.wav", "07.RS.808.wav"],
        "shaker": ["05.MA.808.wav", "06.MA.808.wav", "07.MA.808.wav"],
    }),
    "505": ("DM/TR-505/samples", {
        "kick": ["tr505-kick.wav"],
        "snare": ["tr505-snare.wav"],
        "clap": ["tr505-clap.wav"],
        "hat-closed": ["tr505-hihat-closed.wav"],
        "hat-open": ["tr505-hihat-open.wav"],
        "tom": ["tr505-tom-m.wav"],
        "perc": ["tr505-cowb-h.wav"],
        "rim": ["tr505-rim.wav"],
        "shaker": ["tr505-timbal.wav"],
    }),
    "cr78": ("DM/CR-78/samples", {
        "kick": ["kick.wav"],
        "snare": ["snare.wav"],
        "hat-closed": ["hihat.wav"],
        "hat-open": ["hihat-metal.wav"],
        "tom": ["conga-l.wav"],
        "perc": ["bongo-l.wav"],
        "rim": ["rim.wav"],
        "shaker": ["tamb-short.wav"],
    }),
    "linn": ("DM/LM-2/samples", {
        "kick": ["kick.wav"],
        "snare": ["snare-m.wav"],
        "clap": ["clap.wav"],
        "hat-closed": ["hihat-closed.wav"],
        "hat-open": ["hihat-open.wav"],
        "tom": ["conga-m.wav"],
        "perc": ["conga-hh.wav"],
        "rim": ["conga-lll.wav"],
        "shaker": ["cabasa.wav"],
    }),
    "mrk2": ("DM/MRK-2/samples", {
        "kick": ["kick.wav"],
        "snare": ["snare.wav"],
        "hat-closed": ["hihat-closed.wav"],
        "hat-open": ["hihat-open.wav"],
        "tom": ["tom.wav"],
        "perc": ["bongo.wav"],
        "rim": ["clave.wav"],
        "shaker": ["block.wav"],
    }),
    "pearl": ("DRUMS/pearl-master-studio/samples", {
        "kick": ["kick-01.wav"],
        "snare": ["snare-01.wav"],
        "clap": ["snare-03.wav"],
        "hat-closed": ["hihat-closed.wav"],
        "hat-open": ["hihat-open.wav"],
        "tom": ["tom-01.wav"],
        "perc": ["tom-02.wav"],
    }),
}

TRIM = (
    # Sólo el silencio previo al ataque: el ataque no se toca.
    "silenceremove=start_periods=1:start_threshold=-60dB:start_silence=0.001,"
    # Cola: umbral muy bajo, para no comerse el decay. Un snare sin cola es un click.
    "areverse,"
    "silenceremove=start_periods=1:start_threshold=-80dB:start_silence=0.03,"
    # Fade de 8 ms en el extremo (al revertir queda al final) para evitar clicks.
    "afade=t=in:d=0.008,"
    "areverse"
)


def fetch(url: str, path: str, force: bool) -> None:
    if os.path.exists(path) and not force:
        return
    os.makedirs(os.path.dirname(path), exist_ok=True)
    subprocess.run(["curl", "-fsSL", "--retry", "3", "-o", path, url], check=True)


def peak_db(path: str) -> float:
    out = subprocess.run(
        ["ffmpeg", "-hide_banner", "-i", path, "-af", "volumedetect", "-f", "null", "-"],
        capture_output=True,
        text=True,
    ).stderr
    for line in out.splitlines():
        if "max_volume" in line:
            return float(line.split("max_volume:")[1].split("dB")[0])
    return -99.0


def run(args: list[str]) -> None:
    subprocess.run(["ffmpeg", "-y", "-v", "error", *args], check=True)


def main() -> int:
    force = "--force" in sys.argv
    report: dict[str, object] = {}
    for kit, (src_dir, slots) in KITS.items():
        raw_dir = os.path.join(STAGE, src_dir.replace("/", "_"))
        staged: dict[str, list[str]] = {}
        for slot, names in slots.items():
            paths = []
            for name in names:
                path = os.path.join(raw_dir, name)
                fetch(f"{RAW}/{src_dir}/{urllib.parse.quote(name)}", path, force)
                paths.append(path)
            staged[slot] = paths

        trimmed: dict[str, list[str]] = {}
        for slot, paths in staged.items():
            outs = []
            for index, path in enumerate(paths):
                dst = os.path.join(STAGE, f"{kit}-{slot}-{index}-trim.wav")
                run(["-i", path, "-af", TRIM, "-ac", "1", "-ar", "44100", "-c:a", "pcm_s24le", dst])
                outs.append(dst)
            trimmed[slot] = outs

        peaks = {
            (slot, index): peak_db(path)
            for slot, paths in trimmed.items()
            for index, path in enumerate(paths)
        }
        gain = -1.0 - max(peaks.values())
        kit_dir = os.path.join(OUT, kit)
        os.makedirs(kit_dir, exist_ok=True)
        output_files: dict[str, list[str]] = {}
        for slot, paths in trimmed.items():
            names = []
            for index, path in enumerate(paths):
                name = f"{slot}.wav" if index == 0 else f"{slot}-{index + 1}.wav"
                dst = os.path.join(kit_dir, name)
                run(["-i", path, "-af", f"volume={gain:.2f}dB", "-ac", "1", "-ar", "44100",
                     "-c:a", "pcm_s16le", dst])
                names.append(name)
            output_files[slot] = names

        report[kit] = {
            "source": f"{RAW}/{src_dir}",
            "license": "Public Domain",
            "gainDb": round(gain, 2),
            "slots": {
                slot: {
                    "files": output_files[slot],
                    "peakDb": round(max(peaks[(slot, index)] for index in range(len(output_files[slot]))), 1),
                    "kb": round(
                        sum(os.path.getsize(os.path.join(kit_dir, name)) for name in output_files[slot]) / 1024,
                        1,
                    ),
                }
                for slot in slots
            },
        }
        total = sum(v["kb"] for v in report[kit]["slots"].values())  # type: ignore[index,union-attr]
        print(f"{kit:6s} gain={gain:+6.2f} dB  {len(slots)} slots  {total:6.0f} KB")

    with open(os.path.join(OUT, "kits.json"), "w") as fh:
        json.dump(report, fh, indent=2, ensure_ascii=False)
        fh.write("\n")

    total = sum(
        os.path.getsize(os.path.join(OUT, kit, name))
        for kit, data in report.items()
        for slot in data["slots"].values()  # type: ignore[index,union-attr]
        for name in slot["files"]
    )
    files_count = sum(
        len(slot["files"])
        for data in report.values()
        for slot in data["slots"].values()  # type: ignore[index,union-attr]
    )
    print(f"total {total / 1024:.0f} KB en {files_count} archivos")
    return 0


if __name__ == "__main__":
    sys.exit(main())
