import type { NoteDuration } from '../domain/audio';
import type { InstrumentState } from '../domain/models';
import { isDrumRole, type TrackState } from '../domain/kit';
import {
  locksAt,
  lockTargetKey,
  normalizeStep,
  patternStep,
  type LockTarget
} from '../domain/pattern';
import type {
  AudioEnginePort,
  AutomationRunner,
  ClockPort,
  GenerativePort,
  PatternEvolver,
  StatusPort
} from '../domain/ports';
import { PlaybackRuntime } from './runtime';
import type { ClipService } from './clip';
import type { ArrangementService } from './arrangement';
import type { Store } from './store';
import {
  bassVoice,
  dronePlaybackRate,
  hihatVoice,
  leadNote,
  noteDuration,
  padChord,
  percPlaybackRate,
  progressionDegrees,
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
    private readonly clips: ClipService,
    private readonly runtime: PlaybackRuntime,
    private readonly arrangement?: ArrangementService
  ) {
    this.unsubscribe = this.clock.onStep((time, stepCount) => this.handleStep(time, stepCount));
  }

  async prepare(): Promise<void> {
    await this.engine.prepare();
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
    this.arrangement?.stopRecording();
    this.clips.clearPending();
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

  setLookAhead(seconds: number): void {
    const lookAhead = clamp(seconds, 0, 0.5);
    this.clock.setLookAhead(lookAhead);
    this.store.update(current => ({
      ...current,
      transport: { ...current.transport, lookAhead }
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
    if (!this.running) return;
    this.runtime.absoluteStep = stepCount;
    this.clips.applyPending(stepCount);
    this.arrangement?.onStep(stepCount);

    const state = this.store.getState();
    if (!state.transport.playing) return;

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
      if (!isTrackActive(state, track.id)) return;
      if (!patternStep(state.pattern.steps, track.id, stepCount)) return;

      locksAt(state.pattern.locks, track.id, step).forEach(lock => {
        if (lock.kind === 'track') {
          const base = lock.paramId === 'gain' ? track.gainDb : track.pan;
          const key = lockKey(track.id, lock);
          desired.set(key, {
            trackId: track.id,
            kind: 'track',
            paramId: lock.paramId,
            value: lock.value,
            base
          });
          return;
        }

        const insert = track.inserts.find(entry => entry.id === lock.insertId);
        if (!insert) return;
        const definition = this.engine
          .listPlugins()
          .find(plugin => plugin.id === insert.pluginId);
        const param = definition?.params.find(entry => entry.id === lock.paramId);
        const base =
          insert.params[lock.paramId] ?? param?.defaultValue ?? lock.value;
        const key = lockKey(track.id, lock);
        desired.set(key, {
          trackId: track.id,
          kind: 'insert',
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
      this.applyLockValue(lock, lock.value, Math.max(0, time + offset));
      this.activeLocks.set(key, lock);
    });

    this.activeLocks.forEach((lock, key) => {
      if (desired.has(key)) return;
      this.applyLockValue(lock, lock.base, time);
      this.activeLocks.delete(key);
    });
  }

  private restoreLocks(): void {
    this.activeLocks.forEach(lock => {
      this.applyLockValue(lock, lock.base);
    });
    this.activeLocks.clear();
  }

  private applyLockValue(
    lock: AppliedLock,
    value: number,
    time?: number
  ): void {
    if (lock.kind === 'track') {
      if (lock.paramId === 'gain') {
        this.engine.setChannelVolume(lock.trackId, value, time);
      } else {
        this.engine.setChannelPan(lock.trackId, value, time);
      }
      return;
    }
    this.engine.setInsertParam(
      lock.trackId,
      lock.insertId ?? '',
      lock.paramId,
      value,
      time
    );
  }

  private triggerStep(state: InstrumentState, time: number, stepCount: number): void {
    const quarter = stepCount % 4 === 0;
    const tracks = state.kit.tracks;

    this.eachPatternHit(state, 'kick', stepCount, time, (at, velocity) => {
      const kick = tracks.kick;
      if (kick?.machine.kind === 'sampler') {
        this.engine.trigger({
          type: 'sample',
          channel: 'perc',
          trackId: 'kick',
          time: at,
          sampleIndex: 0,
          playbackRate: 1,
          gainDb: velocityGainDb(velocity)
        });
        return;
      }
      this.engine.trigger({ type: 'kick', time: at, velocity });
    });

    const bass = bassVoice(
      state,
      this.generative,
      stepCount,
      this.runtime.currentChordDegree
    );
    this.eachPatternHit(state, 'bass', stepCount, time, (at, velocity) => {
      this.engine.trigger({
        type: 'sample',
        channel: 'bass',
        time: at,
        sampleIndex: bass.sampleIndex,
        playbackRate: bass.playbackRate,
        gainDb: velocityGainDb(velocity),
        duration: noteDuration('bass', state.harmony.sustain)
      });
    });

    const hihat = hihatVoice(state, this.generative, stepCount, 8);
    this.eachPatternHit(state, 'hihat', stepCount, time, (at, velocity) => {
      this.engine.trigger({
        type: 'sample',
        channel: 'hihat',
        time: at,
        sampleIndex: hihat.sampleIndex,
        playbackRate: hihat.playbackRate,
        gainDb: hihat.gainDb + velocityGainDb(velocity)
      });
    });

    const drone = tracks.drone;
    if (quarter && drone && !drone.hasPattern) {
      this.runtime.droneStep += 1;
      if ((this.runtime.droneStep - 1) % 16 === 0) {
        this.triggerGenerative(drone, time, {
          notes: notesForTrack(
            state,
            this.generative,
            drone,
            this.runtime.currentChordDegree
          ),
          duration: noteDuration('pad', state.harmony.sustain),
          playbackRate: dronePlaybackRate(
            state,
            this.generative,
            this.runtime.droneStep
          )
        });
      }
    }

    const pad = tracks.pad;
    if (quarter && pad && !pad.hasPattern) {
      this.runtime.padStep += 1;
      if ((this.runtime.padStep - 1) % 8 === 0) {
        const chord = padChord(state, this.generative, this.runtime.lastPadChord);
        this.runtime.currentChordDegree = this.runtime.lastPadChord;
        this.triggerGenerative(pad, time, {
          notes: chord.notes,
          duration: noteDuration('pad', state.harmony.sustain)
        });
        this.runtime.lastPadChord += 1;
      }
    }

    const percRate = percPlaybackRate(state, this.generative, stepCount);
    this.eachPatternHit(state, 'perc', stepCount, time, (at, velocity) => {
      this.engine.trigger({
        type: 'sample',
        channel: 'perc',
        time: at,
        playbackRate: percRate,
        gainDb: velocityGainDb(velocity)
      });
    });

    Object.values(tracks).forEach(track => {
      if (!track.hasPattern || isDrumRole(track.role)) return;
      if (track.machine.kind === 'sampler') {
        this.eachPatternHit(state, track.id, stepCount, time, (at, velocity) => {
          this.engine.trigger({
            type: 'sample',
            channel: 'perc',
            trackId: track.id,
            time: at,
            sampleIndex: 0,
            playbackRate: 1,
            gainDb: velocityGainDb(velocity)
          });
        });
        return;
      }
      if (!isSynthMachineKind(track.machine.kind)) return;

      const notes = notesForTrack(
        state,
        this.generative,
        track,
        this.runtime.currentChordDegree
      );
      if (!notes) return;
      const duration = machineNoteDuration(
        track.machine.kind,
        state.harmony.sustain
      );
      const channel =
        track.machine.kind === 'poly' || track.machine.kind === 'plugin'
          ? 'pad'
          : 'lead';
      this.eachPatternHit(state, track.id, stepCount, time, (at, velocity) => {
        this.engine.trigger({
          type: 'synth',
          channel,
          trackId: track.id,
          time: at,
          notes,
          duration,
          velocity
        });
      });
    });

    const lead = tracks.lead;
    if (quarter && lead && !lead.hasPattern) {
      this.runtime.leadCounter += 1;
      const note = leadNote(
        state,
        this.generative,
        this.runtime.leadCounter,
        this.runtime.currentChordDegree
      );
      if (note) {
        this.triggerGenerative(lead, time, {
          notes: note,
          duration: noteDuration('lead', state.harmony.sustain)
        });
      }
    }
  }

  private triggerGenerative(
    track: TrackState,
    time: number,
    options: {
      readonly notes: string | readonly string[] | null;
      readonly duration: NoteDuration;
      readonly playbackRate?: number;
    }
  ): void {
    if (track.machine.kind === 'sampler') {
      this.engine.trigger({
        type: 'sample',
        channel: track.role === 'drone' ? 'drone' : 'perc',
        trackId: track.id,
        time,
        sampleIndex: 0,
        playbackRate: options.playbackRate ?? 1
      });
      return;
    }
    if (!options.notes || !isSynthMachineKind(track.machine.kind)) return;
    this.engine.trigger({
      type: 'synth',
      channel:
        track.machine.kind === 'poly' || track.machine.kind === 'plugin'
          ? 'pad'
          : 'lead',
      trackId: track.id,
      time,
      notes: options.notes,
      duration: options.duration
    });
  }

  private eachPatternHit(
    state: InstrumentState,
    trackId: string,
    stepCount: number,
    time: number,
    callback: (time: number, velocity: number) => void
  ): void {
    if (!isTrackActive(state, trackId)) return;
    if (!patternStep(state.pattern.steps, trackId, stepCount)) return;

    const step = normalizeStep(stepCount);
    const probability = state.pattern.probability[trackId]?.[step] ?? 1;
    if (probability <= 0) return;
    if (
      probability < 1 &&
      this.generative.hash01(state.seed, `${trackId}-prob`, stepCount, 31) >
        probability
    ) {
      return;
    }

    const velocity = clamp(
      state.pattern.velocity[trackId]?.[step] ?? 1,
      0,
      1
    );
    if (velocity <= 0) return;

    const ratchets = clamp(
      Math.round(state.pattern.ratchets[trackId]?.[step] ?? 1),
      1,
      4
    );
    const offset = timingOffset(state, this.generative, trackId, stepCount);
    const stepSeconds = 60 / Math.max(state.transport.bpm, 1) / 4;

    for (let index = 0; index < ratchets; index += 1) {
      callback(
        Math.max(0, time + offset + (index * stepSeconds) / ratchets),
        velocity
      );
    }
  }
}

function velocityGainDb(velocity: number): number {
  return velocity >= 0.999
    ? 0
    : 20 * Math.log10(Math.max(0.02, velocity));
}

function notesForTrack(
  state: InstrumentState,
  generative: GenerativePort,
  track: TrackState,
  chordDegree: number
): string | readonly string[] | null {
  const source = track.noteSource;
  if (!source) return 'C4';

  if (source.kind === 'fixed') return source.note;

  if (source.kind === 'scale-degree') {
    return generative.midiToNote(
      generative.scaleDegreeMidi(
        state.harmony.root,
        state.harmony.scale,
        source.degree,
        source.octave
      )
    );
  }

  const degrees = progressionDegrees(state, generative);
  const degree =
    (degrees[chordDegree % degrees.length] ?? 0) + source.degreeOffset;
  const notes = generative.chordNotes(
    state.harmony.root,
    state.harmony.scale,
    degree,
    source.octave,
    source.size
  );
  if (notes.length === 0) return null;
  return source.size === 1 ? notes[0] ?? null : notes;
}

function machineNoteDuration(
  kind: 'poly' | 'mono' | 'pluck' | 'plugin',
  sustain: number
): NoteDuration {
  if (kind === 'mono') return noteDuration('bass', sustain);
  if (kind === 'pluck') return '8n';
  if (kind === 'plugin') return noteDuration('lead', sustain);
  return noteDuration('pad', sustain);
}

function isSynthMachineKind(
  kind: string
): kind is 'poly' | 'mono' | 'pluck' | 'plugin' {
  return kind === 'poly' || kind === 'mono' || kind === 'pluck' || kind === 'plugin';
}

function isTrackActive(state: InstrumentState, trackId: string): boolean {
  return state.activeClips[trackId] !== null;
}

function lockKey(trackId: string, target: LockTarget): string {
  return `${trackId}:${lockTargetKey(target)}`;
}

interface AppliedLock {
  readonly trackId: string;
  readonly kind: 'insert' | 'track';
  readonly insertId?: string;
  readonly paramId: string;
  readonly value: number;
  readonly base: number;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
