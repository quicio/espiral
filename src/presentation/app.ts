import type { GenerativeParams, InstrumentState, ProgressionId, ScaleId, SceneId } from '../domain/models';
import type { ModulationState } from '../domain/modulation';
import { formatMachineParam, machinePreset } from '../domain/machines';
import { denormalizePluginParam } from '../domain/plugin';
import type { StatusPort } from '../domain/ports';
import type { AutomationService } from '../application/automation';
import type { ExportService } from '../application/export';
import type { MixService } from '../application/mix';
import type { LocksService } from '../application/locks';
import type { ModulationService } from '../application/modulation';
import type { PatternService } from '../application/patterns';
import type { PlaybackService } from '../application/playback';
import type { PresetService } from '../application/presets';
import type { RoutingService } from '../application/routing';
import type { SceneService } from '../application/scenes';
import type { SessionService } from '../application/sessions';
import type { Store } from '../application/store';
import type { TrackService } from '../application/tracks';
import * as view from './render';
import { CpuMeter } from './cpu-meter';
import { formatPluginParam } from './plugin-controls';

type ViewId = 'performance' | 'sequencer' | 'sound' | 'routing' | 'modulation';

interface PresentationDependencies {
  readonly store: Store;
  readonly catalog: view.Catalog;
  readonly playback: PlaybackService;
  readonly patterns: PatternService;
  readonly automation: AutomationService;
  readonly mix: MixService;
  readonly sessions: SessionService;
  readonly presets: PresetService;
  readonly scenes: SceneService;
  readonly tracks: TrackService;
  readonly routing: RoutingService;
  readonly modulation: ModulationService;
  readonly locks: LocksService;
  readonly exportService: ExportService;
  readonly status: StatusPort;
}

export class EspiralApp {
  private lastState: InstrumentState | null = null;
  private unsubscribe: (() => void) | null = null;
  private meterFrame: number | null = null;

  constructor(private readonly deps: PresentationDependencies) {}

  mount(): void {
    this.renderCatalog();
    this.renderPresets();
    this.bindControls();

    this.lastState = this.deps.store.getState();
    this.unsubscribe = this.deps.store.subscribe(state => this.handleState(state));

    view.renderAll(this.lastState, this.deps.catalog, this.deps.mix);
    const initial = (location.hash || '').replace('#', '');
    this.setView(isView(initial) ? initial : 'performance', { scroll: false });
    this.deps.status.instrument('Detenido');
    this.deps.status.generative(
      `Semilla ${this.lastState.seed} · escena ${this.deps.catalog.sceneLabel(this.lastState.scene)}.`
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
  }

  private startMeter(): void {
    let clipping = false;
    const cpuMeter = new CpuMeter();
    const clipButton = view.q<HTMLButtonElement>('#master-clip');
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

    const tick = (): void => {
      const db = this.deps.mix.getMasterLevel();
      const level = Number.isFinite(db) ? Math.max(0, Math.min(1, (db + 60) / 60)) : 0;
      const fill = view.q('#master-meter-fill');
      if (fill) fill.style.setProperty('--level', level.toFixed(3));

      if (db > -0.5 && !clipping) {
        clipping = true;
        clipButton?.classList.add('is-clip');
        clipButton?.setAttribute('aria-pressed', 'true');
      }

      const cpu = cpuMeter.sample(performance.now(), this.deps.mix.getAudioStats());
      const cpuFill = view.q('#cpu-meter-fill');
      if (cpuFill) cpuFill.style.setProperty('--level', cpu.toFixed(3));
      const cpuValue = view.q('#cpu-value');
      if (cpuValue) cpuValue.textContent = `${Math.round(cpu * 100)}%`;

      view.qa('[data-track-meter]').forEach(element => {
        const trackId = element.getAttribute('data-track-meter');
        if (!trackId) return;
        this.updateNodeMeter('track', trackId, this.deps.mix.getTrackLevel(trackId));
      });
      view.qa('[data-bus-meter]').forEach(element => {
        const busId = element.getAttribute('data-bus-meter');
        if (!busId) return;
        this.updateNodeMeter('bus', busId, this.deps.mix.getBusLevel(busId));
      });

      this.meterFrame = requestAnimationFrame(tick);
    };

    this.meterFrame = requestAnimationFrame(tick);
  }

  private updateNodeMeter(kind: 'track' | 'bus', id: string, db: number): void {
    const level = Number.isFinite(db)
      ? Math.max(0, Math.min(1, (db + 60) / 60))
      : 0;
    const fill = view.q(`[data-${kind}-meter-fill="${id}"]`);
    if (fill) fill.style.setProperty('--level', level.toFixed(3));

    if (db > -0.5) {
      const clip = view.q(`[data-meter-reset="${kind}:${id}"]`);
      clip?.classList.add('is-clip');
      clip?.setAttribute('aria-pressed', 'true');
    }
  }

  private handleState(state: InstrumentState): void {
    const previous = this.lastState;
    this.lastState = state;
    if (!previous) {
      view.renderAll(state, this.deps.catalog, this.deps.mix);
      return;
    }

    if (sameNonTransport(previous, state)) {
      view.syncTransport(state);
      view.updatePatternClasses(state, this.deps.catalog);
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
      view.updatePatternClasses(state, this.deps.catalog);
      return;
    }

    view.renderAll(state, this.deps.catalog, this.deps.mix, {
      sound: previous.kit !== state.kit || previous.masterVolume !== state.masterVolume
    });
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

    view.must<HTMLInputElement>('#bpm-control').addEventListener('input', event => {
      const value = Number(inputValue(event));
      playback.setBpm(value);
      const output = view.q('#bpm-value');
      if (output) output.textContent = String(value);
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

    view.must<HTMLInputElement>('#master-volume').addEventListener('input', event => {
      const value = Number(inputValue(event));
      mix.setMasterVolume(value);
      const output = view.q('#master-volume-value');
      if (output) output.textContent = `${value.toFixed(1)} dB`;
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
    this.bindModulation();
    this.bindLocks();
    this.bindDynamics();
    this.bindChannelActions();
    this.bindSessionActions();
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
    view.qa<HTMLButtonElement>('[data-scene]').forEach(button => {
      button.addEventListener('click', () => {
        const id = button.getAttribute('data-scene');
        if (id && this.deps.catalog.scenes.some(scene => scene.id === id)) {
          this.deps.scenes.apply(id as SceneId);
        }
      });
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
      const mute = attr(event, 'data-mute');
      const freeze = attr(event, 'data-freeze');

      if (select) patterns.selectChannel(select);
      else if (mute) this.toggleMute(mute);
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
      const step = attr(event, 'data-radial-step');
      if (step === null) return;
      const channel = attr(event, 'data-pattern-channel');
      if (channel) patterns.toggleStep(channel, Number(step));
    });

    view.must('#sound-channels').addEventListener('input', event => {
      const fader = attr(event, 'data-sound-fader');
      const pan = attr(event, 'data-sound-pan');
      const send = attr(event, 'data-sound-send');
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
      }
    });

    view.must('#sound-channels').addEventListener('change', event => {
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
      const mute = attr(event, 'data-sound-mute');
      const solo = attr(event, 'data-sound-solo');
      const freeze = attr(event, 'data-sound-freeze');
      const bypass = attr(event, 'data-insert-bypass');
      const remove = attr(event, 'data-insert-remove');
      const move = attr(event, 'data-insert-move');
      const ref = attr(event, 'data-insert-ref');

      if (mute) this.toggleMute(mute);
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
        if (target?.closest('button, a')) return;
        event.preventDefault();
        const state = this.deps.store.getState();
        if (state.transport.playing || state.transport.preparing) this.deps.playback.stop();
        else void this.deps.playback.start();
        return;
      }

      if (event.key === '1') this.setView('performance');
      else if (event.key === '2') this.setView('sequencer');
      else if (event.key === '3') this.setView('sound');
      else if (event.key === '4') this.setView('routing');
      else if (event.key === '5') this.setView('modulation');
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

  private toggleMute(trackId: string): void {
    this.deps.mix.toggleMute(trackId);
    this.deps.status.generative(
      `${trackName(this.deps.store.getState(), trackId)} ${this.deps.store.getState().kit.tracks[trackId]?.muted ? 'silenciado' : 'audible'}.`
    );
  }

  private setView(id: ViewId, options: { scroll?: boolean } = {}): void {
    view.qa<HTMLButtonElement>('.view-tab').forEach(tab => {
      const active = tab.getAttribute('data-view') === id;
      tab.setAttribute('aria-selected', active ? 'true' : 'false');
      tab.classList.toggle('is-active', active);
    });
    (['performance', 'sequencer', 'sound', 'routing', 'modulation'] as const).forEach(name => {
      const section = view.q(`#view-${name}`);
      if (section) section.hidden = name !== id;
    });

    const state = this.deps.store.getState();
    if (id === 'performance') view.renderPerformance(state, this.deps.catalog);
    if (id === 'sequencer') {
      view.renderSequencer(state, this.deps.catalog);
      view.renderAutomation(state, this.deps.catalog);
    }
    if (id === 'sound') view.renderSound(state, this.deps.catalog, this.deps.mix);
    if (id === 'routing') view.renderRouting(state, this.deps.mix);
    if (id === 'modulation') view.renderModulation(state, this.deps.mix);
    view.updatePatternClasses(state, this.deps.catalog);

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
    value === 'sequencer' ||
    value === 'sound' ||
    value === 'routing' ||
    value === 'modulation'
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
    a.modulation === b.modulation &&
    a.kit === b.kit &&
    a.masterVolume === b.masterVolume &&
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
    a.modulation === b.modulation &&
    a.kit === b.kit &&
    a.masterVolume === b.masterVolume
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
    a.modulation === b.modulation &&
    a.transport === b.transport &&
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
    a.transport === b.transport &&
    a.kit === b.kit &&
    a.masterVolume === b.masterVolume &&
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
