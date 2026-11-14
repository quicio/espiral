import type { GenerativeParams, InstrumentState, ProgressionId, ScaleId, SceneId } from '../domain/models';
import type { ClipFollowAction, ClipQuantize } from '../domain/clip';
import type { ModulationState } from '../domain/modulation';
import { formatMachineParam, machinePreset } from '../domain/machines';
import { denormalizePluginParam } from '../domain/plugin';
import { canEditTrackSound } from '../domain/kit';
import type {
  FileGatewayPort,
  SoundKitRepositoryPort,
  StatusPort
} from '../domain/ports';
import {
  DEFAULT_KIT_ID,
  SOUND_KITS,
  soundKit,
  soundOptionsForTrack,
  type SoundKit
} from '../domain/sound-kits';
import {
  SLOT_TRACK,
  drumKit,
  drumKitSoundMap
} from '../domain/drum-kits';
import type { AutomationService } from '../application/automation';
import type { ArrangementService } from '../application/arrangement';
import type { BrowserService } from '../application/browser';
import type { ClipService } from '../application/clip';
import type { DeviceChainService } from '../application/device-chains';
import type { ExportService } from '../application/export';
import type { HistoryService } from '../application/history';
import type { MixService } from '../application/mix';
import type { LiveInputService } from '../application/live-input';
import type { LocksService } from '../application/locks';
import type { ModulationService } from '../application/modulation';
import type { PatternService } from '../application/patterns';
import type { PlaybackService } from '../application/playback';
import type { PlaybackRuntime } from '../application/runtime';
import type { PresetService } from '../application/presets';
import type { RoutingService } from '../application/routing';
import type { SceneService } from '../application/scenes';
import type { SessionService } from '../application/sessions';
import type { Store } from '../application/store';
import type { TrackService } from '../application/tracks';
import * as view from './render';
import { CpuMeter, cpuSeverity } from './cpu-meter';
import { formatPluginParam } from './plugin-controls';

type ViewId =
  | 'performance'
  | 'session'
  | 'arrangement'
  | 'sequencer'
  | 'sound'
  | 'routing'
  | 'modulation';

const METER_INTERVAL_MS = 1000 / 25;
const METER_TRACK_BATCH = 8;
const METER_BUS_BATCH = 4;

const ALL_VIEWS: readonly ViewId[] = [
  'performance',
  'session',
  'arrangement',
  'sequencer',
  'sound',
  'routing',
  'modulation'
];

interface MeterTarget {
  readonly id: string;
  readonly fill: HTMLElement | null;
  readonly clip: HTMLElement | null;
}

interface PresentationDependencies {
  readonly store: Store;
  readonly catalog: view.Catalog;
  readonly playback: PlaybackService;
  readonly patterns: PatternService;
  readonly browser: BrowserService;
  readonly clips: ClipService;
  readonly runtime: PlaybackRuntime;
  readonly arrangement: ArrangementService;
  readonly liveInput: LiveInputService;
  readonly automation: AutomationService;
  readonly mix: MixService;
  readonly deviceChains: DeviceChainService;
  readonly sessions: SessionService;
  readonly presets: PresetService;
  readonly kits: SoundKitRepositoryPort;
  readonly scenes: SceneService;
  readonly tracks: TrackService;
  readonly routing: RoutingService;
  readonly modulation: ModulationService;
  readonly locks: LocksService;
  readonly exportService: ExportService;
  readonly history: HistoryService;
  readonly files: FileGatewayPort;
  readonly status: StatusPort;
}

const spectrumContexts = new WeakMap<
  HTMLCanvasElement,
  CanvasRenderingContext2D
>();

function drawSpectrum(
  canvas: HTMLCanvasElement | null,
  values: readonly number[]
): void {
  if (!canvas || values.length === 0) return;
  let context = spectrumContexts.get(canvas);
  if (!context) {
    const created = canvas.getContext('2d');
    if (!created) return;
    context = created;
    spectrumContexts.set(canvas, context);
  }
  const { width, height } = canvas;
  context.clearRect(0, 0, width, height);
  context.fillStyle = '#c7b8ff';
  const barWidth = width / values.length;
  values.forEach((value, index) => {
    const barHeight = Math.max(1, value * (height - 2));
    context.fillRect(
      index * barWidth + 0.5,
      height - barHeight,
      Math.max(1, barWidth - 1),
      barHeight
    );
  });
}

export class EspiralApp {
  private lastState: InstrumentState | null = null;
  private unsubscribe: (() => void) | null = null;
  private meterFrame: number | null = null;
  private renderFrame: number | null = null;
  private pendingRenderState: InstrumentState | null = null;
  private sessionFocus: { row: number; col: number } | null = null;
  private readonly dirtyViews = new Set<ViewId>(ALL_VIEWS);
  private meterTargetsDirty = true;
  private currentView: ViewId = 'performance';
  private armRequired = true;
  private midiConnected = false;
  private armState: view.ArmWizardState = {
    presetId: 'techno',
    sceneId: 'umbral',
    root: 0,
    scale: 'minor',
    progression: 'menor',
    bpm: 128,
    kitId: DEFAULT_KIT_ID,
    drumKitId: soundKit(DEFAULT_KIT_ID)?.drumKitId ?? '',
    sounds: { ...(soundKit(DEFAULT_KIT_ID)?.sounds ?? {}) },
    elements: new Set(
      view.ARM_ELEMENT_IDS.filter(trackId => trackId !== 'pad')
    ),
    canCancel: false,
    hasSavedSession: false
  };

  constructor(private readonly deps: PresentationDependencies) {}

  mount(): void {
    this.renderCatalog();
    this.renderPresets();
    this.bindControls();

    this.lastState = this.deps.store.getState();
    this.unsubscribe = this.deps.store.subscribe(state => this.handleState(state));

    this.syncHistoryButtons();
    const initial = (location.hash || '').replace('#', '');
    this.setView(isView(initial) ? initial : 'performance', { scroll: false });
    this.openArmWizard(true);
    this.deps.status.instrument('Detenido');
    this.deps.status.generative(
      `Semilla ${this.lastState.seed} · escena ${this.lastState.scenes[this.lastState.scene]?.name ?? this.deps.catalog.sceneLabel(this.lastState.scene)}.`
    );
    this.startMeter();
  }

  dispose(): void {
    this.unsubscribe?.();
    this.unsubscribe = null;
    if (this.meterFrame !== null) {
      cancelAnimationFrame(this.meterFrame);
      this.meterFrame = null;
    }
    if (this.renderFrame !== null) {
      cancelAnimationFrame(this.renderFrame);
      this.renderFrame = null;
    }
    this.pendingRenderState = null;
  }

  private startMeter(): void {
    let clipping = false;
    const cpuMeter = new CpuMeter();
    let lastCpu = 0;
    let lastSample = 0;
    let trackCursor = 0;
    let busCursor = 0;
    let targets: { tracks: MeterTarget[]; buses: MeterTarget[] } | null = null;
    const clipButton = view.q<HTMLButtonElement>('#master-clip');
    const masterFill = view.q('#master-meter-fill');
    const cpuFill = view.q('#cpu-meter-fill');
    const cpuValue = view.q('#cpu-value');
    const masterSpectrum = view.q<HTMLCanvasElement>('#master-spectrum');
    const cpuBar = view.q('.cpu-meter');
    const resetClip = (): void => {
      clipping = false;
      clipButton?.classList.remove('is-clip');
      clipButton?.setAttribute('aria-pressed', 'false');
    };
    clipButton?.addEventListener('click', resetClip);

    const resetNodeClip = (event: Event): void => {
      const target =
        event.target instanceof Element
          ? event.target.closest<HTMLElement>('[data-meter-reset]')
          : null;
      if (!target) return;
      target.classList.remove('is-clip');
      target.setAttribute('aria-pressed', 'false');
    };
    view.q('#sound-channels')?.addEventListener('click', resetNodeClip);
    view.q('#routing-buses')?.addEventListener('click', resetNodeClip);

    const collect = (
      selector: string,
      attribute: string,
      kind: 'track' | 'bus'
    ): MeterTarget[] =>
      view.qa<HTMLElement>(selector).flatMap(element => {
        const id = element.getAttribute(attribute);
        if (!id) return [];
        return [
          {
            id,
            fill: element.querySelector<HTMLElement>(
              `[data-${kind}-meter-fill="${id}"]`
            ),
            clip: element.querySelector<HTMLElement>(
              `[data-meter-reset="${kind}:${id}"]`
            )
          }
        ];
      });

    const collectTargets = (): {
      tracks: MeterTarget[];
      buses: MeterTarget[];
    } => ({
      tracks: collect('[data-track-meter]', 'data-track-meter', 'track'),
      buses: collect('[data-bus-meter]', 'data-bus-meter', 'bus')
    });

    const tick = (now: number): void => {
      const cpu = cpuMeter.sample(now, this.deps.mix.getAudioStats());

      if (!document.hidden && now - lastSample >= METER_INTERVAL_MS) {
        lastSample = now;
        if (!targets || this.meterTargetsDirty) {
          targets = collectTargets();
          this.meterTargetsDirty = false;
        }

        const db = this.deps.mix.getMasterLevel();
        const level = Number.isFinite(db)
          ? Math.max(0, Math.min(1, (db + 60) / 60))
          : 0;
        masterFill?.style.setProperty('--level', level.toFixed(3));

        if (db > -0.5 && !clipping) {
          clipping = true;
          clipButton?.classList.add('is-clip');
          clipButton?.setAttribute('aria-pressed', 'true');
        }

        lastCpu = cpu;
        const state = this.deps.store.getState();
        drawSpectrum(masterSpectrum, this.deps.mix.getMasterSpectrum(32));
        const trackSpectrum = view.q<HTMLCanvasElement>('#track-spectrum');
        if (trackSpectrum && !document.hidden) {
          drawSpectrum(
            trackSpectrum,
            this.deps.mix.getTrackSpectrum(state.selected, 32)
          );
        }
        cpuFill?.style.setProperty('--level', lastCpu.toFixed(3));
        if (cpuValue) cpuValue.textContent = `${Math.round(lastCpu * 100)}%`;
        if (cpuBar) {
          const severity = cpuSeverity(lastCpu);
          cpuBar.classList.toggle('is-warning', severity === 'warning');
          cpuBar.classList.toggle('is-critical', severity === 'critical');
          cpuBar.setAttribute(
            'aria-label',
            `Carga de CPU estimada: ${Math.round(lastCpu * 100)}%`
          );
        }

        const trackCount = targets.tracks.length;
        if (trackCount > 0) {
          const count = Math.min(METER_TRACK_BATCH, trackCount);
          for (let index = 0; index < count; index += 1) {
            const target = targets.tracks[(trackCursor + index) % trackCount];
            if (target) {
              this.updateNodeMeter(
                target,
                this.deps.mix.getTrackLevel(target.id)
              );
            }
          }
          trackCursor = (trackCursor + count) % trackCount;
        }

        const busCount = targets.buses.length;
        if (busCount > 0) {
          const count = Math.min(METER_BUS_BATCH, busCount);
          for (let index = 0; index < count; index += 1) {
            const target = targets.buses[(busCursor + index) % busCount];
            if (target) {
              this.updateNodeMeter(
                target,
                this.deps.mix.getBusLevel(target.id)
              );
            }
          }
          busCursor = (busCursor + count) % busCount;
        }
      }

      this.meterFrame = requestAnimationFrame(tick);
    };

    this.meterFrame = requestAnimationFrame(tick);
  }

  private updateNodeMeter(target: MeterTarget, db: number): void {
    const level = Number.isFinite(db)
      ? Math.max(0, Math.min(1, (db + 60) / 60))
      : 0;
    target.fill?.style.setProperty('--level', level.toFixed(3));

    if (db > -0.5) {
      target.clip?.classList.add('is-clip');
      target.clip?.setAttribute('aria-pressed', 'true');
    }
  }

  private handleState(state: InstrumentState): void {
    const previous = this.lastState;
    this.lastState = state;
    this.syncHistoryButtons();
    if (!previous) {
      this.meterTargetsDirty = true;
      ALL_VIEWS.forEach(id => this.dirtyViews.add(id));
      view.renderActiveView(
        state,
        this.deps.catalog,
        this.deps.mix,
        this.currentView,
        {
          runtime: this.deps.runtime,
          chains: this.deps.deviceChains.list()
        }
      );
      this.dirtyViews.delete(this.currentView);
      return;
    }

    if (sameNonTransport(previous, state)) {
      view.syncTransport(state);
      view.syncPlayhead(state);
      if (previous.transport.playing !== state.transport.playing) {
        view.renderSession(state, this.deps.runtime);
      }
      return;
    }

    if (isAutomationValueChange(previous, state)) {
      view.syncAutomationValues(state, this.deps.catalog);
      return;
    }

    if (isModulationChange(previous, state)) {
      if (modulationStructureChanged(previous.modulation, state.modulation)) {
        view.renderModulation(state, this.deps.mix);
      } else {
        view.syncModulation(state, this.deps.mix);
      }
      return;
    }

    if (isMixValueChange(previous, state)) {
      view.syncTransport(state);
      view.syncMixValues(state, this.deps.mix);
      view.syncRouting(state, this.deps.mix);
      if (this.currentView === 'performance' || this.currentView === 'sequencer') {
        view.syncPlayhead(state);
      }
      return;
    }

    this.meterTargetsDirty = true;
    ALL_VIEWS.forEach(id => this.dirtyViews.add(id));
    this.scheduleRender(state);
  }

  private renderCatalog(): void {
    const root = view.q<HTMLSelectElement>('#root-select');
    if (root) {
      root.innerHTML = this.deps.catalog.roots
        .map(option => `<option value="${option.value}">${option.label}</option>`)
        .join('');
    }

    const scale = view.q<HTMLSelectElement>('#scale-select');
    if (scale) {
      scale.innerHTML = this.deps.catalog.scales
        .map(option => `<option value="${option.value}">${option.label}</option>`)
        .join('');
    }

    const progression = view.q<HTMLSelectElement>('#progression-select');
    if (progression) {
      progression.innerHTML = this.deps.catalog.progressions
        .map(option => `<option value="${option.value}">${option.label}</option>`)
        .join('');
    }

    const automationTarget = view.q<HTMLSelectElement>('#automation-target');
    if (automationTarget) {
      automationTarget.innerHTML = this.deps.catalog.automationTargets
        .map(option => `<option value="${option.value}">${option.label}</option>`)
        .join('');
    }

    const sceneGrid = view.q('.scene-grid');
    if (sceneGrid) {
      sceneGrid.innerHTML = this.deps.catalog.scenes
        .map(
          scene =>
            `<button class="scene" type="button" data-scene="${scene.id}" aria-pressed="false"><span class="scene__name">${scene.label}</span><span class="scene__desc">${scene.description}</span></button>`
        )
        .join('');
    }

    const exportScene = view.q<HTMLSelectElement>('#export-scene');
    if (exportScene) {
      exportScene.innerHTML =
        '<option value="">Actual</option>' +
        this.deps.catalog.scenes
          .map(scene => `<option value="${scene.id}">${scene.label}</option>`)
          .join('');
    }
  }

  private renderPresets(): void {
    const select = view.q<HTMLSelectElement>('#mix-preset');
    if (!select) return;
    select.innerHTML =
      '<option value="-1">Seleccionar…</option>' +
      this.deps.presets
        .list()
        .map(preset => `<option value="${preset.id}">${preset.name}</option>`)
        .join('');
  }

  private bindControls(): void {
    const { playback, patterns, automation, mix } = this.deps;

    view.must('#transport-play').addEventListener('click', () => {
      const state = this.deps.store.getState();
      if (state.transport.playing || state.transport.preparing) playback.stop();
      else void playback.start();
    });

    view.must('#performance-mode').addEventListener('click', event => {
      const active = document.body.classList.toggle('is-performance');
      if (event.target instanceof HTMLElement) {
        event.target.setAttribute('aria-pressed', String(active));
        event.target.classList.toggle('is-active', active);
      }
    });

    const setBpm = (raw: number): void => {
      if (!Number.isFinite(raw)) return;
      const value = Math.max(40, Math.min(240, Math.round(raw)));
      playback.setBpm(value);
      const range = view.q<HTMLInputElement>('#bpm-control');
      const number = view.q<HTMLInputElement>('#bpm-number');
      const output = view.q('#bpm-value');
      if (range) range.value = String(value);
      if (number) number.value = String(value);
      if (output) output.textContent = String(value);
    };

    view.must<HTMLInputElement>('#bpm-control').addEventListener('input', event => {
      setBpm(Number(inputValue(event)));
    });

    view.must<HTMLInputElement>('#bpm-number').addEventListener('input', event => {
      setBpm(Number(inputValue(event)));
    });

    view.must<HTMLInputElement>('#swing-control').addEventListener('input', event => {
      const value = Number(inputValue(event));
      playback.setSwing(value / 100);
      const output = view.q('#swing-value');
      if (output) output.textContent = `${value}%`;
    });

    view.must<HTMLInputElement>('#humanize-control').addEventListener('input', event => {
      const value = Number(inputValue(event));
      playback.setHumanize(value / 100);
      const output = view.q('#humanize-value');
      if (output) output.textContent = `${value}%`;
    });

    view.must<HTMLInputElement>('#lookahead-control').addEventListener('input', event => {
      const value = Number(inputValue(event));
      playback.setLookAhead(value / 1000);
      const output = view.q('#lookahead-value');
      if (output) output.textContent = `${value} ms`;
    });

    view.must<HTMLInputElement>('#master-volume').addEventListener('input', event => {
      const value = Number(inputValue(event));
      mix.setMasterVolume(value);
      const output = view.q('#master-volume-value');
      if (output) output.textContent = `${value.toFixed(1)} dB`;
    });

    (['low', 'mid', 'high'] as const).forEach(band => {
      view.must<HTMLInputElement>(`#master-eq-${band}`).addEventListener(
        'input',
        event => {
          const value = Number(inputValue(event));
          mix.setMasterEq({ [band]: value });
          const output = view.q(`#master-eq-${band}-value`);
          if (output) output.textContent = `${value.toFixed(1)} dB`;
        }
      );
    });

    Object.keys(this.deps.store.getState().params).forEach(key => {
      const input = view.q<HTMLInputElement>(`#param-${key}`);
      if (!input) return;
      input.addEventListener('input', event => {
        const value = Number(inputValue(event));
        patterns.setParam(key as keyof GenerativeParams, value);
        const output = view.q(`#param-${key}-value`);
        if (output) output.textContent = `${Math.round(value * 100)}%`;
      });
    });

    view.must<HTMLSelectElement>('#root-select').addEventListener('change', event => {
      const value = Number(selectValue(event));
      patterns.setRoot(value);
      this.deps.status.generative(
        `Tonalidad: ${this.deps.catalog.harmonyLabel(this.deps.store.getState().harmony)}.`
      );
    });

    view.must<HTMLSelectElement>('#scale-select').addEventListener('change', event => {
      const value = selectValue(event);
      if (!value || !this.deps.catalog.scales.some(option => option.value === value)) return;
      patterns.setScale(value as ScaleId);
      this.deps.status.generative(
        `Escala: ${this.deps.catalog.harmonyLabel(this.deps.store.getState().harmony)}.`
      );
    });

    view.must<HTMLSelectElement>('#progression-select').addEventListener('change', event => {
      const value = selectValue(event);
      if (!value || !this.deps.catalog.progressions.some(option => option.value === value)) return;
      patterns.setProgression(value as ProgressionId);
      const label =
        this.deps.catalog.progressions.find(option => option.value === value)?.label ?? value;
      this.deps.status.generative(`Progresión: ${label}.`);
    });

    view.must<HTMLInputElement>('#sustain-control').addEventListener('input', event => {
      const value = Number(inputValue(event));
      patterns.setSustain(value / 100);
      const output = view.q('#sustain-value');
      if (output) output.textContent = `${value}%`;
    });

    view.must<HTMLSelectElement>('#automation-target').addEventListener('change', event => {
      const value = selectValue(event);
      if (!value || !this.deps.catalog.automationTargets.some(option => option.value === value)) {
        return;
      }
      automation.setTarget(value as Parameters<AutomationService['setTarget']>[0]);
      this.deps.status.generative(
        `Automatización: ${this.deps.catalog.automationLabel(value as Parameters<AutomationService['setTarget']>[0])}.`
      );
    });

    view.must('#automation-toggle').addEventListener('click', () => automation.toggle());

    this.bindAutomationLane();
    this.bindSceneButtons();
    this.bindGenerativeActions();
    this.bindTrackActions();
    this.bindRouting();
    this.bindArrangement();
    this.bindModulation();
    this.bindLocks();
    this.bindDynamics();
    this.bindChannelActions();
    this.bindClipActions();
    this.bindClipDrag();
    this.bindInsertDrag();
    this.bindSessionActions();
    this.bindHistory();
    this.bindLiveInput();
    this.bindArmWizard();
    this.bindViewControls();
    this.bindKeyboard();
  }

  private bindTrackActions(): void {
    view.must('#add-track').addEventListener('click', () => {
      const machine =
        view.q<HTMLSelectElement>('#add-track-machine')?.value ?? 'sampler';
      this.deps.tracks.addTrack(machine);
    });
    view.must('#remove-track').addEventListener('click', () =>
      this.deps.tracks.removeSelectedTrack()
    );
  }

  private bindRouting(): void {
    const { routing } = this.deps;
    const matrix = view.must('#routing-matrix');

    matrix.addEventListener('input', event => {
      const ref = attr(event, 'data-route-amount');
      const value = inputValue(event);
      if (!ref || value === '') return;
      const target = parseRouteRef(ref);
      if (!target) return;

      const amount = Number(value) / 100;
      routing.setSend(target.trackId, target.busId, amount);
      const output = view.q(`[data-route-value="${ref}"]`);
      if (output) output.textContent = `${Math.round(amount * 100)}%`;
    });

    matrix.addEventListener('click', event => {
      const ref = attr(event, 'data-route-pre');
      if (!ref) return;
      const target = parseRouteRef(ref);
      if (!target) return;

      const track = this.deps.store.getState().kit.tracks[target.trackId];
      const current =
        track?.sends.find(send => send.busId === target.busId)?.preFader ?? false;
      routing.setSendPre(target.trackId, target.busId, !current);
    });

    view.must('#routing-buses').addEventListener('input', event => {
      const busId = attr(event, 'data-bus-return');
      const value = inputValue(event);
      if (!busId || value === '') return;

      const db = Number(value);
      routing.setBusReturn(busId, db);
      const output = view.q(`[data-bus-value="${busId}"]`);
      if (output) output.textContent = `${db.toFixed(1)} dB`;
    });

    view.must('#add-bus').addEventListener('click', () => routing.addBus());
    view.must('#routing-buses').addEventListener('click', event => {
      const busId = attr(event, 'data-bus-remove');
      if (busId) routing.removeBus(busId);
    });

    view.must('#patch-matrix').addEventListener('input', event => {
      const ref = attr(event, 'data-bus-send');
      const value = inputValue(event);
      if (!ref || value === '') return;
      const [fromBusId, toBusId] = ref.split(':');
      if (!fromBusId || !toBusId) return;

      const amount = Number(value) / 100;
      routing.setBusSend(fromBusId, toBusId, amount);
      view.syncRouting(this.deps.store.getState(), this.deps.mix);
    });
  }

  private bindModulation(): void {
    const { modulation } = this.deps;

    view.must('#mod-enabled').addEventListener('click', () => {
      modulation.setEnabled(!this.deps.store.getState().modulation.enabled);
    });

    view.must('#mod-add-route').addEventListener('click', () => {
      const source = view.q<HTMLSelectElement>('#mod-source-select')?.value;
      const target = parseModTarget(
        view.q<HTMLSelectElement>('#mod-target-select')?.value ?? ''
      );
      const amountInput = view.q<HTMLInputElement>('#mod-amount');
      const bipolar =
        view.q('#mod-bipolar')?.getAttribute('aria-pressed') === 'true';
      if (!source || !target) {
        this.deps.status.generative('Elegí una fuente y un destino para la ruta.');
        return;
      }
      modulation.addRoute(
        source,
        target,
        Number(amountInput?.value ?? 50) / 100,
        bipolar
      );
    });

    view.must('#mod-bipolar').addEventListener('click', event => {
      const button = event.currentTarget as HTMLElement;
      const active = button.getAttribute('aria-pressed') === 'true';
      button.setAttribute('aria-pressed', active ? 'false' : 'true');
      button.classList.toggle('is-active', !active);
    });

    view.must('#mod-routes').addEventListener('input', event => {
      const routeId = attr(event, 'data-mod-amount');
      const value = inputValue(event);
      if (!routeId || value === '') return;
      const amount = Number(value) / 100;
      modulation.setRouteAmount(routeId, amount);
      const output = view.q(`[data-mod-value="${routeId}"]`);
      if (output) output.textContent = `${Math.round(amount * 100)}%`;
    });

    view.must('#mod-routes').addEventListener('click', event => {
      const routeId = attr(event, 'data-mod-bipolar');
      if (routeId) {
        const state = this.deps.store.getState();
        const route = state.modulation.routes.find(entry => entry.id === routeId);
        if (route) modulation.setRouteBipolar(routeId, !route.bipolar);
        return;
      }
      const removeId = attr(event, 'data-mod-remove');
      if (removeId) modulation.removeRoute(removeId);
    });

    view.must('#mod-sources').addEventListener('input', event => {
      const macro = attr(event, 'data-mod-macro');
      const value = inputValue(event);
      if (macro && value !== '') {
        modulation.setMacro(macro, Number(value) / 100);
        const output = view.q(`[data-mod-source-value="${macro}"]`);
        if (output) output.textContent = `${value}%`;
        return;
      }

      const lfo = attr(event, 'data-mod-rate');
      if (lfo && value !== '') {
        modulation.setLfoRate(lfo, Number(value));
        const output = view.q(`[data-mod-source-value="${lfo}"]`);
        if (output) output.textContent = `${Number(value).toFixed(2)} Hz`;
      }
    });
  }

  private bindLocks(): void {
    const { locks } = this.deps;
    const stepSelect = view.must<HTMLSelectElement>('#lock-step');

    stepSelect.addEventListener('change', () => {
      view.renderLocks(this.deps.store.getState(), this.deps.mix);
    });

    view.must<HTMLSelectElement>('#lock-target').addEventListener('change', () => {
      view.syncLockValue(this.deps.store.getState(), this.deps.mix);
    });

    view.must<HTMLInputElement>('#lock-value').addEventListener('input', event => {
      const descriptor = view.selectedLockDescriptor(
        this.deps.store.getState(),
        this.deps.mix
      );
      const output = view.q('#lock-value-output');
      if (!descriptor || !output) return;
      if (descriptor.kind === 'track') {
        output.textContent = view.formatTrackLockValue(
          descriptor.paramId,
          Number(inputValue(event))
        );
        return;
      }
      const value = denormalizePluginParam(
        descriptor.param,
        Number(inputValue(event))
      );
      output.textContent = formatPluginParam(descriptor.param, value);
    });

    view.must('#lock-set').addEventListener('click', () => {
      const descriptor = view.selectedLockDescriptor(
        this.deps.store.getState(),
        this.deps.mix
      );
      const input = view.q<HTMLInputElement>('#lock-value');
      if (!descriptor || !input) {
        this.deps.status.generative('Elegí un track y un paso para el lock.');
        return;
      }
      if (descriptor.kind === 'track') {
        locks.setTrackLock(
          descriptor.trackId,
          descriptor.step,
          descriptor.paramId,
          Number(input.value)
        );
        return;
      }
      locks.setLock(
        descriptor.trackId,
        descriptor.step,
        descriptor.insertId,
        descriptor.paramId,
        denormalizePluginParam(descriptor.param, Number(input.value))
      );
    });

    view.must('#lock-list').addEventListener('click', event => {
      if (attr(event, 'data-lock-remove') === null) return;
      const trackId = attr(event, 'data-lock-track');
      const step = Number(attr(event, 'data-lock-step'));
      const scope = attr(event, 'data-lock-scope');
      const insertId = attr(event, 'data-lock-insert');
      const paramId = attr(event, 'data-lock-param');
      if (!trackId || !paramId || !Number.isFinite(step)) return;
      if (scope === 'track') {
        if (paramId !== 'gain' && paramId !== 'pan') return;
        locks.removeTrackLock(trackId, step, paramId);
        return;
      }
      if (!insertId) return;
      locks.removeLock(trackId, step, insertId, paramId);
    });
  }

  private bindDynamics(): void {
    const { patterns } = this.deps;
    const stepSelect = view.must<HTMLSelectElement>('#dyn-step');

    stepSelect.addEventListener('change', () => {
      view.syncDynamics(this.deps.store.getState());
    });

    view.must<HTMLInputElement>('#dyn-velocity').addEventListener('input', event => {
      const state = this.deps.store.getState();
      const step = Number(stepSelect.value) - 1;
      const value = Number(inputValue(event)) / 100;
      patterns.setStepVelocity(state.selected, step, value);
      const output = view.q('#dyn-velocity-value');
      if (output) output.textContent = `${Math.round(value * 100)}%`;
    });

    view.must<HTMLInputElement>('#dyn-probability').addEventListener('input', event => {
      const state = this.deps.store.getState();
      const step = Number(stepSelect.value) - 1;
      const value = Number(inputValue(event)) / 100;
      patterns.setStepProbability(state.selected, step, value);
      const output = view.q('#dyn-probability-value');
      if (output) output.textContent = `${Math.round(value * 100)}%`;
    });

    view.must<HTMLInputElement>('#dyn-ratchets').addEventListener('input', event => {
      const state = this.deps.store.getState();
      const step = Number(stepSelect.value) - 1;
      const value = Number(inputValue(event));
      patterns.setStepRatchets(state.selected, step, value);
      const output = view.q('#dyn-ratchets-value');
      if (output) output.textContent = String(Math.round(value));
    });

    view.must<HTMLInputElement>('#dyn-accent').addEventListener('change', event => {
      const state = this.deps.store.getState();
      const step = Number(stepSelect.value) - 1;
      const value = event.target instanceof HTMLInputElement && event.target.checked;
      patterns.setStepAccent(state.selected, step, value);
      const output = view.q('#dyn-accent-value');
      if (output) output.textContent = value ? 'on' : 'off';
    });

    view.must<HTMLInputElement>('#dyn-slide').addEventListener('change', event => {
      const state = this.deps.store.getState();
      const step = Number(stepSelect.value) - 1;
      const value = event.target instanceof HTMLInputElement && event.target.checked;
      patterns.setStepSlide(state.selected, step, value);
      const output = view.q('#dyn-slide-value');
      if (output) output.textContent = value ? 'on' : 'off';
    });
  }

  private bindAutomationLane(): void {
    const { automation } = this.deps;
    const lane = view.must('#automation-lane');
    let drawing = false;

    const paint = (event: PointerEvent): void => {
      const rect = lane.getBoundingClientRect();
      const index = Math.max(
        0,
        Math.min(15, Math.floor((event.clientX - rect.left) / (rect.width / 16)))
      );
      const bar = view.q(`[data-auto-step="${index}"] .automation-bar`);
      if (!bar) return;
      const barRect = bar.getBoundingClientRect();
      const value = 1 - (event.clientY - barRect.top) / barRect.height;
      automation.setValue(index, value);
      const step = view.q(`[data-auto-step="${index}"]`);
      step?.focus({ preventScroll: true });
    };

    lane.addEventListener('pointerdown', event => {
      if (event.pointerType === 'mouse' && event.button !== 0) return;
      drawing = true;
      lane.setPointerCapture?.(event.pointerId);
      paint(event);
      event.preventDefault();
    });
    lane.addEventListener('pointermove', event => {
      if (drawing) paint(event);
    });
    const stopDrawing = (event: PointerEvent): void => {
      drawing = false;
      if (lane.hasPointerCapture?.(event.pointerId)) {
        lane.releasePointerCapture(event.pointerId);
      }
    };
    lane.addEventListener('pointerup', stopDrawing);
    lane.addEventListener('pointercancel', stopDrawing);

    lane.addEventListener('keydown', event => {
      const step =
        event.target instanceof Element ? event.target.closest('[data-auto-step]') : null;
      if (!step) return;
      const index = Number(step.getAttribute('data-auto-step'));
      const current = this.deps.store.getState().automation.values[index] ?? 0;
      const delta = event.shiftKey ? 0.01 : 0.05;
      let next: number | null = null;

      if (event.key === 'ArrowUp') next = current + delta;
      if (event.key === 'ArrowDown') next = current - delta;
      if (event.key === 'PageUp') next = current + delta * 4;
      if (event.key === 'PageDown') next = current - delta * 4;
      if (event.key === 'Home') next = 0;
      if (event.key === 'End') next = 1;
      if (next === null) return;

      event.preventDefault();
      automation.setValue(index, next);
      if (step instanceof HTMLElement) step.focus({ preventScroll: true });
    });
  }

  private bindSceneButtons(): void {
    const grid = view.q('.scene-grid');
    if (!grid) return;
    grid.addEventListener('click', event => {
      const target =
        event.target instanceof Element
          ? event.target.closest<HTMLElement>('[data-scene]')
          : null;
      const id = target?.getAttribute('data-scene');
      if (id && this.deps.store.getState().scenes[id]) {
        this.deps.scenes.apply(id);
        this.deps.arrangement.recordScene(id);
      }
    });
  }

  private bindGenerativeActions(): void {
    const { patterns } = this.deps;
    view.must('#mutate-selected').addEventListener('click', () => patterns.mutateSelected());
    view.must('#freeze-selected').addEventListener('click', () => patterns.toggleFreeze());
    view.must('#evolve-toggle').addEventListener('click', () =>
      patterns.setEvolve(!this.deps.store.getState().evolve)
    );
    view.must('#new-seed').addEventListener('click', () => patterns.newSeed());
    view.must('#density-up').addEventListener('click', () => patterns.densifySelected());
    view.must('#density-down').addEventListener('click', () => patterns.thinSelected());
    view.must('#rotate-pattern').addEventListener('click', () => patterns.rotateSelected());
    view.must('#copy-pattern').addEventListener('click', () => patterns.copySelected());
    view.must('#paste-pattern').addEventListener('click', () => patterns.pasteSelected());
    view.must('#apply-euclid').addEventListener('click', () => patterns.applyEuclid());
    view.must('#undo-pattern').addEventListener('click', () => patterns.undo());

    const pulses = view.must<HTMLInputElement>('#euclid-pulses');
    pulses.addEventListener('input', event => {
      const value = Number(inputValue(event));
      patterns.setPulses(value);
      const output = view.q('#euclid-pulses-value');
      if (output) output.textContent = String(value);
    });
  }

  private bindChannelActions(): void {
    const { patterns, mix, tracks } = this.deps;

    view.must('#activity-list').addEventListener('click', event => {
      const select = attr(event, 'data-select');
      const patternToggle = attr(event, 'data-pattern-toggle');
      const moveTrack = attr(event, 'data-track-move');
      const moveOffset = attr(event, 'data-track-offset');
      const mute = attr(event, 'data-mute');
      const freeze = attr(event, 'data-freeze');

      if (select) patterns.selectChannel(select);
      else if (patternToggle) tracks.togglePattern(patternToggle);
      else if (moveTrack && moveOffset) {
        tracks.moveTrack(moveTrack, Number(moveOffset));
      } else if (mute) this.toggleMute(mute);
      else if (freeze) patterns.toggleFreeze(freeze);
    });

    view.must('#sequencer-channel-list').addEventListener('click', event => {
      const select = attr(event, 'data-select');
      if (select) patterns.selectChannel(select);
    });

    view.must('#seq-matrix').addEventListener('click', event => {
      const select = attr(event, 'data-select');
      if (select) patterns.selectChannel(select);
    });

    view.must('#radial-editor').addEventListener('click', event => {
      const patternToggle = attr(event, 'data-pattern-toggle');
      if (patternToggle) {
        tracks.togglePattern(patternToggle);
        return;
      }
      const step = attr(event, 'data-radial-step');
      if (step === null) return;
      const channel = attr(event, 'data-pattern-channel');
      if (channel) patterns.toggleStep(channel, Number(step));
    });

    view.must('#sound-channels').addEventListener('input', event => {
      const fader = attr(event, 'data-sound-fader');
      const pan = attr(event, 'data-sound-pan');
      const send = attr(event, 'data-sound-send');
      const sidechainDepth = attr(event, 'data-sidechain-depth');
      const sidechainAttack = attr(event, 'data-sidechain-attack');
      const sidechainRelease = attr(event, 'data-sidechain-release');
      const machineParam = attr(event, 'data-machine-param');
      const machineTrack = attr(event, 'data-machine-track');
      const trackMacro = attr(event, 'data-track-macro');
      const value = inputValue(event);

      if (trackMacro && value !== null) {
        const [trackId, rawIndex] = trackMacro.split(':');
        const index = Number(rawIndex);
        if (!trackId || (index !== 0 && index !== 1)) return;
        const amount = Number(value) / 100;
        tracks.setTrackMacro(trackId, index, amount);
        const output = view.q(`[data-track-macro-value="${trackMacro}"]`);
        if (output) output.textContent = `${Math.round(amount * 100)}%`;
        return;
      }

      if (machineParam && machineTrack) {
        const track = this.deps.store.getState().kit.tracks[machineTrack];
        if (!track) return;
        const param = machinePreset(track.machineId).params.find(
          entry => entry.id === machineParam
        );
        if (!param) return;
        const raw =
          event.target instanceof HTMLSelectElement ? event.target.value : Number(value);
        const output =
          event.target instanceof Element
            ? event.target.closest('.machine-param')?.querySelector('output')
            : null;
        if (output) output.textContent = formatMachineParam(param, raw);
        return;
      }

      if (fader && value !== null) {
        const db = Number(value);
        mix.setChannelVolume(fader, db);
        const output = view.q(`[data-sound-value="${fader}"]`);
        if (output) output.textContent = `${db.toFixed(1)} dB`;
        return;
      }

      if (pan && value !== null) {
        const amount = Number(value);
        mix.setChannelPan(pan, amount);
        const output = view.q(`[data-sound-pan-value="${pan}"]`);
        if (output) {
          output.textContent =
            Math.abs(amount) < 0.005
              ? 'C'
              : `${amount < 0 ? 'L' : 'R'} ${Math.round(Math.abs(amount) * 100)}`;
        }
        return;
      }

      if (send && value !== null) {
        const target = parseRouteRef(send);
        if (!target) return;
        const amount = Number(value) / 100;
        this.deps.routing.setSend(target.trackId, target.busId, amount);
        const output = view.q(`[data-sound-send-value="${send}"]`);
        if (output) output.textContent = `${Math.round(amount * 100)}%`;
        return;
      }

      if (sidechainDepth !== null && value !== null) {
        const depthDb = Number(value);
        mix.setSidechain({ depthDb });
        const output = view.q('[data-sidechain-depth-value]');
        if (output) output.textContent = `${depthDb.toFixed(1)} dB`;
        return;
      }

      if (sidechainAttack !== null && value !== null) {
        const attack = Number(value) / 1000;
        mix.setSidechain({ attack });
        const output = view.q('[data-sidechain-attack-value]');
        if (output) output.textContent = `${Math.round(attack * 1000)} ms`;
        return;
      }

      if (sidechainRelease !== null && value !== null) {
        const release = Number(value) / 1000;
        mix.setSidechain({ release });
        const output = view.q('[data-sidechain-release-value]');
        if (output) output.textContent = `${Math.round(release * 1000)} ms`;
      }
    });

    view.must('#sound-channels').addEventListener('change', event => {
      const sidechainEnabled = attr(event, 'data-sidechain-enabled');
      if (sidechainEnabled !== null && event.target instanceof HTMLInputElement) {
        const enabled = event.target.checked;
        mix.setSidechain({ enabled });
        const output = view.q('[data-sidechain-enabled-value]');
        if (output) output.textContent = enabled ? 'on' : 'off';
        return;
      }

      const renameTrack = attr(event, 'data-track-name');
      if (renameTrack && event.target instanceof HTMLInputElement) {
        tracks.renameTrack(renameTrack, event.target.value);
        return;
      }

      const trackId = attr(event, 'data-machine');
      if (trackId && event.target instanceof HTMLSelectElement) {
        this.deps.tracks.setMachine(trackId, event.target.value);
        return;
      }

      const paramId = attr(event, 'data-machine-param');
      const paramTrack = attr(event, 'data-machine-track');
      if (
        paramId &&
        paramTrack &&
        (event.target instanceof HTMLInputElement ||
          event.target instanceof HTMLSelectElement)
      ) {
        this.deps.tracks.setMachineParam(
          paramTrack,
          paramId,
          event.target instanceof HTMLSelectElement
            ? event.target.value
            : Number(event.target.value)
        );
        return;
      }

      const channel = attr(event, 'data-add-insert');
      if (!channel) return;
      if (!(event.target instanceof HTMLSelectElement) || !event.target.value) return;

      mix.addInsert(channel, event.target.value);
      event.target.value = '';
    });

    view.must('#sound-channels').addEventListener('click', event => {
      const chainSave = attr(event, 'data-chain-save');
      const chainApply = attr(event, 'data-chain-apply');
      const chainRemove = attr(event, 'data-chain-remove');
      if (chainSave !== null) {
        const name =
          view.q<HTMLInputElement>('[data-chain-name]')?.value ?? '';
        const preset = this.deps.deviceChains.saveCurrent(name);
        this.refreshSound();
        if (preset) {
          const select = view.q<HTMLSelectElement>('[data-chain-select]');
          if (select) select.value = preset.id;
          const input = view.q<HTMLInputElement>('[data-chain-name]');
          if (input) input.value = preset.name;
        }
        return;
      }
      if (chainApply !== null) {
        const presetId = view.q<HTMLSelectElement>('[data-chain-select]')?.value;
        if (presetId) {
          this.deps.deviceChains.apply(presetId);
          this.refreshSound();
        }
        return;
      }
      if (chainRemove !== null) {
        const presetId = view.q<HTMLSelectElement>('[data-chain-select]')?.value;
        if (presetId) {
          this.deps.deviceChains.remove(presetId);
          this.refreshSound();
        }
        return;
      }

      const select = attr(event, 'data-sound-select');
      const mute = attr(event, 'data-sound-mute');
      const solo = attr(event, 'data-sound-solo');
      const freeze = attr(event, 'data-sound-freeze');
      const bypass = attr(event, 'data-insert-bypass');
      const remove = attr(event, 'data-insert-remove');
      const move = attr(event, 'data-insert-move');
      const ref = attr(event, 'data-insert-ref');

      if (select) {
        patterns.selectChannel(select);
      } else if (mute) this.toggleMute(mute);
      else if (solo) {
        mix.toggleSolo(solo);
        this.deps.status.generative(
          `${trackName(this.deps.store.getState(), solo)} ${this.deps.store.getState().kit.tracks[solo]?.solo ? 'aislado' : 'en mezcla'}.`
        );
      } else if (freeze) {
        patterns.toggleFreeze(freeze);
      } else if (bypass) {
        const target = parseInsertRef(bypass);
        if (target) {
          const insert = this.deps.store
            .getState()
            .kit.tracks[target.trackId]?.inserts.find(entry => entry.id === target.insertId);
          if (insert) mix.setInsertBypass(target.trackId, target.insertId, !insert.bypass);
        }
      } else if (remove) {
        const target = parseInsertRef(remove);
        if (target) mix.removeInsert(target.trackId, target.insertId);
      } else if (move && ref) {
        const target = parseInsertRef(ref);
        if (target) mix.moveInsert(target.trackId, target.insertId, move === 'up' ? -1 : 1);
      }
    });

    view.must('#sound-bank').addEventListener('click', event => {
      const preview = attr(event, 'data-sound-preview');
      if (preview) {
        this.deps.browser.preview(preview);
        return;
      }
      const favorite = attr(event, 'data-sound-favorite');
      if (favorite) {
        this.deps.browser.toggleFavorite(favorite);
        return;
      }
      if (attr(event, 'data-sound-clear-recent') !== null) {
        this.deps.browser.clearRecent();
        return;
      }
      const presetId = attr(event, 'data-sound-preset');
      if (presetId) {
        tracks.applySoundPreset(presetId);
        this.deps.browser.recordPlayed(presetId);
      }
    });

    view.must<HTMLInputElement>('#sound-bank-search').addEventListener('input', event => {
      const root = view.q<HTMLElement>('#sound-bank');
      if (root) view.filterSoundBank(root, inputValue(event));
    });

    view.must('#sound-bank').addEventListener('dragstart', event => {
      const target =
        event.target instanceof Element
          ? event.target.closest<HTMLElement>('[data-sound-preset]')
          : null;
      const presetId = target?.getAttribute('data-sound-preset');
      if (!presetId || !(event instanceof DragEvent) || !event.dataTransfer) return;
      event.dataTransfer.setData('text/plain', presetId);
      event.dataTransfer.effectAllowed = 'copy';
    });

    view.must('#sound-channels').addEventListener('dragover', event => {
      const row =
        event.target instanceof Element
          ? event.target.closest<HTMLElement>('[data-drop-track]')
          : null;
      if (!row) return;
      event.preventDefault();
      row.classList.add('is-drop-target');
    });

    view.must('#sound-channels').addEventListener('dragleave', event => {
      const row =
        event.target instanceof Element
          ? event.target.closest<HTMLElement>('[data-drop-track]')
          : null;
      row?.classList.remove('is-drop-target');
    });

    view.must('#sound-channels').addEventListener('drop', event => {
      const row =
        event.target instanceof Element
          ? event.target.closest<HTMLElement>('[data-drop-track]')
          : null;
      if (!row || !(event instanceof DragEvent)) return;
      event.preventDefault();
      row.classList.remove('is-drop-target');
      const presetId = event.dataTransfer?.getData('text/plain');
      const trackId = row.getAttribute('data-drop-track');
      if (!presetId || !trackId) return;
      const track = this.deps.store.getState().kit.tracks[trackId];
      if (!track || !canEditTrackSound(track)) {
        this.deps.status.generative(
          'Los tracks de batería se editan desde el kit del wizard.'
        );
        return;
      }
      tracks.applySoundPreset(presetId, trackId);
      this.deps.browser.recordPlayed(presetId);
    });

    view.must('#sound-bank').addEventListener('change', event => {
      if (!(event.target instanceof HTMLSelectElement)) return;
      if (event.target.id !== 'sound-bank-target' || !event.target.value) return;
      patterns.selectChannel(event.target.value);
    });
  }

  private bindClipActions(): void {
    const { clips, patterns, scenes } = this.deps;

    view.must('#session-add-scene').addEventListener('click', () => {
      scenes.addScene();
      this.refreshSession();
    });

    view.must<HTMLSelectElement>('#clip-quantize').addEventListener('change', event => {
      if (!(event.target instanceof HTMLSelectElement)) return;
      clips.setQuantize(event.target.value as ClipQuantize);
    });

    view.must('#clip-stop-all').addEventListener('click', () => {
      clips.stopAll();
      this.refreshSession();
    });

    view.must('#session-grid').addEventListener('click', event => {
      const clip = attr(event, 'data-clip-launch');
      const create = attr(event, 'data-clip-create');
      const stop = attr(event, 'data-clip-stop');
      const scene = attr(event, 'data-scene-launch');
      const select = attr(event, 'data-select');
      const sceneApply = attr(event, 'data-scene-apply');
      const sceneMove = attr(event, 'data-scene-move');
      const sceneOffset = attr(event, 'data-scene-offset');
      const sceneDelete = attr(event, 'data-scene-delete');

      if (sceneApply && this.deps.store.getState().scenes[sceneApply]) {
        scenes.apply(sceneApply);
        this.deps.arrangement.recordScene(sceneApply);
      } else if (sceneMove) {
        scenes.moveScene(sceneMove, Number(sceneOffset ?? 0));
      } else if (sceneDelete) {
        scenes.removeScene(sceneDelete);
      } else if (clip) {
        clips.launchClip(clip);
        const trackId = this.deps.store.getState().clips[clip]?.trackId;
        if (trackId) patterns.selectChannel(trackId);
      } else if (create) {
        const [sceneId, trackId] = create.split(':');
        if (
          sceneId &&
          trackId &&
          this.deps.store.getState().scenes[sceneId]
        ) {
          clips.createClip(sceneId, trackId);
        }
      } else if (stop) {
        clips.stopTrack(stop);
      } else if (scene && this.deps.store.getState().scenes[scene]) {
        clips.launchScene(scene);
        this.deps.arrangement.recordScene(scene);
      } else if (select) {
        patterns.selectChannel(select);
      }
      this.refreshSession();
    });

    view.must('#session-grid').addEventListener('keydown', event => {
      const target =
        event.target instanceof HTMLElement
          ? event.target.closest<HTMLElement>('[data-clip-launch]')
          : null;
      if (!target) return;

      const row = Number(target.dataset.sessionRow);
      const col = Number(target.dataset.sessionCol);
      const clipId = target.getAttribute('data-clip-launch');
      if (!clipId || !Number.isFinite(row) || !Number.isFinite(col)) return;
      const trackId = this.deps.store.getState().clips[clipId]?.trackId;

      if (
        event.altKey &&
        (event.key === 'ArrowUp' || event.key === 'ArrowDown')
      ) {
        event.preventDefault();
        const state = this.deps.store.getState();
        const current = state.clips[clipId];
        if (!current) return;
        const sceneIds = Object.keys(state.scenes);
        const index = sceneIds.indexOf(current.sceneId);
        const target = index + (event.key === 'ArrowUp' ? -1 : 1);
        const targetScene = sceneIds[target];
        if (targetScene) {
          clips.moveClip(clipId, targetScene);
          this.refreshSession();
          this.focusSessionCell(target, col);
        }
        return;
      }

      if (event.key === 'Enter') {
        event.preventDefault();
        if (event.shiftKey) {
          if (trackId) patterns.selectChannel(trackId);
        } else {
          clips.launchClip(clipId);
          if (trackId) patterns.selectChannel(trackId);
        }
        this.refreshSession();
        this.focusSessionCell(row, col);
        return;
      }

      if (event.key === 'Backspace' || event.key === 'Delete') {
        event.preventDefault();
        if (trackId) {
          clips.stopTrack(trackId);
          this.refreshSession();
          this.focusSessionCell(row, col);
        }
        return;
      }

      if (event.key === 'Escape') {
        event.preventDefault();
        if (trackId) {
          clips.cancelPending(trackId);
          this.refreshSession();
          this.focusSessionCell(row, col);
        }
        return;
      }

      const delta = arrowDelta(event.key);
      if (!delta) return;
      event.preventDefault();
      const next = view.q<HTMLButtonElement>(
        `[data-clip-launch][data-session-row="${row + delta[0]}"][data-session-col="${col + delta[1]}"]`
      );
      if (next) {
        this.sessionFocus = { row: row + delta[0], col: col + delta[1] };
        next.focus();
      }
    });

    view.must('#clip-inspector').addEventListener('change', event => {
      const target = event.target;
      if (
        !(target instanceof HTMLSelectElement) &&
        !(target instanceof HTMLInputElement)
      ) {
        return;
      }

      const nameId = attr(event, 'data-clip-name');
      if (nameId && target instanceof HTMLInputElement) {
        clips.renameClip(nameId, target.value);
        this.refreshSession();
        return;
      }

      const colorId = attr(event, 'data-clip-color');
      if (colorId && target instanceof HTMLInputElement) {
        clips.setClipColor(colorId, target.value);
        this.refreshSession();
        return;
      }

      const action = attr(event, 'data-clip-follow-action');
      const after = attr(event, 'data-clip-follow-after');
      if (action) {
        clips.setFollowAction(action, target.value as ClipFollowAction);
      }
      if (after) {
        clips.setFollowAfter(after, Number(target.value));
      }
    });

    view.must('#clip-inspector').addEventListener('click', event => {
      const duplicate = attr(event, 'data-clip-duplicate');
      if (duplicate) {
        clips.duplicateClip(duplicate);
        this.refreshSession();
        return;
      }
      const remove = attr(event, 'data-clip-delete');
      if (remove) {
        clips.removeClip(remove);
        this.refreshSession();
      }
    });
  }

  private bindClipDrag(): void {
    const grid = view.must('#session-grid');
    let dragged: string | null = null;

    const clear = (): void => {
      dragged = null;
      grid
        .querySelectorAll<HTMLElement>('.is-dragging, .is-drop-target')
        .forEach(element =>
          element.classList.remove('is-dragging', 'is-drop-target')
        );
    };

    const dropCell = (event: Event): HTMLElement | null => {
      if (!(event.target instanceof Element) || !dragged) return null;
      const cell = event.target.closest<HTMLElement>(
        '[data-session-scene][data-session-track]'
      );
      if (!cell) return null;
      const trackId = cell.getAttribute('data-session-track');
      const clip = this.deps.store.getState().clips[dragged];
      return clip && trackId === clip.trackId ? cell : null;
    };

    grid.addEventListener('dragstart', event => {
      const target =
        event.target instanceof Element
          ? event.target.closest<HTMLElement>('[data-clip-launch]')
          : null;
      if (!target) return;
      dragged = target.getAttribute('data-clip-launch');
      target.classList.add('is-dragging');
      if (event instanceof DragEvent && event.dataTransfer) {
        event.dataTransfer.effectAllowed = 'move';
        event.dataTransfer.setData('text/plain', dragged ?? '');
      }
    });

    grid.addEventListener('dragover', event => {
      const cell = dropCell(event);
      if (!cell) return;
      event.preventDefault();
      if (event instanceof DragEvent && event.dataTransfer) {
        event.dataTransfer.dropEffect = 'move';
      }
      grid
        .querySelectorAll<HTMLElement>('.is-drop-target')
        .forEach(element => element.classList.remove('is-drop-target'));
      cell.classList.add('is-drop-target');
    });

    grid.addEventListener('dragleave', event => {
      if (!(event.target instanceof Element)) return;
      event.target
        .closest<HTMLElement>('[data-session-scene]')
        ?.classList.remove('is-drop-target');
    });

    grid.addEventListener('drop', event => {
      const cell = dropCell(event);
      if (!cell || !dragged) return;
      event.preventDefault();
      const sceneId = cell.getAttribute('data-session-scene');
      if (sceneId) this.deps.clips.moveClip(dragged, sceneId);
      clear();
      this.refreshSession();
    });

    grid.addEventListener('dragend', clear);
  }

  private bindInsertDrag(): void {
    const container = view.must('#sound-channels');
    let dragged: { trackId: string; insertId: string } | null = null;

    const clear = (): void => {
      dragged = null;
      container
        .querySelectorAll<HTMLElement>('.is-dragging, .is-drop-target')
        .forEach(element =>
          element.classList.remove('is-dragging', 'is-drop-target')
        );
    };

    const targetRow = (event: Event): HTMLElement | null => {
      if (!(event.target instanceof Element)) return null;
      return event.target.closest<HTMLElement>('[data-insert-row]');
    };

    container.addEventListener('dragstart', event => {
      const handle =
        event.target instanceof Element
          ? event.target.closest<HTMLElement>('[data-insert-drag]')
          : null;
      const ref = handle?.getAttribute('data-insert-drag');
      const parsed = ref ? parseInsertRef(ref) : null;
      if (!parsed) return;
      dragged = parsed;
      handle?.closest<HTMLElement>('.insert-row')?.classList.add('is-dragging');
      if (event instanceof DragEvent && event.dataTransfer) {
        event.dataTransfer.effectAllowed = 'move';
        event.dataTransfer.setData('text/plain', ref ?? '');
      }
    });

    container.addEventListener('dragover', event => {
      if (!dragged) return;
      const row = targetRow(event);
      const ref = row?.getAttribute('data-insert-row');
      const target = ref ? parseInsertRef(ref) : null;
      if (!row || !target || target.trackId !== dragged.trackId) return;
      event.preventDefault();
      if (event instanceof DragEvent && event.dataTransfer) {
        event.dataTransfer.dropEffect = 'move';
      }
      container
        .querySelectorAll<HTMLElement>('.is-drop-target')
        .forEach(element => element.classList.remove('is-drop-target'));
      row.classList.add('is-drop-target');
    });

    container.addEventListener('dragleave', event => {
      targetRow(event)?.classList.remove('is-drop-target');
    });

    container.addEventListener('drop', event => {
      const row = targetRow(event);
      const ref = row?.getAttribute('data-insert-row');
      const target = ref ? parseInsertRef(ref) : null;
      if (!dragged || !target || target.trackId !== dragged.trackId) return;
      event.preventDefault();
      const inserts =
        this.deps.store.getState().kit.tracks[dragged.trackId]?.inserts ?? [];
      const targetIndex = inserts.findIndex(
        insert => insert.id === target.insertId
      );
      if (targetIndex >= 0) {
        this.deps.mix.reorderInsert(
          dragged.trackId,
          dragged.insertId,
          targetIndex
        );
      }
      clear();
    });

    container.addEventListener('dragend', clear);
  }

  private bindLiveInput(): void {
    view.must('#midi-connect').addEventListener('click', () => {
      void this.toggleMidi();
    });
  }

  private async toggleMidi(): Promise<void> {
    const button = view.q<HTMLButtonElement>('#midi-connect');
    if (button) button.disabled = true;
    if (this.midiConnected) {
      this.deps.liveInput.disconnect();
      this.midiConnected = false;
    } else {
      this.midiConnected = await this.deps.liveInput.connect();
    }
    if (button) {
      button.disabled = false;
      button.textContent = this.midiConnected ? 'MIDI on' : 'MIDI';
      button.setAttribute(
        'aria-pressed',
        this.midiConnected ? 'true' : 'false'
      );
      button.classList.toggle('is-active', this.midiConnected);
    }
  }

  private bindArrangement(): void {
    const { arrangement } = this.deps;
    view.must('#arrangement-toggle').addEventListener('click', () => arrangement.toggle());
    view.must('#arrangement-record').addEventListener('click', () => {
      arrangement.toggleRecording();
    });
    view.must('#arrangement-reset').addEventListener('click', () => arrangement.reset());
    view.must('#arrangement-loop').addEventListener('click', () => {
      arrangement.setLoop(!this.deps.store.getState().arrangement.loop);
    });
    const setLoopRange = (): void => {
      const start = Number(
        view.q<HTMLSelectElement>('#arrangement-loop-start')?.value ?? 0
      );
      const end = Number(
        view.q<HTMLSelectElement>('#arrangement-loop-end')?.value ?? 1
      );
      arrangement.setLoopRange(start, end);
    };
    view.must('#arrangement-loop-start').addEventListener('change', setLoopRange);
    view.must('#arrangement-loop-end').addEventListener('change', setLoopRange);
    view.must('#arrangement-add').addEventListener('click', () => {
      const scene = view.q<HTMLSelectElement>('#arrangement-scene')?.value;
      if (scene && this.deps.store.getState().scenes[scene]) {
        arrangement.addBlock(scene);
      }
    });

    view.must('#arrangement-timeline').addEventListener('click', event => {
      const remove = attr(event, 'data-arrangement-remove');
      if (remove) {
        arrangement.removeBlock(remove);
        return;
      }
      const move = attr(event, 'data-arrangement-move');
      const block = attr(event, 'data-arrangement-block');
      if (move && block) arrangement.moveBlock(block, Number(move));
    });

    view.must('#arrangement-timeline').addEventListener('change', event => {
      if (!(event.target instanceof HTMLInputElement)) return;
      const block = attr(event, 'data-arrangement-bars');
      if (block) arrangement.setBars(block, Number(event.target.value));
    });
  }

  private bindHistory(): void {
    view.must('#undo-global').addEventListener('click', () => {
      this.deps.clips.clearPending();
      if (this.deps.history.undo()) {
        this.deps.status.generative('Cambio deshecho.');
      }
      this.syncHistoryButtons();
    });
    view.must('#redo-global').addEventListener('click', () => {
      this.deps.clips.clearPending();
      if (this.deps.history.redo()) {
        this.deps.status.generative('Cambio rehecho.');
      }
      this.syncHistoryButtons();
    });
  }

  private syncHistoryButtons(): void {
    view.syncGlobalHistory(
      this.deps.history.canUndo,
      this.deps.history.canRedo
    );
  }

  private bindArmWizard(): void {
    view.must('#arm-wizard-open').addEventListener('click', () => this.openArmWizard(false));

    view.must('#arm-presets').addEventListener('click', event => {
      const presetId = attr(event, 'data-arm-preset');
      if (!presetId) return;
      this.armState = { ...this.armState, presetId };
      this.renderArmWizardState();
    });

    view.must('#arm-scenes').addEventListener('click', event => {
      const scene = attr(event, 'data-arm-scene');
      if (!scene || !isSceneId(scene)) return;
      this.armState = { ...this.armState, sceneId: scene };
      this.renderArmWizardState();
    });

    view.must('#arm-elements').addEventListener('click', event => {
      const trackId = attr(event, 'data-arm-element');
      if (!trackId) return;
      const elements = new Set(this.armState.elements);
      if (elements.has(trackId)) elements.delete(trackId);
      else elements.add(trackId);
      this.armState = { ...this.armState, elements };
      this.renderArmWizardState();
    });

    view.must('#arm-music').addEventListener('change', event => {
      const target = event.target;
      if (
        !(target instanceof HTMLInputElement) &&
        !(target instanceof HTMLSelectElement)
      ) {
        return;
      }
      if (target.id === 'arm-root') {
        this.armState = { ...this.armState, root: Number(target.value) };
      } else if (target.id === 'arm-scale') {
        this.armState = {
          ...this.armState,
          scale: target.value as ScaleId
        };
      } else if (target.id === 'arm-progression') {
        this.armState = {
          ...this.armState,
          progression: target.value as ProgressionId
        };
      } else if (target.id === 'arm-bpm') {
        const bpm = Math.max(40, Math.min(240, Math.round(Number(target.value))));
        this.armState = { ...this.armState, bpm };
      }
      this.renderArmWizardState();
    });

    view.must('#arm-kits').addEventListener('click', event => {
      const removeId = attr(event, 'data-arm-kit-remove');
      if (removeId) {
        this.deps.kits.remove(removeId);
        if (this.armState.kitId === removeId) {
          this.armState = { ...this.armState, kitId: 'custom' };
        }
        this.renderArmWizardState();
        return;
      }

      const kitId = attr(event, 'data-arm-kit');
      if (!kitId) return;
      if (kitId === 'custom') {
        this.armState = { ...this.armState, kitId: 'custom' };
      } else {
        const kit = [...SOUND_KITS, ...this.deps.kits.list()].find(
          entry => entry.id === kitId
        );
        if (kit) {
          this.armState = {
            ...this.armState,
            kitId,
            drumKitId: kit.drumKitId ?? this.armState.drumKitId,
            sounds: this.normalizeArmSounds({ ...kit.sounds })
          };
        }
      }
      this.renderArmWizardState();
    });

    view.must('#arm-machines').addEventListener('click', event => {
      const machineId = attr(event, 'data-arm-machine');
      if (!machineId) return;
      if (!drumKit(machineId)) return;
      const drumTracks = new Set(Object.values(SLOT_TRACK));
      const sounds = Object.fromEntries(
        Object.entries(this.armState.sounds).filter(
          ([trackId]) => !drumTracks.has(trackId)
        )
      );
      Object.assign(sounds, drumKitSoundMap(machineId));
      this.armState = {
        ...this.armState,
        kitId: 'custom',
        drumKitId: machineId,
        sounds: this.normalizeArmSounds(sounds)
      };
      this.renderArmWizardState();
    });

    view.must('#arm-sounds').addEventListener('change', event => {
      if (!(event.target instanceof HTMLSelectElement)) return;
      const trackId = attr(event, 'data-arm-sound');
      if (!trackId) return;
      this.armState = {
        ...this.armState,
        kitId: 'custom',
        sounds: { ...this.armState.sounds, [trackId]: event.target.value }
      };
      this.renderArmWizardState();
    });

    view.must('#arm-kit-save').addEventListener('click', () => {
      const input = view.q<HTMLInputElement>('#arm-kit-name');
      const name = input?.value.trim() || 'Mi kit';
      const id = `user-${Date.now().toString(36)}`;
      this.deps.kits.save({
        id,
        name,
        description: 'Kit propio',
        sounds: { ...this.armState.sounds },
        builtin: false
      });
      this.armState = { ...this.armState, kitId: id };
      if (input) input.value = '';
      this.renderArmWizardState();
    });

    view.must('#arm-build').addEventListener('click', () => void this.buildArmSet());
    view.must('#arm-load-session').addEventListener('click', () => {
      if (this.deps.sessions.load()) this.closeArmWizard();
    });
    view.must('#arm-cancel').addEventListener('click', () => {
      if (!this.armRequired) this.closeArmWizard();
    });
  }

  private normalizeArmSounds(
    input: Readonly<Record<string, string>>
  ): Record<string, string> {
    const sounds = { ...input };
    view.ARM_ELEMENT_IDS.forEach(trackId => {
      if (sounds[trackId]) return;
      const fallback = soundOptionsForTrack(trackId)[0];
      if (fallback) sounds[trackId] = fallback.id;
    });
    return sounds;
  }

  private openArmWizard(required: boolean): void {
    this.armRequired = required;
    this.armState = {
      ...this.armState,
      canCancel: !required,
      hasSavedSession: this.deps.sessions.hasSaved(),
      sounds: this.normalizeArmSounds(this.armState.sounds)
    };
    this.renderArmWizardState();
    const wizard = view.q<HTMLElement>('#arm-wizard');
    if (wizard) wizard.hidden = false;
    this.setShellInert(true);
    requestAnimationFrame(() =>
      view.q<HTMLButtonElement>('#arm-presets .arm-card')?.focus()
    );
  }

  private closeArmWizard(): void {
    const wizard = view.q<HTMLElement>('#arm-wizard');
    if (wizard) wizard.hidden = true;
    this.setShellInert(false);
    this.armRequired = false;
    this.armState = { ...this.armState, canCancel: true };
    view.q<HTMLButtonElement>('#transport-play')?.focus();
  }

  private renderArmWizardState(): void {
    const kits: SoundKit[] = [...SOUND_KITS, ...this.deps.kits.list()];
    view.renderArmWizard(
      this.deps.store.getState(),
      this.deps.catalog,
      this.deps.presets.list(),
      kits,
      this.armState
    );
  }

  private async buildArmSet(): Promise<void> {
    const build = view.q<HTMLButtonElement>('#arm-build');
    const statusLabel = view.q('#arm-status');
    if (build) build.disabled = true;
    if (statusLabel) statusLabel.textContent = 'Armando set…';

    const loaded = await this.deps.presets.load(this.armState.presetId);
    if (!loaded) {
      if (build) build.disabled = false;
      if (statusLabel) statusLabel.textContent = 'No se pudo cargar la base. Probá otra.';
      return;
    }

    this.deps.scenes.apply(this.armState.sceneId);
    this.deps.patterns.setHarmony({
      root: this.armState.root,
      scale: this.armState.scale,
      progression: this.armState.progression
    });
    this.deps.playback.setBpm(this.armState.bpm);

    view.ARM_ELEMENT_IDS.forEach(trackId => {
      if (!this.armState.elements.has(trackId)) return;
      const soundId = this.armState.sounds[trackId];
      if (soundId) this.deps.tracks.applyKitSound(trackId, soundId);
    });

    const state = this.deps.store.getState();
    view.ARM_ELEMENT_IDS.forEach(trackId => {
      if (!state.kit.tracks[trackId]) return;
      this.deps.mix.setTrackMuted(
        trackId,
        !this.armState.elements.has(trackId)
      );
    });

    const preset = this.deps.presets
      .list()
      .find(entry => entry.id === this.armState.presetId);
    const mixPreset = view.q<HTMLSelectElement>('#mix-preset');
    if (mixPreset) mixPreset.value = this.armState.presetId;
    void this.deps.playback.prepare().catch(() => {
      // El primer play vuelve a intentar preparar el motor.
    });
    this.closeArmWizard();
    this.setView('session');
    this.deps.status.generative(
      `Set armado: ${preset?.name ?? this.armState.presetId} · ${this.deps.catalog.sceneLabel(this.armState.sceneId)} · ${this.armState.elements.size} elementos.`
    );
  }

  private setShellInert(inert: boolean): void {
    const shell = view.q<HTMLElement>('.espiral-shell');
    if (!shell) return;
    if (inert) shell.setAttribute('inert', '');
    else shell.removeAttribute('inert');
  }

  private bindSessionActions(): void {
    const { sessions, exportService } = this.deps;
    view.must('#save-session').addEventListener('click', () => sessions.save());
    view.must('#load-session').addEventListener('click', () => sessions.load());
    view.must('#export-session').addEventListener('click', () => sessions.export());
    const exportAudio = view.must<HTMLButtonElement>('#export-audio');
    exportAudio.addEventListener('click', () => {
      const sceneValue =
        view.q<HTMLSelectElement>('#export-scene')?.value ?? '';
      const bars = Number(
        view.q<HTMLSelectElement>('#export-bars')?.value ?? 8
      );
      const tailSeconds = Number(
        view.q<HTMLSelectElement>('#export-tail')?.value ?? 2
      );
      exportAudio.disabled = true;
      void exportService
        .exportWav({
          bars,
          tailSeconds,
          scene: sceneValue ? (sceneValue as SceneId) : null
        })
        .finally(() => {
          exportAudio.disabled = false;
        });
    });
    view.must('#import-session').addEventListener('click', () =>
      view.must<HTMLInputElement>('#import-file').click()
    );

    const importFile = view.must<HTMLInputElement>('#import-file');
    importFile.addEventListener('change', () => {
      const file = importFile.files?.[0];
      if (file) void sessions.import(file);
      importFile.value = '';
    });

    const audioButton = view.must<HTMLButtonElement>('#import-audio');
    const audioFile = view.must<HTMLInputElement>('#import-audio-file');
    audioButton.addEventListener('click', () => audioFile.click());
    audioFile.addEventListener('change', () => {
      const file = audioFile.files?.[0];
      if (!file) return;
      audioFile.disabled = true;
      this.deps.status.session('Importando audio…');
      void this.deps.files
        .readFileAsDataUrl(file)
        .then(dataUrl => this.deps.tracks.addAudioTrack(file.name, dataUrl))
        .catch(error => {
          console.error(error);
          this.deps.status.session('No se pudo importar el audio.');
        })
        .finally(() => {
          audioFile.disabled = false;
          audioFile.value = '';
        });
    });

    view.must<HTMLSelectElement>('#mix-preset').addEventListener('change', event => {
      const id = selectValue(event);
      if (id && id !== '-1') void this.deps.presets.load(id);
    });
  }

  private bindViewControls(): void {
    view.qa<HTMLButtonElement>('.view-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        const id = tab.getAttribute('data-view');
        if (isView(id)) this.setView(id);
      });
    });

    const tablist = view.q('.view-switch');
    tablist?.addEventListener('keydown', event => {
      if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
      const tabs = view.qa<HTMLButtonElement>('.view-tab');
      const current = tabs.indexOf(document.activeElement as HTMLButtonElement);
      if (current < 0) return;
      event.preventDefault();
      let next = current;
      if (event.key === 'ArrowLeft') next = (current - 1 + tabs.length) % tabs.length;
      if (event.key === 'ArrowRight') next = (current + 1) % tabs.length;
      if (event.key === 'Home') next = 0;
      if (event.key === 'End') next = tabs.length - 1;
      const tab = tabs[next];
      if (!tab) return;
      tab.focus();
      const id = tab.getAttribute('data-view');
      if (isView(id)) this.setView(id);
    });
  }

  private bindKeyboard(): void {
    document.addEventListener('keydown', event => {
      const target = event.target instanceof Element ? event.target : null;
      if (target?.closest('input, select, textarea, [contenteditable]')) return;

      if (event.code === 'Space') {
        if (event.repeat) return;
        event.preventDefault();
        const state = this.deps.store.getState();
        if (state.transport.playing || state.transport.preparing) this.deps.playback.stop();
        else void this.deps.playback.start();
        return;
      }

      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'z') {
        event.preventDefault();
        this.deps.clips.clearPending();
        const changed = event.shiftKey
          ? this.deps.history.redo()
          : this.deps.history.undo();
        if (changed) {
          this.deps.status.generative(
            event.shiftKey ? 'Cambio rehecho.' : 'Cambio deshecho.'
          );
        }
        this.syncHistoryButtons();
        return;
      }

      if (event.key === '1') this.setView('performance');
      else if (event.key === '2') this.setView('session');
      else if (event.key === '3') this.setView('arrangement');
      else if (event.key === '4') this.setView('sequencer');
      else if (event.key === '5') this.setView('sound');
      else if (event.key === '6') this.setView('routing');
      else if (event.key === '7') this.setView('modulation');
      else if (event.key.toLowerCase() === 'r') this.deps.patterns.mutateSelected();
      else if (event.key.toLowerCase() === 'f') this.deps.patterns.toggleFreeze();
      else if (event.key.toLowerCase() === 'm') this.toggleMute(this.deps.store.getState().selected);
      else if (event.key.toLowerCase() === 'z') this.deps.patterns.undo();
    });

    window.addEventListener('hashchange', () => {
      const id = (location.hash || '').replace('#', '');
      if (isView(id)) this.setView(id);
    });
  }

  private refreshSession(): void {
    view.renderSession(this.deps.store.getState(), this.deps.runtime);
    this.dirtyViews.delete('session');
  }

  private scheduleRender(state: InstrumentState): void {
    this.pendingRenderState = state;
    this.meterTargetsDirty = true;
    if (this.renderFrame !== null) return;
    this.renderFrame = requestAnimationFrame(() => {
      this.renderFrame = null;
      const next = this.pendingRenderState;
      this.pendingRenderState = null;
      if (!next) return;
      view.renderActiveView(
        next,
        this.deps.catalog,
        this.deps.mix,
        this.currentView,
        {
          runtime: this.deps.runtime,
          chains: this.deps.deviceChains.list()
        }
      );
      this.dirtyViews.delete(this.currentView);
      this.restoreSessionFocus();
    });
  }

  private cancelScheduledRender(): void {
    if (this.renderFrame !== null) {
      cancelAnimationFrame(this.renderFrame);
      this.renderFrame = null;
    }
    this.pendingRenderState = null;
  }

  private refreshSound(): void {
    this.meterTargetsDirty = true;
    view.renderSound(
      this.deps.store.getState(),
      this.deps.catalog,
      this.deps.mix,
      this.deps.deviceChains.list()
    );
    this.dirtyViews.delete('sound');
  }

  private focusSessionCell(row: number, col: number): void {
    this.sessionFocus = { row, col };
    this.restoreSessionFocus();
  }

  private restoreSessionFocus(): void {
    const focus = this.sessionFocus;
    const grid = view.q<HTMLElement>('#session-grid');
    if (!focus || !grid || this.currentView !== 'session') return;
    const active = document.activeElement;
    if (
      active instanceof HTMLElement &&
      active !== document.body &&
      active.isConnected
    ) {
      return;
    }
    view
      .q<HTMLButtonElement>(
        `[data-clip-launch][data-session-row="${focus.row}"][data-session-col="${focus.col}"]`
      )
      ?.focus({ preventScroll: true });
  }

  private toggleMute(trackId: string): void {
    this.deps.mix.toggleMute(trackId);
    this.deps.status.generative(
      `${trackName(this.deps.store.getState(), trackId)} ${this.deps.store.getState().kit.tracks[trackId]?.muted ? 'silenciado' : 'audible'}.`
    );
  }

  private setView(id: ViewId, options: { scroll?: boolean } = {}): void {
    this.currentView = id;
    this.cancelScheduledRender();
    document.body.dataset.view = id;
    view.qa<HTMLButtonElement>('.view-tab').forEach(tab => {
      const active = tab.getAttribute('data-view') === id;
      tab.setAttribute('aria-selected', active ? 'true' : 'false');
      tab.classList.toggle('is-active', active);
    });
    (['performance', 'session', 'arrangement', 'sequencer', 'sound', 'routing', 'modulation'] as const).forEach(name => {
      const section = view.q(`#view-${name}`);
      if (section) section.hidden = name !== id;
    });

    if (this.dirtyViews.has(id)) {
      this.meterTargetsDirty = true;
      const state = this.deps.store.getState();
      view.renderActiveView(
        state,
        this.deps.catalog,
        this.deps.mix,
        id,
        {
          runtime: this.deps.runtime,
          chains: this.deps.deviceChains.list()
        }
      );
      this.dirtyViews.delete(id);
      this.restoreSessionFocus();
    } else {
      const state = this.deps.store.getState();
      view.syncTransport(state);
      if (id === 'performance' || id === 'sequencer') {
        view.syncPlayhead(state);
      }
    }

    if (options.scroll !== false) this.revealView(id);
    if (history.replaceState) history.replaceState(null, '', `#${id}`);
  }

  private revealView(id: ViewId): void {
    const dock = view.q('.instrument-dock');
    const section = view.q(`#view-${id}`);
    if (!dock || !section) return;
    if (window.getComputedStyle(dock).position !== 'sticky') return;
    const dockBottom = dock.getBoundingClientRect().bottom;
    const top = section.getBoundingClientRect().top;
    if (top >= dockBottom + 1) return;
    const target = Math.max(0, window.scrollY + top - dockBottom - 16);
    const reduce =
      window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
    window.scrollTo({ top: target, behavior: reduce ? 'auto' : 'smooth' });
  }
}

function isView(value: unknown): value is ViewId {
  return (
    value === 'performance' ||
    value === 'session' ||
    value === 'arrangement' ||
    value === 'sequencer' ||
    value === 'sound' ||
    value === 'routing' ||
    value === 'modulation'
  );
}

function arrowDelta(key: string): readonly [number, number] | null {
  if (key === 'ArrowLeft') return [0, -1];
  if (key === 'ArrowRight') return [0, 1];
  if (key === 'ArrowUp') return [-1, 0];
  if (key === 'ArrowDown') return [1, 0];
  return null;
}

function isSceneId(value: string): value is SceneId {
  return (
    value === 'umbral' ||
    value === 'deriva' ||
    value === 'pulso' ||
    value === 'caos'
  );
}

function parseInsertRef(
  value: string | null
): { trackId: string; insertId: string } | null {
  if (!value) return null;
  const [trackId, insertId] = value.split(':');
  if (!trackId || !insertId) return null;
  return { trackId, insertId };
}

function parseRouteRef(
  value: string | null
): { trackId: string; busId: string } | null {
  if (!value) return null;
  const [trackId, busId] = value.split(':');
  if (!trackId || !busId) return null;
  return { trackId, busId };
}

function parseModTarget(
  value: string
): { trackId: string; insertId: string; paramId: string } | null {
  const [trackId, insertId, paramId] = value.split(':');
  if (!trackId || !insertId || !paramId) return null;
  return { trackId, insertId, paramId };
}

function sameNonTransport(a: InstrumentState, b: InstrumentState): boolean {
  return (
    a.selected === b.selected &&
    a.scene === b.scene &&
    a.seed === b.seed &&
    a.params === b.params &&
    a.harmony === b.harmony &&
    a.scenes === b.scenes &&
    a.pattern === b.pattern &&
    a.automation === b.automation &&
    a.arrangement === b.arrangement &&
    a.modulation === b.modulation &&
    a.kit === b.kit &&
    a.masterVolume === b.masterVolume &&
    a.clips === b.clips &&
    a.activeClips === b.activeClips &&
    a.clipQuantize === b.clipQuantize &&
    a.favorites === b.favorites &&
    a.recentSounds === b.recentSounds &&
    a.history === b.history &&
    a.clipboard === b.clipboard &&
    a.mutationCount === b.mutationCount &&
    a.evolveCount === b.evolveCount &&
    a.evolve === b.evolve
  );
}

function isAutomationValueChange(a: InstrumentState, b: InstrumentState): boolean {
  return (
    a.automation !== b.automation &&
    a.automation.enabled === b.automation.enabled &&
    a.automation.target === b.automation.target &&
    a.selected === b.selected &&
    a.scene === b.scene &&
    a.seed === b.seed &&
    a.params === b.params &&
    a.harmony === b.harmony &&
    a.scenes === b.scenes &&
    a.pattern === b.pattern &&
    a.transport === b.transport &&
    a.arrangement === b.arrangement &&
    a.modulation === b.modulation &&
    a.kit === b.kit &&
    a.masterVolume === b.masterVolume &&
    a.clips === b.clips &&
    a.activeClips === b.activeClips &&
    a.clipQuantize === b.clipQuantize &&
    a.favorites === b.favorites &&
    a.recentSounds === b.recentSounds
  );
}

function isMixValueChange(a: InstrumentState, b: InstrumentState): boolean {
  const structuralMix =
    Object.keys(a.kit.tracks).some(id => {
      const left = a.kit.tracks[id];
      const right = b.kit.tracks[id];
      return left?.muted !== right?.muted || left?.solo !== right?.solo;
    }) || insertStructureChanged(a, b) || machineChanged(a, b);

  return (
    !structuralMix &&
    (a.kit !== b.kit || a.masterVolume !== b.masterVolume) &&
    a.selected === b.selected &&
    a.scene === b.scene &&
    a.seed === b.seed &&
    a.params === b.params &&
    a.harmony === b.harmony &&
    a.scenes === b.scenes &&
    a.pattern === b.pattern &&
    a.automation === b.automation &&
    a.arrangement === b.arrangement &&
    a.modulation === b.modulation &&
    a.transport === b.transport &&
    a.clips === b.clips &&
    a.activeClips === b.activeClips &&
    a.clipQuantize === b.clipQuantize &&
    a.favorites === b.favorites &&
    a.recentSounds === b.recentSounds &&
    a.history === b.history &&
    a.clipboard === b.clipboard &&
    a.mutationCount === b.mutationCount &&
    a.evolveCount === b.evolveCount &&
    a.evolve === b.evolve
  );
}

function isModulationChange(a: InstrumentState, b: InstrumentState): boolean {
  return (
    a.modulation !== b.modulation &&
    a.selected === b.selected &&
    a.scene === b.scene &&
    a.seed === b.seed &&
    a.params === b.params &&
    a.harmony === b.harmony &&
    a.scenes === b.scenes &&
    a.pattern === b.pattern &&
    a.automation === b.automation &&
    a.arrangement === b.arrangement &&
    a.transport === b.transport &&
    a.kit === b.kit &&
    a.masterVolume === b.masterVolume &&
    a.clips === b.clips &&
    a.activeClips === b.activeClips &&
    a.clipQuantize === b.clipQuantize &&
    a.favorites === b.favorites &&
    a.recentSounds === b.recentSounds &&
    a.history === b.history &&
    a.clipboard === b.clipboard &&
    a.mutationCount === b.mutationCount &&
    a.evolveCount === b.evolveCount &&
    a.evolve === b.evolve
  );
}

function modulationStructureChanged(
  a: ModulationState,
  b: ModulationState
): boolean {
  if (a.sources.length !== b.sources.length) return true;
  if (a.sources.some((source, index) => source.id !== b.sources[index]?.id)) {
    return true;
  }
  if (a.routes.length !== b.routes.length) return true;
  return a.routes.some((route, index) => {
    const other = b.routes[index];
    return (
      !other ||
      route.id !== other.id ||
      route.sourceId !== other.sourceId ||
      route.target.trackId !== other.target.trackId ||
      route.target.insertId !== other.target.insertId ||
      route.target.paramId !== other.target.paramId
    );
  });
}

function insertStructureChanged(a: InstrumentState, b: InstrumentState): boolean {
  return Object.keys(a.kit.tracks).some(id => {
    const left = a.kit.tracks[id]?.inserts ?? [];
    const right = b.kit.tracks[id]?.inserts ?? [];
    if (left.length !== right.length) return true;
    return left.some((insert, index) => {
      const other = right[index];
      return (
        !other ||
        insert.id !== other.id ||
        insert.pluginId !== other.pluginId ||
        insert.bypass !== other.bypass
      );
    });
  });
}

function machineChanged(a: InstrumentState, b: InstrumentState): boolean {
  return Object.keys(a.kit.tracks).some(id => {
    const left = a.kit.tracks[id];
    const right = b.kit.tracks[id];
    return (
      left !== undefined &&
      right !== undefined &&
      (left.machineId !== right.machineId || left.machine !== right.machine)
    );
  });
}

function attr(event: Event, name: string): string | null {
  const target = event.target;
  if (!(target instanceof Element)) return null;
  return target.closest(`[${name}]`)?.getAttribute(name) ?? null;
}

function inputValue(event: Event): string {
  return event.target instanceof HTMLInputElement ? event.target.value : '';
}

function selectValue(event: Event): string | null {
  return event.target instanceof HTMLSelectElement ? event.target.value : null;
}

function trackName(state: InstrumentState, id: string): string {
  return state.kit.tracks[id]?.name ?? id;
}
