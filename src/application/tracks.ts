import { PATTERN_LENGTH } from '../domain/channels';
import { createUserTrack } from '../domain/default-kit';
import {
  instrumentMachinePreset,
  MACHINE_PRESETS,
  machinePreset,
  type MachinePreset
} from '../domain/machines';
import { trackToConfig, type KitState, type TrackState } from '../domain/kit';
import type { InstrumentState } from '../domain/models';
import { soundPreset } from '../domain/sound-bank';
import {
  emptyStepValues,
  emptyTrackLocks,
  type Pattern,
  type PatternState,
  type PatternSteps
} from '../domain/pattern';
import type { AudioEnginePort, StatusPort } from '../domain/ports';
import type { SceneSnapshot } from '../domain/scene';
import type { Store } from './store';

const MAX_TRACKS = 32;

export class TrackService {
  constructor(
    private readonly store: Store,
    private readonly engine: AudioEnginePort,
    private readonly status: StatusPort
  ) {}

  addTrack(machineId = 'sampler'): void {
    if (!this.engine.supportsTrackManagement) {
      this.status.generative('Crear tracks no está disponible en este motor.');
      return;
    }

    const state = this.store.getState();
    if (Object.keys(state.kit.tracks).length >= MAX_TRACKS) {
      this.status.generative(`Máximo de ${MAX_TRACKS} tracks alcanzado.`);
      return;
    }

    const preset = this.resolvePreset(machineId) ?? machinePreset('sampler');
    const track = createUserTrack(nextTrackIndex(state.kit), preset.id, preset);
    const empty = emptyPattern();
    const next: InstrumentState = {
      ...state,
      kit: {
        ...state.kit,
        tracks: { ...state.kit.tracks, [track.id]: track }
      },
      pattern: {
        steps: { ...state.pattern.steps, [track.id]: empty },
        pulses: { ...state.pattern.pulses, [track.id]: 4 },
        frozen: { ...state.pattern.frozen, [track.id]: false },
        locks: { ...state.pattern.locks, [track.id]: emptyTrackLocks() },
        velocity: { ...state.pattern.velocity, [track.id]: emptyStepValues(1) },
        probability: {
          ...state.pattern.probability,
          [track.id]: emptyStepValues(1)
        },
        ratchets: { ...state.pattern.ratchets, [track.id]: emptyStepValues(1) }
      },
      scenes: mapScenes(state, scene => addTrackToScene(scene, track, empty)),
      selected: track.id,
      history: []
    };

    this.store.update(() => next);
    this.engine.addTrack(trackToConfig(track));
    this.status.generative(`${track.name} creado.`);
  }

  removeSelectedTrack(): void {
    this.removeTrack(this.store.getState().selected);
  }

  setMachine(trackId: string, machineId: string): void {
    const state = this.store.getState();
    const track = state.kit.tracks[trackId];
    if (!track) return;
    if (track.role !== 'user') {
      this.status.generative('La máquina solo se puede cambiar en tracks de usuario.');
      return;
    }
    if (!this.engine.supportsMachineChange) {
      this.status.generative('Cambiar máquinas no está disponible en este motor.');
      return;
    }

    const preset = this.resolvePreset(machineId);
    if (!preset) {
      this.status.generative(`Máquina desconocida: ${machineId}.`);
      return;
    }
    const created = createUserTrack(
      trackNumber(track.id, state.kit),
      preset.id,
      preset
    );
    const next: InstrumentState = {
      ...state,
      kit: {
        ...state.kit,
        tracks: {
          ...state.kit.tracks,
          [trackId]: {
            ...track,
            machineId: created.machineId,
            machine: created.machine,
            noteSource: created.noteSource
          }
        }
      },
      history: []
    };

    this.store.update(() => next);
    this.engine.setTrackMachine(trackId, created.machine);
    this.status.generative(`${track.name} · ${preset.name}.`);
  }

  applySoundPreset(presetId: string, trackId = this.store.getState().selected): void {
    const state = this.store.getState();
    const track = state.kit.tracks[trackId];
    if (!track) return;
    if (track.role !== 'user') {
      this.status.generative('El banco de sonidos se aplica a tracks de usuario.');
      return;
    }
    if (!this.engine.supportsMachineChange) {
      this.status.generative('Cambiar sonidos no está disponible en este motor.');
      return;
    }

    const preset = soundPreset(presetId);
    if (!preset) {
      this.status.generative(`Sonido desconocido: ${presetId}.`);
      return;
    }

    const next: InstrumentState = {
      ...state,
      kit: {
        ...state.kit,
        tracks: {
          ...state.kit.tracks,
          [trackId]: {
            ...track,
            machineId: preset.machineId,
            machine: preset.machine,
            noteSource: preset.noteSource
          }
        }
      },
      history: []
    };

    this.store.update(() => next);
    this.engine.setTrackMachine(trackId, preset.machine);
    this.status.generative(`${track.name} · ${preset.name}.`);
  }

  setTrackMacro(trackId: string, index: number, value: number): void {
    const state = this.store.getState();
    const track = state.kit.tracks[trackId];
    if (!track || index < 0 || index >= 2) return;
    const macros = [...track.macros];
    macros[index] = clamp(value, 0, 1);
    this.store.update(current => ({
      ...current,
      kit: {
        ...current.kit,
        tracks: {
          ...current.kit.tracks,
          [trackId]: { ...track, macros }
        }
      }
    }));
  }

  setMachineParam(
    trackId: string,
    paramId: string,
    value: number | string
  ): void {
    const state = this.store.getState();
    const track = state.kit.tracks[trackId];
    if (!track || track.role !== 'user') return;
    if (!this.engine.supportsMachineChange) return;

    const preset =
      this.resolvePreset(track.machineId) ?? machinePreset(track.machineId);
    const param = preset.params.find(entry => entry.id === paramId);
    if (!param) return;

    const machine = param.set(track.machine, value);
    this.store.update(current => ({
      ...current,
      kit: {
        ...current.kit,
        tracks: {
          ...current.kit.tracks,
          [trackId]: { ...track, machine }
        }
      }
    }));
    this.engine.setTrackMachine(trackId, machine);
  }

  private resolvePreset(machineId: string): MachinePreset | null {
    const preset = MACHINE_PRESETS[machineId];
    if (preset) return preset;
    const pluginId = machineId.startsWith('plugin-')
      ? machineId.slice('plugin-'.length)
      : machineId;
    const definition = this.engine
      .listInstruments()
      .find(entry => entry.id === pluginId);
    return definition ? instrumentMachinePreset(definition) : null;
  }

  removeTrack(trackId: string): void {
    if (!this.engine.supportsTrackManagement) {
      this.status.generative('Eliminar tracks no está disponible en este motor.');
      return;
    }

    const state = this.store.getState();
    const track = state.kit.tracks[trackId];
    if (!track) return;
    if (track.role !== 'user') {
      this.status.generative(`${track.name} es un track del núcleo y no se puede eliminar.`);
      return;
    }
    if (Object.keys(state.kit.tracks).length <= 1) {
      this.status.generative('El instrumento necesita al menos un track.');
      return;
    }

    const pattern = removeTrackFromPattern(state.pattern, trackId);
    const selected =
      state.selected === trackId
        ? Object.keys(pattern.steps)[0] ?? 'kick'
        : state.selected;

    const next: InstrumentState = {
      ...state,
      kit: {
        ...state.kit,
        tracks: omit(state.kit.tracks, trackId)
      },
      pattern,
      scenes: mapScenes(state, scene => removeTrackFromScene(scene, trackId)),
      modulation: {
        ...state.modulation,
        routes: state.modulation.routes.filter(
          route =>
            route.target.trackId !== trackId &&
            !route.sourceId.startsWith(`track-macro:${trackId}:`)
        )
      },
      selected,
      history: []
    };

    this.store.update(() => next);
    this.engine.removeTrack(trackId);
    this.status.generative(`${track.name} eliminado.`);
  }
}

function nextTrackIndex(kit: KitState): number {
  let max = 7;
  Object.keys(kit.tracks).forEach(id => {
    const match = /^track-(\d+)$/.exec(id);
    if (match) max = Math.max(max, Number(match[1]));
  });
  return max + 1;
}

function trackNumber(trackId: string, kit: KitState): number {
  const match = /^track-(\d+)$/.exec(trackId);
  return match ? Number(match[1]) : Object.keys(kit.tracks).length + 1;
}

function emptyPattern(): Pattern {
  return Array.from({ length: PATTERN_LENGTH }, () => 0 as const);
}

function addTrackToScene(
  scene: SceneSnapshot,
  track: TrackState,
  pattern: Pattern
): SceneSnapshot {
  return {
    ...scene,
    kit: {
      ...scene.kit,
      tracks: { ...scene.kit.tracks, [track.id]: track }
    },
    pattern: {
      steps: { ...scene.pattern.steps, [track.id]: [...pattern] },
      pulses: { ...scene.pattern.pulses, [track.id]: 4 },
      frozen: { ...scene.pattern.frozen, [track.id]: false },
      locks: { ...scene.pattern.locks, [track.id]: emptyTrackLocks() },
      velocity: { ...scene.pattern.velocity, [track.id]: emptyStepValues(1) },
      probability: {
        ...scene.pattern.probability,
        [track.id]: emptyStepValues(1)
      },
      ratchets: { ...scene.pattern.ratchets, [track.id]: emptyStepValues(1) }
    }
  };
}

function removeTrackFromScene(
  scene: SceneSnapshot,
  trackId: string
): SceneSnapshot {
  return {
    ...scene,
    kit: {
      ...scene.kit,
      tracks: omit(scene.kit.tracks, trackId)
    },
    pattern: removeTrackFromPattern(scene.pattern, trackId)
  };
}

function removeTrackFromPattern(
  pattern: PatternState,
  trackId: string
): PatternState {
  const steps: PatternSteps = omit(pattern.steps, trackId);
  return {
    steps,
    pulses: omit(pattern.pulses, trackId),
    frozen: omit(pattern.frozen, trackId),
    locks: omit(pattern.locks, trackId),
    velocity: omit(pattern.velocity, trackId),
    probability: omit(pattern.probability, trackId),
    ratchets: omit(pattern.ratchets, trackId)
  };
}

function mapScenes(
  state: InstrumentState,
  mapper: (scene: SceneSnapshot) => SceneSnapshot
): InstrumentState['scenes'] {
  return Object.fromEntries(
    Object.entries(state.scenes).map(([id, scene]) => [id, mapper(scene)])
  ) as InstrumentState['scenes'];
}

function omit<T>(record: Readonly<Record<string, T>>, key: string): Record<string, T> {
  return Object.fromEntries(
    Object.entries(record).filter(([id]) => id !== key)
  );
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
