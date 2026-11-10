import type {
  PresetCodec,
  PresetRepositoryPort,
  PresetSummary,
  StatusPort
} from '../domain/ports';
import { activeClipsForScene, createClipsFromScenes } from '../domain/clip';
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
    let transitioning = false;
    try {
      const raw = await this.repository.load(id);
      const state = this.store.getState();
      const config = this.mapper.fromDto(raw, state);
      const scenes = config.scenes ?? state.scenes;
      const scene = config.scene ?? state.scene;
      const clips = createClipsFromScenes(scenes);
      this.mix.beginTransition();
      transitioning = true;
      const next = {
        ...state,
        transport: {
          ...state.transport,
          bpm: config.bpm
        },
        kit: config.kit,
        masterVolume: config.masterVolume,
        pattern: config.pattern ?? state.pattern,
        harmony: config.harmony ?? state.harmony,
        seed: config.seed ?? state.seed,
        params: config.params ?? state.params,
        scenes,
        scene,
        clips,
        activeClips: activeClipsForScene(clips, scene),
        selected: config.selected ?? state.selected,
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
    } finally {
      if (transitioning) this.mix.endTransition();
    }
  }
}
