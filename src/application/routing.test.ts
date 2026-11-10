import { describe, expect, it } from 'vitest';
import { createInitialState } from './initial-state';
import { RoutingService } from './routing';
import { Store } from './store';
import { FakeAudioEngine, FakeGenerative, FakeStatus } from '../test/fakes';

function setup() {
  const generative = new FakeGenerative();
  const store = new Store(createInitialState(generative));
  const engine = new FakeAudioEngine();
  const status = new FakeStatus();
  const routing = new RoutingService(store, engine, status);
  return { store, engine, status, routing };
}

describe('RoutingService', () => {
  it('adds and updates a send', () => {
    const { store, engine, routing } = setup();

    routing.setSend('pad', 'reverb-bus', 0.35);
    routing.setSend('pad', 'reverb-bus', 0.6);

    const sends = store.getState().kit.tracks.pad?.sends ?? [];
    expect(sends).toHaveLength(1);
    expect(sends[0]).toEqual({
      busId: 'reverb-bus',
      amount: 0.6,
      preFader: false
    });
    expect(engine.sends.at(-1)).toEqual({
      trackId: 'pad',
      busId: 'reverb-bus',
      amount: 0.6,
      preFader: false
    });
  });

  it('changes a send to pre-fader', () => {
    const { store, engine, routing } = setup();
    routing.setSend('lead', 'delay-bus', 0.4);

    routing.setSendPre('lead', 'delay-bus', true);

    expect(store.getState().kit.tracks.lead?.sends[0]?.preFader).toBe(true);
    expect(engine.sends.at(-1)?.preFader).toBe(true);
  });

  it('creates a zero send when pre is toggled first', () => {
    const { store, routing } = setup();

    routing.setSendPre('hihat', 'reverb-bus', true);

    expect(store.getState().kit.tracks.hihat?.sends).toEqual([
      { busId: 'reverb-bus', amount: 0, preFader: true }
    ]);
  });

  it('updates a bus return and clamps it', () => {
    const { store, engine, routing } = setup();

    routing.setBusReturn('reverb-bus', -22);
    routing.setBusReturn('delay-bus', 20);

    expect(store.getState().kit.buses[0]?.returnDb).toBe(-22);
    expect(store.getState().kit.buses[1]?.returnDb).toBe(6);
    expect(engine.returns.at(-1)).toEqual({ busId: 'delay-bus', db: 6 });
  });

  it('routes one bus into another and removes the connection at zero', () => {
    const { store, engine, routing } = setup();

    routing.setBusSend('reverb-bus', 'delay-bus', 0.4);

    expect(store.getState().kit.buses[0]?.sends).toEqual([
      { busId: 'delay-bus', amount: 0.4, preFader: false }
    ]);
    expect(engine.busSends.at(-1)).toEqual({
      fromBusId: 'reverb-bus',
      toBusId: 'delay-bus',
      amount: 0.4
    });

    routing.setBusSend('reverb-bus', 'delay-bus', 0);

    expect(store.getState().kit.buses[0]?.sends).toEqual([]);
    expect(engine.busSends.at(-1)?.amount).toBe(0);
  });

  it('rejects bus connections that would create a cycle', () => {
    const { store, status, routing } = setup();
    routing.setBusSend('reverb-bus', 'delay-bus', 0.4);

    routing.setBusSend('delay-bus', 'reverb-bus', 0.3);

    expect(store.getState().kit.buses[1]?.sends).toEqual([]);
    expect(status.messages.at(-1)).toContain('ciclo');
  });

  it('keeps scene snapshots until the scene is captured', () => {
    const { store, routing } = setup();
    routing.setSend('perc', 'delay-bus', 0.2);

    expect(store.getState().scenes.umbral.kit.tracks.perc?.sends).toEqual([]);
  });
});
