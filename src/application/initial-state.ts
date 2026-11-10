import {
  DEFAULT_MASTER_VOLUME,
  isPatternChannel,
  PATTERN_LENGTH
} from '../domain/channels';
import { DEFAULT_AUTOMATION_VALUES } from '../domain/automation';
import {
  DEFAULT_CLIP_QUANTIZE,
  activeClipsForScene,
  createClipsFromScenes
} from '../domain/clip';
import { createDefaultKit } from '../domain/default-kit';
import { cloneKit, kitTracks } from '../domain/kit';
import { createDefaultModulation } from '../domain/modulation';
import {
  countSteps,
  emptyTrackLocks,
  type Pattern,
  type PatternLocks,
  type PatternSteps,
  type StepValues
} from '../domain/pattern';
import {
  defaultGroovePattern,
  defaultProbability,
  defaultRatchets,
  defaultVelocity
} from '../domain/default-groove';
import type { InstrumentState, SceneId } from '../domain/models';
import type { GenerativePort } from '../domain/ports';
import type { SceneCollection } from '../domain/scene';

const INITIAL_SEED = 4821;

export function createInitialState(generative: GenerativePort): InstrumentState {
  const kitTemplate = createDefaultKit();
  const patternTracks = kitTracks(kitTemplate)
    .filter(track => track.hasPattern)
    .map(track => track.id);
  const emptyPattern = (): Pattern =>
    Array.from({ length: PATTERN_LENGTH }, () => 0);
  const frozen = Object.fromEntries(
    patternTracks.map(key => [key, false])
  ) as Record<string, boolean>;

  const scenes = Object.fromEntries(
    Object.entries(generative.scenes).map(([id, scene]) => {
      const grooves = Object.fromEntries(
        patternTracks.map(key => [
          key,
          defaultGroovePattern(id as SceneId, key)
        ])
      ) as Record<string, Pattern | null>;
      const steps: PatternSteps = Object.fromEntries(
        patternTracks.map(key => [key, grooves[key] ?? emptyPattern()])
      );
      const pulses = Object.fromEntries(
        patternTracks.map(key => {
          const groove = grooves[key];
          if (groove) return [key, countSteps(groove)];
          return [
            key,
            isPatternChannel(key) ? generative.channelSeeds[key].pulses : 4
          ];
        })
      ) as Record<string, number>;

      return [
        id,
        {
          id: id as SceneId,
          name: scene.label,
          kit: cloneKit(kitTemplate),
          pattern: {
            steps,
            pulses,
            frozen: { ...frozen },
            locks: Object.fromEntries(
              patternTracks.map(key => [key, emptyTrackLocks()])
            ) as PatternLocks,
            velocity: stepValues(patternTracks, defaultVelocity),
            probability: stepValues(patternTracks, defaultProbability),
            ratchets: stepValues(patternTracks, defaultRatchets)
          },
          harmony: { ...scene.harmony },
          seed: INITIAL_SEED,
          params: { ...scene.params },
          masterVolume: DEFAULT_MASTER_VOLUME
        }
      ];
    })
  ) as unknown as SceneCollection;

  const initial = scenes.umbral;
  const clips = createClipsFromScenes(scenes);

  return {
    selected: 'kick',
    scene: 'umbral',
    scenes,
    seed: initial.seed,
    params: initial.params,
    harmony: initial.harmony,
    pattern: initial.pattern,
    automation: {
      enabled: false,
      target: 'pad-reverb',
      values: [...DEFAULT_AUTOMATION_VALUES]
    },
    transport: {
      bpm: 120,
      swing: 0.12,
      humanize: 0.15,
      lookAhead: 0.1,
      playing: false,
      preparing: false,
      currentStep: -1
    },
    kit: initial.kit,
    modulation: createDefaultModulation(),
    masterVolume: initial.masterVolume,
    clips,
    activeClips: activeClipsForScene(clips, 'umbral'),
    clipQuantize: DEFAULT_CLIP_QUANTIZE,
    history: [],
    clipboard: null,
    mutationCount: 0,
    evolveCount: 0,
    evolve: false
  };
}

function stepValues(
  tracks: readonly string[],
  factory: (trackId: string) => StepValues
): Record<string, StepValues> {
  return Object.fromEntries(
    tracks.map(trackId => [trackId, [...factory(trackId)]])
  );
}
