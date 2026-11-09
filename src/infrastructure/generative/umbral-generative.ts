import {
  CHANNEL_SEEDS,
  DEFAULT_PARAMS,
  PATTERN_LENGTH,
  PROGRESSIONS,
  ROOTS,
  SCALES,
  SCENES,
  chordNotes,
  count,
  euclidean,
  fillPattern,
  generatePattern,
  hash01,
  midiToNote,
  mutatePattern,
  rotatePattern,
  scaleDegreeMidi,
  scaleNotes,
  thinPattern
} from '@quicio/umbral-tone/generative';
import type { PatternChannel } from '../../domain/channels';
import type {
  ChannelSeed,
  GenerativeParams,
  ProgressionDefinition,
  ProgressionId,
  RootDefinition,
  ScaleDefinition,
  ScaleId,
  SceneDefinition,
  SceneId
} from '../../domain/models';
import type { GenerativePort } from '../../domain/ports';
import { toPattern, type Pattern } from '../../domain/pattern';

export class UmbralGenerative implements GenerativePort {
  readonly patternLength = PATTERN_LENGTH;
  readonly scenes = SCENES as unknown as Record<SceneId, SceneDefinition>;
  readonly defaultParams = DEFAULT_PARAMS as unknown as GenerativeParams;
  readonly roots = ROOTS as unknown as readonly RootDefinition[];
  readonly scales = SCALES as unknown as Record<ScaleId, ScaleDefinition>;
  readonly progressions = PROGRESSIONS as unknown as Record<ProgressionId, ProgressionDefinition>;
  readonly channelSeeds = CHANNEL_SEEDS as unknown as Record<PatternChannel, ChannelSeed>;

  generatePattern(
    channel: string,
    params: GenerativeParams,
    pulses: number,
    seed: number
  ): Pattern {
    return toPattern(generatePattern(channel, params, pulses, seed));
  }

  mutatePattern(
    pattern: Pattern,
    params: GenerativeParams,
    seed: number,
    channel: string
  ): Pattern {
    return toPattern(mutatePattern(pattern, params, seed, channel));
  }

  thinPattern(
    pattern: Pattern,
    params: GenerativeParams,
    seed: number,
    channel: string
  ): Pattern {
    return toPattern(thinPattern(pattern, params, seed, channel));
  }

  fillPattern(
    pattern: Pattern,
    params: GenerativeParams,
    seed: number,
    channel: string
  ): Pattern {
    return toPattern(fillPattern(pattern, params, seed, channel));
  }

  rotatePattern(pattern: Pattern, amount: number): Pattern {
    return toPattern(rotatePattern(pattern, amount));
  }

  euclidean(steps: number, pulses: number, offset: number): Pattern {
    return toPattern(euclidean(steps, pulses, offset));
  }

  count(pattern: Pattern): number {
    return count(pattern);
  }

  hash01(seed: number, key: string, step: number, salt: number): number {
    return hash01(seed, key, step, salt);
  }

  midiToNote(midi: number): string {
    return midiToNote(midi);
  }

  scaleDegreeMidi(root: number, scale: ScaleId, degree: number, octave: number): number {
    return scaleDegreeMidi(root, scale, degree, octave);
  }

  scaleNotes(root: number, scale: ScaleId, octave: number, countNotes: number): readonly string[] {
    return scaleNotes(root, scale, octave, countNotes);
  }

  chordNotes(
    root: number,
    scale: ScaleId,
    degree: number,
    octave: number,
    size: number
  ): readonly string[] {
    return chordNotes(root, scale, degree, octave, size);
  }
}
