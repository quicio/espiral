import type {
  PresetCodec,
  PresetRepositoryPort,
  PresetSummary,
  StatusPort
} from '../domain/ports';
import type { MixService } from './mix';
import type { PlaybackService } from './playback';
import type { Store } from './store';

export class PresetService {
  constructor(
    private readonly repository: PresetRepositoryPort,
    private readonly store: Store,
    private readonly mapper: PresetCodec,
    private readonly mix: MixService,
    private readonly playback: PlaybackService,
    private readonly status: StatusPort
  ) {}

  list(): readonly PresetSummary[] {
    return this.repository.list();
  }

  async load(id: string): Promise<void> {
    try {
      const raw = await this.repository.load(id);
      const config = this.mapper.fromDto(raw, this.store.getState());
      this.store.update(state => ({
        ...state,
        transport: { ...state.transport, bpm: config.bpm },
        kit: config.kit,
        masterVolume: config.masterVolume
      }));
      this.playback.setBpm(config.bpm);
      this.mix.syncAll(this.store.getState(), true);
      this.status.session('Mezcla cargada.');
      this.status.error('');
    } catch (error) {
      console.error(error);
      this.status.error('No se pudo cargar la mezcla.');
    }
  }
}
