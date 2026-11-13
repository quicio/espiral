import * as Tone from 'tone';

/**
 * Cache de buffers compartido por todos los tracks. Evita que cada voz de cada
 * pool descargue y decodifique el mismo WAV por separado.
 */
export class SampleLibrary {
  private readonly buffers = new Map<string, Tone.ToneAudioBuffer>();
  private readonly pending = new Map<string, Promise<Tone.ToneAudioBuffer>>();

  load(url: string): Promise<Tone.ToneAudioBuffer> {
    const loaded = this.buffers.get(url);
    if (loaded) return Promise.resolve(loaded);

    const inFlight = this.pending.get(url);
    if (inFlight) return inFlight;

    const buffer = new Tone.ToneAudioBuffer();
    const request = buffer
      .load(url)
      .then(() => {
        this.buffers.set(url, buffer);
        this.pending.delete(url);
        return buffer;
      })
      .catch(error => {
        this.pending.delete(url);
        buffer.dispose();
        throw error;
      });
    this.pending.set(url, request);
    return request;
  }

  dispose(): void {
    this.buffers.forEach(buffer => buffer.dispose());
    this.buffers.clear();
    this.pending.clear();
  }
}
