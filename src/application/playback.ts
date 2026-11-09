import type { InstrumentState } from '../domain/models';
import { locksAt, normalizeStep, patternStep } from '../domain/pattern';
import type {
  AudioEnginePort,
  AutomationRunner,
  ClockPort,
  GenerativePort,
  PatternEvolver,
  StatusPort
} from '../domain/ports';
import { PlaybackRuntime } from './runtime';
import type { Store } from './store';
import {
  bassVoice,
  dronePlaybackRate,
  hihatVoice,
  leadNote,
  noteDuration,
  padChord,
  percPlaybackRate,
  timingOffset
} from './voices';

export class PlaybackService {
  private readonly unsubscribe: () => void;
  private running = false;
  private startId = 0;
  private readonly activeLocks = new Map<string, AppliedLock>();

  constructor(
    private readonly store: Store,
    private readonly clock: ClockPort,
    private readonly engine: AudioEnginePort,
    private readonly generative: GenerativePort,
    private readonly status: StatusPort,
    private readonly automation: AutomationRunner,
    private readonly patterns: PatternEvolver,
    private readonly runtime: PlaybackRuntime
  ) {
    this.unsubscribe = this.clock.onStep((time, stepCount) => this.handleStep(time, stepCount));
  }

  async start(): Promise<void> {
    const state = this.store.getState();
    if (this.running || state.transport.preparing) return;

    const startId = ++this.startId;
    this.store.update(current => ({
      ...current,
      transport: { ...current.transport, preparing: true }
    }));
    this.status.error('');
    this.status.instrument('Preparando audio');

    try {
      this.runtime.resetAll();
      this.running = true;
      await this.engine.prepare();
      if (startId !== this.startId) return;

      this.store.update(current => ({
        ...current,
        transport: {
          ...current.transport,
          playing: true,
          preparing: false,
          currentStep: -1
        }
      }));
      this.status.instrument('Reproduciendo');
      await this.clock.start();
    } catch (error) {
      if (startId !== this.startId) return;
      console.error('Error starting transport:', error);
      this.running = false;
      try {
        this.clock.stop();
        this.engine.stop();
      } catch {
        // El transporte puede no haber llegado a iniciarse.
      }
      this.store.update(current => ({
        ...current,
        transport: { ...current.transport, playing: false, preparing: false }
      }));
      this.status.instrument('Detenido');
      this.status.error('No se pudo iniciar el audio. Revisá el permiso de audio del navegador.');
    }
  }

  stop(): void {
    const state = this.store.getState();
    if (!state.transport.playing && !state.transport.preparing) return;

    this.startId += 1;
    this.running = false;
    this.clock.stop();
    this.engine.stop();
    this.restoreLocks();
    this.store.update(current => ({
      ...current,
      transport: {
        ...current.transport,
        playing: false,
        preparing: false,
        currentStep: -1
      }
    }));
    this.status.instrument('Detenido');
  }

  setBpm(bpm: number): void {
    this.clock.setBpm(bpm);
    this.store.update(current => ({
      ...current,
      transport: { ...current.transport, bpm }
    }));
  }

  setSwing(swing: number): void {
    this.store.update(current => ({
      ...current,
      transport: { ...current.transport, swing: clamp(swing, 0, 1) }
    }));
  }

  setHumanize(humanize: number): void {
    this.store.update(current => ({
      ...current,
      transport: { ...current.transport, humanize: clamp(humanize, 0, 1) }
    }));
  }

  resetHarmony(): void {
    this.runtime.resetHarmony();
  }

  dispose(): void {
    this.unsubscribe();
    this.stop();
  }

  private handleStep(time: number, stepCount: number): void {
    const state = this.store.getState();
    if (!this.running || !state.transport.playing) return;

    const step = normalizeStep(stepCount);
    if (state.transport.currentStep !== step) {
      this.store.update(current => ({
        ...current,
        transport: { ...current.transport, currentStep: step }
      }));
    }

    this.automation.applyAt(step, time);
    this.applyLocks(state, time, step, stepCount);
    this.triggerStep(state, time, stepCount);

    if (state.evolve && stepCount > 0 && stepCount % 32 === 0) {
      this.patterns.evolve();
    }
  }

  private applyLocks(
    state: InstrumentState,
    time: number,
    step: number,
    stepCount: number
  ): void {
    const desired = new Map<string, AppliedLock>();

    Object.values(state.kit.tracks).forEach(track => {
      if (!track.hasPattern) return;
      if (!patternStep(state.pattern.steps, track.id, stepCount)) return;

      locksAt(state.pattern.locks, track.id, step).forEach(lock => {
        const insert = track.inserts.find(entry => entry.id === lock.insertId);
        if (!insert) return;
        const definition = this.engine
          .listPlugins()
          .find(plugin => plugin.id === insert.pluginId);
        const param = definition?.params.find(entry => entry.id === lock.paramId);
        const base =
          insert.params[lock.paramId] ?? param?.defaultValue ?? lock.value;
        const key = lockKey(track.id, lock.insertId, lock.paramId);
        desired.set(key, {
          trackId: track.id,
          insertId: lock.insertId,
          paramId: lock.paramId,
          value: lock.value,
          base
        });
      });
    });

    desired.forEach((lock, key) => {
      const offset = timingOffset(
        state,
        this.generative,
        lock.trackId,
        stepCount
      );
      this.engine.setInsertParam(
        lock.trackId,
        lock.insertId,
        lock.paramId,
        lock.value,
        time + offset
      );
      this.activeLocks.set(key, lock);
    });

    this.activeLocks.forEach((lock, key) => {
      if (desired.has(key)) return;
      this.engine.setInsertParam(
        lock.trackId,
        lock.insertId,
        lock.paramId,
        lock.base,
        time
      );
      this.activeLocks.delete(key);
    });
  }

  private restoreLocks(): void {
    this.activeLocks.forEach(lock => {
      this.engine.setInsertParam(
        lock.trackId,
        lock.insertId,
        lock.paramId,
        lock.base
      );
    });
    this.activeLocks.clear();
  }

  private triggerStep(state: InstrumentState, time: number, stepCount: number): void {
    const quarter = stepCount % 4 === 0;

    if (patternStep(state.pattern.steps, 'kick', stepCount)) {
      this.engine.trigger({ type: 'kick', time: time + timingOffset(state, this.generative, 'kick', stepCount) });
    }

    if (patternStep(state.pattern.steps, 'bass', stepCount)) {
      const voice = bassVoice(state, this.generative, stepCount, this.runtime.currentChordDegree);
      this.engine.trigger({
        type: 'sample',
        channel: 'bass',
        time: time + timingOffset(state, this.generative, 'bass', stepCount),
        sampleIndex: voice.sampleIndex,
        playbackRate: voice.playbackRate,
        duration: noteDuration('bass', state.harmony.sustain)
      });
    }

    if (patternStep(state.pattern.steps, 'hihat', stepCount)) {
      const voice = hihatVoice(state, this.generative, stepCount, 8);
      this.engine.trigger({
        type: 'sample',
        channel: 'hihat',
        time: time + timingOffset(state, this.generative, 'hihat', stepCount),
        sampleIndex: voice.sampleIndex,
        playbackRate: voice.playbackRate,
        gainDb: voice.gainDb
      });
    }

    if (quarter) {
      this.runtime.droneStep += 1;
      if ((this.runtime.droneStep - 1) % 16 === 0) {
        this.engine.trigger({
          type: 'sample',
          channel: 'drone',
          time,
          playbackRate: dronePlaybackRate(state, this.generative, this.runtime.droneStep)
        });
      }
    }

    if (quarter) {
      this.runtime.padStep += 1;
      if ((this.runtime.padStep - 1) % 8 === 0) {
        const chord = padChord(state, this.generative, this.runtime.lastPadChord);
        this.runtime.currentChordDegree = this.runtime.lastPadChord;
        this.engine.trigger({
          type: 'synth',
          channel: 'pad',
          time,
          notes: chord.notes,
          duration: noteDuration('pad', state.harmony.sustain)
        });
        this.runtime.lastPadChord += 1;
      }
    }

    if (patternStep(state.pattern.steps, 'perc', stepCount)) {
      this.engine.trigger({
        type: 'sample',
        channel: 'perc',
        time: time + timingOffset(state, this.generative, 'perc', stepCount),
        playbackRate: percPlaybackRate(state, this.generative, stepCount),
        duration: '2n'
      });
    }

    Object.values(state.kit.tracks).forEach(track => {
      if (track.role !== 'user' || !track.hasPattern) return;
      if (track.machine.kind !== 'sampler') return;
      if (!patternStep(state.pattern.steps, track.id, stepCount)) return;
      this.engine.trigger({
        type: 'sample',
        channel: 'perc',
        trackId: track.id,
        time: time + timingOffset(state, this.generative, track.id, stepCount),
        sampleIndex: 0,
        playbackRate: 1,
        duration: '8n'
      });
    });

    if (quarter) {
      this.runtime.leadCounter += 1;
      const note = leadNote(
        state,
        this.generative,
        this.runtime.leadCounter,
        this.runtime.currentChordDegree
      );
      if (note) {
        this.engine.trigger({
          type: 'synth',
          channel: 'lead',
          time,
          notes: note,
          duration: noteDuration('lead', state.harmony.sustain)
        });
      }
    }
  }
}

function lockKey(trackId: string, insertId: string, paramId: string): string {
  return `${trackId}:${insertId}:${paramId}`;
}

interface AppliedLock {
  readonly trackId: string;
  readonly insertId: string;
  readonly paramId: string;
  readonly value: number;
  readonly base: number;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
