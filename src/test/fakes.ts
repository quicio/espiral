import type { EffectKind, SoundEvent } from '../domain/audio';
import type {
  ChannelKey,
  DelaySettings,
  PatternChannel,
  ReverbSettings
} from '../domain/channels';
import type { InsertConfig, MachineConfig, TrackConfig } from '../domain/graph';
import type {
  ChannelSeed,
  GenerativeParams,
  HarmonyState,
  ProgressionDefinition,
  ProgressionId,
  RootDefinition,
  ScaleDefinition,
  ScaleId,
  SceneDefinition,
  SceneId
} from '../domain/models';
import type { Pattern } from '../domain/pattern';
import type { PluginDefinition } from '../domain/plugin';
import type {
  AudioEnginePort,
  AutomationRunner,
  ClockPort,
  GenerativePort,
  PatternEvolver,
  StatusPort,
  StepListener
} from '../domain/ports';

const BASE_PARAMS: GenerativeParams = {
  density: 0.55,
  complexity: 0.35,
  variation: 0.25,
  stability: 0.72,
  randomness: 0.18
};

const HARMONY: Record<SceneId, HarmonyState> = {
  umbral: { root: 0, scale: 'minor', progression: 'menor', sustain: 0.5 },
  deriva: { root: 2, scale: 'dorian', progression: 'epica', sustain: 0.68 },
  pulso: { root: 5, scale: 'minorPent', progression: 'pedal', sustain: 0.34 },
  caos: { root: 1, scale: 'phrygian', progression: 'cadencia', sustain: 0.56 }
};

const SCENES: Record<SceneId, SceneDefinition> = {
  umbral: { label: 'Umbral', params: BASE_PARAMS, harmony: HARMONY.umbral },
  deriva: { label: 'Deriva', params: { ...BASE_PARAMS, variation: 0.5 }, harmony: HARMONY.deriva },
  pulso: { label: 'Pulso', params: { ...BASE_PARAMS, density: 0.7 }, harmony: HARMONY.pulso },
  caos: { label: 'Caos contenido', params: { ...BASE_PARAMS, randomness: 0.65 }, harmony: HARMONY.caos }
};

const SCALES: Record<ScaleId, ScaleDefinition> = {
  minor: { label: 'Menor natural', intervals: [0, 2, 3, 5, 7, 8, 10] },
  harmonic: { label: 'Menor armónica', intervals: [0, 2, 3, 5, 7, 8, 11] },
  dorian: { label: 'Dórica', intervals: [0, 2, 3, 5, 7, 9, 10] },
  phrygian: { label: 'Frigia', intervals: [0, 1, 3, 5, 7, 8, 10] },
  major: { label: 'Mayor', intervals: [0, 2, 4, 5, 7, 9, 11] },
  minorPent: { label: 'Pentatónica menor', intervals: [0, 3, 5, 7, 10] },
  majorPent: { label: 'Pentatónica mayor', intervals: [0, 2, 4, 7, 9] }
};

const PROGRESSIONS: Record<ProgressionId, ProgressionDefinition> = {
  menor: { label: 'i · VI · III · VII', degrees: [0, 5, 2, 6] },
  cadencia: { label: 'i · iv · v · i', degrees: [0, 3, 4, 0] },
  epica: { label: 'i · VI · VII · v', degrees: [0, 5, 6, 4] },
  pedal: { label: 'Pedal', degrees: [0, 0, 0, 0] }
};

const CHANNEL_SEEDS: Record<PatternChannel, ChannelSeed> = {
  kick: { pulses: 4, offset: 0 },
  bass: { pulses: 5, offset: 1 },
  hihat: { pulses: 8, offset: 0 },
  perc: { pulses: 3, offset: 2 }
};

export class FakeGenerative implements GenerativePort {
  readonly patternLength = 16;
  readonly scenes = SCENES;
  readonly defaultParams = BASE_PARAMS;
  readonly roots: readonly RootDefinition[] = Array.from({ length: 12 }, (_, index) => ({
    label: `Root ${index}`,
    pc: index
  }));
  readonly scales = SCALES;
  readonly progressions = PROGRESSIONS;
  readonly channelSeeds = CHANNEL_SEEDS;

  generatePattern(_channel: PatternChannel, _params: GenerativeParams, pulses: number): Pattern {
    const pattern: number[] = Array.from({ length: 16 }, () => 0);
    const gap = Math.max(1, Math.round(16 / pulses));
    for (let index = 0; index < 16; index += gap) pattern[index] = 1;
    return pattern.map(value => (value ? 1 : 0)) as Pattern;
  }

  mutatePattern(pattern: Pattern): Pattern {
    const next = pattern.slice();
    next[0] = next[0] ? 0 : 1;
    return next;
  }

  thinPattern(pattern: Pattern): Pattern {
    return pattern.map((value, index) => (index === 1 ? 0 : value));
  }

  fillPattern(pattern: Pattern): Pattern {
    return pattern.map((value, index) => (index === 2 ? 1 : value));
  }

  rotatePattern(pattern: Pattern, amount: number): Pattern {
    const shift = ((amount % pattern.length) + pattern.length) % pattern.length;
    return [...pattern.slice(shift), ...pattern.slice(0, shift)];
  }

  euclidean(steps: number, pulses: number, offset: number): Pattern {
    return this.generatePattern('kick', BASE_PARAMS, pulses).map((value, index) => {
      if (index < steps) return value;
      return 0;
    }).map((value, index) => (index + offset < steps ? value : 0));
  }

  count(pattern: Pattern): number {
    return pattern.reduce<number>((total, step) => total + step, 0);
  }

  hash01(seed: number, key: string, step: number, salt: number): number {
    return ((seed + key.length + step + salt) % 97) / 97;
  }

  midiToNote(midi: number): string {
    return `C${Math.floor(midi / 12)}`;
  }

  scaleDegreeMidi(root: number, _scale: ScaleId, degree: number, octave: number): number {
    return 12 * (octave + 1) + root + degree;
  }

  scaleNotes(root: number, _scale: ScaleId, octave: number, count: number): readonly string[] {
    return Array.from({ length: count }, (_, index) => this.midiToNote(12 * (octave + 1) + root + index));
  }

  chordNotes(
    root: number,
    _scale: ScaleId,
    degree: number,
    octave: number,
    size: number
  ): readonly string[] {
    return Array.from({ length: size }, (_, index) =>
      this.midiToNote(12 * (octave + 1) + root + degree + index * 2)
    );
  }
}

export class FakeStatus implements StatusPort {
  readonly messages: string[] = [];

  generative(message: string): void {
    this.messages.push(message);
  }

  session(message: string): void {
    this.messages.push(message);
  }

  instrument(message: string): void {
    this.messages.push(message);
  }

  error(message: string): void {
    this.messages.push(message);
  }
}

export class FakeAudioEngine implements AudioEnginePort {
  readonly supportsInserts = true;
  readonly supportsTrackManagement = true;
  readonly supportsRouting = true;
  readonly supportsMachineChange = true;
  prepared = 0;
  stopped = 0;
  disposed = 0;
  readonly events: SoundEvent[] = [];
  readonly added: TrackConfig[] = [];
  readonly removed: string[] = [];
  readonly machines: { trackId: string; machine: MachineConfig }[] = [];
  readonly sends: {
    trackId: string;
    busId: string;
    amount: number;
    preFader: boolean;
  }[] = [];
  readonly returns: { busId: string; db: number }[] = [];
  readonly busInserts: {
    busId: string;
    inserts: readonly InsertConfig[];
  }[] = [];
  readonly params: {
    trackId: string;
    insertId: string;
    paramId: string;
    value: number;
  }[] = [];
  readonly volumes: { channel: ChannelKey; db: number }[] = [];
  readonly pans: { trackId: string; pan: number }[] = [];
  readonly mutes: { channel: ChannelKey; muted: boolean }[] = [];
  readonly effects: { channel: ChannelKey; effect: EffectKind; wet: number }[] = [];
  readonly delays: { channel: ChannelKey; settings: DelaySettings }[] = [];
  readonly reverbs: { channel: ChannelKey; settings: ReverbSettings }[] = [];
  readonly inserts: { channel: ChannelKey; inserts: readonly InsertConfig[] }[] = [];
  readonly master: number[] = [];
  masterLevel = -60;
  pluginDefinitions: readonly PluginDefinition[] = [
    {
      id: 'filter',
      name: 'Filter',
      version: 1,
      kind: 'effect',
      params: [
        {
          id: 'cutoff',
          label: 'Cutoff',
          min: 20,
          max: 20000,
          defaultValue: 1200,
          unit: 'hz',
          curve: 'log'
        },
        {
          id: 'q',
          label: 'Resonance',
          min: 0.1,
          max: 20,
          defaultValue: 1,
          unit: 'q',
          curve: 'log'
        }
      ]
    }
  ];

  async prepare(): Promise<void> {
    this.prepared += 1;
  }

  stop(): void {
    this.stopped += 1;
  }

  dispose(): void {
    this.disposed += 1;
  }

  addTrack(track: TrackConfig): void {
    this.added.push(track);
  }

  removeTrack(trackId: string): void {
    this.removed.push(trackId);
  }

  setTrackMachine(trackId: string, machine: MachineConfig): void {
    this.machines.push({ trackId, machine });
  }

  setTrackSend(
    trackId: string,
    busId: string,
    amount: number,
    preFader: boolean
  ): void {
    this.sends.push({ trackId, busId, amount, preFader });
  }

  setBusReturn(busId: string, db: number): void {
    this.returns.push({ busId, db });
  }

  async setBusInserts(
    busId: string,
    inserts: readonly InsertConfig[]
  ): Promise<void> {
    this.busInserts.push({ busId, inserts });
  }

  trigger(event: SoundEvent): void {
    this.events.push(event);
  }

  setChannelVolume(channel: ChannelKey, db: number): void {
    this.volumes.push({ channel, db });
  }

  setChannelPan(trackId: string, pan: number): void {
    this.pans.push({ trackId, pan });
  }

  setChannelMute(channel: ChannelKey, muted: boolean): void {
    this.mutes.push({ channel, muted });
  }

  setEffectWet(channel: ChannelKey, effect: EffectKind, wet: number): void {
    this.effects.push({ channel, effect, wet });
  }

  setDelaySettings(channel: ChannelKey, settings: DelaySettings): void {
    this.delays.push({ channel, settings });
  }

  setReverbSettings(channel: ChannelKey, settings: ReverbSettings): void {
    this.reverbs.push({ channel, settings });
  }

  setMasterVolume(db: number): void {
    this.master.push(db);
  }

  getMasterLevel(): number {
    return this.masterLevel;
  }

  listPlugins(): readonly PluginDefinition[] {
    return this.pluginDefinitions;
  }

  async setTrackInserts(channel: ChannelKey, inserts: readonly InsertConfig[]): Promise<void> {
    this.inserts.push({ channel, inserts });
  }

  setInsertParam(
    trackId: string,
    insertId: string,
    paramId: string,
    value: number
  ): void {
    this.params.push({ trackId, insertId, paramId, value });
  }

  setInsertBypass(): void {
    // No-op.
  }
}

export class FakeClock implements ClockPort {
  bpm = 120;
  started = 0;
  stopped = 0;
  private readonly listeners = new Set<StepListener>();

  async start(): Promise<void> {
    this.started += 1;
  }

  stop(): void {
    this.stopped += 1;
  }

  setBpm(bpm: number): void {
    this.bpm = bpm;
  }

  getBpm(): number {
    return this.bpm;
  }

  onStep(listener: StepListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  dispose(): void {
    this.listeners.clear();
  }

  fire(time: number, step: number): void {
    for (const listener of this.listeners) listener(time, step);
  }
}

export class FakeAutomation implements AutomationRunner {
  readonly calls: { step: number; time: number }[] = [];

  applyAt(step: number, time: number): void {
    this.calls.push({ step, time });
  }
}

export class FakeEvolver implements PatternEvolver {
  count = 0;

  evolve(): void {
    this.count += 1;
  }
}
