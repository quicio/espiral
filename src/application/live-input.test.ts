import { describe, expect, it } from 'vitest';
import { createInitialState } from './initial-state';
import { LiveInputService, type MidiInput } from './live-input';
import { Store } from './store';
import {
  FakeAudioEngine,
  FakeClock,
  FakeGenerative,
  FakeStatus
} from '../test/fakes';

class FakeMidiInput implements MidiInput {
  handler: ((data: Uint8Array) => void) | null = null;
  connected = 0;
  disconnected = 0;

  async connect(handler: (data: Uint8Array) => void): Promise<boolean> {
    this.handler = handler;
    this.connected += 1;
    return true;
  }

  disconnect(): void {
    this.handler = null;
    this.disconnected += 1;
  }
}

function setup() {
  const store = new Store(createInitialState(new FakeGenerative()));
  const engine = new FakeAudioEngine();
  const clock = new FakeClock();
  const status = new FakeStatus();
  const midi = new FakeMidiInput();
  const live = new LiveInputService(store, engine, clock, status, midi);
  return { store, engine, status, midi, live };
}

describe('LiveInputService', () => {
  it('connects and disconnects MIDI', async () => {
    const { midi, live } = setup();

    expect(await live.connect()).toBe(true);
    expect(midi.connected).toBe(1);

    live.disconnect();
    expect(midi.disconnected).toBe(1);
  });

  it('triggers the selected synth track on note-on', () => {
    const { store, engine, live } = setup();
    store.update(state => ({ ...state, selected: 'lead' }));

    live.handleMessage(new Uint8Array([0x90, 64, 100]));

    const event = engine.events.at(-1);
    expect(event?.type).toBe('synth');
    expect(event && 'trackId' in event ? event.trackId : null).toBe('lead');
  });

  it('triggers a sampler track with note pitch', () => {
    const { store, engine, live } = setup();
    store.update(state => ({ ...state, selected: 'track-08' }));

    live.handleMessage(new Uint8Array([0x90, 72, 80]));

    const event = engine.events.at(-1);
    expect(event?.type).toBe('sample');
    expect(event && 'trackId' in event ? event.trackId : null).toBe('track-08');
  });

  it('maps CC1 and CC2 to track macros', () => {
    const { store, live } = setup();
    store.update(state => ({ ...state, selected: 'track-08' }));

    live.handleMessage(new Uint8Array([0xb0, 1, 127]));
    live.handleMessage(new Uint8Array([0xb0, 2, 64]));

    expect(store.getState().kit.tracks['track-08']?.macros[0]).toBe(1);
    expect(
      store.getState().kit.tracks['track-08']?.macros[1]
    ).toBeCloseTo(64 / 127, 3);
  });
});
