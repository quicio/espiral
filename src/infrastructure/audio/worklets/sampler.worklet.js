class EspiralSamplerProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.buffers = new Map();
    this.voices = [];
    this.maxVoices = 8;
    this.port.onmessage = event => this.handleMessage(event.data);
  }

  handleMessage(message) {
    if (!message) return;
    if (message.type === 'buffer') {
      this.buffers.set(message.index, {
        channels: message.channels,
        length: message.channels[0]?.length ?? 0,
        sampleRate: message.sampleRate
      });
      return;
    }
    if (message.type === 'config') {
      this.maxVoices = Math.max(1, Math.round(message.voices ?? 8));
      return;
    }
    if (message.type === 'stop') {
      this.voices.length = 0;
      return;
    }
    if (message.type !== 'play') return;

    const buffer = this.buffers.get(message.index);
    if (!buffer || buffer.length === 0) return;

    const rate = Math.max(0.01, message.rate ?? 1);
    const requested = message.duration
      ? message.duration * sampleRate
      : buffer.length / rate;
    const total = Math.min(buffer.length / rate, requested);
    if (total <= 1) return;

    const delay = Math.max(
      0,
      Math.round((message.time - currentTime) * sampleRate)
    );
    while (this.voices.length >= this.maxVoices) {
      this.voices.shift();
    }
    this.voices.push({
      buffer,
      position: 0,
      rate,
      gain: message.gain ?? 1,
      fadeIn: Math.max(1, (message.fadeIn ?? 0.004) * sampleRate),
      fadeOut: Math.max(1, (message.fadeOut ?? 0.03) * sampleRate),
      total,
      played: 0,
      delay,
      done: false
    });
  }

  process(_inputs, outputs) {
    const output = outputs[0];    if (!output || output.length === 0) return true;
    const left = output[0];
    const right = output[1] ?? output[0];
    if (!left) return true;

    for (let frame = 0; frame < left.length; frame += 1) {
      let mixLeft = 0;
      let mixRight = 0;
      for (let index = 0; index < this.voices.length; index += 1) {
        const voice = this.voices[index];
        if (voice.done) continue;

        if (voice.delay > 0) {
          voice.delay -= 1;
          continue;
        }

        if (voice.played >= voice.total) {
          voice.done = true;
          continue;
        }

        const channels = voice.buffer.channels;
        const channel0 = channels[0];
        if (!channel0) {
          voice.done = true;
          continue;
        }

        const position = voice.position;
        const lower = Math.floor(position);
        const fraction = position - lower;
        const sample0 = channel0[lower] ?? 0;
        const sample1 = channel0[lower + 1] ?? sample0;
        let sampleLeft = sample0 + (sample1 - sample0) * fraction;
        let sampleRight = sampleLeft;

        const channel1 = channels[1];
        if (channel1) {
          const right0 = channel1[lower] ?? 0;
          const right1 = channel1[lower + 1] ?? right0;
          sampleRight = right0 + (right1 - right0) * fraction;
        }

        const fadeIn = Math.min(1, (voice.played + 1) / voice.fadeIn);
        const fadeOut = Math.min(1, (voice.total - voice.played) / voice.fadeOut);
        const gain = voice.gain * Math.min(fadeIn, fadeOut);

        mixLeft += sampleLeft * gain;
        mixRight += sampleRight * gain;

        voice.position += voice.rate;
        voice.played += 1;
      }

      left[frame] += mixLeft;
      right[frame] += mixRight;
    }

    let write = 0;
    for (let read = 0; read < this.voices.length; read += 1) {
      const voice = this.voices[read];
      if (!voice.done) this.voices[write++] = voice;
    }
    this.voices.length = write;
    return true;
  }
}

registerProcessor('espiral-sampler', EspiralSamplerProcessor);
