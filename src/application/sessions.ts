import type { InstrumentState } from '../domain/models';
import type {
  FileGatewayPort,
  SessionCodec,
  SessionRepositoryPort,
  StatusPort
} from '../domain/ports';
import type { MixService } from './mix';
import type { PlaybackService } from './playback';
import type { PlaybackRuntime } from './runtime';
import type { Store } from './store';

export class SessionService {
  constructor(
    private readonly store: Store,
    private readonly repository: SessionRepositoryPort,
    private readonly files: FileGatewayPort,
    private readonly mapper: SessionCodec,
    private readonly mix: MixService,
    private readonly playback: PlaybackService,
    private readonly runtime: PlaybackRuntime,
    private readonly status: StatusPort
  ) {}

  save(): void {
    try {
      this.repository.save(this.mapper.toDto(this.store.getState()));
      this.status.session('Sesión guardada.');
    } catch (error) {
      console.error(error);
      this.status.session('No se pudo guardar la sesión.');
    }
  }

  load(): void {
    try {
      const raw = this.repository.load();
      if (raw === null) {
        this.status.session('No hay una sesión guardada.');
        return;
      }
      this.apply(raw);
      this.status.session('Sesión cargada.');
    } catch (error) {
      console.error(error);
      this.status.session('No se pudo cargar la sesión.');
    }
  }

  export(): void {
    try {
      this.files.downloadJson('espiral-session.json', this.mapper.toDto(this.store.getState()));
      this.status.session('Sesión exportada.');
    } catch (error) {
      console.error(error);
      this.status.session('No se pudo exportar la sesión.');
    }
  }

  async import(file: File): Promise<void> {
    try {
      const raw = await this.files.readJsonFile(file);
      this.apply(raw);
      this.status.session('Sesión importada.');
    } catch (error) {
      console.error(error);
      this.status.session('El archivo no es una sesión válida.');
    }
  }

  private apply(raw: unknown): void {
    const next: InstrumentState = this.mapper.fromDto(raw, this.store.getState());
    this.store.update(() => next);
    this.playback.setBpm(next.transport.bpm);
    this.mix.syncAll(next, true);
    this.runtime.resetHarmony();
  }
}
