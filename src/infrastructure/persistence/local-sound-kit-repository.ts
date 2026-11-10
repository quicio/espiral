import type { SoundKitRepositoryPort } from '../../domain/ports';
import type { SoundKit } from '../../domain/sound-kits';

const KITS_KEY = 'quicio-espiral-kits-v1';

export class LocalSoundKitRepository implements SoundKitRepositoryPort {
  list(): readonly SoundKit[] {
    try {
      const raw = localStorage.getItem(KITS_KEY);
      if (!raw) return [];
      const parsed = JSON.parse(raw) as unknown;
      if (!Array.isArray(parsed)) return [];
      return parsed.flatMap(value => {
        const record = asRecord(value);
        if (!record) return [];
        const id = typeof record.id === 'string' ? record.id : null;
        const name = typeof record.name === 'string' ? record.name : null;
        const sounds = asStringRecord(record.sounds);
        if (!id || !name || !sounds) return [];
        return [
          {
            id,
            name,
            description:
              typeof record.description === 'string'
                ? record.description
                : 'Kit propio',
            sounds,
            builtin: false
          }
        ];
      });
    } catch {
      return [];
    }
  }

  save(kit: SoundKit): void {
    const next = [...this.list().filter(entry => entry.id !== kit.id), kit];
    this.write(next);
  }

  remove(id: string): void {
    this.write(this.list().filter(entry => entry.id !== id));
  }

  private write(kits: readonly SoundKit[]): void {
    try {
      localStorage.setItem(KITS_KEY, JSON.stringify(kits));
    } catch {
      // Sin storage disponible: los kits viven sólo en esta sesión.
    }
  }
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function asStringRecord(value: unknown): Record<string, string> | null {
  const record = asRecord(value);
  if (!record) return null;
  const entries = Object.entries(record).filter(
    (entry): entry is [string, string] => typeof entry[1] === 'string'
  );
  return Object.fromEntries(entries);
}
