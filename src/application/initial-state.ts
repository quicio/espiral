import {
  DEFAULT_MASTER_VOLUME,
  isPatternChannel,
  PATTERN_LENGTH
} from '../domain/channels';
import { DEFAULT_AUTOMATION_VALUES } from '../domain/automation';
import { createDefaultKit } from '../domain/default-kit';
import { cloneKit, kitTracks } from '../domain/kit';
import { createDefaultModulation } from '../domain/modulation';
import {
  emptyStepValues,
  emptyTrackLocks,
  INITIAL_PATTERNS,
  type Pattern,
  type PatternLocks,
  type PatternSteps,
  type StepValues
} from '../domain/pattern';
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
  const pulses = Object.fromEntries(
    patternTracks.map(key => [
      key,
      isPatternChannel(key) ? generative.channelSeeds[key].pulses : 4
    ])
  ) as Record<string, number>;
  const frozen = Object.fromEntries(
    patternTracks.map(key => [key, false])
  ) as Record<string, boolean>;

  const scenes = Object.fromEntries(
    Object.entries(generative.scenes).map(([id, scene]) => {
      const steps: PatternSteps = Object.fromEntries(
        patternTracks.map(key => {
          if (!isPatternChannel(key)) return [key, emptyPattern()];
          if (id === 'umbral') return [key, INITIAL_PATTERNS[key]];
          return [
            key,
            generative.generatePattern(
              key,
              scene.params,
              pulses[key] ?? 4,
              INITIAL_SEED
            )
          ];
        })
      );

      return [
        id,
        {
          id: id as SceneId,
          name: scene.label,
          kit: cloneKit(kitTemplate),
          pattern: {
            steps,
            pulses: { ...pulses },
            frozen: { ...frozen },
            locks: Object.fromEntries(
              patternTracks.map(key => [key, emptyTrackLocks()])
            ) as PatternLocks,
            velocity: patternValues(patternTracks, 1),
            probability: patternValues(patternTracks, 1),
            ratchets: patternValues(patternTracks, 1)
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
    history: [],
    clipboard: null,
    mutationCount: 0,
    evolveCount: 0,
    evolve: false
  };
}

function patternValues(
  tracks: readonly string[],
  value: number
): Record<string, StepValues> {
  return Object.fromEntries(
    tracks.map(trackId => [trackId, emptyStepValues(value)])
  );
}
