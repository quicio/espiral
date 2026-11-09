import type { AutomationTargetId } from '../domain/automation';
import { AUTOMATION_TARGET_IDS } from '../domain/automation';
import {
  CHANNELS,
  PATTERN_LENGTH,
  type ChannelKey
} from '../domain/channels';
import { kitHasSolo, kitTracks, type TrackState } from '../domain/kit';
import {
  formatMachineParam,
  MACHINE_PRESETS,
  USER_MACHINE_IDS
} from '../domain/machines';
import type { HarmonyState, InstrumentState, ProgressionId, ScaleId, SceneId } from '../domain/models';
import { countSteps, type Pattern, type Step } from '../domain/pattern';
import { normalizePluginParam, type PluginDefinition } from '../domain/plugin';
import type { GenerativePort } from '../domain/ports';
import type { MixService } from '../application/mix';
import { formatPluginParam, renderPluginControls } from './plugin-controls';

export interface Catalog {
  readonly channels: Record<ChannelKey, { readonly name: string; readonly pattern: boolean }>;
  readonly scenes: readonly { readonly id: SceneId; readonly label: string; readonly description: string }[];
  readonly roots: readonly { readonly value: number; readonly label: string }[];
  readonly scales: readonly { readonly value: ScaleId; readonly label: string }[];
  readonly progressions: readonly { readonly value: ProgressionId; readonly label: string }[];
  readonly automationTargets: readonly { readonly value: AutomationTargetId; readonly label: string }[];
  harmonyLabel(harmony: HarmonyState): string;
  sceneLabel(scene: SceneId): string;
  automationLabel(target: AutomationTargetId): string;
}

const SCENE_DESCRIPTIONS: Record<SceneId, string> = {
  umbral: 'pulso estable',
  deriva: 'fuga lenta',
  pulso: 'motor firme',
  caos: 'tensión alta'
};

const AUTOMATION_LABELS: Record<AutomationTargetId, string> = {
  'pad-reverb': 'Reverb Pad',
  'lead-delay': 'Delay Lead',
  'hihat-reverb': 'Reverb Hi-Hat',
  'drone-delay': 'Delay Drone'
};

export function createCatalog(generative: GenerativePort): Catalog {
  const roots = generative.roots.map((root, index) => ({
    value: index,
    label: root.label
  }));
  const scales = Object.entries(generative.scales).map(([value, definition]) => ({
    value: value as ScaleId,
    label: definition.label
  }));
  const progressions = Object.entries(generative.progressions).map(([value, definition]) => ({
    value: value as ProgressionId,
    label: definition.label
  }));
  const scenes = Object.entries(generative.scenes).map(([id, definition]) => ({
    id: id as SceneId,
    label: definition.label,
    description: SCENE_DESCRIPTIONS[id as SceneId] ?? ''
  }));
  const automationTargets = AUTOMATION_TARGET_IDS.map(value => ({
    value,
    label: AUTOMATION_LABELS[value]
  }));

  return {
    channels: CHANNELS,
    scenes,
    roots,
    scales,
    progressions,
    automationTargets,
    harmonyLabel(harmony) {
      const root = roots[harmony.root]?.label ?? 'Do';
      const scale = generative.scales[harmony.scale]?.label ?? 'Menor natural';
      return `${root} ${scale.toLowerCase()}`;
    },
    sceneLabel(scene) {
      return generative.scenes[scene]?.label ?? scene;
    },
    automationLabel(target) {
      return AUTOMATION_LABELS[target];
    }
  };
}

export function renderPerformance(state: InstrumentState, catalog: Catalog): void {
  renderPulse(state, catalog);

  const list = q('#activity-list');
  if (!list) return;

  const anySolo = kitHasSolo(state.kit);
  list.innerHTML = kitTracks(state.kit).map(track => {
    const steps = track.hasPattern
      ? `<span class="activity-steps">${statePattern(state, track.id)
          .map(
            (_, index) =>
              `<span class="activity-step" data-pattern-channel="${track.id}" data-pattern-step="${index}" data-part="activity"></span>`
          )
          .join('')}</span>`
      : '<span class="activity-steps activity-steps--generative"><span class="activity-gen">reglas</span></span>';
    const isolated = anySolo && !track.solo;

    return `<div class="activity-row${isolated ? ' is-isolated' : ''}" data-activity-channel="${track.id}">
      <button class="activity-name" type="button" data-select="${track.id}" aria-pressed="${track.id === state.selected}">${track.name}</button>
      <span class="activity-meta">${track.hasPattern ? 'patrón' : 'generativo'}</span>
      ${steps}
      <button class="activity-action" type="button" data-mute="${track.id}" aria-pressed="${track.muted}" aria-label="Silenciar ${track.name}">M</button>
      ${track.hasPattern ? `<button class="activity-action" type="button" data-freeze="${track.id}" aria-pressed="${state.pattern.frozen[track.id] ?? false}" aria-label="Congelar ${track.name}">F</button>` : ''}
    </div>`;
  }).join('');
}

export function renderSequencer(state: InstrumentState, _catalog: Catalog): void {
  const keys = Object.keys(state.pattern.steps);
  const tabs = q('#sequencer-channel-list');
  if (tabs) {
    tabs.innerHTML = keys
      .map(
        key =>
          `<button class="channel-tab${key === state.selected ? ' is-active' : ''}" type="button" data-select="${key}" aria-pressed="${key === state.selected}">${trackName(state, key)}</button>`
      )
      .join('');
  }

  const radial = q('#radial-editor');
  if (radial) {
    radial.innerHTML = `<div class="radial-ring">${statePattern(state, state.selected)
      .map(
        (_, index) =>
          `<button class="radial-step${statePattern(state, state.selected)[index] === 1 ? ' is-active' : ''}" type="button" data-pattern-channel="${state.selected}" data-pattern-step="${index}" data-radial-step="${index}" style="--i:${index}" aria-label="Paso ${index + 1}" aria-pressed="${statePattern(state, state.selected)[index] === 1}">${index + 1}</button>`
      )
      .join('')}<div class="radial-center"><strong id="radial-center-name">${trackName(state, state.selected)}</strong><span id="radial-center-count">${countSteps(statePattern(state, state.selected))}/${PATTERN_LENGTH}</span></div></div>`;
  }

  const matrix = q('#seq-matrix');
  if (matrix) {
    matrix.innerHTML = keys
      .map(
        key => `
      <div class="matrix-row${key === state.selected ? ' is-selected' : ''}">
        <button class="matrix-label" type="button" data-select="${key}" aria-pressed="${key === state.selected}">${trackName(state, key)}</button>
        <span class="matrix-cells">${statePattern(state, key)
          .map(
            (_, index) =>
              `<span class="matrix-cell" data-pattern-channel="${key}" data-pattern-step="${index}" data-part="matrix"></span>`
          )
          .join('')}</span>
      </div>`
      )
      .join('');
  }

  syncSelected(state);
  updatePatternClasses(state, _catalog);
}

export function renderSound(
  state: InstrumentState,
  _catalog: Catalog,
  mixService: MixService
): void {
  const container = q('#sound-channels');
  if (!container) return;

  const plugins = mixService.listPlugins().filter(plugin => plugin.kind === 'effect');
  const anySolo = kitHasSolo(state.kit);

  container.innerHTML = kitTracks(state.kit)
    .map(track => {
      const isolated = anySolo && !track.solo;
      const inserts = mixService.supportsInserts ? track.inserts : [];

      const rack = inserts
        .map(insert => {
          const plugin = plugins.find(definition => definition.id === insert.pluginId);
          const name = plugin?.name ?? insert.pluginId;
          const ref = `${track.id}:${insert.id}`;
          return `<div class="insert-row">
          <div class="insert-head">
            <strong>${name}</strong>
            <div class="insert-actions">
              <button class="small-toggle${insert.bypass ? ' is-active' : ''}" type="button" data-insert-move="up" data-insert-ref="${ref}" aria-label="Mover ${name} hacia arriba">↑</button>
              <button class="small-toggle" type="button" data-insert-move="down" data-insert-ref="${ref}" aria-label="Mover ${name} hacia abajo">↓</button>
              <button class="small-toggle${insert.bypass ? ' is-active' : ''}" type="button" data-insert-bypass="${ref}" aria-pressed="${insert.bypass}" aria-label="Bypass ${name}">BYP</button>
              <button class="small-toggle" type="button" data-insert-remove="${ref}" aria-label="Quitar ${name}">×</button>
            </div>
          </div>
          <div class="insert-params" data-insert-params="${ref}"></div>
        </div>`;
        })
        .join('');

      const add = mixService.supportsInserts
        ? `<select class="insert-add" data-add-insert="${track.id}" aria-label="Agregar plugin a ${track.name}">
          <option value="">+ insert</option>
          ${plugins.map(plugin => `<option value="${plugin.id}">${plugin.name}</option>`).join('')}
        </select>`
        : '<span class="sound-none">rack no disponible en motor legacy</span>';

      const sends =
        mixService.supportsRouting && state.kit.buses.length > 0
          ? `<div class="sound-sends">${state.kit.buses
              .map(bus => {
                const ref = `${track.id}:${bus.id}`;
                const send = track.sends.find(entry => entry.busId === bus.id);
                const amount = Math.round((send?.amount ?? 0) * 100);
                return `<label class="sound-send">
                  <span>${bus.name}</span>
                  <input type="range" min="0" max="100" step="1" value="${amount}" data-sound-send="${ref}" aria-label="Enviar ${track.name} a ${bus.name}">
                  <output data-sound-send-value="${ref}">${amount}%</output>
                </label>`;
              })
              .join('')}</div>`
          : '';

      const machineControl =
        track.role === 'user'
          ? `<select class="machine-select" data-machine="${track.id}" aria-label="Máquina de ${track.name}"${mixService.supportsMachineChange ? '' : ' disabled'}>${USER_MACHINE_IDS.map(
              id => {
                const preset = MACHINE_PRESETS[id];
                if (!preset) return '';
                return `<option value="${id}"${track.machineId === id ? ' selected' : ''}>${preset.name}</option>`;
              }
            ).join('')}</select>`
          : `<span class="machine-label">${machineLabel(track.machineId)}</span>`;

      const machineParams =
        track.role === 'user'
          ? renderMachineParams(track, mixService.supportsMachineChange)
          : '';

      return `<div class="sound-channel${isolated ? ' is-isolated' : ''}" data-sound-channel="${track.id}">
      <div class="sound-name"><strong>${track.name}</strong><span>${track.hasPattern ? 'patrón' : 'generativo'}</span>${machineControl}</div>
      <input class="sound-fader" type="range" min="-20" max="0" step="0.5" value="${track.gainDb}" data-sound-fader="${track.id}" aria-label="Volumen de ${track.name}">
      <output class="sound-value" data-sound-value="${track.id}">${track.gainDb.toFixed(1)} dB</output>
      <div class="sound-controls">
        <button class="small-toggle${track.muted ? ' is-active' : ''}" type="button" data-sound-mute="${track.id}" aria-label="Silenciar ${track.name}" aria-pressed="${track.muted}">M</button>
        <button class="small-toggle${track.solo ? ' is-active' : ''}" type="button" data-sound-solo="${track.id}" aria-label="Aislar ${track.name}" aria-pressed="${track.solo}">S</button>
        ${track.hasPattern ? `<button class="small-toggle${state.pattern.frozen[track.id] ? ' is-active' : ''}" type="button" data-sound-freeze="${track.id}" aria-label="Congelar ${track.name}" aria-pressed="${state.pattern.frozen[track.id] ?? false}">F</button>` : ''}
      </div>
      <div class="sound-pan">
        <span>Pan</span>
        <input type="range" min="-1" max="1" step="0.01" value="${track.pan}" data-sound-pan="${track.id}" aria-label="Paneo de ${track.name}">
        <output data-sound-pan-value="${track.id}">${formatPan(track.pan)}</output>
      </div>
      <div class="machine-params" data-machine-params="${track.id}">${machineParams}</div>
      <div class="sound-effects">
        ${sends}
        <div class="insert-rack">${rack}</div>
        ${add}
      </div>
    </div>`;
    })
    .join('');

  if (mixService.supportsInserts) {
    kitTracks(state.kit).forEach(track => {
      track.inserts.forEach(insert => {
        const plugin = plugins.find(definition => definition.id === insert.pluginId);
        const target = q(`[data-insert-params="${track.id}:${insert.id}"]`);
        if (!plugin || !target) return;
        renderPluginControls(target, plugin, insert.params, (paramId, value) => {
          mixService.setInsertParam(track.id, insert.id, paramId, value);
        });
      });
    });
  }

  syncMixValues(state, mixService);
}

export function renderAutomation(state: InstrumentState, catalog: Catalog): void {
  const lane = q('#automation-lane');
  if (!lane) return;

  lane.classList.toggle('is-off', !state.automation.enabled);
  lane.innerHTML = state.automation.values
    .map(
      (value, index) =>
        `<button class="automation-step" type="button" data-auto-step="${index}" style="--v:${value.toFixed(2)}" aria-label="Paso ${index + 1}: ${Math.round(value * 100)}%">
      <span class="automation-bar"><span class="automation-fill"></span></span>
      <span class="automation-index">${index + 1}</span>
    </button>`
    )
    .join('');

  const target = q<HTMLSelectElement>('#automation-target');
  if (target) target.value = state.automation.target;
  const toggle = q('#automation-toggle');
  if (toggle) {
    toggle.setAttribute('aria-pressed', state.automation.enabled ? 'true' : 'false');
    toggle.classList.toggle('is-active', state.automation.enabled);
  }
  updateAutomationStep(state, catalog);
}

export function syncParams(state: InstrumentState): void {
  Object.entries(state.params).forEach(([key, value]) => {
    const input = q<HTMLInputElement>(`#param-${key}`);
    const output = q(`#param-${key}-value`);
    if (input) input.value = String(value);
    if (output) output.textContent = `${Math.round(value * 100)}%`;
  });

  qa('[data-scene]').forEach(button => {
    const active = button.getAttribute('data-scene') === state.scene;
    button.classList.toggle('is-active', active);
    button.setAttribute('aria-pressed', active ? 'true' : 'false');
  });
}

export function syncSeed(state: InstrumentState): void {
  const seed = q('#seed-value');
  if (seed) seed.textContent = String(state.seed);
}

export function syncHarmony(state: InstrumentState, catalog: Catalog): void {
  const root = q<HTMLSelectElement>('#root-select');
  const scale = q<HTMLSelectElement>('#scale-select');
  const progression = q<HTMLSelectElement>('#progression-select');
  const sustain = q<HTMLInputElement>('#sustain-control');
  const sustainValue = q('#sustain-value');
  const readout = q('#harmony-readout');

  if (root) root.value = String(state.harmony.root);
  if (scale) scale.value = state.harmony.scale;
  if (progression) progression.value = state.harmony.progression;
  if (sustain) sustain.value = String(Math.round(state.harmony.sustain * 100));
  if (sustainValue) sustainValue.textContent = `${Math.round(state.harmony.sustain * 100)}%`;
  if (readout) readout.textContent = catalog.harmonyLabel(state.harmony);
  const caption = q('.pulse-caption');
  if (caption) caption.textContent = `pulso colectivo · 16 pasos · ${catalog.harmonyLabel(state.harmony)}`;
}

export function syncTransport(state: InstrumentState): void {
  const bpm = q<HTMLInputElement>('#bpm-control');
  const bpmValue = q('#bpm-value');
  if (bpm) bpm.value = String(state.transport.bpm);
  if (bpmValue) bpmValue.textContent = String(state.transport.bpm);

  const swing = q<HTMLInputElement>('#swing-control');
  const swingValue = q('#swing-value');
  if (swing) swing.value = String(Math.round(state.transport.swing * 100));
  if (swingValue) swingValue.textContent = `${Math.round(state.transport.swing * 100)}%`;

  const humanize = q<HTMLInputElement>('#humanize-control');
  const humanizeValue = q('#humanize-value');
  if (humanize) humanize.value = String(Math.round(state.transport.humanize * 100));
  if (humanizeValue) humanizeValue.textContent = `${Math.round(state.transport.humanize * 100)}%`;

  const master = q<HTMLInputElement>('#master-volume');
  const masterValue = q('#master-volume-value');
  if (master) master.value = String(state.masterVolume);
  if (masterValue) masterValue.textContent = `${state.masterVolume.toFixed(1)} dB`;

  const label = q('#transport-label');
  if (label) {
    label.textContent = state.transport.preparing
      ? 'Preparando'
      : state.transport.playing
        ? 'Detener'
        : 'Reproducir';
  }
  const play = q<HTMLButtonElement>('#transport-play');
  if (play) {
    play.dataset.playing = state.transport.playing ? 'true' : 'false';
    play.setAttribute('aria-pressed', state.transport.playing ? 'true' : 'false');
  }
  const status = q('#instrument-status');
  if (status) {
    status.textContent = state.transport.preparing
      ? 'Preparando audio'
      : state.transport.playing
        ? 'Reproduciendo'
        : 'Detenido';
  }
  const pulseState = q('#pulse-state');
  if (pulseState) pulseState.textContent = state.transport.playing ? 'en curso' : 'detenido';
}

export function syncSelected(state: InstrumentState): void {
  qa('[data-select]').forEach(button => {
    const key = button.getAttribute('data-select');
    const active = key === state.selected;
    button.setAttribute('aria-pressed', active ? 'true' : 'false');
    button.classList.toggle('is-active', active);
  });

  const label = q('#selected-channel-label');
  if (label) label.textContent = trackName(state, state.selected);
  const pulses = q<HTMLInputElement>('#euclid-pulses');
  const pulsesValue = q('#euclid-pulses-value');
  if (pulses) pulses.value = String(state.pattern.pulses[state.selected] ?? 4);
  if (pulsesValue) pulsesValue.textContent = String(state.pattern.pulses[state.selected] ?? 4);
}

export function syncFreeze(state: InstrumentState): void {
  Object.keys(state.pattern.steps).forEach(key => {
    qa(`[data-freeze="${key}"], [data-sound-freeze="${key}"]`).forEach(button => {
      button.setAttribute('aria-pressed', state.pattern.frozen[key] ? 'true' : 'false');
      button.classList.toggle('is-active', state.pattern.frozen[key] === true);
    });
  });

  const freezeButton = q('#freeze-selected');
  if (freezeButton) {
    freezeButton.setAttribute('aria-pressed', state.pattern.frozen[state.selected] ? 'true' : 'false');
    freezeButton.textContent = state.pattern.frozen[state.selected] ? 'Descongelar track' : 'Congelar track';
  }
}

export function syncUndo(state: InstrumentState): void {
  const button = q<HTMLButtonElement>('#undo-pattern');
  if (button) button.disabled = state.history.length === 0;
}

export function syncPaste(state: InstrumentState): void {
  const button = q<HTMLButtonElement>('#paste-pattern');
  if (button) button.disabled = state.clipboard === null;
}

export function updatePatternClasses(state: InstrumentState, catalog: Catalog): void {
  const current = state.transport.currentStep;

  qa('[data-pattern-channel][data-pattern-step]').forEach(element => {
    const key = element.getAttribute('data-pattern-channel');
    const index = Number(element.getAttribute('data-pattern-step'));
    const active = key !== null && statePattern(state, key)[index] === 1;
    const lockCount =
      key !== null ? state.pattern.locks[key]?.[index]?.length ?? 0 : 0;
    const ratchets =
      key !== null ? state.pattern.ratchets[key]?.[index] ?? 1 : 1;
    element.classList.toggle('is-active', active);
    element.classList.toggle('is-current', index === current);
    element.classList.toggle('has-locks', lockCount > 0);
    element.classList.toggle('has-ratchets', ratchets > 1);
    if (lockCount > 0) element.setAttribute('data-lock-count', String(lockCount));
    else element.removeAttribute('data-lock-count');
    if (ratchets > 1) element.setAttribute('data-ratchets', String(ratchets));
    else element.removeAttribute('data-ratchets');
    if (element.tagName === 'BUTTON') {
      element.setAttribute('aria-pressed', active ? 'true' : 'false');
    }
  });

  const keys = Object.keys(state.pattern.steps);
  const union = Array.from({ length: PATTERN_LENGTH }, (_, index) =>
    keys.some(key => statePattern(state, key)[index] === 1)
  );
  qa('[data-pulse-step]').forEach((element, index) => {
    element.classList.toggle('is-active', union[index] === true);
    element.classList.toggle('is-current', index === current);
  });

  const pulseStep = q('#pulse-step');
  if (pulseStep) {
    pulseStep.textContent = current >= 0 ? String(current + 1).padStart(2, '0') : '00';
  }
  const pulseState = q('#pulse-state');
  if (pulseState) pulseState.textContent = state.transport.playing ? 'en curso' : 'detenido';
  const pulseCaption = q('.pulse-caption');
  if (pulseCaption) {
    pulseCaption.textContent = `pulso colectivo · 16 pasos · ${catalog.harmonyLabel(state.harmony)}`;
  }

  const radialName = q('#radial-center-name');
  if (radialName) radialName.textContent = trackName(state, state.selected);
  const radialCount = q('#radial-center-count');
  if (radialCount) {
    radialCount.textContent = `${countSteps(statePattern(state, state.selected))}/${PATTERN_LENGTH}`;
  }

  const readout = q('#sequencer-readout');
  if (readout) {
    readout.textContent = `${trackName(state, state.selected)} · ${countSteps(statePattern(state, state.selected))} pasos${state.pattern.frozen[state.selected] ? ' · congelado' : ''}`;
  }
  const performanceReadout = q('#performance-readout');
  if (performanceReadout) {
    const auto = state.automation.enabled ? ' · auto' : '';
    performanceReadout.textContent = state.transport.playing
      ? `Paso ${current + 1} / ${PATTERN_LENGTH}${auto}`
      : `Instrumento detenido${auto}`;
  }
  const selectedLabel = q('#selected-channel-label');
  if (selectedLabel) selectedLabel.textContent = trackName(state, state.selected);
  const freezeButton = q('#freeze-selected');
  if (freezeButton) {
    freezeButton.setAttribute('aria-pressed', state.pattern.frozen[state.selected] ? 'true' : 'false');
    freezeButton.textContent = state.pattern.frozen[state.selected] ? 'Descongelar track' : 'Congelar track';
  }

  syncUndo(state);
  syncFreeze(state);
  updateAutomationStep(state, catalog);
}

export function updateAutomationStep(state: InstrumentState, catalog: Catalog): void {
  const current = state.transport.currentStep;
  qa('[data-auto-step]').forEach((element, index) => {
    element.classList.toggle('is-current', index === current);
  });

  const readout = q('#automation-readout');
  if (!readout) return;
  const index = current >= 0 ? current : 0;
  const value = state.automation.values[index] ?? 0;
  readout.textContent = state.automation.enabled
    ? `${catalog.automationLabel(state.automation.target)} · paso ${String(index + 1).padStart(2, '0')} · ${Math.round(value * 100)}%`
    : `Auto apagado · ${catalog.automationLabel(state.automation.target)}`;
}

export function syncAutomationValues(state: InstrumentState, catalog: Catalog): void {
  state.automation.values.forEach((value, index) => {
    const step = q(`[data-auto-step="${index}"]`);
    if (!step) return;
    step.style.setProperty('--v', value.toFixed(2));
    step.setAttribute('aria-label', `Paso ${index + 1}: ${Math.round(value * 100)}%`);
  });
  updateAutomationStep(state, catalog);
}

export function syncMixValues(
  state: InstrumentState,
  mixService: MixService
): void {
  Object.values(state.kit.tracks).forEach(track => {
    const volume = q(`[data-sound-value="${track.id}"]`);
    if (volume) volume.textContent = `${track.gainDb.toFixed(1)} dB`;
    const pan = q(`[data-sound-pan-value="${track.id}"]`);
    if (pan) pan.textContent = formatPan(track.pan);
    track.sends.forEach(send => {
      const ref = `${track.id}:${send.busId}`;
      const output = q(`[data-sound-send-value="${ref}"]`);
      if (output) output.textContent = `${Math.round(send.amount * 100)}%`;
      const input = q<HTMLInputElement>(`[data-sound-send="${ref}"]`);
      if (input) input.value = String(Math.round(send.amount * 100));
    });
  });

  const master = q('#master-volume-value');
  if (master) master.textContent = `${state.masterVolume.toFixed(1)} dB`;

  syncInsertValues(state, mixService);
}

export function syncInsertValues(
  state: InstrumentState,
  mixService: MixService
): void {
  if (!mixService.supportsInserts) return;
  const plugins = mixService.listPlugins();

  Object.values(state.kit.tracks).forEach(track => {
    track.inserts.forEach(insert => {
      const target = q(`[data-insert-params="${track.id}:${insert.id}"]`);
      const definition = plugins.find(plugin => plugin.id === insert.pluginId);
      if (!target || !definition) return;

      definition.params.forEach(param => {
        const input = q<HTMLInputElement>(
          `[data-plugin-param="${param.id}"]`,
          target
        );
        if (!input) return;
        const value = insert.params[param.id] ?? param.defaultValue;
        input.value = String(normalizePluginParam(param, value));
        const output = input.parentElement?.querySelector('output');
        if (output) output.textContent = formatPluginParam(param, value);
      });
    });
  });
}

export function syncTrackManagement(
  state: InstrumentState,
  supportsTrackManagement: boolean
): void {
  const count = q('#track-count');
  if (count) count.textContent = String(Object.keys(state.kit.tracks).length);

  const machineSelect = q<HTMLSelectElement>('#add-track-machine');
  if (machineSelect && machineSelect.options.length === 0) {
    machineSelect.innerHTML = USER_MACHINE_IDS.map(id => {
      const preset = MACHINE_PRESETS[id];
      return preset ? `<option value="${id}">${preset.name}</option>` : '';
    }).join('');
  }
  if (machineSelect) machineSelect.disabled = !supportsTrackManagement;

  const add = q<HTMLButtonElement>('#add-track');
  if (add) {
    add.disabled = !supportsTrackManagement;
    add.title = supportsTrackManagement
      ? 'Crear un track de usuario'
      : 'No disponible en el motor legacy';
  }

  const remove = q<HTMLButtonElement>('#remove-track');
  if (remove) {
    const selected = state.kit.tracks[state.selected];
    const removable = supportsTrackManagement && selected?.role === 'user';
    remove.disabled = !removable;
    remove.setAttribute(
      'aria-label',
      removable && selected ? `Eliminar ${selected.name}` : 'Eliminar track seleccionado'
    );
    remove.title = removable
      ? `Eliminar ${selected.name}`
      : 'Selecciona un track de usuario para eliminarlo';
  }
}

export function renderRouting(
  state: InstrumentState,
  mixService: MixService
): void {
  const buses = q('#routing-buses');
  if (buses) {
    const supports = mixService.supportsRouting;
    buses.innerHTML = state.kit.buses
      .map(
        bus => `<div class="routing-bus" data-bus="${bus.id}">
          <div class="routing-bus-name"><strong>${bus.name}</strong><span>return</span></div>
          <input class="routing-range" type="range" min="-60" max="6" step="0.5" value="${bus.returnDb}" data-bus-return="${bus.id}" aria-label="Retorno de ${bus.name}"${supports ? '' : ' disabled'}>
          <output class="routing-value" data-bus-value="${bus.id}">${bus.returnDb.toFixed(1)} dB</output>
        </div>`
      )
      .join('');
  }

  const matrix = q('#routing-matrix');
  if (!matrix) return;

  const supports = mixService.supportsRouting;
  const tracks = kitTracks(state.kit);
  const columns = `minmax(6.5rem, 9rem) repeat(${Math.max(1, state.kit.buses.length)}, minmax(8rem, 1fr))`;
  const header = `<div class="routing-row routing-row--head" style="grid-template-columns:${columns}">
    <span class="routing-track-label">Track</span>
    ${state.kit.buses
      .map(bus => `<span class="routing-bus-label">${bus.name}</span>`)
      .join('')}
  </div>`;

  matrix.innerHTML =
    header +
    tracks
      .map(track => {
        const cells = state.kit.buses
          .map(bus => {
            const ref = `${track.id}:${bus.id}`;
            const send = track.sends.find(entry => entry.busId === bus.id);
            const amount = Math.round((send?.amount ?? 0) * 100);
            const pre = send?.preFader ?? false;
            return `<div class="routing-cell">
              <input class="routing-range" type="range" min="0" max="100" step="1" value="${amount}" data-route-amount="${ref}" aria-label="Enviar ${track.name} a ${bus.name}"${supports ? '' : ' disabled'}>
              <output class="routing-value" data-route-value="${ref}">${amount}%</output>
              <button class="small-toggle route-pre${pre ? ' is-active' : ''}" type="button" data-route-pre="${ref}" aria-pressed="${pre}" aria-label="Pre-fader ${track.name} a ${bus.name}"${supports ? '' : ' disabled'}>PRE</button>
            </div>`;
          })
          .join('');
        return `<div class="routing-row" data-routing-track="${track.id}" style="grid-template-columns:${columns}">
          <button class="routing-track-label" type="button" data-select="${track.id}" aria-pressed="${track.id === state.selected}">${track.name}</button>
          ${cells}
        </div>`;
      })
      .join('');

  syncRouting(state, mixService);
}

export function syncRouting(
  state: InstrumentState,
  mixService: MixService
): void {
  const supports = mixService.supportsRouting;
  const active = kitTracks(state.kit).reduce(
    (total, track) =>
      total + track.sends.filter(send => send.amount > 0).length,
    0
  );
  const status = q('#routing-status');
  if (status) {
    status.textContent = supports
      ? `${active} ${active === 1 ? 'send activo' : 'sends activos'} · ${state.kit.buses.length} buses`
      : 'routing no disponible en motor legacy';
  }

  qa<HTMLInputElement>('[data-route-amount]').forEach(input => {
    const ref = input.getAttribute('data-route-amount');
    if (!ref) return;
    const [trackId, busId] = ref.split(':');
    if (!trackId || !busId) return;
    const send = state.kit.tracks[trackId]?.sends.find(
      entry => entry.busId === busId
    );
    const amount = Math.round((send?.amount ?? 0) * 100);
    input.value = String(amount);
    input.disabled = !supports;
    const output = q(`[data-route-value="${ref}"]`);
    if (output) output.textContent = `${amount}%`;
  });

  qa<HTMLButtonElement>('[data-route-pre]').forEach(button => {
    const ref = button.getAttribute('data-route-pre');
    if (!ref) return;
    const [trackId, busId] = ref.split(':');
    if (!trackId || !busId) return;
    const pre =
      state.kit.tracks[trackId]?.sends.find(entry => entry.busId === busId)
        ?.preFader ?? false;
    button.setAttribute('aria-pressed', pre ? 'true' : 'false');
    button.classList.toggle('is-active', pre);
    button.disabled = !supports;
  });

  qa<HTMLInputElement>('[data-bus-return]').forEach(input => {
    const busId = input.getAttribute('data-bus-return');
    if (!busId) return;
    const bus = state.kit.buses.find(entry => entry.id === busId);
    input.disabled = !supports;
    if (!bus) return;
    input.value = String(bus.returnDb);
    const output = q(`[data-bus-value="${busId}"]`);
    if (output) output.textContent = `${bus.returnDb.toFixed(1)} dB`;
  });
}

export function syncDynamics(state: InstrumentState): void {
  const step = dynStepValue();
  const trackId = state.selected;
  const track = state.kit.tracks[trackId];
  const values = {
    velocity: state.pattern.velocity[trackId]?.[step],
    probability: state.pattern.probability[trackId]?.[step],
    ratchets: state.pattern.ratchets[trackId]?.[step]
  };
  const supported =
    track !== undefined &&
    values.velocity !== undefined &&
    values.probability !== undefined &&
    values.ratchets !== undefined;

  const velocity = values.velocity ?? 1;
  const probability = values.probability ?? 1;
  const ratchets = values.ratchets ?? 1;

  const velocityInput = q<HTMLInputElement>('#dyn-velocity');
  const probabilityInput = q<HTMLInputElement>('#dyn-probability');
  const ratchetsInput = q<HTMLInputElement>('#dyn-ratchets');
  if (velocityInput) {
    velocityInput.disabled = !supported;
    velocityInput.value = String(Math.round(velocity * 100));
  }
  if (probabilityInput) {
    probabilityInput.disabled = !supported;
    probabilityInput.value = String(Math.round(probability * 100));
  }
  if (ratchetsInput) {
    ratchetsInput.disabled = !supported;
    ratchetsInput.value = String(ratchets);
  }

  const velocityOut = q('#dyn-velocity-value');
  const probabilityOut = q('#dyn-probability-value');
  const ratchetsOut = q('#dyn-ratchets-value');
  if (velocityOut) velocityOut.textContent = `${Math.round(velocity * 100)}%`;
  if (probabilityOut) probabilityOut.textContent = `${Math.round(probability * 100)}%`;
  if (ratchetsOut) ratchetsOut.textContent = String(ratchets);

  const readout = q('#dyn-readout');
  if (readout) {
    readout.textContent = supported
      ? `Paso ${String(step + 1).padStart(2, '0')} · ${track.name} · V ${Math.round(velocity * 100)} · P ${Math.round(probability * 100)} · R ${ratchets}`
      : 'Seleccioná un track con patrón';
  }
}

function dynStepValue(): number {
  const value = Number(q<HTMLSelectElement>('#dyn-step')?.value ?? 1);
  return Number.isFinite(value)
    ? Math.max(0, Math.min(PATTERN_LENGTH - 1, value - 1))
    : 0;
}

export interface LockDescriptor {
  readonly trackId: string;
  readonly step: number;
  readonly insertId: string;
  readonly paramId: string;
  readonly param: PluginDefinition['params'][number];
  readonly value: number;
}

export function renderLocks(
  state: InstrumentState,
  mixService: MixService
): void {
  const supports = mixService.supportsInserts;
  const step = lockStepValue();
  const targets = lockTargets(state, mixService);
  const track = state.kit.tracks[state.selected];
  const locks = state.pattern.locks[state.selected]?.[step] ?? [];

  const targetSelect = q<HTMLSelectElement>('#lock-target');
  if (targetSelect) {
    const previous = targetSelect.value;
    targetSelect.innerHTML = !supports
      ? '<option value="">Locks no disponibles en motor legacy</option>'
      : targets.length === 0
        ? '<option value="">Sin inserts en el track</option>'
        : targets
            .map(target => `<option value="${target.value}">${target.label}</option>`)
            .join('');
    if (targets.some(target => target.value === previous)) {
      targetSelect.value = previous;
    }
    targetSelect.disabled = !supports || targets.length === 0;
  }

  const list = q('#lock-list');
  if (list) {
    list.innerHTML =
      locks.length === 0
        ? '<p class="lock-empty">Sin locks en este paso.</p>'
        : locks
            .map(lock => {
              const target = targets.find(
                entry => entry.value === `${lock.insertId}:${lock.paramId}`
              );
              const label =
                target?.label ?? `${lock.insertId} · ${lock.paramId}`;
              return `<div class="lock-row">
                <div class="lock-info"><strong>${label}</strong><span>paso ${String(step + 1).padStart(2, '0')}</span></div>
                <output class="lock-value-display">${formatPluginParam(target?.param ?? fallbackParam(lock.value), lock.value)}</output>
                <button class="small-toggle" type="button" data-lock-remove data-lock-track="${state.selected}" data-lock-step="${step}" data-lock-insert="${lock.insertId}" data-lock-param="${lock.paramId}" aria-label="Quitar lock de ${label}">×</button>
              </div>`;
            })
            .join('');
  }

  const readout = q('#lock-readout');
  if (readout) {
    const trackName = track?.name ?? state.selected;
    readout.textContent =
      locks.length === 0
        ? `Paso ${String(step + 1).padStart(2, '0')} · ${trackName} · sin locks`
        : `Paso ${String(step + 1).padStart(2, '0')} · ${trackName} · ${locks.length} ${locks.length === 1 ? 'lock' : 'locks'}`;
  }

  const set = q<HTMLButtonElement>('#lock-set');
  if (set) set.disabled = !supports || targets.length === 0;

  syncLockValue(state, mixService);
}

export function syncLockValue(
  state: InstrumentState,
  mixService: MixService
): void {
  const supports = mixService.supportsInserts;
  const descriptor = selectedLockDescriptor(state, mixService);
  const input = q<HTMLInputElement>('#lock-value');
  const output = q('#lock-value-output');

  if (!descriptor) {
    if (input) input.disabled = true;
    if (output) output.textContent = '—';
    return;
  }

  const value = descriptor.value;
  if (input) {
    input.disabled = !supports;
    input.min = '0';
    input.max = '1';
    input.step = '0.001';
    input.value = String(normalizePluginParam(descriptor.param, value));
  }
  if (output) output.textContent = formatPluginParam(descriptor.param, value);
}

export function selectedLockDescriptor(
  state: InstrumentState,
  mixService: MixService
): LockDescriptor | null {
  const step = lockStepValue();
  const targetValue = q<HTMLSelectElement>('#lock-target')?.value ?? '';
  const parsed = parseLockTarget(targetValue);
  if (!parsed) return null;

  const track = state.kit.tracks[state.selected];
  const insert = track?.inserts.find(entry => entry.id === parsed.insertId);
  if (!insert) return null;
  const definition = mixService
    .listPlugins()
    .find(plugin => plugin.id === insert.pluginId);
  const param = definition?.params.find(entry => entry.id === parsed.paramId);
  if (!param) return null;

  const lock = state.pattern.locks[state.selected]?.[step]?.find(
    entry => entry.insertId === parsed.insertId && entry.paramId === parsed.paramId
  );

  return {
    trackId: state.selected,
    step,
    insertId: parsed.insertId,
    paramId: parsed.paramId,
    param,
    value: lock?.value ?? param.defaultValue
  };
}

function lockTargets(
  state: InstrumentState,
  mixService: MixService
): readonly { value: string; label: string; param: PluginDefinition['params'][number] }[] {
  const track = state.kit.tracks[state.selected];
  if (!track) return [];
  const plugins = mixService.listPlugins();
  const targets: {
    value: string;
    label: string;
    param: PluginDefinition['params'][number];
  }[] = [];
  track.inserts.forEach(insert => {
    const definition = plugins.find(plugin => plugin.id === insert.pluginId);
    if (!definition) return;
    definition.params.forEach(param => {
      targets.push({
        value: `${insert.id}:${param.id}`,
        label: `${definition.name} · ${param.label}`,
        param
      });
    });
  });
  return targets;
}

function lockStepValue(): number {
  const value = Number(q<HTMLSelectElement>('#lock-step')?.value ?? 1);
  return Number.isFinite(value) ? Math.max(0, Math.min(PATTERN_LENGTH - 1, value - 1)) : 0;
}

function parseLockTarget(
  value: string
): { insertId: string; paramId: string } | null {
  const [insertId, paramId] = value.split(':');
  if (!insertId || !paramId) return null;
  return { insertId, paramId };
}

function fallbackParam(value: number): PluginDefinition['params'][number] {
  return {
    id: 'value',
    label: 'Valor',
    min: 0,
    max: 1,
    defaultValue: value,
    unit: 'none'
  };
}

export function renderModulation(
  state: InstrumentState,
  mixService: MixService
): void {
  const supports = mixService.supportsInserts;

  const sources = q('#mod-sources');
  if (sources) {
    sources.innerHTML = state.modulation.sources
      .map(source => {
        if (source.kind === 'lfo') {
          return `<div class="mod-source" data-mod-source="${source.id}">
            <div class="mod-source-name"><strong>${source.name}</strong><span>${source.shape ?? 'sine'}</span></div>
            <input class="routing-range" type="range" min="0.01" max="8" step="0.01" value="${source.rate ?? 0.25}" data-mod-rate="${source.id}" aria-label="Velocidad de ${source.name}"${supports ? '' : ' disabled'}>
            <output class="routing-value" data-mod-source-value="${source.id}">${(source.rate ?? 0.25).toFixed(2)} Hz</output>
          </div>`;
        }
        if (source.kind === 'macro') {
          const value = Math.round((source.value ?? 0.5) * 100);
          return `<div class="mod-source" data-mod-source="${source.id}">
            <div class="mod-source-name"><strong>${source.name}</strong><span>macro</span></div>
            <input class="routing-range" type="range" min="0" max="100" step="1" value="${value}" data-mod-macro="${source.id}" aria-label="Valor de ${source.name}"${supports ? '' : ' disabled'}>
            <output class="routing-value" data-mod-source-value="${source.id}">${value}%</output>
          </div>`;
        }
        return `<div class="mod-source" data-mod-source="${source.id}">
          <div class="mod-source-name"><strong>${source.name}</strong><span>transporte</span></div>
          <span class="mod-source-static">posición del paso</span>
        </div>`;
      })
      .join('');
  }

  const targets = modulationTargets(state, mixService);
  const sourceSelect = q<HTMLSelectElement>('#mod-source-select');
  if (sourceSelect) {
    sourceSelect.innerHTML = state.modulation.sources
      .map(
        source =>
          `<option value="${source.id}">${source.name}</option>`
      )
      .join('');
    sourceSelect.disabled = !supports;
  }

  const targetSelect = q<HTMLSelectElement>('#mod-target-select');
  if (targetSelect) {
    targetSelect.innerHTML = targets
      .map(
        target =>
          `<option value="${target.value}">${target.label}</option>`
      )
      .join('');
    targetSelect.disabled = !supports || targets.length === 0;
  }

  const add = q<HTMLButtonElement>('#mod-add-route');
  if (add) add.disabled = !supports || targets.length === 0;

  const routes = q('#mod-routes');
  if (routes) {
    routes.innerHTML =
      state.modulation.routes.length === 0
        ? '<p class="mod-empty">Sin rutas. Elegí fuente y destino, y agregá una ruta.</p>'
        : state.modulation.routes
            .map(route => {
              const source =
                state.modulation.sources.find(entry => entry.id === route.sourceId)?.name ??
                route.sourceId;
              const target =
                targets.find(entry => entry.value === routeTargetValue(route))?.label ??
                `${route.target.trackId} · ${route.target.insertId} · ${route.target.paramId}`;
              const amount = Math.round(route.amount * 100);
              return `<div class="mod-route" data-mod-route="${route.id}">
                <div class="mod-route-info">
                  <strong>${source} → ${target}</strong>
                  <span data-mod-mode="${route.id}">${route.bipolar ? 'bipolar' : 'unipolar'}</span>
                </div>
                <input class="routing-range" type="range" min="-100" max="100" step="1" value="${amount}" data-mod-amount="${route.id}" aria-label="Cantidad de ${source}"${supports ? '' : ' disabled'}>
                <output class="routing-value" data-mod-value="${route.id}">${amount}%</output>
                <button class="small-toggle route-pre${route.bipolar ? ' is-active' : ''}" type="button" data-mod-bipolar="${route.id}" aria-pressed="${route.bipolar}" aria-label="Bipolar ${source}"${supports ? '' : ' disabled'}>BIP</button>
                <button class="small-toggle" type="button" data-mod-remove="${route.id}" aria-label="Quitar ruta ${source}"${supports ? '' : ' disabled'}>×</button>
              </div>`;
            })
            .join('');
  }

  syncModulation(state, mixService);
}

export function syncModulation(
  state: InstrumentState,
  mixService: MixService
): void {
  const supports = mixService.supportsInserts;
  const modulation = state.modulation;
  const enabled = q('#mod-enabled');
  if (enabled) {
    enabled.setAttribute('aria-pressed', modulation.enabled ? 'true' : 'false');
    enabled.classList.toggle('is-active', modulation.enabled);
    enabled.toggleAttribute('disabled', !supports);
  }

  const status = q('#mod-status');
  if (status) {
    status.textContent = supports
      ? `${modulation.routes.length} ${modulation.routes.length === 1 ? 'ruta' : 'rutas'} · ${modulation.enabled ? 'activa' : 'apagada'}`
      : 'modulación no disponible en motor legacy';
  }

  qa<HTMLInputElement>('[data-mod-rate], [data-mod-macro]').forEach(input => {
    input.disabled = !supports;
  });

  qa<HTMLInputElement>('[data-mod-amount]').forEach(input => {
    const routeId = input.getAttribute('data-mod-amount');
    if (!routeId) return;
    const route = modulation.routes.find(entry => entry.id === routeId);
    if (!route) return;
    const amount = Math.round(route.amount * 100);
    input.value = String(amount);
    input.disabled = !supports;
    const output = q(`[data-mod-value="${routeId}"]`);
    if (output) output.textContent = `${amount}%`;
  });

  qa<HTMLButtonElement>('[data-mod-bipolar]').forEach(button => {
    const routeId = button.getAttribute('data-mod-bipolar');
    if (!routeId) return;
    const route = modulation.routes.find(entry => entry.id === routeId);
    const active = route?.bipolar ?? false;
    button.setAttribute('aria-pressed', active ? 'true' : 'false');
    button.classList.toggle('is-active', active);
    button.disabled = !supports;
  });

  qa('[data-mod-mode]').forEach(span => {
    const routeId = span.getAttribute('data-mod-mode');
    if (!routeId) return;
    const route = modulation.routes.find(entry => entry.id === routeId);
    span.textContent = route?.bipolar ? 'bipolar' : 'unipolar';
  });

  qa<HTMLButtonElement>('[data-mod-remove]').forEach(button => {
    button.disabled = !supports;
  });

  const add = q<HTMLButtonElement>('#mod-add-route');
  if (add) add.disabled = !supports;

  const amountInput = q<HTMLInputElement>('#mod-amount');
  if (amountInput) amountInput.disabled = !supports;
  const bipolar = q<HTMLButtonElement>('#mod-bipolar');
  if (bipolar) bipolar.disabled = !supports;

  modulation.sources.forEach(source => {
    const output = q(`[data-mod-source-value="${source.id}"]`);
    if (!output) return;
    if (source.kind === 'lfo') {
      output.textContent = `${(source.rate ?? 0.25).toFixed(2)} Hz`;
    } else if (source.kind === 'macro') {
      output.textContent = `${Math.round((source.value ?? 0.5) * 100)}%`;
    }
  });
}

function modulationTargets(
  state: InstrumentState,
  mixService: MixService
): readonly { value: string; label: string }[] {
  const plugins = mixService.listPlugins();
  const targets: { value: string; label: string }[] = [];
  kitTracks(state.kit).forEach(track => {
    track.inserts.forEach(insert => {
      const definition = plugins.find(plugin => plugin.id === insert.pluginId);
      if (!definition) return;
      definition.params.forEach(param => {
        targets.push({
          value: `${track.id}:${insert.id}:${param.id}`,
          label: `${track.name} · ${definition.name} · ${param.label}`
        });
      });
    });
  });
  return targets;
}

function routeTargetValue(route: {
  target: { trackId: string; insertId: string; paramId: string };
}): string {
  return `${route.target.trackId}:${route.target.insertId}:${route.target.paramId}`;
}

export function renderAll(
  state: InstrumentState,
  catalog: Catalog,
  mixService: MixService,
  options: { sound?: boolean } = {}
): void {
  renderPerformance(state, catalog);
  renderSequencer(state, catalog);
  if (options.sound !== false) renderSound(state, catalog, mixService);
  renderAutomation(state, catalog);
  renderRouting(state, mixService);
  renderModulation(state, mixService);
  renderLocks(state, mixService);
  syncDynamics(state);
  syncTrackManagement(state, mixService.supportsTrackManagement);
  syncParams(state);
  syncSeed(state);
  syncHarmony(state, catalog);
  syncSelected(state);
  syncTransport(state);
  syncFreeze(state);
  syncUndo(state);
  syncPaste(state);
  updatePatternClasses(state, catalog);
}

function renderPulse(state: InstrumentState, catalog: Catalog): void {
  const wrap = q('#pulse-wrap');
  if (!wrap) return;
  wrap.innerHTML =
    '<div class="pulse" aria-hidden="true">' +
    Array.from(
      { length: PATTERN_LENGTH },
      (_, index) => `<span class="pulse-dot" data-pulse-step="${index}" style="--i:${index}"></span>`
    ).join('') +
    '<div class="pulse-center"><span id="pulse-step">00</span><small id="pulse-state">detenido</small></div>' +
    '</div>' +
    `<p class="pulse-caption">pulso colectivo · 16 pasos · ${catalog.harmonyLabel(state.harmony)}</p>`;
}

const EMPTY_PATTERN: Pattern = Array.from(
  { length: PATTERN_LENGTH },
  () => 0 as Step
);

function statePattern(state: InstrumentState, key: string): Pattern {
  return state.pattern.steps[key] ?? EMPTY_PATTERN;
}

function trackName(state: InstrumentState, id: string): string {
  return state.kit.tracks[id]?.name ?? id;
}

function machineLabel(machineId: string): string {
  const preset = MACHINE_PRESETS[machineId];
  if (preset) return preset.name;
  return machineId.replace(/^core-/, '');
}

function renderMachineParams(track: TrackState, enabled: boolean): string {
  const preset = MACHINE_PRESETS[track.machineId];
  if (!preset || preset.params.length === 0) return '';

  return preset.params
    .map(param => {
      const value = param.get(track.machine);
      const disabled = enabled ? '' : ' disabled';
      const control =
        param.kind === 'select'
          ? `<select data-machine-param="${param.id}" data-machine-track="${track.id}" aria-label="${param.label} de ${track.name}"${disabled}>${(param.options ?? [])
              .map(
                option =>
                  `<option value="${option.value}"${String(value) === option.value ? ' selected' : ''}>${option.label}</option>`
              )
              .join('')}</select>`
          : `<input type="range" min="${param.min ?? 0}" max="${param.max ?? 1}" step="${param.step ?? 0.01}" value="${value}" data-machine-param="${param.id}" data-machine-track="${track.id}" aria-label="${param.label} de ${track.name}"${disabled}>`;
      return `<label class="machine-param">
        <span>${param.label}</span>
        ${control}
        <output>${formatMachineParam(param, value)}</output>
      </label>`;
    })
    .join('');
}

function formatPan(pan: number): string {
  if (Math.abs(pan) < 0.005) return 'C';
  return `${pan < 0 ? 'L' : 'R'} ${Math.round(Math.abs(pan) * 100)}`;
}

export function q<T extends Element = HTMLElement>(selector: string, root: ParentNode = document): T | null {
  return root.querySelector<T>(selector);
}

export function must<T extends Element = HTMLElement>(selector: string, root: ParentNode = document): T {
  const element = q<T>(selector, root);
  if (!element) throw new Error(`Elemento no encontrado: ${selector}`);
  return element;
}

export function qa<T extends Element = HTMLElement>(
  selector: string,
  root: ParentNode = document
): T[] {
  return Array.from(root.querySelectorAll<T>(selector));
}
