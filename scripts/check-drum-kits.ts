/**
 * Verifica que los drum kits declarados en src/domain/drum-kits.ts tengan su
 * wav en public/audio/kits y que no queden archivos huérfanos.
 *
 * Corre antes de `npm test` vía vite-node (no está en el tsconfig de src, así
 * que puede usar node:fs sin contaminar el typecheck del dominio).
 */
import { existsSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DRUM_KITS } from '../src/domain/drum-kits';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const KIT_ROOT = join(ROOT, 'public', 'audio', 'kits');

const errors: string[] = [];
const declared = new Set<string>();
let bytes = 0;

for (const kit of DRUM_KITS) {
  const dir = join(KIT_ROOT, kit.id);
  if (!existsSync(dir)) {
    errors.push(`falta el directorio public/audio/kits/${kit.id}`);
    continue;
  }
  for (const sound of kit.sounds) {
    const file = join(dir, sound.file);
    const key = `${kit.id}/${sound.file}`;
    declared.add(key);
    if (!existsSync(file)) {
      errors.push(`falta el wav ${key} (kit ${kit.code}, slot ${sound.slot})`);
      continue;
    }
    const size = statSync(file).size;
    if (size < 1024) errors.push(`${key} pesa ${size} bytes: sospechosamente vacío`);
    bytes += size;
  }
}

if (existsSync(KIT_ROOT)) {
  for (const entry of readdirSync(KIT_ROOT, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    for (const name of readdirSync(join(KIT_ROOT, entry.name))) {
      if (!name.endsWith('.wav')) continue;
      const key = `${entry.name}/${name}`;
      if (!declared.has(key)) errors.push(`wav huérfano sin declarar: ${key}`);
    }
  }
} else {
  errors.push('no existe public/audio/kits (corré scripts/fetch-drum-kits.py)');
}

if (errors.length > 0) {
  console.error(`drum kits: ${errors.length} problema(s)`);
  errors.forEach(error => console.error(`  · ${error}`));
  process.exit(1);
}

const slots = DRUM_KITS.reduce((total, kit) => total + kit.sounds.length, 0);
console.log(
  `drum kits ok · ${DRUM_KITS.length} máquinas · ${slots} one-shots · ${(bytes / 1024 / 1024).toFixed(2)} MB`
);
