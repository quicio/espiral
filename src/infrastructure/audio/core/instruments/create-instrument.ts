import type { CoreTrackConfig } from '../types';
import type { CoreInstrument } from './instrument';
import { FmInstrument } from './fm-instrument';
import { MembraneInstrument } from './membrane-instrument';
import { MonoInstrument } from './mono-instrument';
import { PluckInstrument } from './pluck-instrument';
import { PolyInstrument } from './poly-instrument';
import { SamplerInstrument } from './sampler-instrument';

export function createInstrument(
  track: CoreTrackConfig,
  sampleRate: number
): CoreInstrument {
  switch (track.machine.kind) {
    case 'membrane':
      return new MembraneInstrument(sampleRate);
    case 'mono':
      return new MonoInstrument(track.machine, sampleRate);
    case 'poly':
      return new PolyInstrument(track.machine, sampleRate);
    case 'pluck':
      return new PluckInstrument(track.machine, sampleRate);
    case 'sampler':
      return new SamplerInstrument(
        track.machine,
        track.samples ?? [],
        sampleRate
      );
    case 'plugin':
      return track.machine.pluginId === 'fm-synth'
        ? new FmInstrument(track.machine, sampleRate)
        : new SilentInstrument();
    default:
      return new SilentInstrument();
  }
}

class SilentInstrument implements CoreInstrument {
  render(): number {
    return 0;
  }

  stop(): void {}

  reset(): void {}
}
