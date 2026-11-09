import type { InstrumentState, SceneId } from '../domain/models';
import type {
  AudioExportPort,
  FileGatewayPort,
  StatusPort
} from '../domain/ports';
import type { Store } from './store';

export interface ExportOptions {
  readonly bars?: number;
  readonly tailSeconds?: number;
  readonly scene?: SceneId | null;
}

export class ExportService {
  constructor(
    private readonly store: Store,
    private readonly renderer: AudioExportPort,
    private readonly files: FileGatewayPort,
    private readonly status: StatusPort
  ) {}

  async exportWav(options: ExportOptions = {}): Promise<void> {
    const bars = options.bars ?? 8;
    const tailSeconds = options.tailSeconds ?? 2;
    const state = this.store.getState();
    const scene = options.scene ?? state.scene;
    const source = scene === state.scene ? state : stateForScene(state, scene);

    this.status.session('Renderizando audio…');
    try {
      const blob = await this.renderer.render(source, { bars, tailSeconds });
      this.files.downloadBlob(`espiral-${scene}-${bars}bars.wav`, blob);
      this.status.session('Audio exportado.');
    } catch (error) {
      console.error(error);
      this.status.session('No se pudo exportar el audio.');
    }
  }
}

function stateForScene(
  state: InstrumentState,
  scene: SceneId
): InstrumentState {
  const snapshot = state.scenes[scene];
  if (!snapshot) return state;
  return {
    ...state,
    scene,
    kit: snapshot.kit,
    pattern: snapshot.pattern,
    harmony: snapshot.harmony,
    seed: snapshot.seed,
    params: snapshot.params,
    masterVolume: snapshot.masterVolume
  };
}
