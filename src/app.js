import * as Tone from 'tone';
import {
  Channel,
  Mixer,
  Transport,
  Effects,
  PresetLoader,
  PATTERN_LENGTH,
  SCENES,
  DEFAULT_PARAMS,
  ROOTS,
  SCALES,
  PROGRESSIONS,
  CHANNEL_SEEDS,
  generatePattern,
  mutatePattern,
  thinPattern,
  fillPattern,
  rotatePattern,
  euclidean,
  count,
  hash01,
  midiToNote,
  scaleDegreeMidi,
  scaleNotes,
  chordNotes
} from '@quicio/umbral-tone';

const SAMPLE_PATH = './audio/';
const samples = {
  kick: 'kick.wav',
  drone: 'drone.wav',
  perc: 'perc.wav',
  bass: {
    A: 'bass-a.wav',
    B: 'bass-b.wav',
    'C#': 'bass-cs.wav',
    'D#': 'bass-ds.wav',
    F: 'bass-f.wav',
    G: 'bass-g.wav'
  },
  hihat: {
    '01': 'hihat-01.wav',
    '02': 'hihat-02.wav',
    '03': 'hihat-03.wav',
    '04': 'hihat-04.wav',
    '05': 'hihat-05.wav',
    '06': 'hihat-06.wav',
    '07': 'hihat-07.wav',
    '08': 'hihat-08.wav'
  }
};

const CHANNELS = {
  kick: { name: 'Kick 4/4', pattern: true },
  bass: { name: 'Bass', pattern: true },
  hihat: { name: 'Hi-Hat', pattern: true },
  perc: { name: 'Perc', pattern: true },
  drone: { name: 'Drone', pattern: false },
  pad: { name: 'Pad', pattern: false },
  lead: { name: 'Lead', pattern: false }
};
const PATTERN_KEYS = Object.keys(CHANNELS).filter(key => CHANNELS[key].pattern);

const INITIAL_PATTERNS = {
  kick: [1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0],
  bass: [1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 0, 1],
  hihat: [0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1],
  perc: [0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 1, 0, 0, 0, 0, 1]
};

const state = {
  view: 'performance',
  selected: 'kick',
  scene: 'umbral',
  seed: 4821,
  params: { ...DEFAULT_PARAMS },
  root: SCENES.umbral.harmony.root,
  scale: SCENES.umbral.harmony.scale,
  progression: SCENES.umbral.harmony.progression,
  sustain: SCENES.umbral.harmony.sustain,
  pulses: { kick: 4, bass: 5, hihat: 8, perc: 3 },
  frozen: { kick: false, bass: false, hihat: false, perc: false },
  patterns: {
    kick: INITIAL_PATTERNS.kick.slice(),
    bass: INITIAL_PATTERNS.bass.slice(),
    hihat: INITIAL_PATTERNS.hihat.slice(),
    perc: INITIAL_PATTERNS.perc.slice()
  },
  automation: {
    enabled: false,
    target: 'pad-reverb',
    values: [0.18, 0.22, 0.28, 0.38, 0.5, 0.62, 0.74, 0.82, 0.78, 0.68, 0.56, 0.44, 0.34, 0.27, 0.22, 0.18]
  },
  swing: 0.12,
  humanize: 0.15,
  evolve: false,
  playing: false,
  preparing: false,
  currentStep: -1,
  history: [],
  clipboard: null,
  mutationCount: 0,
  evolveCount: 0
};

const mixer = new Mixer({ masterVolume: -4 });
const transport = new Transport({ bpm: 120 });
const preparedReverbs = new WeakSet();

let droneStep = 0;
let padStep = 0;
let lastPadChord = 0;
let currentChordDegree = 0;
let leadCounter = 0;

function q(selector, root = document) {
  return root.querySelector(selector);
}
function qa(selector, root = document) {
  return Array.from(root.querySelectorAll(selector));
}
function channelName(key) {
  return CHANNELS[key] ? CHANNELS[key].name : key;
}
function timingOffset(key, stepCount) {
  const stepSeconds = 60 / Math.max(transport.getBPM(), 1) / 4;
  const step = stepCount % PATTERN_LENGTH;
  const swing = step % 2 === 1 ? state.swing * stepSeconds * 0.5 : 0;
  const human = (hash01(state.seed, key, stepCount, 91) - 0.5) * state.humanize * 0.03;
  return swing + human;
}

const BASS_SAMPLE_MIDI = [45, 47, 49, 51, 53, 55];
const automationTargets = {
  'pad-reverb': { label: 'Reverb Pad', channel: 'pad', type: 'reverb' },
  'lead-delay': { label: 'Delay Lead', channel: 'lead', type: 'delay' },
  'hihat-reverb': { label: 'Reverb Hi-Hat', channel: 'hihat', type: 'reverb' },
  'drone-delay': { label: 'Delay Drone', channel: 'drone', type: 'delay' }
};

function harmonyLabel() {
  const root = ROOTS[state.root] ? ROOTS[state.root].label : 'Do';
  const scale = SCALES[state.scale] ? SCALES[state.scale].label : 'Menor natural';
  return root + ' ' + scale.toLowerCase();
}

function progressionDegrees() {
  const progression = PROGRESSIONS[state.progression] || PROGRESSIONS.menor;
  return progression.degrees;
}

function noteDuration(kind) {
  const sustain = state.sustain;
  if (kind === 'pad') return sustain < 0.34 ? '2n' : sustain < 0.67 ? '1m' : '2m';
  if (kind === 'lead') return sustain < 0.25 ? '16n' : sustain < 0.5 ? '8n' : sustain < 0.75 ? '4n' : '2n';
  if (kind === 'bass') return sustain < 0.4 ? '16n' : sustain < 0.7 ? '8n' : '4n';
  return '8n';
}

function bassVoice(stepCount) {
  const degrees = progressionDegrees();
  const degree = degrees[currentChordDegree % degrees.length];
  const step = ((stepCount % PATTERN_LENGTH) + PATTERN_LENGTH) % PATTERN_LENGTH;
  const offset = step === 4 || step === 12 ? 4 : 0;
  const target = scaleDegreeMidi(state.root, state.scale, degree + offset, 3);
  let index = 0;
  let distance = Infinity;
  BASS_SAMPLE_MIDI.forEach((midi, sampleIndex) => {
    const delta = Math.abs(midi - target);
    if (delta < distance) {
      distance = delta;
      index = sampleIndex;
    }
  });
  const jitter = 1 + (hash01(state.seed, 'bass-pitch', stepCount, 12) - 0.5) * 0.004;
  return {
    index,
    rate: Math.pow(2, (target - BASS_SAMPLE_MIDI[index]) / 12) * jitter
  };
}

function automationNode(targetKey = state.automation.target) {
  const target = automationTargets[targetKey];
  if (!target) return null;
  const channel = mixer.getChannel(target.channel);
  if (!channel) return null;
  return target.type === 'delay' ? channel.getDelay() : channel.getReverb();
}

function applyAutomation(step) {
  if (!state.automation.enabled) return;
  const effect = automationNode();
  if (!effect || !effect.wet) return;
  const index = ((step % PATTERN_LENGTH) + PATTERN_LENGTH) % PATTERN_LENGTH;
  const value = state.automation.values[index];
  if (effect.wet.rampTo) effect.wet.rampTo(value, 0.06);
  else effect.wet.value = value;
}
function currentStatus(message) {
  const el = q('#generative-readout');
  if (el) el.textContent = message;
}
function setInstrumentStatus(message) {
  const el = q('#instrument-status');
  if (el) el.textContent = message;
}
function setInstrumentError(message) {
  const el = q('#instrument-error');
  if (el) el.textContent = message;
}
function setSessionStatus(message) {
  const el = q('#session-status');
  if (el) el.textContent = message;
}

// === AUDIO ===
function buildChannels() {
  const kickChannel = new Channel({ name: 'Kick 4/4', volume: -4 });
  kickChannel.source = new Tone.MembraneSynth({
    pitchDecay: 0.05,
    octaves: 10,
    oscillator: { type: 'sine' },
    envelope: { attack: 0.001, decay: 0.4, sustain: 0.01, release: 1.4 }
  });
  kickChannel._rebuildChain();
  mixer.addChannel('kick', kickChannel);

  const bassChannel = new Channel({ name: 'Bass', volume: -8 });
  bassChannel.samples = Object.values(samples.bass).map(file => {
    const player = new Tone.Player(SAMPLE_PATH + file);
    player.overlap = true;
    player.chain(bassChannel.volume);
    return player;
  });
  mixer.addChannel('bass', bassChannel);

  const hihatChannel = new Channel({ name: 'Hi-Hat', volume: -10 });
  const hihatEffects = Effects.ambient({
    delay: { delayTime: '8n', feedback: 0.35, wet: 0.3 },
    reverb: { roomSize: 0.8, dampening: 2000, wet: 0.4 }
  });
  hihatChannel.addEffects(hihatEffects);
  hihatChannel.samples = Object.values(samples.hihat).map(file => {
    const player = new Tone.Player(SAMPLE_PATH + file);
    player.chain(...hihatEffects, hihatChannel.volume);
    return player;
  });
  mixer.addChannel('hihat', hihatChannel);

  const droneChannel = new Channel({ name: 'Drone', volume: -10 });
  droneChannel.source = new Tone.Player(SAMPLE_PATH + samples.drone);
  droneChannel.addEffects(Effects.ambient({
    delay: { delayTime: '8n', feedback: 0.4, wet: 0.3 },
    reverb: { roomSize: 0.95, dampening: 4000, wet: 0.5 }
  }));
  droneChannel._rebuildChain();
  mixer.addChannel('drone', droneChannel);

  const padChannel = new Channel({ name: 'Pad', volume: -14 });
  padChannel.source = new Tone.PolySynth(Tone.Synth, {
    oscillator: { type: 'sine' },
    envelope: { attack: 2, decay: 1, sustain: 0.8, release: 3 }
  });
  padChannel.addEffects(Effects.ambient({
    delay: { delayTime: '8n', feedback: 0.4, wet: 0.3 },
    reverb: { roomSize: 0.95, dampening: 4000, wet: 0.5 }
  }));
  padChannel._rebuildChain();
  mixer.addChannel('pad', padChannel);

  const percChannel = new Channel({ name: 'Perc', volume: -8 });
  percChannel.source = new Tone.Player(SAMPLE_PATH + samples.perc);
  percChannel._rebuildChain();
  mixer.addChannel('perc', percChannel);

  const leadChannel = new Channel({ name: 'Lead', volume: -16 });
  leadChannel.source = new Tone.PolySynth(Tone.Synth, {
    oscillator: { type: 'triangle' },
    envelope: { attack: 0.05, decay: 0.25, sustain: 0.35, release: 1.4 }
  });
  leadChannel.source.maxPolyphony = 4;
  leadChannel.addEffects(Effects.ambient({
    delay: { delayTime: '8n', feedback: 0.3, wet: 0.2 },
    reverb: { roomSize: 0.9, dampening: 3000, wet: 0.4 }
  }));
  leadChannel._rebuildChain();
  mixer.addChannel('lead', leadChannel);
}

function patternStep(key, stepCount) {
  const step = stepCount % PATTERN_LENGTH;
  return state.patterns[key][step];
}

function buildLoops() {
  const kickChannel = mixer.getChannel('kick');
  const bassChannel = mixer.getChannel('bass');
  const hihatChannel = mixer.getChannel('hihat');
  const droneChannel = mixer.getChannel('drone');
  const padChannel = mixer.getChannel('pad');
  const percChannel = mixer.getChannel('perc');
  const leadChannel = mixer.getChannel('lead');

  kickChannel.setLoop((time, stepCount) => {
    if (patternStep('kick', stepCount)) {
      kickChannel.source.triggerAttackRelease('C1', '8n', time + timingOffset('kick', stepCount));
    }
  }, '16n', transport);

  bassChannel.setLoop((time, stepCount) => {
    if (!patternStep('bass', stepCount) || !bassChannel.samples.length) return;
    const voice = bassVoice(stepCount);
    const sample = bassChannel.samples[voice.index] || bassChannel.samples[0];
    sample.playbackRate = voice.rate;
    sample.start(time + timingOffset('bass', stepCount), 0, noteDuration('bass'));
  }, '16n', transport);

  hihatChannel.setLoop((time, stepCount) => {
    if (!patternStep('hihat', stepCount) || !hihatChannel.samples.length) return;
    const index = Math.floor(hash01(state.seed, 'hihat', stepCount, 3) * hihatChannel.samples.length);
    const sample = hihatChannel.samples[index];
    const accent = stepCount % 4 === 0 ? 2.5 : stepCount % 2 === 0 ? 1 : 0;
    sample.volume.value = -17 + accent;
    sample.playbackRate = 1 + (hash01(state.seed, 'hihat', stepCount, 4) - 0.5) * 0.1;
    sample.start(time + timingOffset('hihat', stepCount));
  }, '16n', transport);

  droneChannel.setLoop((time) => {
    droneStep += 1;
    if ((droneStep - 1) % 32 !== 0) return;
    let rootOffset = (state.root - 9 + 12) % 12;
    if (rootOffset > 6) rootOffset -= 12;
    const drift = 1 + (hash01(state.seed, 'drone-tune', droneStep, 5) - 0.5) * 0.01;
    droneChannel.source.playbackRate = Math.pow(2, rootOffset / 12) * drift;
    droneChannel.source.start(time);
  }, '4n');

  padChannel.setLoop((time) => {
    padStep += 1;
    if ((padStep - 1) % 8 !== 0) return;
    const degrees = progressionDegrees();
    const degree = degrees[lastPadChord % degrees.length];
    currentChordDegree = lastPadChord;
    const chord = chordNotes(state.root, state.scale, degree, 3, 4);
    padChannel.source.triggerAttackRelease(chord, noteDuration('pad'), time);
    lastPadChord += 1;
  }, '4n');

  percChannel.setLoop((time, stepCount) => {
    if (!patternStep('perc', stepCount)) return;
    percChannel.source.playbackRate = 1 + (hash01(state.seed, 'perc', stepCount, 6) - 0.5) * 0.1;
    percChannel.source.start(time + timingOffset('perc', stepCount));
  }, '16n', transport);

  const scale = scaleNotes(state.root, state.scale, 3, 14);
  leadChannel.setLoop((time) => {
    leadCounter += 1;
    if (hash01(state.seed, 'lead', leadCounter, 7) <= 0.76) return;
    let note;
    if (hash01(state.seed, 'lead', leadCounter, 10) < 0.35) {
      const degrees = progressionDegrees();
      const degree = degrees[currentChordDegree % degrees.length];
      note = midiToNote(scaleDegreeMidi(state.root, state.scale, degree, 4));
    } else {
      note = scale[Math.floor(hash01(state.seed, 'lead', leadCounter, 8) * scale.length)];
    }
    leadChannel.source.triggerAttackRelease(note, noteDuration('lead'), time);
  }, '4n');
}

function resetGenerativeCounters() {
  droneStep = 0;
  padStep = 0;
  lastPadChord = 0;
  currentChordDegree = 0;
  leadCounter = 0;
}

async function startPlayback() {
  if (state.playing || state.preparing) return;
  state.preparing = true;
  setInstrumentError('');
  setInstrumentStatus('Preparando audio');
  const label = q('#transport-label');
  if (label) label.textContent = 'Preparando';
  try {
    const reverbs = [];
    mixer.getChannels().forEach(channel => {
      channel.effects.forEach(effect => {
        if (effect instanceof Tone.Reverb && !preparedReverbs.has(effect)) {
          preparedReverbs.add(effect);
          reverbs.push(effect.generate());
        }
      });
    });
    await Promise.all(reverbs);
    resetGenerativeCounters();
    await transport.start();
    mixer.startLoops();
    state.playing = true;
    setPlayingUI(true);
  } catch (error) {
    console.error('Error starting transport:', error);
    try {
      transport.stop();
      mixer.stopLoops();
    } catch {
      // El transporte puede no haber llegado a iniciarse.
    }
    setPlayingUI(false);
    setInstrumentError('No se pudo iniciar el audio. Revisá el permiso de audio del navegador.');
  } finally {
    state.preparing = false;
  }
}

function stopPlayback() {
  if (!state.playing) return;
  transport.stop();
  mixer.stopLoops();
  mixer.getChannels().forEach(channel => {
    if (channel.source) {
      if (channel.source.releaseAll) channel.source.releaseAll();
      if (channel.source.stop) channel.source.stop();
    }
    if (channel.samples) channel.samples.forEach(sample => sample.stop());
  });
  state.playing = false;
  state.currentStep = -1;
  setPlayingUI(false);
  updatePatternClasses(-1);
}

function setPlayingUI(playing) {
  const button = q('#transport-play');
  const label = q('#transport-label');
  if (label) label.textContent = playing ? 'Detener' : 'Reproducir';
  if (button) {
    button.dataset.playing = playing ? 'true' : 'false';
    button.setAttribute('aria-pressed', playing ? 'true' : 'false');
  }
  setInstrumentStatus(playing ? 'Reproduciendo' : 'Detenido');
  const pulseState = q('#pulse-state');
  if (pulseState) pulseState.textContent = playing ? 'en curso' : 'detenido';
}

// === STATE / HISTORY ===
function pushHistory() {
  state.history.push(JSON.parse(JSON.stringify(state.patterns)));
  if (state.history.length > 40) state.history.shift();
  syncUndoButton();
}

function syncUndoButton() {
  const button = q('#undo-pattern');
  if (button) button.disabled = state.history.length === 0;
}

function syncPasteButton() {
  const button = q('#paste-pattern');
  if (button) button.disabled = !state.clipboard;
}

function copySelected() {
  state.clipboard = selectedPattern().slice();
  syncPasteButton();
  currentStatus('Patrón de ' + channelName(state.selected) + ' copiado.');
}

function pasteSelected() {
  const key = state.selected;
  if (!state.clipboard) return;
  if (state.frozen[key]) return currentStatus(channelName(key) + ' está congelado.');
  pushHistory();
  state.patterns[key] = state.clipboard.slice();
  currentStatus('Patrón pegado en ' + channelName(key) + '.');
  updatePatternClasses();
}

function undoPattern() {
  const previous = state.history.pop();
  if (!previous) return;
  state.patterns = previous;
  currentStatus('Patrón restaurado.');
  updatePatternClasses();
  syncUndoButton();
}

function toggleStep(key, index) {
  if (!state.patterns[key]) return;
  pushHistory();
  state.patterns[key][index] = state.patterns[key][index] ? 0 : 1;
  updatePatternClasses();
}

function selectedPattern() {
  return state.patterns[state.selected];
}

function mutateSelected() {
  const key = state.selected;
  if (state.frozen[key]) {
    currentStatus(channelName(key) + ' está congelado.');
    return;
  }
  pushHistory();
  state.mutationCount += 1;
  state.patterns[key] = mutatePattern(
    selectedPattern(),
    state.params,
    state.seed + state.mutationCount,
    key
  );
  currentStatus(channelName(key) + ' mutado.');
  updatePatternClasses();
}

function densifySelected() {
  const key = state.selected;
  if (state.frozen[key]) return currentStatus(channelName(key) + ' está congelado.');
  pushHistory();
  state.patterns[key] = fillPattern(selectedPattern(), state.params, state.seed + state.mutationCount++, key);
  currentStatus('Densidad aumentada en ' + channelName(key) + '.');
  updatePatternClasses();
}

function thinSelected() {
  const key = state.selected;
  if (state.frozen[key]) return currentStatus(channelName(key) + ' está congelado.');
  pushHistory();
  state.patterns[key] = thinPattern(selectedPattern(), state.params, state.seed + state.mutationCount++, key);
  currentStatus('Densidad reducida en ' + channelName(key) + '.');
  updatePatternClasses();
}

function rotateSelected() {
  const key = state.selected;
  if (state.frozen[key]) return currentStatus(channelName(key) + ' está congelado.');
  pushHistory();
  state.patterns[key] = rotatePattern(selectedPattern(), 1);
  currentStatus('Patrón girado.');
  updatePatternClasses();
}

function applyEuclid() {
  const key = state.selected;
  if (state.frozen[key]) return currentStatus(channelName(key) + ' está congelado.');
  pushHistory();
  state.patterns[key] = euclidean(PATTERN_LENGTH, state.pulses[key], CHANNEL_SEEDS[key].offset);
  currentStatus('Euclid aplicado a ' + channelName(key) + '.');
  updatePatternClasses();
}

function generateAll(seed = state.seed) {
  pushHistory();
  PATTERN_KEYS.forEach(key => {
    if (state.frozen[key]) return;
    state.patterns[key] = generatePattern(key, state.params, state.pulses[key], seed);
  });
  currentStatus('Patrones generados · semilla ' + seed + '.');
  updatePatternClasses();
}

function applyScene(name) {
  const scene = SCENES[name];
  if (!scene) return;
  state.scene = name;
  state.params = { ...scene.params };
  if (scene.harmony) {
    state.root = scene.harmony.root;
    state.scale = scene.harmony.scale;
    state.progression = scene.harmony.progression;
    state.sustain = scene.harmony.sustain;
    lastPadChord = 0;
    currentChordDegree = 0;
    syncHarmonyUI();
  }
  syncParamsUI();
  generateAll(state.seed);
  currentStatus('Escena ' + scene.label + ' · ' + harmonyLabel() + ' · semilla ' + state.seed + '.');
}

function toggleFreeze(key = state.selected) {
  state.frozen[key] = !state.frozen[key];
  syncFreezeUI();
  currentStatus(channelName(key) + (state.frozen[key] ? ' congelado.' : ' libre.'));
}
function toggleEvolve() {
  state.evolve = !state.evolve;
  const button = q('#evolve-toggle');
  if (button) {
    button.setAttribute('aria-pressed', state.evolve ? 'true' : 'false');
    button.classList.toggle('is-active', state.evolve);
  }
  currentStatus(state.evolve ? 'Evolución activa: cada 2 compases.' : 'Evolución detenida.');
}
function newSeed() {
  state.seed = Math.floor(Math.random() * 10000);
  syncSeedUI();
  generateAll(state.seed);
}
function evolvePatterns() {
  if (!state.evolve || !state.playing) return;
  pushHistory();
  state.evolveCount += 1;
  PATTERN_KEYS.forEach(key => {
    if (state.frozen[key]) return;
    state.patterns[key] = mutatePattern(
      state.patterns[key],
      { ...state.params, variation: state.params.variation * 0.55 },
      state.seed + state.evolveCount * 37,
      key
    );
  });
  updatePatternClasses();
  currentStatus('Evolución ' + state.evolveCount + '.');
}

// === UI RENDER ===
function renderPulse() {
  const wrap = q('#pulse-wrap');
  if (!wrap) return;
  wrap.innerHTML =
    '<div class="pulse" aria-hidden="true">' +
    Array.from({ length: PATTERN_LENGTH }, (_, index) =>
      `<span class="pulse-dot" data-pulse-step="${index}" style="--i:${index}"></span>`
    ).join('') +
    '<div class="pulse-center"><span id="pulse-step">00</span><small id="pulse-state">detenido</small></div>' +
    '</div>' +
    '<p class="pulse-caption">pulso colectivo · 16 pasos</p>';
}

function renderPerformance() {
  renderPulse();
  const list = q('#activity-list');
  if (!list) return;
  list.innerHTML = Object.keys(CHANNELS).map(key => {
    const channel = mixer.getChannel(key);
    const isPattern = CHANNELS[key].pattern;
    const steps = isPattern
      ? `<span class="activity-steps">${state.patterns[key].map((_, index) =>
          `<span class="activity-step" data-pattern-channel="${key}" data-pattern-step="${index}" data-part="activity"></span>`
        ).join('')}</span>`
      : '<span class="activity-steps activity-steps--generative"><span class="activity-gen">reglas</span></span>';
    return `<div class="activity-row" data-activity-channel="${key}">
      <button class="activity-name" type="button" data-select="${key}" aria-pressed="${key === state.selected}">${channelName(key)}</button>
      <span class="activity-meta">${isPattern ? 'patrón' : 'generativo'}</span>
      ${steps}
      <button class="activity-action" type="button" data-mute="${key}" aria-pressed="${channel && channel.muted}" aria-label="Silenciar ${channelName(key)}">M</button>
      ${isPattern ? `<button class="activity-action" type="button" data-freeze="${key}" aria-pressed="${state.frozen[key]}" aria-label="Congelar ${channelName(key)}">F</button>` : ''}
    </div>`;
  }).join('');
  syncActivityButtons();
  updatePatternClasses();
}

function renderSequencer() {
  const tabs = q('#sequencer-channel-list');
  if (tabs) {
    tabs.innerHTML = PATTERN_KEYS.map(key =>
      `<button class="channel-tab${key === state.selected ? ' is-active' : ''}" type="button" data-select="${key}" aria-pressed="${key === state.selected}">${channelName(key)}</button>`
    ).join('');
  }

  const radial = q('#radial-editor');
  if (radial) {
    radial.innerHTML =
      `<div class="radial-ring">${state.patterns[state.selected].map((_, index) =>
        `<button class="radial-step" type="button" data-pattern-channel="${state.selected}" data-pattern-step="${index}" data-radial-step="${index}" style="--i:${index}" aria-label="Paso ${index + 1}" aria-pressed="false">${index + 1}</button>`
      ).join('')}<div class="radial-center"><strong id="radial-center-name">${channelName(state.selected)}</strong><span id="radial-center-count">${count(state.patterns[state.selected])}/${PATTERN_LENGTH}</span></div></div>`;
  }

  const matrix = q('#seq-matrix');
  if (matrix) {
    matrix.innerHTML = PATTERN_KEYS.map(key => `
      <div class="matrix-row${key === state.selected ? ' is-selected' : ''}">
        <button class="matrix-label" type="button" data-select="${key}" aria-pressed="${key === state.selected}">${channelName(key)}</button>
        <span class="matrix-cells">${state.patterns[key].map((_, index) =>
          `<span class="matrix-cell" data-pattern-channel="${key}" data-pattern-step="${index}" data-part="matrix"></span>`
        ).join('')}</span>
      </div>`).join('');
  }

  const pulses = q('#euclid-pulses');
  if (pulses) pulses.value = state.pulses[state.selected];
  const pulsesValue = q('#euclid-pulses-value');
  if (pulsesValue) pulsesValue.textContent = state.pulses[state.selected];
  updatePatternClasses();
}

function renderSound() {
  const container = q('#sound-channels');
  if (!container) return;
  container.innerHTML = Object.keys(CHANNELS).map(key => {
    const channel = mixer.getChannel(key);
    const delay = channel ? channel.getDelay() : null;
    const reverb = channel ? channel.getReverb() : null;
    const effects = [];
    if (delay) effects.push(effectRow(key, 'delay', 'Delay', delay.wet.value));
    if (reverb) effects.push(effectRow(key, 'reverb', 'Reverb', reverb.wet.value));
    return `<div class="sound-channel" data-sound-channel="${key}">
      <div class="sound-name"><strong>${channelName(key)}</strong><span>${CHANNELS[key].pattern ? 'patrón' : 'generativo'}</span></div>
      <input class="sound-fader" type="range" min="-20" max="0" step="0.5" value="${channel ? channel.getVolume() : 0}" data-sound-fader="${key}" aria-label="Volumen de ${channelName(key)}">
      <output class="sound-value" data-sound-value="${key}">${channel ? channel.getVolume().toFixed(1) : '0.0'} dB</output>
      <div class="sound-controls">
        <button class="small-toggle" type="button" data-sound-mute="${key}" aria-label="Silenciar ${channelName(key)}" aria-pressed="${channel && channel.muted}">M</button>
        <button class="small-toggle" type="button" data-sound-solo="${key}" aria-label="Aislar ${channelName(key)}" aria-pressed="${channel && channel.solo}">S</button>
        ${CHANNELS[key].pattern ? `<button class="small-toggle" type="button" data-sound-freeze="${key}" aria-label="Congelar ${channelName(key)}" aria-pressed="${state.frozen[key]}">F</button>` : ''}
      </div>
      <div class="sound-effects">${effects.join('') || '<span class="sound-none">sin efectos</span>'}</div>
    </div>`;
  }).join('');
  syncActivityButtons();
}

function effectRow(key, type, label, value) {
  return `<div class="sound-effect">
    <label for="${type}-${key}">${label}</label>
    <input id="${type}-${key}" type="range" min="0" max="1" step="0.01" value="${value}" data-effect-channel="${key}" data-effect-type="${type}">
    <output data-effect-value="${key}-${type}">${Math.round(value * 100)}%</output>
  </div>`;
}

function renderMixPresets() {
  const select = q('#mix-preset');
  if (!select) return;
  const presets = [
    { name: 'Techno Ambiental', file: '/assets/data/presets/default.json' },
    { name: 'Minimal', file: '/assets/data/presets/minimal.json' },
    { name: 'Ambient', file: '/assets/data/presets/ambient.json' }
  ];
  select.innerHTML = '<option value="-1">Seleccionar…</option>' + presets.map((preset, index) =>
    `<option value="${index}">${preset.name}</option>`
  ).join('');
  select.onchange = async () => {
    const index = parseInt(select.value, 10);
    if (index < 0) return;
    setInstrumentError('');
    try {
      const data = await PresetLoader.loadPreset(presets[index].file);
      PresetLoader.applyPreset(mixer, transport, data);
      state.bpm = transport.getBPM();
      syncTransportUI();
      mixer.updateChannelStates();
      renderSound();
      setSessionStatus('Mezcla cargada.');
    } catch (error) {
      console.error(error);
      setInstrumentError('No se pudo cargar la mezcla.');
    }
  };
}

function updatePatternClasses(step = state.currentStep) {
  const current = step == null ? -1 : step;
  qa('[data-pattern-channel][data-pattern-step]').forEach(el => {
    const key = el.getAttribute('data-pattern-channel');
    const index = parseInt(el.getAttribute('data-pattern-step'), 10);
    const active = state.patterns[key] && state.patterns[key][index] === 1;
    el.classList.toggle('is-active', !!active);
    el.classList.toggle('is-current', index === current);
    if (el.tagName === 'BUTTON') el.setAttribute('aria-pressed', active ? 'true' : 'false');
  });

  const union = Array.from({ length: PATTERN_LENGTH }, (_, index) =>
    PATTERN_KEYS.some(key => state.patterns[key][index] === 1)
  );
  qa('[data-pulse-step]').forEach((el, index) => {
    el.classList.toggle('is-active', union[index]);
    el.classList.toggle('is-current', index === current);
  });

  const pulseStep = q('#pulse-step');
  if (pulseStep) pulseStep.textContent = current >= 0 ? String(current + 1).padStart(2, '0') : '00';
  const pulseState = q('#pulse-state');
  if (pulseState) pulseState.textContent = state.playing ? 'en curso' : 'detenido';
  const pulseCaption = q('.pulse-caption');
  if (pulseCaption) pulseCaption.textContent = 'pulso colectivo · 16 pasos · ' + harmonyLabel();
  updateAutomationStep(current);

  const radialName = q('#radial-center-name');
  if (radialName) radialName.textContent = channelName(state.selected);
  const radialCount = q('#radial-center-count');
  if (radialCount) radialCount.textContent = count(state.patterns[state.selected]) + '/' + PATTERN_LENGTH;
  const readout = q('#sequencer-readout');
  if (readout) {
    readout.textContent = channelName(state.selected) + ' · ' + count(state.patterns[state.selected]) + ' pasos' + (state.frozen[state.selected] ? ' · congelado' : '');
  }
  const perfReadout = q('#performance-readout');
  if (perfReadout) {
    const auto = state.automation.enabled ? ' · auto' : '';
    perfReadout.textContent = state.playing
      ? 'Paso ' + (current + 1) + ' / ' + PATTERN_LENGTH + auto
      : 'Instrumento detenido' + auto;
  }
  const selectedLabel = q('#selected-channel-label');
  if (selectedLabel) selectedLabel.textContent = channelName(state.selected);
  const freezeButton = q('#freeze-selected');
  if (freezeButton) {
    freezeButton.setAttribute('aria-pressed', state.frozen[state.selected] ? 'true' : 'false');
    freezeButton.textContent = state.frozen[state.selected] ? 'Descongelar canal' : 'Congelar canal';
  }
  syncUndoButton();
  syncFreezeUI();
}

function syncParamsUI() {
  Object.keys(state.params).forEach(key => {
    const input = q('#param-' + key);
    const output = q('#param-' + key + '-value');
    if (input) input.value = state.params[key];
    if (output) output.textContent = Math.round(state.params[key] * 100) + '%';
  });
  qa('[data-scene]').forEach(button => {
    const active = button.getAttribute('data-scene') === state.scene;
    button.classList.toggle('is-active', active);
    button.setAttribute('aria-pressed', active ? 'true' : 'false');
  });
}
function syncSeedUI() {
  const seed = q('#seed-value');
  if (seed) seed.textContent = state.seed;
}
function syncHarmonyUI() {
  const root = q('#root-select');
  const scale = q('#scale-select');
  const progression = q('#progression-select');
  const sustain = q('#sustain-control');
  const sustainValue = q('#sustain-value');
  const readout = q('#harmony-readout');
  if (root) root.value = String(state.root);
  if (scale) scale.value = state.scale;
  if (progression) progression.value = state.progression;
  if (sustain) sustain.value = Math.round(state.sustain * 100);
  if (sustainValue) sustainValue.textContent = Math.round(state.sustain * 100) + '%';
  if (readout) readout.textContent = harmonyLabel();
  const caption = q('.pulse-caption');
  if (caption) caption.textContent = 'pulso colectivo · 16 pasos · ' + harmonyLabel();
}
function updateAutomationStep(step) {
  const current = step == null ? -1 : step;
  qa('[data-auto-step]').forEach((el, index) => {
    el.classList.toggle('is-current', index === current);
  });
  const readout = q('#automation-readout');
  if (!readout) return;
  const target = automationTargets[state.automation.target];
  const index = current >= 0 ? current : 0;
  if (!state.automation.enabled) {
    readout.textContent = 'Auto apagado · ' + target.label;
  } else {
    readout.textContent = target.label + ' · paso ' + String(index + 1).padStart(2, '0') + ' · ' + Math.round(state.automation.values[index] * 100) + '%';
  }
}
function renderAutomation() {
  const lane = q('#automation-lane');
  if (!lane) return;
  lane.classList.toggle('is-off', !state.automation.enabled);
  lane.innerHTML = state.automation.values.map((value, index) =>
    `<button class="automation-step" type="button" data-auto-step="${index}" style="--v:${value.toFixed(2)}" aria-label="Paso ${index + 1}: ${Math.round(value * 100)}%">
      <span class="automation-bar"><span class="automation-fill"></span></span>
      <span class="automation-index">${index + 1}</span>
    </button>`
  ).join('');
  const target = q('#automation-target');
  if (target) target.value = state.automation.target;
  const toggle = q('#automation-toggle');
  if (toggle) {
    toggle.setAttribute('aria-pressed', state.automation.enabled ? 'true' : 'false');
    toggle.classList.toggle('is-active', state.automation.enabled);
  }
  updateAutomationStep(state.currentStep);
}
function setAutomationValue(index, value) {
  const clamped = Math.max(0, Math.min(1, Math.round(value * 20) / 20));
  state.automation.values[index] = clamped;
  const step = q(`[data-auto-step="${index}"]`);
  if (step) {
    step.style.setProperty('--v', clamped.toFixed(2));
    step.setAttribute('aria-label', `Paso ${index + 1}: ${Math.round(clamped * 100)}%`);
  }
  updateAutomationStep(state.currentStep);
  if (state.automation.enabled && state.currentStep === index) applyAutomation(index);
}
function toggleAutomation() {
  state.automation.enabled = !state.automation.enabled;
  renderAutomation();
  if (state.automation.enabled) applyAutomation(state.currentStep >= 0 ? state.currentStep : 0);
  currentStatus(state.automation.enabled ? 'Automatización activa · ' + automationTargets[state.automation.target].label + '.' : 'Automatización apagada.');
}
function syncTransportUI() {
  const bpm = q('#bpm-control');
  const bpmValue = q('#bpm-value');
  if (bpm) bpm.value = transport.getBPM();
  if (bpmValue) bpmValue.textContent = transport.getBPM();
  const swing = q('#swing-control');
  const swingValue = q('#swing-value');
  if (swing) swing.value = Math.round(state.swing * 100);
  if (swingValue) swingValue.textContent = Math.round(state.swing * 100) + '%';
  const humanize = q('#humanize-control');
  const humanizeValue = q('#humanize-value');
  if (humanize) humanize.value = Math.round(state.humanize * 100);
  if (humanizeValue) humanizeValue.textContent = Math.round(state.humanize * 100) + '%';
  const master = q('#master-volume');
  const masterValue = q('#master-volume-value');
  if (master) master.value = mixer.getMasterVolume();
  if (masterValue) masterValue.textContent = mixer.getMasterVolume().toFixed(1) + ' dB';
}
function syncFreezeUI() {
  PATTERN_KEYS.forEach(key => {
    qa(`[data-freeze="${key}"], [data-sound-freeze="${key}"]`).forEach(button => {
      button.setAttribute('aria-pressed', state.frozen[key] ? 'true' : 'false');
      button.classList.toggle('is-active', state.frozen[key]);
    });
  });
  const freezeButton = q('#freeze-selected');
  if (freezeButton) {
    freezeButton.setAttribute('aria-pressed', state.frozen[state.selected] ? 'true' : 'false');
    freezeButton.textContent = state.frozen[state.selected] ? 'Descongelar canal' : 'Congelar canal';
  }
}

function selectChannel(key) {
  if (!CHANNELS[key] || !CHANNELS[key].pattern) return;
  state.selected = key;
  syncSelectedUI();
  renderSequencer();
  renderPerformance();
  updatePatternClasses();
}
function syncSelectedUI() {
  qa('[data-select]').forEach(button => {
    const key = button.getAttribute('data-select');
    const active = key === state.selected;
    button.setAttribute('aria-pressed', active ? 'true' : 'false');
    button.classList.toggle('is-active', active);
  });
  const label = q('#selected-channel-label');
  if (label) label.textContent = channelName(state.selected);
  const pulses = q('#euclid-pulses');
  const pulsesValue = q('#euclid-pulses-value');
  if (pulses) pulses.value = state.pulses[state.selected];
  if (pulsesValue) pulsesValue.textContent = state.pulses[state.selected];
}

// === CHANNEL ACTIONS ===
function toggleMute(key) {
  const channel = mixer.getChannel(key);
  if (!channel) return;
  channel.toggleMute();
  mixer.updateChannelStates();
  syncActivityButtons();
  currentStatus(channelName(key) + (channel.muted ? ' silenciado.' : ' audible.'));
}
function toggleSolo(key) {
  const channel = mixer.getChannel(key);
  if (!channel) return;
  channel.toggleSolo();
  mixer.updateChannelStates();
  syncActivityButtons();
  currentStatus(channelName(key) + (channel.solo ? ' aislado.' : ' en mezcla.'));
}
function syncActivityButtons() {
  const hasSolo = Object.keys(CHANNELS).some(key => {
    const channel = mixer.getChannel(key);
    return channel && channel.solo;
  });
  Object.keys(CHANNELS).forEach(key => {
    const channel = mixer.getChannel(key);
    const isolated = hasSolo && channel && !channel.solo;
    qa(`[data-activity-channel="${key}"]`).forEach(row => row.classList.toggle('is-isolated', !!isolated));
    qa(`[data-sound-channel="${key}"]`).forEach(row => row.classList.toggle('is-isolated', !!isolated));
    qa(`[data-mute="${key}"], [data-sound-mute="${key}"]`).forEach(button => {
      const muted = channel && channel.muted;
      button.setAttribute('aria-pressed', muted ? 'true' : 'false');
      button.classList.toggle('is-active', !!muted);
    });
    qa(`[data-solo="${key}"], [data-sound-solo="${key}"]`).forEach(button => {
      const solo = channel && channel.solo;
      button.setAttribute('aria-pressed', solo ? 'true' : 'false');
      button.classList.toggle('is-active', !!solo);
    });
  });
}

// === SESSIONS ===
function collectSession() {
  const channels = {};
  Object.keys(CHANNELS).forEach(key => {
    const channel = mixer.getChannel(key);
    if (!channel) return;
    channels[key] = {
      volume: channel.getVolume(),
      muted: channel.muted,
      solo: channel.solo,
      delay: channel.getDelay() ? channel.getDelay().wet.value : null,
      reverb: channel.getReverb() ? channel.getReverb().wet.value : null,
      pattern: state.patterns[key] ? state.patterns[key].slice() : null
    };
  });
  return {
    version: 1,
    seed: state.seed,
    scene: state.scene,
    params: { ...state.params },
    root: state.root,
    scale: state.scale,
    progression: state.progression,
    sustain: state.sustain,
    automation: {
      enabled: state.automation.enabled,
      target: state.automation.target,
      values: state.automation.values.slice()
    },
    pulses: { ...state.pulses },
    frozen: { ...state.frozen },
    selected: state.selected,
    bpm: transport.getBPM(),
    master: mixer.getMasterVolume(),
    swing: state.swing,
    humanize: state.humanize,
    evolve: state.evolve,
    mutationCount: state.mutationCount,
    evolveCount: state.evolveCount,
    channels
  };
}
function applySession(data) {
  if (!data || data.version !== 1) throw new Error('Sesión inválida');
  state.seed = typeof data.seed === 'number' ? data.seed : state.seed;
  state.scene = SCENES[data.scene] ? data.scene : 'umbral';
  state.params = { ...DEFAULT_PARAMS, ...(data.params || {}) };
  state.root = Number.isInteger(data.root) && ROOTS[data.root] ? data.root : state.root;
  state.scale = SCALES[data.scale] ? data.scale : state.scale;
  state.progression = PROGRESSIONS[data.progression] ? data.progression : state.progression;
  state.sustain = typeof data.sustain === 'number' ? Math.max(0, Math.min(1, data.sustain)) : state.sustain;
  if (data.automation) {
    const automation = data.automation;
    state.automation.enabled = !!automation.enabled;
    state.automation.target = automationTargets[automation.target] ? automation.target : state.automation.target;
    if (Array.isArray(automation.values) && automation.values.length === PATTERN_LENGTH) {
      state.automation.values = automation.values.map(value => Math.max(0, Math.min(1, Number(value) || 0)));
    }
  }
  lastPadChord = 0;
  currentChordDegree = 0;
  syncHarmonyUI();
  renderAutomation();
  state.pulses = { ...state.pulses, ...(data.pulses || {}) };
  state.frozen = { ...state.frozen, ...(data.frozen || {}) };
  state.selected = CHANNELS[data.selected] && CHANNELS[data.selected].pattern ? data.selected : 'kick';
  state.swing = typeof data.swing === 'number' ? data.swing : state.swing;
  state.humanize = typeof data.humanize === 'number' ? data.humanize : state.humanize;
  state.evolve = !!data.evolve;
  state.mutationCount = typeof data.mutationCount === 'number' ? data.mutationCount : 0;
  state.evolveCount = typeof data.evolveCount === 'number' ? data.evolveCount : 0;
  transport.setBPM(data.bpm || transport.getBPM());
  mixer.setMasterVolume(typeof data.master === 'number' ? data.master : mixer.getMasterVolume());

  Object.entries(data.channels || {}).forEach(([key, config]) => {
    const channel = mixer.getChannel(key);
    if (!channel) return;
    if (typeof config.volume === 'number') channel.setVolume(config.volume);
    if (typeof config.muted === 'boolean') channel.setMute(config.muted);
    if (typeof config.solo === 'boolean') channel.setSolo(config.solo);
    if (config.delay !== null && config.delay !== undefined && channel.getDelay()) channel.getDelay().wet.value = config.delay;
    if (config.reverb !== null && config.reverb !== undefined && channel.getReverb()) channel.getReverb().wet.value = config.reverb;
    if (Array.isArray(config.pattern) && config.pattern.length === PATTERN_LENGTH && CHANNELS[key] && CHANNELS[key].pattern) {
      state.patterns[key] = config.pattern.slice();
    }
  });

  mixer.updateChannelStates();
  state.history = [];
  state.clipboard = null;
  syncUndoButton();
  syncPasteButton();
  syncTransportUI();
  syncParamsUI();
  syncSeedUI();
  syncFreezeUI();
  syncSelectedUI();
  const evolve = q('#evolve-toggle');
  if (evolve) {
    evolve.setAttribute('aria-pressed', state.evolve ? 'true' : 'false');
    evolve.classList.toggle('is-active', state.evolve);
  }
  renderPerformance();
  renderSequencer();
  renderSound();
  updatePatternClasses();
}
function saveSession() {
  try {
    localStorage.setItem('kndl000-mixer-session-v1', JSON.stringify(collectSession()));
    setSessionStatus('Sesión guardada.');
  } catch (error) {
    setSessionStatus('No se pudo guardar la sesión.');
  }
}
function loadSession() {
  try {
    const raw = localStorage.getItem('kndl000-mixer-session-v1');
    if (!raw) return setSessionStatus('No hay una sesión guardada.');
    applySession(JSON.parse(raw));
    setSessionStatus('Sesión cargada.');
  } catch (error) {
    setSessionStatus('No se pudo cargar la sesión.');
  }
}
function exportSession() {
  try {
    const blob = new Blob([JSON.stringify(collectSession(), null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'kndl-mixer-session.json';
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 0);
    setSessionStatus('Sesión exportada.');
  } catch (error) {
    setSessionStatus('No se pudo exportar la sesión.');
  }
}
function importSession(file) {
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    try {
      applySession(JSON.parse(reader.result));
      setSessionStatus('Sesión importada.');
    } catch (error) {
      setSessionStatus('El archivo no es una sesión válida.');
    }
  };
  reader.readAsText(file);
}

// === VIEWS / INIT ===
function setView(view, options = {}) {
  if (!['performance', 'sequencer', 'sound'].includes(view)) return;
  state.view = view;
  qa('.view-tab').forEach(tab => {
    const active = tab.getAttribute('data-view') === view;
    tab.setAttribute('aria-selected', active ? 'true' : 'false');
    tab.classList.toggle('is-active', active);
  });
  ['performance', 'sequencer', 'sound'].forEach(name => {
    const section = q('#view-' + name);
    if (section) section.hidden = name !== view;
  });
  if (view === 'performance') renderPerformance();
  if (view === 'sequencer') renderSequencer();
  if (view === 'sound') renderSound();
  if (options.scroll !== false) revealView(view);
  if (history.replaceState) history.replaceState(null, '', '#' + view);
}

function revealView(view) {
  const dock = q('.instrument-dock');
  const section = q('#view-' + view);
  if (!dock || !section) return;
  if (window.getComputedStyle(dock).position !== 'sticky') return;
  const dockBottom = dock.getBoundingClientRect().bottom;
  const top = section.getBoundingClientRect().top;
  if (top >= dockBottom + 1) return;
  const target = Math.max(0, window.scrollY + top - dockBottom - 16);
  const reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  window.scrollTo({ top: target, behavior: reduce ? 'auto' : 'smooth' });
}

function bindStaticControls() {
  q('#transport-play').addEventListener('click', () => {
    if (state.playing) stopPlayback();
    else startPlayback();
  });

  q('#bpm-control').addEventListener('input', event => {
    const bpm = parseInt(event.target.value, 10);
    transport.setBPM(bpm);
    q('#bpm-value').textContent = bpm;
  });
  q('#swing-control').addEventListener('input', event => {
    state.swing = parseInt(event.target.value, 10) / 100;
    q('#swing-value').textContent = Math.round(state.swing * 100) + '%';
  });
  q('#humanize-control').addEventListener('input', event => {
    state.humanize = parseInt(event.target.value, 10) / 100;
    q('#humanize-value').textContent = Math.round(state.humanize * 100) + '%';
  });
  q('#master-volume').addEventListener('input', event => {
    const value = parseFloat(event.target.value);
    mixer.setMasterVolume(value);
    q('#master-volume-value').textContent = value.toFixed(1) + ' dB';
  });

  qa('.view-tab').forEach(tab => tab.addEventListener('click', () => setView(tab.getAttribute('data-view'))));

  const tablist = q('.view-switch');
  if (tablist) {
    tablist.addEventListener('keydown', event => {
      if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
      const tabs = qa('.view-tab');
      const current = tabs.indexOf(document.activeElement);
      if (current < 0) return;
      event.preventDefault();
      let next = current;
      if (event.key === 'ArrowLeft') next = (current - 1 + tabs.length) % tabs.length;
      if (event.key === 'ArrowRight') next = (current + 1) % tabs.length;
      if (event.key === 'Home') next = 0;
      if (event.key === 'End') next = tabs.length - 1;
      tabs[next].focus();
      setView(tabs[next].getAttribute('data-view'));
    });
  }

  Object.keys(state.params).forEach(key => {
    const input = q('#param-' + key);
    if (!input) return;
    input.addEventListener('input', event => {
      state.params[key] = parseFloat(event.target.value);
      q('#param-' + key + '-value').textContent = Math.round(state.params[key] * 100) + '%';
    });
  });

  const rootSelect = q('#root-select');
  if (rootSelect) {
    rootSelect.addEventListener('change', event => {
      state.root = parseInt(event.target.value, 10);
      lastPadChord = 0;
      syncHarmonyUI();
      currentStatus('Tonalidad: ' + harmonyLabel() + '.');
    });
  }
  const scaleSelect = q('#scale-select');
  if (scaleSelect) {
    scaleSelect.addEventListener('change', event => {
      state.scale = event.target.value;
      lastPadChord = 0;
      syncHarmonyUI();
      currentStatus('Escala: ' + harmonyLabel() + '.');
    });
  }
  const progressionSelect = q('#progression-select');
  if (progressionSelect) {
    progressionSelect.addEventListener('change', event => {
      state.progression = event.target.value;
      lastPadChord = 0;
      syncHarmonyUI();
      currentStatus('Progresión: ' + PROGRESSIONS[state.progression].label + '.');
    });
  }
  const sustainControl = q('#sustain-control');
  if (sustainControl) {
    sustainControl.addEventListener('input', event => {
      state.sustain = parseInt(event.target.value, 10) / 100;
      q('#sustain-value').textContent = Math.round(state.sustain * 100) + '%';
    });
  }

  const automationTarget = q('#automation-target');
  if (automationTarget) {
    automationTarget.addEventListener('change', event => {
      state.automation.target = event.target.value;
      renderAutomation();
      if (state.automation.enabled) applyAutomation(state.currentStep >= 0 ? state.currentStep : 0);
      currentStatus('Automatización: ' + automationTargets[state.automation.target].label + '.');
    });
  }
  const automationToggle = q('#automation-toggle');
  if (automationToggle) automationToggle.addEventListener('click', toggleAutomation);

  const automationLane = q('#automation-lane');
  if (automationLane) {
    let drawing = false;
    const paint = event => {
      const lane = automationLane.getBoundingClientRect();
      const index = Math.max(0, Math.min(PATTERN_LENGTH - 1, Math.floor((event.clientX - lane.left) / (lane.width / PATTERN_LENGTH))));
      const bar = q(`[data-auto-step="${index}"] .automation-bar`);
      if (!bar) return;
      const rect = bar.getBoundingClientRect();
      const value = 1 - (event.clientY - rect.top) / rect.height;
      setAutomationValue(index, value);
      const step = q(`[data-auto-step="${index}"]`);
      if (step) step.focus({ preventScroll: true });
    };
    automationLane.addEventListener('pointerdown', event => {
      if (event.pointerType === 'mouse' && event.button !== 0) return;
      drawing = true;
      if (automationLane.setPointerCapture) automationLane.setPointerCapture(event.pointerId);
      paint(event);
      event.preventDefault();
    });
    automationLane.addEventListener('pointermove', event => {
      if (drawing) paint(event);
    });
    const stopDrawing = event => {
      drawing = false;
      if (automationLane.hasPointerCapture && automationLane.hasPointerCapture(event.pointerId)) {
        automationLane.releasePointerCapture(event.pointerId);
      }
    };
    automationLane.addEventListener('pointerup', stopDrawing);
    automationLane.addEventListener('pointercancel', stopDrawing);
    automationLane.addEventListener('keydown', event => {
      const step = event.target.closest('[data-auto-step]');
      if (!step) return;
      const index = parseInt(step.getAttribute('data-auto-step'), 10);
      const delta = event.shiftKey ? 0.01 : 0.05;
      let next = null;
      if (event.key === 'ArrowUp') next = state.automation.values[index] + delta;
      if (event.key === 'ArrowDown') next = state.automation.values[index] - delta;
      if (event.key === 'PageUp') next = state.automation.values[index] + delta * 4;
      if (event.key === 'PageDown') next = state.automation.values[index] - delta * 4;
      if (event.key === 'Home') next = 0;
      if (event.key === 'End') next = 1;
      if (next === null) return;
      event.preventDefault();
      setAutomationValue(index, next);
      step.focus({ preventScroll: true });
    });
  }

  qa('[data-scene]').forEach(button => {
    button.addEventListener('click', () => applyScene(button.getAttribute('data-scene')));
  });
  q('#mutate-selected').addEventListener('click', mutateSelected);
  q('#freeze-selected').addEventListener('click', () => toggleFreeze());
  q('#evolve-toggle').addEventListener('click', toggleEvolve);
  q('#new-seed').addEventListener('click', newSeed);

  q('#density-up').addEventListener('click', densifySelected);
  q('#density-down').addEventListener('click', thinSelected);
  q('#rotate-pattern').addEventListener('click', rotateSelected);
  q('#copy-pattern').addEventListener('click', copySelected);
  q('#paste-pattern').addEventListener('click', pasteSelected);
  q('#apply-euclid').addEventListener('click', applyEuclid);
  q('#undo-pattern').addEventListener('click', undoPattern);
  q('#euclid-pulses').addEventListener('input', event => {
    state.pulses[state.selected] = parseInt(event.target.value, 10);
    q('#euclid-pulses-value').textContent = state.pulses[state.selected];
  });

  q('#activity-list').addEventListener('click', event => {
    const mute = event.target.closest('[data-mute]');
    const freeze = event.target.closest('[data-freeze]');
    const select = event.target.closest('[data-select]');
    if (mute) toggleMute(mute.getAttribute('data-mute'));
    else if (freeze) toggleFreeze(freeze.getAttribute('data-freeze'));
    else if (select) selectChannel(select.getAttribute('data-select'));
  });
  q('#sequencer-channel-list').addEventListener('click', event => {
    const select = event.target.closest('[data-select]');
    if (select) selectChannel(select.getAttribute('data-select'));
  });
  q('#seq-matrix').addEventListener('click', event => {
    const select = event.target.closest('[data-select]');
    if (select) selectChannel(select.getAttribute('data-select'));
  });
  q('#radial-editor').addEventListener('click', event => {
    const step = event.target.closest('[data-radial-step]');
    if (step) toggleStep(step.getAttribute('data-pattern-channel'), parseInt(step.getAttribute('data-pattern-step'), 10));
  });
  q('#sound-channels').addEventListener('input', event => {
    const fader = event.target.closest('[data-sound-fader]');
    const effect = event.target.closest('[data-effect-type]');
    if (fader) {
      const key = fader.getAttribute('data-sound-fader');
      const value = parseFloat(fader.value);
      mixer.getChannel(key).setVolume(value);
      q(`[data-sound-value="${key}"]`).textContent = value.toFixed(1) + ' dB';
    }
    if (effect) {
      const key = effect.getAttribute('data-effect-channel');
      const type = effect.getAttribute('data-effect-type');
      const value = parseFloat(effect.value);
      const channel = mixer.getChannel(key);
      const fx = type === 'delay' ? channel.getDelay() : channel.getReverb();
      if (fx) fx.wet.value = value;
      q(`[data-effect-value="${key}-${type}"]`).textContent = Math.round(value * 100) + '%';
    }
  });
  q('#sound-channels').addEventListener('click', event => {
    const mute = event.target.closest('[data-sound-mute]');
    const solo = event.target.closest('[data-sound-solo]');
    const freeze = event.target.closest('[data-sound-freeze]');
    if (mute) toggleMute(mute.getAttribute('data-sound-mute'));
    else if (solo) toggleSolo(solo.getAttribute('data-sound-solo'));
    else if (freeze) toggleFreeze(freeze.getAttribute('data-sound-freeze'));
  });

  q('#save-session').addEventListener('click', saveSession);
  q('#load-session').addEventListener('click', loadSession);
  q('#export-session').addEventListener('click', exportSession);
  q('#import-session').addEventListener('click', () => q('#import-file').click());
  q('#import-file').addEventListener('change', event => {
    importSession(event.target.files[0]);
    event.target.value = '';
  });

  document.addEventListener('keydown', event => {
    const target = event.target;
    const editable = target && target.closest && target.closest('input, select, textarea, [contenteditable]');
    if (editable) return;

    if (event.code === 'Space') {
      if (target && target.closest && target.closest('button, a')) return;
      event.preventDefault();
      if (state.playing) stopPlayback();
      else startPlayback();
    } else if (event.key === '1') setView('performance');
    else if (event.key === '2') setView('sequencer');
    else if (event.key === '3') setView('sound');
    else if (event.key.toLowerCase() === 'r') mutateSelected();
    else if (event.key.toLowerCase() === 'f') toggleFreeze();
    else if (event.key.toLowerCase() === 'm') toggleMute(state.selected);
    else if (event.key.toLowerCase() === 'z') undoPattern();
  });
}

function init() {
  buildChannels();
  buildLoops();
  renderMixPresets();
  bindStaticControls();
  syncTransportUI();
  syncParamsUI();
  syncSeedUI();
  syncHarmonyUI();
  syncSelectedUI();
  renderPerformance();
  renderSequencer();
  renderSound();
  renderAutomation();
  updatePatternClasses();
  syncUndoButton();
  syncPasteButton();

  const initial = (location.hash || '').replace('#', '');
  setView(['performance', 'sequencer', 'sound'].includes(initial) ? initial : 'performance', { scroll: false });

  window.addEventListener('hashchange', () => {
    const view = (location.hash || '').replace('#', '');
    if (['performance', 'sequencer', 'sound'].includes(view)) setView(view);
  });

  transport.onStep((time, stepCount) => {
    state.currentStep = ((stepCount % PATTERN_LENGTH) + PATTERN_LENGTH) % PATTERN_LENGTH;
    updatePatternClasses(state.currentStep);
    applyAutomation(state.currentStep);
    if (state.evolve && state.playing && stepCount > 0 && stepCount % 32 === 0) evolvePatterns();
  });

  setInstrumentStatus('Detenido');
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
