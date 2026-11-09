import * as Tone from 'tone';
import workletUrl from '../worklets/worklet-drive.worklet.js?url';
import type { PluginDefinition } from '../../../domain/plugin';
import type { PluginFactory, PluginInstance } from './types';

const DEFINITION: PluginDefinition = {
  id: 'worklet-drive',
  name: 'Worklet Drive',
  version: 1,
  kind: 'effect',
  params: [
    { id: 'drive', label: 'Drive', min: 1, max: 10, defaultValue: 3, unit: 'none' },
    { id: 'mix', label: 'Mix', min: 0, max: 1, defaultValue: 0.5, unit: '%' }
  ]
};

const PROCESSOR = 'espiral-worklet-drive';
let loaded = false;

export const workletDrivePlugin: PluginFactory = {
  definition: DEFINITION,
  async load() {
    if (loaded) return;
    await Tone.getContext().rawContext.audioWorklet.addModule(workletUrl);
    loaded = true;
  },
  create(): PluginInstance {
    if (!loaded) throw new Error('El plugin worklet-drive no está cargado.');

    const input = new Tone.Gain(1);
    const output = new Tone.Gain(1);
    const node = Tone.getContext().createAudioWorkletNode(PROCESSOR, {
      numberOfInputs: 1,
      numberOfOutputs: 1,
      outputChannelCount: [2],
      parameterData: { drive: 3, mix: 0.5 }
    });

    Tone.connect(input, node);
    Tone.connect(node, output);

    return {
      input,
      output,
      setParam(id, value, time = Tone.now()) {
        const param = node.parameters.get(id);
        if (param) param.setValueAtTime(value, time);
      },
      getParam(id) {
        return node.parameters.get(id)?.value ?? 0;
      },
      dispose() {
        input.disconnect();
        output.disconnect();
        node.disconnect();
        input.dispose();
        output.dispose();
      }
    };
  }
};
