import * as Tone from 'tone';
import type { PluginDefinition } from '../../../domain/plugin';
import { PluginHost } from './plugin-host';
import type { PluginFactory } from './types';
import { workletDrivePlugin } from './worklet-drive';

const FILTER: PluginDefinition = {
  id: 'filter',
  name: 'SVF Filter',
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
    { id: 'q', label: 'Resonance', min: 0.1, max: 20, defaultValue: 1, unit: 'q', curve: 'log' }
  ]
};

const DELAY: PluginDefinition = {
  id: 'delay',
  name: 'Feedback Delay',
  version: 1,
  kind: 'effect',
  params: [
    { id: 'wet', label: 'Mix', min: 0, max: 1, defaultValue: 0.3, unit: '%' },
    { id: 'feedback', label: 'Feedback', min: 0, max: 1, defaultValue: 0.35, unit: '%' },
    { id: 'time', label: 'Time', min: 0.01, max: 2, defaultValue: 0.25, unit: 's' }
  ]
};

const REVERB: PluginDefinition = {
  id: 'reverb',
  name: 'Convolution Reverb',
  version: 1,
  kind: 'effect',
  params: [
    { id: 'wet', label: 'Mix', min: 0, max: 1, defaultValue: 0.5, unit: '%' },
    { id: 'decay', label: 'Decay', min: 0.1, max: 10, defaultValue: 4, unit: 's' }
  ]
};

const DRIVE: PluginDefinition = {
  id: 'drive',
  name: 'Drive',
  version: 1,
  kind: 'effect',
  params: [
    { id: 'drive', label: 'Drive', min: 0, max: 1, defaultValue: 0.4, unit: '%' },
    { id: 'mix', label: 'Mix', min: 0, max: 1, defaultValue: 0.5, unit: '%' }
  ]
};

const COMPRESSOR: PluginDefinition = {
  id: 'compressor',
  name: 'Compressor',
  version: 1,
  kind: 'effect',
  params: [
    { id: 'threshold', label: 'Threshold', min: -60, max: 0, defaultValue: -18, unit: 'db' },
    { id: 'ratio', label: 'Ratio', min: 1, max: 20, defaultValue: 4, unit: 'ratio' },
    { id: 'attack', label: 'Attack', min: 0.001, max: 0.2, defaultValue: 0.01, unit: 's' },
    { id: 'release', label: 'Release', min: 0.01, max: 1, defaultValue: 0.2, unit: 's' }
  ]
};

export const filterPlugin: PluginFactory = {
  definition: FILTER,
  create() {
    const filter = new Tone.Filter({ type: 'lowpass', frequency: 1200, Q: 1 });
    return {
      input: filter,
      output: filter,
      setParam(id, value, time = Tone.now()) {
        if (id === 'cutoff') filter.frequency.rampTo(value, 0.05, time);
        else if (id === 'q') filter.Q.rampTo(value, 0.05, time);
      },
      getParam(id) {
        return id === 'cutoff' ? Number(filter.frequency.value) : Number(filter.Q.value);
      },
      dispose() {
        filter.dispose();
      }
    };
  }
};

export const delayPlugin: PluginFactory = {
  definition: DELAY,
  create() {
    const delay = new Tone.FeedbackDelay({ delayTime: 0.25, feedback: 0.3, wet: 0.3 });
    return {
      input: delay,
      output: delay,
      setParam(id, value, time = Tone.now()) {
        if (id === 'wet') delay.wet.rampTo(value, 0.05, time);
        else if (id === 'feedback') delay.feedback.rampTo(value, 0.05, time);
        else if (id === 'time') delay.delayTime.rampTo(value, 0.05, time);
      },
      getParam(id) {
        if (id === 'feedback') return delay.feedback.value;
        if (id === 'time') return Number(delay.delayTime.value);
        return delay.wet.value;
      },
      dispose() {
        delay.dispose();
      }
    };
  }
};

export const reverbPlugin: PluginFactory = {
  definition: REVERB,
  create() {
    const reverb = new Tone.Reverb({ decay: 4, preDelay: 0.02, wet: 0.5 });
    return {
      input: reverb,
      output: reverb,
      setParam(id, value, time = Tone.now()) {
        if (id === 'wet') reverb.wet.rampTo(value, 0.05, time);
        else if (id === 'decay' && Math.abs(Number(reverb.decay) - value) > 0.001) {
          reverb.decay = value;
        }
      },
      getParam(id) {
        return id === 'decay' ? Number(reverb.decay) : reverb.wet.value;
      },
      async prepare() {
        await reverb.ready;
      },
      dispose() {
        reverb.dispose();
      }
    };
  }
};

export const drivePlugin: PluginFactory = {
  definition: DRIVE,
  create() {
    const distortion = new Tone.Distortion({ distortion: 0.4, oversample: '2x', wet: 0.5 });
    return {
      input: distortion,
      output: distortion,
      setParam(id, value, time = Tone.now()) {
        if (id === 'drive') distortion.distortion = value;
        else if (id === 'mix') distortion.wet.rampTo(value, 0.05, time);
      },
      getParam(id) {
        return id === 'mix' ? distortion.wet.value : distortion.distortion;
      },
      dispose() {
        distortion.dispose();
      }
    };
  }
};

export const compressorPlugin: PluginFactory = {
  definition: COMPRESSOR,
  create() {
    const compressor = new Tone.Compressor({
      threshold: -18,
      ratio: 4,
      attack: 0.01,
      release: 0.2
    });
    return {
      input: compressor,
      output: compressor,
      setParam(id, value, time = Tone.now()) {
        if (id === 'threshold') compressor.threshold.rampTo(value, 0.05, time);
        else if (id === 'ratio') compressor.ratio.rampTo(value, 0.05, time);
        else if (id === 'attack') compressor.attack.rampTo(value, 0.05, time);
        else if (id === 'release') compressor.release.rampTo(value, 0.05, time);
      },
      getParam(id) {
        if (id === 'threshold') return compressor.threshold.value;
        if (id === 'ratio') return compressor.ratio.value;
        if (id === 'attack') return Number(compressor.attack.value);
        return Number(compressor.release.value);
      },
      dispose() {
        compressor.dispose();
      }
    };
  }
};

export function createBuiltinPluginHost(): PluginHost {
  return new PluginHost()
    .register(filterPlugin)
    .register(delayPlugin)
    .register(reverbPlugin)
    .register(drivePlugin)
    .register(compressorPlugin)
    .register(workletDrivePlugin);
}

export const builtinPlugins = [
  filterPlugin,
  delayPlugin,
  reverbPlugin,
  drivePlugin,
  compressorPlugin,
  workletDrivePlugin
] as const;
