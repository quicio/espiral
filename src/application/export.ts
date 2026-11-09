import type {
  AudioExportPort,
  FileGatewayPort,
  StatusPort
} from '../domain/ports';
import type { Store } from './store';

export class ExportService {
  constructor(
    private readonly store: Store,
    private readonly renderer: AudioExportPort,
    private readonly files: FileGatewayPort,
    private readonly status: StatusPort
  ) {}

  async exportWav(bars = 8, tailSeconds = 2): Promise<void> {
    this.status.session('Renderizando audio…');
    try {
      const state = this.store.getState();
      const blob = await this.renderer.render(state, { bars, tailSeconds });
      this.files.downloadBlob('espiral-export.wav', blob);
      this.status.session('Audio exportado.');
    } catch (error) {
      console.error(error);
      this.status.session('No se pudo exportar el audio.');
    }
  }
}
