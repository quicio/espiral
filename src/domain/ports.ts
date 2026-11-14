import type { EffectKind, NoteDuration, SoundEvent } from './audio';
import type { DeviceChainPreset } from './device-chain';
import type {
  PatternChannel
} from './channels';
import type {
  BusConfig,
  EqSettings,
  InsertConfig,
  MachineConfig,
  TrackConfig
} from './graph';
import type { KitState, BusState } from './kit';
import type { SidechainConfig } from './sidechain';
import type { PluginDefinition } from './plugin';
import type {
  ChannelSeed,
  GenerativeParams,
  HarmonyState,
  InstrumentState,
  ProgressionDefinition,
  ProgressionId,
  RootDefinition,
  ScaleDefinition,
  ScaleId,
  SceneDefinition,
  SceneId
} from './models';
import type { Pattern, PatternState } from './pattern';
import type { LfoShape, ModulationTarget } from './modulation';
import type { SceneCollection } from './scene';
import type { SoundKit } from './sound-kits';

export type StepListener = (time: number, stepCount: number) => void;

export interface AudioEnginePort {
  readonly supportsInserts: boolean;
  readonly supportsTrackManagement: boolean;
  readonly supportsRouting: boolean;
  readonly supportsMachineChange: boolean;
  prepare(): Promise<void>;
  stop(): void;
  dispose(): void;
  addTrack(track: TrackConfig): void;
  removeTrack(trackId: string): void;
  syncTracks(tracks: readonly TrackConfig[]): void;
  setTrackMachine(trackId: string, machine: MachineConfig): void;
  setTrackOutput(trackId: string, outputBusId?: string): void;
  setSidechain(config?: SidechainConfig): void;
  addBus(bus: BusConfig): void;
  removeBus(busId: string): void;
  syncBuses(buses: readonly BusConfig[]): void;
  trigger(event: SoundEvent): void;
  previewMachine(
    machine: MachineConfig,
    notes: readonly string[],
    duration?: NoteDuration
  ): void;
  setChannelVolume(trackId: string, db: number, time?: number): void;
  setChannelPan(trackId: string, pan: number, time?: number): void;
  setChannelMute(trackId: string, muted: boolean): void;
  setTrackSend(
    trackId: string,
    busId: string,
    amount: number,
    preFader: boolean
  ): void;
  setBusReturn(busId: string, db: number): void;
  setBusSend(fromBusId: string, toBusId: string, amount: number): void;
  syncBusSends(buses: readonly BusState[]): void;
  setBusInserts(busId: string, inserts: readonly InsertConfig[]): Promise<void>;
  setEffectWet(trackId: string, effect: EffectKind, wet: number, time?: number): void;
  setMasterVolume(db: number, time?: number): void;
  setMasterEq(eq: EqSettings): void;
  beginTransition(fadeOutMs?: number): void;
  endTransition(fadeInMs?: number): void;
  getMasterLevel(): number;
  getMasterSpectrum(bins: number): readonly number[];
  getTrackSpectrum(trackId: string, bins: number): readonly number[];
  getTrackLevel(trackId: string): number;
  getBusLevel(busId: string): number;
  getAudioStats(): {
    readonly underruns: number;
    readonly underrunDuration: number;
    readonly totalDuration: number;
  } | null;
  listPlugins(): readonly PluginDefinition[];
  listInstruments(): readonly PluginDefinition[];
  setTrackInserts(trackId: string, inserts: readonly InsertConfig[]): Promise<void>;
  setInsertParam(
    trackId: string,
    insertId: string,
    param: string,
    value: number,
    time?: number
  ): void;
  setInsertBypass(trackId: string, insertId: string, bypass: boolean): void;
  supportsAudioModulation(target: ModulationTarget): boolean;
  setAudioModulation(
    routeId: string,
    source: { readonly rate: number; readonly shape: LfoShape },
    target: ModulationTarget,
    amount: number,
    bipolar: boolean
  ): void;
  removeAudioModulation(routeId: string): void;
  clearAudioModulations(): void;
}

export interface ClockPort {
  start(): Promise<void>;
  stop(): void;
  setBpm(bpm: number): void;
  getBpm(): number;
  setLookAhead(seconds: number): void;
  getLookAhead(): number;
  now(): number;
  onStep(listener: StepListener): () => void;
  dispose(): void;
}

export interface TickerPort {
  start(callback: () => void, intervalMs: number): () => void;
}

export interface GenerativePort {
  readonly patternLength: number;
  readonly scenes: Record<SceneId, SceneDefinition>;
  readonly defaultParams: GenerativeParams;
  readonly roots: readonly RootDefinition[];
  readonly scales: Record<ScaleId, ScaleDefinition>;
  readonly progressions: Record<ProgressionId, ProgressionDefinition>;
  readonly channelSeeds: Record<PatternChannel, ChannelSeed>;
  generatePattern(
    channel: string,
    params: GenerativeParams,
    pulses: number,
    seed: number
  ): Pattern;
  mutatePattern(
    pattern: Pattern,
    params: GenerativeParams,
    seed: number,
    channel: string
  ): Pattern;
  thinPattern(
    pattern: Pattern,
    params: GenerativeParams,
    seed: number,
    channel: string
  ): Pattern;
  fillPattern(
    pattern: Pattern,
    params: GenerativeParams,
    seed: number,
    channel: string
  ): Pattern;
  rotatePattern(pattern: Pattern, amount: number): Pattern;
  euclidean(steps: number, pulses: number, offset: number): Pattern;
  count(pattern: Pattern): number;
  hash01(seed: number, key: string, step: number, salt: number): number;
  midiToNote(midi: number): string;
  scaleDegreeMidi(root: number, scale: ScaleId, degree: number, octave: number): number;
  scaleNotes(root: number, scale: ScaleId, octave: number, count: number): readonly string[];
  chordNotes(
    root: number,
    scale: ScaleId,
    degree: number,
    octave: number,
    size: number
  ): readonly string[];
}

export interface AutomationRunner {
  applyAt(step: number, time: number): void;
}

export interface PatternEvolver {
  evolve(): void;
}

export interface SessionRepositoryPort {
  load(): unknown | null;
  save(session: unknown): void;
}

export interface SessionCodec {
  toDto(state: InstrumentState): unknown;
  fromDto(raw: unknown, current: InstrumentState): InstrumentState;
}

export interface PresetConfig {
  readonly bpm: number;
  readonly masterVolume: number;
  readonly kit: KitState;
  readonly pattern?: PatternState;
  readonly harmony?: HarmonyState;
  readonly seed?: number;
  readonly params?: GenerativeParams;
  readonly scenes?: SceneCollection;
  readonly scene?: SceneId;
  readonly selected?: string;
}

export interface PresetCodec {
  fromDto(raw: unknown, current: InstrumentState): PresetConfig;
}

export interface PresetSummary {
  readonly id: string;
  readonly name: string;
}

export interface PresetRepositoryPort {
  list(): readonly PresetSummary[];
  load(id: string): Promise<unknown>;
}

export interface SoundKitRepositoryPort {
  list(): readonly SoundKit[];
  save(kit: SoundKit): void;
  remove(id: string): void;
}

export interface DeviceChainPresetRepositoryPort {
  list(): readonly DeviceChainPreset[];
  save(preset: DeviceChainPreset): void;
  remove(id: string): void;
}

export interface FileGatewayPort {
  downloadJson(filename: string, data: unknown): void;
  downloadBlob(filename: string, blob: Blob): void;
  readJsonFile(file: File): Promise<unknown>;
  readFileAsDataUrl(file: File): Promise<string>;
}

export interface AudioExportPort {
  render(
    state: InstrumentState,
    options: { readonly bars: number; readonly tailSeconds: number }
  ): Promise<Blob>;
}

export interface StatusPort {
  generative(message: string): void;
  session(message: string): void;
  instrument(message: string): void;
  error(message: string): void;
}
