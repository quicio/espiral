/**
 * Prototipo de voz 303 en AudioWorklet.
 *
 * No pretende ser el 303 original: es un mono de una voz con sierra/cuadrada,
 * filtro ladder de 4 polos aproximado, acento y slide, todo en el hilo de audio.
 * La comparación contra Tone.MonoSynth está en src/audio-check/acid303-bench.ts.
 */
class Acid303Processor extends AudioWorkletProcessor {
  constructor(options) {
    super();
    const processorOptions = options?.processorOptions ?? {};
    this.params = {
      waveform: 'sawtooth',
      cutoff: 420,
      resonance: 0.86,
      envAmount: 3.2,
      envDecay: 0.22,
      envSustain: 0.05,
      glide: 0.06,
      ...(processorOptions.params ?? {})
    };
    this.resetVoice();
    this.queue = (processorOptions.notes ?? []).map(note => ({
      ...note,
      delay: Math.max(0, Math.round((note.time ?? 0) * sampleRate))
    }));
    this.port.onmessage = event => this.handleMessage(event.data);
  }

  resetVoice() {
    this.phase = 0;
    this.frequency = 0;
    this.targetFrequency = 0;
    this.velocity = 1;
    this.slide = false;
    this.gate = 0;
    this.gateLeft = 0;
    this.amp = 0;
    this.ampStage = 'idle';
    this.filterEnv = 0;
    this.filterStage = 'idle';
    this.accent = false;
    this.active = false;
    this.s1 = 0;
    this.s2 = 0;
    this.s3 = 0;
    this.s4 = 0;
  }

  handleMessage(message) {
    if (!message) return;
    if (message.type === 'params') {
      this.params = { ...this.params, ...message.values };
      return;
    }
    if (message.type === 'stop') {
      this.resetVoice();
      this.queue.length = 0;
      return;
    }
    if (message.type !== 'note') return;
    this.queue.push({
      ...message,
      delay: Math.max(0, Math.round((message.time - currentTime) * sampleRate))
    });
  }

  startNote(message) {
    this.targetFrequency = message.frequency;
    if (!this.slide || this.frequency <= 0) {
      this.frequency = message.frequency;
      this.phase = 0;
      this.s1 = 0;
      this.s2 = 0;
      this.s3 = 0;
      this.s4 = 0;
    }
    this.velocity = Math.max(0, Math.min(1, message.velocity ?? 1));
    this.slide = message.slide === true;
    this.accent = message.accent === true;
    this.gate = Math.max(0.04, message.duration ?? 0.2);
    this.gateLeft = Math.round(this.gate * sampleRate);
    this.amp = 0;
    this.ampStage = 'attack';
    this.filterEnv = 1;
    this.filterStage = 'decay';
    this.active = true;
    this.glideCoef =
      1 - Math.exp(-1 / (Math.max(0.001, this.params.glide) * sampleRate));
    this.refreshFilterCoefficient();
  }

  refreshFilterCoefficient() {
    const cutoff = Math.max(
      30,
      Math.min(
        sampleRate * 0.45,
        this.params.cutoff *
          Math.pow(
            2,
            this.params.envAmount * this.filterEnv + (this.accent ? 0.45 : 0)
          )
      )
    );
    // Aproximación de tan(pi*fc/sr) para fc << Nyquist.
    const g = (Math.PI * cutoff) / sampleRate;
    this.G = g / (1 + g);
  }

  process(_inputs, outputs) {
    const output = outputs[0];
    const left = output?.[0];
    if (!left) return true;
    const right = output[1] ?? left;
    for (let frame = 0; frame < left.length; frame += 1) {
      for (let index = 0; index < this.queue.length; index += 1) {
        const note = this.queue[index];
        if (note.delay > 0) {
          note.delay -= 1;
          continue;
        }
        this.startNote(note);
        this.queue.splice(index, 1);
        index -= 1;
      }

      if (!this.active) {
        left[frame] = 0;
        if (right !== left) right[frame] = 0;
        continue;
      }

      if (this.gateLeft > 0) this.gateLeft -= 1;
      else if (this.ampStage !== 'release') {
        this.ampStage = 'release';
        this.filterStage = 'release';
      }

      if (this.slide) {
        this.frequency +=
          (this.targetFrequency - this.frequency) * this.glideCoef;
      } else {
        this.frequency = this.targetFrequency;
      }

      this.phase += this.frequency / sampleRate;
      if (this.phase >= 1) this.phase -= 1;
      let oscillator =
        this.params.waveform === 'square'
          ? this.phase < 0.5
            ? 1
            : -1
          : 2 * this.phase - 1;

      // Envolvente de amplitud: ataque corto, decay a sustain y release.
      if (this.ampStage === 'attack') {
        this.amp += 1 / (0.004 * sampleRate);
        if (this.amp >= 1) {
          this.amp = 1;
          this.ampStage = 'decay';
        }
      } else if (this.ampStage === 'decay') {
        this.amp += (0.06 - this.amp) * 0.002;
      } else if (this.ampStage === 'release') {
        this.amp += (0 - this.amp) * 0.006;
        if (this.amp < 0.0001) {
          this.active = false;
          this.resetVoice();
          left[frame] = 0;
          if (right !== left) right[frame] = 0;
          continue;
        }
      }

      // Envolvente de filtro: cae desde 1 hasta sustain.
      if (this.filterStage === 'decay') {
        const target = this.params.envSustain;
        this.filterEnv += (target - this.filterEnv) * 0.0012;
      } else if (this.filterStage === 'release') {
        this.filterEnv += (0 - this.filterEnv) * 0.004;
      }

      if ((frame & 31) === 0) this.refreshFilterCoefficient();
      const accentBoost = this.accent ? 1.35 : 1;
      const feedback = Math.min(0.98, this.params.resonance) * 4;
      const input =
        oscillator * accentBoost - feedback * (this.s4 - 0.5 * oscillator);
      // Soft clip barato en vez de Math.tanh por muestra.
      const soft = value => value / (1 + Math.abs(value));
      this.s1 += this.G * (soft(input) - soft(this.s1));
      this.s2 += this.G * (soft(this.s1) - soft(this.s2));
      this.s3 += this.G * (soft(this.s2) - soft(this.s3));
      this.s4 += this.G * (soft(this.s3) - soft(this.s4));

      const sample = this.s4 * this.amp * this.velocity * 0.8;
      left[frame] = sample;
      if (right !== left) right[frame] = sample;
    }

    return true;
  }
}

registerProcessor('espiral-acid-303', Acid303Processor);
