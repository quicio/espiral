import * as Tone from 'tone';
import type { EffectKind, SoundEvent } from '../../domain/audio';
import type {
  ChannelKey,
  DelaySettings,
  ReverbSettings
} from '../../domain/channels';
import type { KitState } from '../../domain/kit';
import type { PluginDefinition } from '../../domain/plugin';
import type { AudioEnginePort } from '../../domain/ports';
import { isOfflineContext } from './context';
import { SampleVoicePool } from './sample-voice-pool';
import { createSafetyClipper } from './safety-clipper';
import { BASS_FILES, DRONE_FILE, HIHAT_FILES, PERC_FILE, SAMPLE_PATH } from './samples';

interface EngineChannel {
  readonly volume: Tone.Volume;
  readonly panner: Tone.Panner;
  readonly mute: Tone.Gain;
  readonly synth?: Tone.PolySynth | Tone.MembraneSynth;
  readonly pools?: readonly SampleVoicePool[];
  readonly delay?: Tone.FeedbackDelay;
  readonly reverb?: Tone.Reverb;
}

export class ToneAudioEngine implements AudioEnginePort {
  readonly supportsInserts = false;
  readonly supportsTrackManagement = false;
  readonly supportsRouting = false;
  private readonly channels = new Map<ChannelKey, EngineChannel>();
  private readonly reverbs = new Set<Tone.Reverb>();
  private readonly masterVolume: Tone.Volume;
  private readonly hpf: Tone.Filter;
  private readonly glue: Tone.Compressor;
  private readonly limiter: Tone.Limiter;
  private readonly clipper: Tone.WaveShaper;
  private readonly meter: Tone.Meter;
  private prepared = false;

  constructor(kit: KitState, masterVolumeDb: number) {
    this.masterVolume = new Tone.Volume(masterVolumeDb);
    this.hpf = new Tone.Filter({ type: 'highpass', frequency: 25, rolloff: -12 });
    this.glue = new Tone.Compressor({
      threshold: -14,
      ratio: 1.5,
      attack: 0.02,
      release: 0.3,
      knee: 6
    });
    this.limiter = new Tone.Limiter(-2);
    this.clipper = createSafetyClipper();
    this.meter = new Tone.Meter({ normalRange: false, smoothing: 0.8 });
    this.masterVolume.chain(
      this.hpf,
      this.glue,
      this.limiter,
      this.clipper,
      Tone.getDestination()
    );
    this.clipper.connect(this.meter);
    this.buildChannels(kit);
  }

  async prepare(): Promise<void> {
    if (this.prepared) return;
    if (!isOfflineContext()) await Tone.start();
    await Promise.all(Array.from(this.reverbs, reverb => reverb.ready));
    await Tone.loaded();
    this.prepared = true;
  }

  addTrack(): void {
    // El motor legacy tiene canales fijos; los tracks de usuario disparan por canal perc.
  }

  removeTrack(): void {
    // El motor legacy tiene canales fijos.
  }

  setTrackSend(): void {
    // El motor legacy no tiene buses.
  }

  setBusReturn(): void {
    // El motor legacy no tiene buses.
  }

  async setBusInserts(): Promise<void> {
    // El motor legacy no tiene buses.
  }

  stop(): void {
    this.channels.forEach(channel => {
      if (channel.synth instanceof Tone.PolySynth) channel.synth.releaseAll();
      else if (channel.synth instanceof Tone.MembraneSynth) channel.synth.triggerRelease();
      channel.pools?.forEach(pool => pool.stop());
    });
  }

  trigger(event: SoundEvent): void {
    switch (event.type) {
      case 'kick': {
        const channel = this.channels.get('kick');
        if (channel?.synth instanceof Tone.MembraneSynth) {
          channel.synth.triggerAttackRelease(
            'C1',
            '8n',
            event.time,
            event.velocity ?? 1
          );
        }
        return;
      }
      case 'synth': {
        const channel = this.channels.get(event.channel);
        if (channel?.synth instanceof Tone.PolySynth) {
          const notes = typeof event.notes === 'string' ? event.notes : [...event.notes];
          channel.synth.triggerAttackRelease(notes, event.duration, event.time);
        }
        return;
      }
      case 'sample': {
        const channel = this.channels.get(event.channel);
        const pools = channel?.pools;
        if (!pools || pools.length === 0) return;

        const index = clamp(event.sampleIndex ?? 0, 0, pools.length - 1);
        pools[index]?.play(
          event.time,
          event.playbackRate ?? 1,
          event.duration,
          event.gainDb
        );
      }
    }
  }

  setChannelVolume(trackId: string, db: number, time?: number): void {
    const target = this.channels.get(trackId as ChannelKey);
    target?.volume.volume.rampTo(db, 0.05, time ?? Tone.now());
  }

  setChannelPan(trackId: string, pan: number, time?: number): void {
    const target = this.channels.get(trackId as ChannelKey);
    target?.panner.pan.rampTo(pan, 0.05, time ?? Tone.now());
  }

  setChannelMute(trackId: string, muted: boolean): void {
    const target = this.channels.get(trackId as ChannelKey);
    target?.mute.gain.rampTo(muted ? 0 : 1, 0.02, Tone.now());
  }

  setEffectWet(
    trackId: string,
    effect: EffectKind,
    wet: number,
    time?: number
  ): void {
    const target = this.channels.get(trackId as ChannelKey);
    const node = effect === 'delay' ? target?.delay : target?.reverb;
    node?.wet.rampTo(wet, 0.05, time ?? Tone.now());
  }

  setDelaySettings(channel: ChannelKey, settings: DelaySettings): void {
    const delay = this.channels.get(channel)?.delay;
    if (!delay) return;
    const time = Tone.now();
    delay.wet.rampTo(settings.wet, 0.05, time);
    delay.feedback.rampTo(settings.feedback, 0.05, time);
    delay.delayTime.rampTo(settings.time, 0.05, time);
  }

  setReverbSettings(channel: ChannelKey, settings: ReverbSettings): void {
    const reverb = this.channels.get(channel)?.reverb;
    if (!reverb) return;
    reverb.wet.rampTo(settings.wet, 0.05, Tone.now());
    const currentDecay = Number(reverb.decay);
    if (Math.abs(currentDecay - settings.decay) > 0.001) {
      reverb.decay = settings.decay;
    }
  }

  setMasterVolume(db: number, time?: number): void {
    this.masterVolume.volume.rampTo(db, 0.05, time ?? Tone.now());
  }

  getMasterLevel(): number {
    const value = this.meter.getValue();
    return Array.isArray(value) ? Math.max(...value) : value;
  }

  listPlugins(): readonly PluginDefinition[] {
    return [];
  }

  async setTrackInserts(): Promise<void> {
    // El motor legacy solo soporta delay/reverb fijos.
  }

  setInsertParam(): void {
    // El motor legacy solo soporta delay/reverb fijos.
  }

  setInsertBypass(): void {
    // El motor legacy solo soporta delay/reverb fijos.
  }

  dispose(): void {
    this.stop();
    this.channels.forEach(channel => {
      channel.synth?.dispose();
      channel.pools?.forEach(pool => pool.dispose());
      channel.delay?.dispose();
      channel.reverb?.dispose();
      channel.volume.dispose();
      channel.panner.dispose();
      channel.mute.dispose();
    });
    this.channels.clear();
    this.reverbs.clear();
    this.masterVolume.dispose();
    this.hpf.dispose();
    this.glue.dispose();
    this.limiter.dispose();
    this.clipper.dispose();
    this.meter.dispose();
    this.prepared = false;
  }

  private buildChannels(kit: KitState): void {
    const kickOutput = this.createOutput('kick', kit);
    const kick = new Tone.MembraneSynth({
      pitchDecay: 0.05,
      octaves: 10,
      oscillator: { type: 'sine' },
      envelope: { attack: 0.001, decay: 0.4, sustain: 0.01, release: 1.4 }
    });
    kick.connect(kickOutput.volume);
    this.channels.set('kick', { ...kickOutput, synth: kick });

    const bassOutput = this.createOutput('bass', kit);
    const bassPools = BASS_FILES.map(
      file =>
        new SampleVoicePool(
          SAMPLE_PATH + file,
          2,
          0.004,
          0.05,
          bassOutput.volume
        )
    );
    this.channels.set('bass', { ...bassOutput, pools: bassPools });

    const hihatOutput = this.createOutput('hihat', kit);
    const hihatDelay = this.createDelay('hihat', kit, {
      wet: 0.3,
      feedback: 0.35,
      time: 0.25
    });
    const hihatReverb = this.createReverb('hihat', kit, { wet: 0.4, decay: 1.8 });
    this.connectEffects(hihatDelay, hihatReverb, hihatOutput.volume);
    const hihatPools = HIHAT_FILES.map(
      file => new SampleVoicePool(SAMPLE_PATH + file, 1, 0.003, 0.03, hihatDelay)
    );
    this.channels.set('hihat', {
      ...hihatOutput,
      pools: hihatPools,
      delay: hihatDelay,
      reverb: hihatReverb
    });

    const droneOutput = this.createOutput('drone', kit);
    const droneDelay = this.createDelay('drone', kit, {
      wet: 0.3,
      feedback: 0.4,
      time: 0.25
    });
    const droneReverb = this.createReverb('drone', kit, { wet: 0.5, decay: 4 });
    this.connectEffects(droneDelay, droneReverb, droneOutput.volume);
    const dronePool = new SampleVoicePool(
      SAMPLE_PATH + DRONE_FILE,
      2,
      0.01,
      0.2,
      droneDelay
    );
    this.channels.set('drone', {
      ...droneOutput,
      pools: [dronePool],
      delay: droneDelay,
      reverb: droneReverb
    });

    const padOutput = this.createOutput('pad', kit);
    const padDelay = this.createDelay('pad', kit, {
      wet: 0.3,
      feedback: 0.4,
      time: 0.25
    });
    const padReverb = this.createReverb('pad', kit, { wet: 0.5, decay: 4 });
    this.connectEffects(padDelay, padReverb, padOutput.volume);
    const pad = new Tone.PolySynth(Tone.Synth, {
      oscillator: { type: 'sine' },
      envelope: { attack: 2, decay: 1, sustain: 0.8, release: 3 }
    });
    pad.connect(padDelay);
    this.channels.set('pad', {
      ...padOutput,
      synth: pad,
      delay: padDelay,
      reverb: padReverb
    });

    const percOutput = this.createOutput('perc', kit);
    const percPool = new SampleVoicePool(
      SAMPLE_PATH + PERC_FILE,
      4,
      0.004,
      0.1,
      percOutput.volume
    );
    this.channels.set('perc', { ...percOutput, pools: [percPool] });

    const leadOutput = this.createOutput('lead', kit);
    const leadDelay = this.createDelay('lead', kit, {
      wet: 0.2,
      feedback: 0.3,
      time: 0.25
    });
    const leadReverb = this.createReverb('lead', kit, { wet: 0.4, decay: 2.5 });
    this.connectEffects(leadDelay, leadReverb, leadOutput.volume);
    const lead = new Tone.PolySynth(Tone.Synth, {
      oscillator: { type: 'triangle' },
      envelope: { attack: 0.05, decay: 0.25, sustain: 0.35, release: 1.4 }
    });
    lead.maxPolyphony = 12;
    lead.connect(leadDelay);
    this.channels.set('lead', {
      ...leadOutput,
      synth: lead,
      delay: leadDelay,
      reverb: leadReverb
    });
  }

  private createDelay(
    channel: ChannelKey,
    kit: KitState,
    fallback: DelaySettings
  ): Tone.FeedbackDelay {
    const params = kit.tracks[channel]?.inserts.find(
      insert => insert.pluginId === 'delay'
    )?.params;
    return new Tone.FeedbackDelay({
      delayTime: params?.time ?? fallback.time,
      feedback: params?.feedback ?? fallback.feedback,
      wet: params?.wet ?? fallback.wet
    });
  }

  private createReverb(
    channel: ChannelKey,
    kit: KitState,
    fallback: ReverbSettings
  ): Tone.Reverb {
    const params = kit.tracks[channel]?.inserts.find(
      insert => insert.pluginId === 'reverb'
    )?.params;
    return new Tone.Reverb({
      decay: params?.decay ?? fallback.decay,
      preDelay: 0.02,
      wet: params?.wet ?? fallback.wet
    });
  }

  private createOutput(
    channel: ChannelKey,
    kit: KitState
  ): { volume: Tone.Volume; panner: Tone.Panner; mute: Tone.Gain } {
    const track = kit.tracks[channel];
    const volume = new Tone.Volume(track?.gainDb ?? 0);
    const panner = new Tone.Panner(track?.pan ?? 0);
    const mute = new Tone.Gain(track?.muted ? 0 : 1);
    volume.connect(panner);
    panner.connect(mute);
    mute.connect(this.masterVolume);
    return { volume, panner, mute };
  }

  private connectEffects(
    delay: Tone.FeedbackDelay,
    reverb: Tone.Reverb,
    output: Tone.Volume
  ): void {
    delay.connect(reverb);
    reverb.connect(output);
    this.reverbs.add(reverb);
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
