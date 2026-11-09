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
      const next = {
        ...this.store.getState(),
        transport: {
          ...this.store.getState().transport,
          bpm: config.bpm
        },
        kit: config.kit,
        masterVolume: config.masterVolume,
        pattern: config.pattern ?? this.store.getState().pattern,
        harmony: config.harmony ?? this.store.getState().harmony,
        seed: config.seed ?? this.store.getState().seed,
        params: config.params ?? this.store.getState().params,
        scenes: config.scenes ?? this.store.getState().scenes,
        scene: config.scene ?? this.store.getState().scene,
        selected: config.selected ?? this.store.getState().selected,
        history: [],
        clipboard: null
      };
      this.store.update(() => next);
      this.playback.setBpm(config.bpm);
      this.playback.resetHarmony();
      this.mix.syncAll(next, true);
      this.status.session('Preset musical cargado.');
      this.status.error('');
    } catch (error) {
      console.error(error);
      this.status.error('No se pudo cargar el preset.');
    }
  }
}
