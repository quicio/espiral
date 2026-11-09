import * as Tone from 'tone';
import type { PluginDefinition, PluginState } from '../../../domain/plugin';
import { InstrumentPluginHost } from './instrument-host';
import type { InstrumentPluginFactory } from './types';

const FM_SYNTH: PluginDefinition = {
  id: 'fm-synth',
  name: 'FM Synth',
  version: 1,
  kind: 'instrument',
  params: [
    { id: 'harmonicity', label: 'Harmonicity', min: 0.5, max: 8, defaultValue: 2, unit: 'none' },
    { id: 'modulationIndex', label: 'Index', min: 0, max: 20, defaultValue: 5, unit: 'none' },
    { id: 'attack', label: 'Attack', min: 0.001, max: 2, defaultValue: 0.02, unit: 's' },
    { id: 'decay', label: 'Decay', min: 0.01, max: 2, defaultValue: 0.3, unit: 's' },
    { id: 'sustain', label: 'Sustain', min: 0, max: 1, defaultValue: 0.4, unit: '%' },
    { id: 'release', label: 'Release', min: 0.01, max: 4, defaultValue: 1.2, unit: 's' }
  ]
};

export const fmSynthPlugin: InstrumentPluginFactory = {
  definition: FM_SYNTH,
  create(initial: PluginState) {
    const state: Record<string, number> = { ...initial };
    const synth = new Tone.FMSynth({
      harmonicity: state.harmonicity,
      modulationIndex: state.modulationIndex,
      envelope: {
        attack: state.attack,
        decay: state.decay,
        sustain: state.sustain,
        release: state.release
      }
    });

    return {
      output: synth,
      trigger(notes, duration, time, velocity) {
        const note = typeof notes === 'string' ? notes : notes[0] ?? 'C4';
        synth.triggerAttackRelease(note, duration, time, velocity);
      },
      release(time = Tone.now()) {
        synth.triggerRelease(time);
      },
      setParam(id, value, time = Tone.now()) {
        state[id] = value;
        if (id === 'harmonicity') synth.harmonicity.rampTo(value, 0.05, time);
        else if (id === 'modulationIndex') {
          synth.modulationIndex.rampTo(value, 0.05, time);
        } else if (id === 'attack') synth.envelope.attack = value;
        else if (id === 'decay') synth.envelope.decay = value;
        else if (id === 'sustain') synth.envelope.sustain = value;
        else if (id === 'release') synth.envelope.release = value;
      },
      getParam(id) {
        return state[id] ?? 0;
      },
      dispose() {
        synth.dispose();
      }
    };
  }
};

export const builtinInstruments = [fmSynthPlugin] as const;

export function createBuiltinInstrumentHost(): InstrumentPluginHost {
  return new InstrumentPluginHost().register(fmSynthPlugin);
}
