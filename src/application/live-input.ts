import type { SoundEvent } from '../domain/audio';
import type { TrackState } from '../domain/kit';
import type { ClockPort, AudioEnginePort, StatusPort } from '../domain/ports';
import type { Store } from './store';

export interface MidiInput {
  connect(handler: (data: Uint8Array) => void): Promise<boolean>;
  disconnect(): void;
}

export class LiveInputService {
  constructor(
    private readonly store: Store,
    private readonly engine: AudioEnginePort,
    private readonly clock: ClockPort,
    private readonly status: StatusPort,
    private readonly input: MidiInput
  ) {}

  async connect(): Promise<boolean> {
    try {
      await this.engine.prepare();
      const connected = await this.input.connect(data => this.handleMessage(data));
      this.status.generative(
        connected
          ? 'MIDI conectado. Tocá el track seleccionado.'
          : 'Web MIDI no está disponible en este navegador.'
      );
      return connected;
    } catch (error) {
      console.warn('No se pudo conectar MIDI:', error);
      this.status.generative('MIDI no disponible o sin permiso del navegador.');
      return false;
    }
  }

  disconnect(): void {
    this.input.disconnect();
    this.status.generative('MIDI desconectado.');
  }

  handleMessage(data: Uint8Array): void {
    if (data.length < 2) return;
    const status = data[0] ?? 0;
    const command = status & 0xf0;
    const note = data[1] ?? 0;
    const value = data[2] ?? 0;

    if (command === 0x90 && value > 0) {
      this.triggerNote(note, value / 127);
      return;
    }

    if (command === 0xb0) {
      this.handleControl(note, value);
    }
  }

  private triggerNote(note: number, velocity: number): void {
    const state = this.store.getState();
    const track = state.kit.tracks[state.selected];
    if (!track) return;
    const time = this.clock.now();
    const event = noteEvent(track, note, time, velocity);
    if (!event) return;
    this.engine.trigger(event);
  }

  private handleControl(controller: number, value: number): void {
    if (controller !== 1 && controller !== 2) return;
    const state = this.store.getState();
    const track = state.kit.tracks[state.selected];
    if (!track) return;
    const index = controller - 1;
    const macros = [...track.macros];
    macros[index] = value / 127;
    this.store.update(current => ({
      ...current,
      kit: {
        ...current.kit,
        tracks: {
          ...current.kit.tracks,
          [track.id]: { ...track, macros }
        }
      }
    }));
    this.status.generative(
      `MIDI CC${controller} · ${track.name} macro ${index + 1}.`
    );
  }
}

function noteEvent(
  track: TrackState,
  note: number,
  time: number,
  velocity: number
): SoundEvent | null {
  if (track.machine.kind === 'membrane') {
    return { type: 'kick', time, velocity };
  }

  if (track.machine.kind === 'sampler') {
    return {
      type: 'sample',
      channel: track.role === 'drone' ? 'drone' : 'perc',
      trackId: track.id,
      time,
      sampleIndex: 0,
      playbackRate: Math.pow(2, (note - 60) / 12),
      duration: '8n',
      gainDb: velocityDb(velocity)
    };
  }

  if (
    track.machine.kind === 'poly' ||
    track.machine.kind === 'mono' ||
    track.machine.kind === 'pluck' ||
    track.machine.kind === 'plugin'
  ) {
    return {
      type: 'synth',
      channel:
        track.machine.kind === 'mono' || track.machine.kind === 'pluck'
          ? 'lead'
          : 'pad',
      trackId: track.id,
      time,
      notes: midiToNote(note),
      duration: '8n',
      velocity
    };
  }

  return null;
}

function midiToNote(midi: number): string {
  const names = [
    'C',
    'C#',
    'D',
    'D#',
    'E',
    'F',
    'F#',
    'G',
    'G#',
    'A',
    'A#',
    'B'
  ];
  const value = Math.max(0, Math.min(127, Math.round(midi)));
  return `${names[value % 12] ?? 'C'}${Math.floor(value / 12) - 1}`;
}

function velocityDb(velocity: number): number {
  return velocity <= 0 ? -60 : 20 * Math.log10(velocity);
}

