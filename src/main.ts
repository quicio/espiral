import './base.css';
import './espiral.css';
import { PresetMapper } from './adapters/preset-mapper';
import { SessionMapper } from './adapters/session-mapper';
import { ArrangementService } from './application/arrangement';
import { AutomationService } from './application/automation';
import { ClipService } from './application/clip';
import { ExportService } from './application/export';
import { HistoryService } from './application/history';
import { createInitialState } from './application/initial-state';
import { LiveInputService } from './application/live-input';
import { LocksService } from './application/locks';
import { MixService } from './application/mix';
import { ModulationService } from './application/modulation';
import { PatternService } from './application/patterns';
import { PlaybackService } from './application/playback';
import { PresetService } from './application/presets';
import { PlaybackRuntime } from './application/runtime';
import { RoutingService } from './application/routing';
import { SceneService } from './application/scenes';
import { SessionService } from './application/sessions';
import { Store } from './application/store';
import { TrackService } from './application/tracks';
import { ToneClock } from './infrastructure/audio/tone-clock';
import { ToneOfflineRenderer } from './infrastructure/audio/offline-renderer';
import { UmbralGenerative } from './infrastructure/generative/umbral-generative';
import { BrowserFileGateway } from './infrastructure/persistence/browser-file-gateway';
import { HttpPresetRepository } from './infrastructure/persistence/http-preset-repository';
import { LocalSessionRepository } from './infrastructure/persistence/local-session-repository';
import { LocalSoundKitRepository } from './infrastructure/persistence/local-sound-kit-repository';
import { WebMidiInput } from './infrastructure/midi/web-midi';
import { IntervalTicker } from './infrastructure/time/interval-ticker';
import { EspiralApp } from './presentation/app';
import { createCatalog } from './presentation/render';
import { DomStatus } from './presentation/status';

async function boot(): Promise<void> {
  const generative = new UmbralGenerative();
  const initial = createInitialState(generative);
  const store = new Store(initial);
  const history = new HistoryService(store);
  const runtime = new PlaybackRuntime();
  const status = new DomStatus();

  const [{ ModularAudioEngine }, { createEspiralGraph }] = await Promise.all([
    import('./infrastructure/audio/modular/modular-audio-engine'),
    import('./infrastructure/audio/modular/espiral-graph')
  ]);
  const engine = new ModularAudioEngine(
    createEspiralGraph(initial.kit, initial.masterVolume)
  );

  const clock = new ToneClock(
    initial.transport.bpm,
    initial.transport.lookAhead
  );
  const patterns = new PatternService(store, generative, status, runtime);
  const automation = new AutomationService(store, engine, status);
  const clips = new ClipService(store, runtime, status);
  const mix = new MixService(store, engine);
  const scenes = new SceneService(store, mix, runtime, status);
  const arrangement = new ArrangementService(store, scenes, status);
  const playback = new PlaybackService(
    store,
    clock,
    engine,
    generative,
    status,
    automation,
    patterns,
    clips,
    runtime,
    arrangement
  );
  const tracks = new TrackService(store, engine, status);
  const liveInput = new LiveInputService(
    store,
    engine,
    clock,
    status,
    new WebMidiInput()
  );
  const routing = new RoutingService(store, engine, status);
  const modulation = new ModulationService(store, engine, new IntervalTicker());
  const locks = new LocksService(store, engine);
  const sessionMapper = new SessionMapper(generative);
  const files = new BrowserFileGateway();
  const sessions = new SessionService(
    store,
    new LocalSessionRepository(),
    files,
    sessionMapper,
    mix,
    playback,
    runtime,
    status
  );
  const exportService = new ExportService(
    store,
    new ToneOfflineRenderer(),
    files,
    status
  );
  const presets = new PresetService(
    new HttpPresetRepository(),
    store,
    new PresetMapper(generative),
    mix,
    playback,
    status
  );

  mix.syncAll(store.getState());

  const app = new EspiralApp({
    store,
    catalog: createCatalog(generative),
    playback,
    patterns,
    clips,
    runtime,
    arrangement,
    liveInput,
    automation,
    mix,
    sessions,
    presets,
    kits: new LocalSoundKitRepository(),
    scenes,
    tracks,
    routing,
    modulation,
    locks,
    exportService,
    history,
    files,
    status
  });
  app.mount();
  modulation.start();
}

function start(): void {
  void boot().catch(error => {
    console.error('No se pudo iniciar Espiral:', error);
  });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', start);
} else {
  start();
}
