import { cloneInsertChain, type DeviceChainPreset } from '../domain/device-chain';
import type {
  DeviceChainPresetRepositoryPort,
  StatusPort
} from '../domain/ports';
import type { MixService } from './mix';
import type { Store } from './store';

export class DeviceChainService {
  constructor(
    private readonly store: Store,
    private readonly mix: MixService,
    private readonly repository: DeviceChainPresetRepositoryPort,
    private readonly status: StatusPort
  ) {}

  list(): readonly DeviceChainPreset[] {
    return this.repository.list();
  }

  saveCurrent(name: string): DeviceChainPreset | null {
    const state = this.store.getState();
    const track = state.kit.tracks[state.selected];
    if (!track) return null;
    if (track.inserts.length === 0) {
      this.status.generative('El rack está vacío: agregá un dispositivo.');
      return null;
    }

    const finalName =
      name.trim().slice(0, 40) || `Cadena ${this.list().length + 1}`;
    const existing = this.list().find(
      preset => preset.name.toLowerCase() === finalName.toLowerCase()
    );
    const preset: DeviceChainPreset = {
      id: existing?.id ?? uniqueChainId(),
      name: finalName,
      inserts: cloneInsertChain(track.inserts)
    };
    this.repository.save(preset);
    this.status.generative(
      existing
        ? `Cadena ${preset.name} actualizada.`
        : `Cadena ${preset.name} guardada.`
    );
    return preset;
  }

  apply(presetId: string): boolean {
    const preset = this.list().find(entry => entry.id === presetId);
    if (!preset) return false;
    const state = this.store.getState();
    const track = state.kit.tracks[state.selected];
    if (!track) return false;
    if (!this.mix.replaceInserts(track.id, preset.inserts)) {
      this.status.generative('El rack no está disponible en este motor.');
      return false;
    }
    this.status.generative(`${preset.name} aplicada a ${track.name}.`);
    return true;
  }

  remove(presetId: string): void {
    const preset = this.list().find(entry => entry.id === presetId);
    this.repository.remove(presetId);
    this.status.generative(
      preset ? `${preset.name} eliminada.` : 'Cadena eliminada.'
    );
  }
}

function uniqueChainId(): string {
  return `chain-${Date.now().toString(36)}-${Math.random()
    .toString(36)
    .slice(2, 6)}`;
}
