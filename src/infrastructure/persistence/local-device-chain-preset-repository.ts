import type { InsertConfig } from '../../domain/graph';
import type { DeviceChainPreset } from '../../domain/device-chain';
import type { DeviceChainPresetRepositoryPort } from '../../domain/ports';

const CHAINS_KEY = 'quicio-espiral-device-chains-v1';

export class LocalDeviceChainPresetRepository
  implements DeviceChainPresetRepositoryPort
{
  list(): readonly DeviceChainPreset[] {
    try {
      const raw = localStorage.getItem(CHAINS_KEY);
      if (!raw) return [];
      const parsed = JSON.parse(raw) as unknown;
      if (!Array.isArray(parsed)) return [];
      return parsed.flatMap(value => {
        const record = asRecord(value);
        if (!record) return [];
        const id = typeof record.id === 'string' ? record.id : null;
        const name = typeof record.name === 'string' ? record.name : null;
        const inserts = asInserts(record.inserts);
        if (!id || !name || !inserts) return [];
        return [{ id, name, inserts }];
      });
    } catch {
      return [];
    }
  }

  save(preset: DeviceChainPreset): void {
    const next = [...this.list().filter(entry => entry.id !== preset.id), preset];
    this.write(next);
  }

  remove(id: string): void {
    this.write(this.list().filter(entry => entry.id !== id));
  }

  private write(chains: readonly DeviceChainPreset[]): void {
    try {
      localStorage.setItem(CHAINS_KEY, JSON.stringify(chains));
    } catch {
      // Sin storage disponible: las cadenas viven sólo en esta sesión.
    }
  }
}

function asInserts(value: unknown): readonly InsertConfig[] | null {
  if (!Array.isArray(value)) return null;
  const inserts = value.flatMap(entry => {
    const record = asRecord(entry);
    if (!record) return [];
    const id = typeof record.id === 'string' ? record.id : null;
    const pluginId = typeof record.pluginId === 'string' ? record.pluginId : null;
    const params = asNumberRecord(record.params);
    if (!id || !pluginId || !params) return [];
    return [
      {
        id,
        pluginId,
        bypass: record.bypass === true,
        params,
        ...(typeof record.latencySamples === 'number'
          ? { latencySamples: record.latencySamples }
          : {})
      }
    ];
  });
  return inserts;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function asNumberRecord(value: unknown): Record<string, number> | null {
  const record = asRecord(value);
  if (!record) return null;
  return Object.fromEntries(
    Object.entries(record).filter(
      (entry): entry is [string, number] => typeof entry[1] === 'number'
    )
  );
}
