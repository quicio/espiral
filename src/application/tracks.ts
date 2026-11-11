import { PATTERN_LENGTH } from '../domain/channels';
import { createUserTrack } from '../domain/default-kit';
import {
  instrumentMachinePreset,
  MACHINE_PRESETS,
  machinePreset,
  type MachinePreset
} from '../domain/machines';
import {
  addClipsForTrack,
  clipId,
  removeClipsForTrack,
  withoutActiveTrack
} from '../domain/clip';
import {
  canEditTrackSound,
  isGenerativeRole,
  trackToConfig,
  type GenerativeRole,
  type KitState,
  type TrackState
} from '../domain/kit';
import type { InstrumentState } from '../domain/models';
import { soundPreset } from '../domain/sound-bank';
import { drumSound } from '../domain/drum-sounds';
import {
  countSteps,
  emptyStepValues,
  emptyTrackLocks,
  toPattern,
  type Pattern,
  type PatternState,
  type PatternSteps
} from '../domain/pattern';
import type { AudioEnginePort, StatusPort } from '../domain/ports';
import type { SceneSnapshot } from '../domain/scene';
import type { Store } from './store';

const MAX_TRACKS = 32;

const GENERATIVE_PATTERN_SEEDS: Record<GenerativeRole, string> = {
  drone: 'x.......x.......',
  pad: 'x.....x.....x...',
  lead: '..x...x...x...x.'
};

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
    const scenes = mapScenes(state, scene => addTrackToScene(scene, track, empty));
    const clips = addClipsForTrack(state.clips, scenes, track.id);
    const activeClip =
      clips[clipId(state.scene, track.id)] ?? clips[clipId('umbral', track.id)];
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
      scenes,
      clips,
      activeClips: activeClip
        ? { ...state.activeClips, [track.id]: activeClip.id }
        : state.activeClips,
      selected: track.id,
      history: []
    };

    this.store.update(() => next);
    this.engine.addTrack(trackToConfig(track));
    this.status.generative(`${track.name} creado.`);
  }

  addAudioTrack(name: string, dataUrl: string): void {
    if (!this.engine.supportsTrackManagement) {
      this.status.generative('Importar audio no está disponible en este motor.');
      return;
    }
    const state = this.store.getState();
    if (Object.keys(state.kit.tracks).length >= MAX_TRACKS) {
      this.status.generative(`Máximo de ${MAX_TRACKS} tracks alcanzado.`);
      return;
    }

    const created = createUserTrack(nextTrackIndex(state.kit), 'sampler');
    const track: TrackState = {
      ...created,
      name: name.replace(/\.[^.]+$/, '') || created.name,
      machine: {
        kind: 'sampler',
        samples: [dataUrl],
        voices: 1,
        fadeIn: 0.005,
        fadeOut: 0.1
      }
    };
    const pattern = Array.from(
      { length: PATTERN_LENGTH },
      (_, index) => (index === 0 ? 1 : 0)
    ) as Pattern;
    const scenes = mapScenes(state, scene => addTrackToScene(scene, track, pattern));
    const clips = addClipsForTrack(state.clips, scenes, track.id);
    const activeClip =
      clips[clipId(state.scene, track.id)] ?? clips[clipId('umbral', track.id)];
    const next: InstrumentState = {
      ...state,
      kit: {
        ...state.kit,
        tracks: { ...state.kit.tracks, [track.id]: track }
      },
      pattern: {
        ...withPattern(state.pattern, track.id, pattern),
        pulses: { ...state.pattern.pulses, [track.id]: 1 }
      },
      scenes,
      clips,
      activeClips: activeClip
        ? { ...state.activeClips, [track.id]: activeClip.id }
        : state.activeClips,
      selected: track.id,
      history: []
    };

    this.store.update(() => next);
    this.engine.addTrack(trackToConfig(track));
    this.status.generative(`${track.name} importado como audio.`);
  }

  removeSelectedTrack(): void {
    this.removeTrack(this.store.getState().selected);
  }

  setMachine(trackId: string, machineId: string): void {
    const state = this.store.getState();
    const track = state.kit.tracks[trackId];
    if (!track) return;
    if (!canEditTrackSound(track)) {
      this.status.generative(
        'La máquina de bombo, bajo, hats y percusión es fija.'
      );
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
    if (!canEditTrackSound(track)) {
      this.status.generative(
        'El banco de sonidos se aplica a tracks editables: usuario, drone, pad y lead.'
      );
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

  applyKitSound(trackId: string, soundId: string): void {
    const state = this.store.getState();
    const track = state.kit.tracks[trackId];
    if (!track) return;

    const drum = drumSound(soundId);
    if (drum) {
      if (drum.trackId !== track.id) return;
      const scenes = mapScenes(state, scene => ({
        ...scene,
        kit: withTrackMachine(scene.kit, trackId, drum.machineId, drum.machine)
      }));
      const next: InstrumentState = {
        ...state,
        kit: withTrackMachine(state.kit, trackId, drum.machineId, drum.machine),
        scenes,
        history: []
      };
      this.store.update(() => next);
      this.engine.setTrackMachine(trackId, drum.machine);
      this.status.generative(`${track.name} · ${drum.name}.`);
      return;
    }

    if (!canEditTrackSound(track)) return;
    const preset = soundPreset(soundId);
    if (!preset) return;

    const scenes = mapScenes(state, scene => ({
      ...scene,
      kit: withTrackSound(scene.kit, trackId, preset)
    }));
    const next: InstrumentState = {
      ...state,
      kit: withTrackSound(state.kit, trackId, preset),
      scenes,
      history: []
    };
    this.store.update(() => next);
    this.engine.setTrackMachine(trackId, preset.machine);
    this.status.generative(`${track.name} · ${preset.name}.`);
  }

  togglePattern(trackId: string): void {
    const state = this.store.getState();
    const track = state.kit.tracks[trackId];
    if (!track) return;
    if (!isGenerativeRole(track.role)) {
      this.status.generative('Solo drone, pad y lead pueden alternar patrón.');
      return;
    }
    if (track.hasPattern) this.detachPattern(trackId);
    else this.attachPattern(trackId);
  }

  private attachPattern(trackId: string): void {
    const state = this.store.getState();
    const track = state.kit.tracks[trackId];
    if (!track || !isGenerativeRole(track.role) || track.hasPattern) return;
    const role = track.role;

    const pattern = toPattern(
      Array.from(
        { length: PATTERN_LENGTH },
        (_, index) =>
          GENERATIVE_PATTERN_SEEDS[role][index] === 'x' ? 1 : 0
      )
    );
    const scenes = mapScenes(state, scene => ({
      ...scene,
      kit: withTrackPattern(scene.kit, trackId, true),
      pattern: withPattern(scene.pattern, trackId, pattern)
    }));
    const clips = addClipsForTrack(state.clips, scenes, trackId);
    const activeClip =
      clips[clipId(state.scene, trackId)] ?? clips[clipId('umbral', trackId)];
    const next: InstrumentState = {
      ...state,
      kit: withTrackPattern(state.kit, trackId, true),
      pattern: withPattern(state.pattern, trackId, pattern),
      scenes,
      clips,
      activeClips: activeClip
        ? { ...state.activeClips, [trackId]: activeClip.id }
        : state.activeClips,
      selected: trackId,
      history: []
    };

    this.store.update(() => next);
    this.status.generative(`${track.name} ahora tiene patrón.`);
  }

  private detachPattern(trackId: string): void {
    const state = this.store.getState();
    const track = state.kit.tracks[trackId];
    if (!track || !isGenerativeRole(track.role) || !track.hasPattern) return;

    const next: InstrumentState = {
      ...state,
      kit: withTrackPattern(state.kit, trackId, false),
      pattern: removeTrackFromPattern(state.pattern, trackId),
      scenes: mapScenes(state, scene => ({
        ...scene,
        kit: withTrackPattern(scene.kit, trackId, false),
        pattern: removeTrackFromPattern(scene.pattern, trackId)
      })),
      clips: removeClipsForTrack(state.clips, trackId),
      activeClips: withoutActiveTrack(state.activeClips, trackId),
      history: []
    };

    this.store.update(() => next);
    this.status.generative(`${track.name} vuelve a modo generativo.`);
  }

  moveTrack(trackId: string, offset: number): void {
    const state = this.store.getState();
    if (!state.kit.tracks[trackId]) return;
    const tracks = reorderTracks(state.kit.tracks, trackId, offset);
    if (tracks === state.kit.tracks) return;
    const next: InstrumentState = {
      ...state,
      kit: { ...state.kit, tracks },
      scenes: mapScenes(state, scene => ({
        ...scene,
        kit: { ...scene.kit, tracks: reorderTracks(scene.kit.tracks, trackId, offset) }
      })),
      history: []
    };
    this.store.update(() => next);
    this.status.generative('Orden de tracks actualizado.');
  }

  renameTrack(trackId: string, name: string): void {
    const nextName = name.trim();
    if (!nextName) return;
    const state = this.store.getState();
    const track = state.kit.tracks[trackId];
    if (!track || track.name === nextName) return;
    const oldName = track.name;
    const clips = Object.fromEntries(
      Object.entries(state.clips).map(([id, clip]) => [
        id,
        clip.trackId === trackId && clip.name === oldName
          ? { ...clip, name: nextName }
          : clip
      ])
    );
    const next: InstrumentState = {
      ...state,
      kit: {
        ...state.kit,
        tracks: {
          ...state.kit.tracks,
          [trackId]: { ...track, name: nextName }
        }
      },
      scenes: mapScenes(state, scene => {
        const sceneTrack = scene.kit.tracks[trackId];
        if (!sceneTrack) return scene;
        return {
          ...scene,
          kit: {
            ...scene.kit,
            tracks: {
              ...scene.kit.tracks,
              [trackId]: { ...sceneTrack, name: nextName }
            }
          }
        };
      }),
      clips,
      history: []
    };
    this.store.update(() => next);
    this.status.generative(`Track renombrado a ${nextName}.`);
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
      clips: removeClipsForTrack(state.clips, trackId),
      activeClips: withoutActiveTrack(state.activeClips, trackId),
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

function reorderTracks(
  tracks: Readonly<Record<string, TrackState>>,
  trackId: string,
  offset: number
): Readonly<Record<string, TrackState>> {
  const entries = Object.entries(tracks);
  const index = entries.findIndex(([id]) => id === trackId);
  const target = index + offset;
  if (index < 0 || target < 0 || target >= entries.length) return tracks;
  const [entry] = entries.splice(index, 1);
  if (!entry) return tracks;
  entries.splice(target, 0, entry);
  return Object.fromEntries(entries);
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

function withTrackPattern(
  kit: KitState,
  trackId: string,
  hasPattern: boolean
): KitState {
  const track = kit.tracks[trackId];
  if (!track) return kit;
  return {
    ...kit,
    tracks: {
      ...kit.tracks,
      [trackId]: { ...track, hasPattern }
    }
  };
}

function withTrackMachine(
  kit: KitState,
  trackId: string,
  machineId: string,
  machine: MachinePreset['machine']
): KitState {
  const track = kit.tracks[trackId];
  if (!track) return kit;
  return {
    ...kit,
    tracks: {
      ...kit.tracks,
      [trackId]: { ...track, machineId, machine }
    }
  };
}

function withTrackSound(
  kit: KitState,
  trackId: string,
  preset: {
    readonly machineId: string;
    readonly machine: MachinePreset['machine'];
    readonly noteSource: MachinePreset['noteSource'];
  }
): KitState {
  const track = kit.tracks[trackId];
  if (!track) return kit;
  return {
    ...kit,
    tracks: {
      ...kit.tracks,
      [trackId]: {
        ...track,
        machineId: preset.machineId,
        machine: preset.machine,
        noteSource: preset.noteSource
      }
    }
  };
}

function withPattern(
  pattern: PatternState,
  trackId: string,
  steps: Pattern
): PatternState {
  return {
    ...pattern,
    steps: { ...pattern.steps, [trackId]: steps },
    pulses: { ...pattern.pulses, [trackId]: countSteps(steps) },
    frozen: { ...pattern.frozen, [trackId]: false },
    locks: { ...pattern.locks, [trackId]: emptyTrackLocks() },
    velocity: { ...pattern.velocity, [trackId]: emptyStepValues(1) },
    probability: {
      ...pattern.probability,
      [trackId]: emptyStepValues(1)
    },
    ratchets: { ...pattern.ratchets, [trackId]: emptyStepValues(1) }
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
