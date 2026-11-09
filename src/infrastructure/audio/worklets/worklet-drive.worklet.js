class WorkletDriveProcessor extends AudioWorkletProcessor {
  static get parameterDescriptors() {
    return [
      { name: 'drive', defaultValue: 3, minValue: 1, maxValue: 10, automationRate: 'a-rate' },
      { name: 'mix', defaultValue: 0.5, minValue: 0, maxValue: 1, automationRate: 'a-rate' }
    ];
  }

  process(inputs, outputs, parameters) {
    const input = inputs[0];
    const output = outputs[0];
    if (!input || !output) return true;

    const drive = parameters.drive;
    const mix = parameters.mix;

    for (let channel = 0; channel < output.length; channel += 1) {
      const inputChannel = input[channel] || input[0];
      const outputChannel = output[channel];
      if (!inputChannel || !outputChannel) continue;

      for (let index = 0; index < outputChannel.length; index += 1) {
        const dry = inputChannel[index] || 0;
        const driveValue = drive.length > 1 ? drive[index] : drive[0];
        const mixValue = mix.length > 1 ? mix[index] : mix[0];
        const normalized = Math.tanh(driveValue);
        const wet = normalized === 0 ? dry : Math.tanh(dry * driveValue) / normalized;
        outputChannel[index] = dry * (1 - mixValue) + wet * mixValue;
      }
    }

    return true;
  }
}

registerProcessor('espiral-worklet-drive', WorkletDriveProcessor);
