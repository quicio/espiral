import type { AutomationTargetId } from '../domain/automation';
import { AUTOMATION_TARGET_IDS } from '../domain/automation';
import type { DeviceChainPreset } from '../domain/device-chain';
import {
  CHANNELS,
  PATTERN_LENGTH,
  type ChannelKey
} from '../domain/channels';
import {
  clipId,
  sceneIdList,
  type ClipFollowAction,
  type ClipState
} from '../domain/clip';
import {
  canEditTrackSound,
  isGenerativeRole,
  kitHasSolo,
  kitTracks,
  type TrackState
} from '../domain/kit';
import {
  formatMachineParam,
  instrumentMachinePreset,
  MACHINE_PRESETS,
  USER_MACHINE_IDS
} from '../domain/machines';
import type { ModulationRoute } from '../domain/modulation';
import type { HarmonyState, InstrumentState, ProgressionId, ScaleId, SceneId } from '../domain/models';
import { countSteps, type Pattern, type Step } from '../domain/pattern';
import { normalizePluginParam, type PluginDefinition } from '../domain/plugin';
import type { GenerativePort, PresetSummary } from '../domain/ports';
import {
  SOUND_BANK,
  SOUND_CATEGORIES,
  type SoundPreset
} from '../domain/sound-bank';
import {
  soundOptionsForTrack,
  type SoundKit
} from '../domain/sound-kits';
import type { MixService } from '../application/mix';
import type { PlaybackRuntime } from '../application/runtime';
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
      <button class="activity-action" type="button" data-track-move="${track.id}" data-track-offset="-1" aria-label="Mover ${track.name} hacia arriba">↑</button>
      <button class="activity-action" type="button" data-track-move="${track.id}" data-track-offset="1" aria-label="Mover ${track.name} hacia abajo">↓</button>
      ${isGenerativeRole(track.role) ? `<button class="activity-action" type="button" data-pattern-toggle="${track.id}" aria-pressed="${track.hasPattern}" aria-label="${track.hasPattern ? 'Quitar patrón a' : 'Agregar patrón a'} ${track.name}">${track.hasPattern ? '−P' : '+P'}</button>` : ''}
      <button class="activity-action" type="button" data-mute="${track.id}" aria-pressed="${track.muted}" aria-label="Silenciar ${track.name}">M</button>
      ${track.hasPattern ? `<button class="activity-action" type="button" data-freeze="${track.id}" aria-pressed="${state.pattern.frozen[track.id] ?? false}" aria-label="Congelar ${track.name}">F</button>` : ''}
    </div>`;
  }).join('');
}

export function renderSceneSwitcher(
  state: InstrumentState,
  catalog: Catalog
): void {
  const grid = q('.scene-grid');
  if (!grid) return;
  grid.innerHTML = sceneIdList(state.scenes)
    .map((sceneId, index) => {
      const scene = state.scenes[sceneId];
      if (!scene) return '';
      const builtin = catalog.scenes.find(entry => entry.id === sceneId);
      const description =
        builtin?.description ??
        (sceneId === state.scene ? 'escena activa' : `slot ${index + 1}`);
      return `<button class="scene${sceneId === state.scene ? ' is-active' : ''}" type="button" data-scene="${sceneId}" aria-pressed="${sceneId === state.scene}">
        <span class="scene__name">${scene.name}</span>
        <span class="scene__desc">${description}</span>
      </button>`;
    })
    .join('');
}

export function renderSession(
  state: InstrumentState,
  runtime?: PlaybackRuntime
): void {
  const grid = q('#session-grid');
  if (!grid) return;

  const tracks = kitTracks(state.kit).filter(track => track.hasPattern);
  const quantize = q<HTMLSelectElement>('#clip-quantize');
  if (quantize) quantize.value = state.clipQuantize;

  const currentStep = runtime?.absoluteStep ?? 0;
  const transportPlaying = state.transport.playing;
  const selected = state.kit.tracks[state.selected];
  const activeId = selected ? state.activeClips[selected.id] : undefined;
  const activeClip = activeId ? state.clips[activeId] : undefined;
  const selectedPending = selected
    ? pendingForTrack(state, runtime, selected.id)
    : null;
  const anchorId =
    (selected ? state.activeClips[selected.id] : undefined) ??
    (selected ? state.clips[clipId('umbral', selected.id)]?.id : undefined) ??
    state.clips[clipId('umbral', tracks[0]?.id ?? 'kick')]?.id;
  const readout = q('#session-readout');
  if (readout) {
    const pendingClip =
      selectedPending?.kind === 'clip' && selectedPending.clipId
        ? state.clips[selectedPending.clipId]
        : undefined;
    readout.textContent =
      selectedPending?.kind === 'clip' && pendingClip
        ? `Queued: ${pendingClip.name} · ${state.scenes[pendingClip.sceneId]?.name ?? pendingClip.sceneId} · ${pendingLabel(selectedPending.targetStep, currentStep)}`
        : selectedPending?.kind === 'stop'
          ? `Stop ${selected?.name ?? ''} · ${pendingLabel(selectedPending.targetStep, currentStep)}`
          : activeClip
            ? `${activeClip.name} · ${state.scenes[activeClip.sceneId]?.name ?? activeClip.sceneId} · ${transportPlaying ? 'playing' : 'armed'}`
            : selected?.hasPattern
              ? `${selected.name} detenido`
              : 'Clips por track y escena.';
  }

  const head = `<div class="session-row session-row--head">
    <div class="session-scene-head"><span>Escena</span></div>
    ${tracks
      .map(
        track => `<div class="session-track-head">
          <button class="session-track-name" type="button" data-select="${track.id}" aria-pressed="${track.id === state.selected}" title="${track.name}" aria-label="Seleccionar ${track.name}">${sessionTrackLabel(track)}</button>
          <button class="session-stop" type="button" data-clip-stop="${track.id}" aria-label="Detener ${track.name}">■</button>
        </div>`
      )
      .join('')}
  </div>`;

  const sceneIds = sceneIdList(state.scenes);
  const rows = sceneIds.map((sceneId, rowIndex) => {
    const scene = state.scenes[sceneId];
    if (!scene) return '';
    const scenePending = tracks.some(track => {
      const pending = pendingForTrack(state, runtime, track.id);
      return (
        pending?.kind === 'clip' &&
        pending.clipId !== undefined &&
        state.clips[pending.clipId]?.sceneId === sceneId
      );
    });

    const cells = tracks
      .map((track, trackIndex) => {
        const id = clipId(sceneId, track.id);
        const clip = state.clips[id];
        if (!clip) {
          return `<button class="session-cell session-cell--empty" type="button" data-clip-create="${sceneId}:${track.id}" data-session-row="${rowIndex}" data-session-col="${trackIndex}" data-session-scene="${sceneId}" data-session-track="${track.id}" aria-label="Crear clip de ${track.name} en ${scene.name}">+</button>`;
        }
        const active = state.activeClips[track.id] === clip.id;
        const stopped = state.activeClips[track.id] === null;
        const pending = pendingForTrack(state, runtime, track.id);
        const queued =
          pending?.kind === 'clip' && pending.clipId === clip.id;
        const stopping = pending?.kind === 'stop' && active;
        const leaving =
          pending?.kind === 'clip' && active && pending.clipId !== clip.id;
        const classes = [
          'session-clip',
          queued ? 'is-queued' : '',
          stopping ? 'is-stopping' : '',
          active && !queued && !stopping ? (transportPlaying ? 'is-active' : 'is-armed') : '',
          stopped && !queued && !stopping ? 'is-stopped' : '',
          leaving ? 'is-leaving' : ''
        ]
          .filter(Boolean)
          .join(' ');
        const stateLabel = queued
          ? 'queued'
          : stopping
            ? 'stop'
            : active
              ? transportPlaying
                ? '● playing'
                : '◼ armed'
              : stopped
                ? '■ stopped'
                : 'clip';
        const steps = active
          ? state.pattern.steps[track.id]
          : scene.pattern.steps[track.id];
        const preview = Array.from({ length: 16 }, (_, index) =>
          `<span class="session-preview-step${steps?.[index] ? ' is-on' : ''}"></span>`
        ).join('');
        return `<button class="${classes}" type="button" draggable="true" data-clip-launch="${clip.id}" data-session-row="${rowIndex}" data-session-col="${trackIndex}" data-session-scene="${sceneId}" data-session-track="${track.id}" tabindex="${clip.id === anchorId ? '0' : '-1'}" style="--clip-color:${clip.color}" aria-pressed="${active}" aria-label="Lanzar ${clip.name} · ${stateLabel}" title="${clip.name} · ${scene.name} · ${stateLabel}">
          <span class="session-clip-preview" aria-hidden="true">${preview}</span>
          <span class="session-clip-state">${stateLabel}</span>
        </button>`;
      })
      .join('');

    return `<div class="session-row" data-session-scene-row="${sceneId}">
      <div class="session-scene-cell">
        <button class="session-scene-launch${scenePending ? ' is-queued' : ''}" type="button" data-scene-launch="${sceneId}" aria-label="Lanzar escena ${scene.name}">
          <span class="session-scene-play">▶</span>
          <span>${scene.name}</span>
        </button>
        <div class="session-scene-tools">
          <button class="session-scene-tool" type="button" data-scene-apply="${sceneId}" aria-pressed="${sceneId === state.scene}" aria-label="Aplicar escena ${scene.name}" title="Aplicar escena">A</button>
          <button class="session-scene-tool" type="button" data-scene-move="${sceneId}" data-scene-offset="-1" aria-label="Mover escena ${scene.name} hacia arriba" title="Mover arriba">↑</button>
          <button class="session-scene-tool" type="button" data-scene-move="${sceneId}" data-scene-offset="1" aria-label="Mover escena ${scene.name} hacia abajo" title="Mover abajo">↓</button>
          <button class="session-scene-tool" type="button" data-scene-delete="${sceneId}" aria-label="Eliminar escena ${scene.name}" title="Eliminar escena" ${sceneId === state.scene ? 'disabled' : ''}>×</button>
        </div>
      </div>
      ${cells}
    </div>`;
  }).join('');

  grid.innerHTML = head + rows;
  renderClipInspector(state, selected, activeClip, selectedPending, currentStep);
}

export const ARM_ELEMENT_IDS = [
  'kick',
  'track-08',
  'track-09',
  'hihat',
  'track-10',
  'perc',
  'track-11',
  'track-12',
  'bass',
  'drone',
  'pad',
  'lead',
  'track-13',
  'track-14',
  'track-15',
  'track-16'
] as const;

export interface ArmWizardState {
  readonly presetId: string;
  readonly sceneId: SceneId;
  readonly root: number;
  readonly scale: ScaleId;
  readonly progression: ProgressionId;
  readonly bpm: number;
  readonly kitId: string;
  readonly sounds: Readonly<Record<string, string>>;
  readonly elements: ReadonlySet<string>;
  readonly canCancel: boolean;
  readonly hasSavedSession: boolean;
}

const ARM_PRESET_DESCRIPTIONS: Readonly<Record<string, string>> = {
  techno: '4/4, hats offbeat y bajo rodante',
  dub: 'Espacio largo, delays y graves',
  ambient: 'Texturas lentas y aire',
  breaks: 'Síncopa y batería rota',
  house: '4/4, bajo offbeat y brillo',
  trance: 'Rodante, abierto y eufórico',
  psytrance: 'Kick firme, bajo ácido y tensión',
  triphop: 'Roto, oscuro y con espacio'
};

export function renderArmWizard(
  state: InstrumentState,
  catalog: Catalog,
  presets: readonly PresetSummary[],
  kits: readonly SoundKit[],
  arm: ArmWizardState
): void {
  const presetRoot = q('#arm-presets');
  if (presetRoot) {
    presetRoot.innerHTML = presets
      .map(
        preset => `<button class="arm-card${preset.id === arm.presetId ? ' is-selected' : ''}" type="button" data-arm-preset="${preset.id}" aria-pressed="${preset.id === arm.presetId}">
          <strong>${preset.name}</strong>
          <span>${ARM_PRESET_DESCRIPTIONS[preset.id] ?? 'Preset musical'}</span>
        </button>`
      )
      .join('');
  }

  const musicRoot = q('#arm-music');
  if (musicRoot) {
    musicRoot.innerHTML = `
      <label class="arm-field"><span>Raíz</span><select id="arm-root">${catalog.roots
        .map(
          root =>
            `<option value="${root.value}"${root.value === arm.root ? ' selected' : ''}>${root.label}</option>`
        )
        .join('')}</select></label>
      <label class="arm-field"><span>Escala</span><select id="arm-scale">${catalog.scales
        .map(
          scale =>
            `<option value="${scale.value}"${scale.value === arm.scale ? ' selected' : ''}>${scale.label}</option>`
        )
        .join('')}</select></label>
      <label class="arm-field"><span>Progresión</span><select id="arm-progression">${catalog.progressions
        .map(
          progression =>
            `<option value="${progression.value}"${progression.value === arm.progression ? ' selected' : ''}>${progression.label}</option>`
        )
        .join('')}</select></label>
      <label class="arm-field"><span>Tempo</span><input id="arm-bpm" type="number" min="40" max="240" step="1" value="${arm.bpm}" inputmode="numeric"></label>
    `;
  }

  const sceneRoot = q('#arm-scenes');
  if (sceneRoot) {
    sceneRoot.innerHTML = catalog.scenes
      .map(
        scene => `<button class="arm-card${scene.id === arm.sceneId ? ' is-selected' : ''}" type="button" data-arm-scene="${scene.id}" aria-pressed="${scene.id === arm.sceneId}">
          <strong>${scene.label}</strong>
          <span>${scene.description}</span>
        </button>`
      )
      .join('');
  }

  const elementRoot = q('#arm-elements');
  if (elementRoot) {
    elementRoot.innerHTML = ARM_ELEMENT_IDS.flatMap(trackId => {
      const track = state.kit.tracks[trackId];
      if (!track) return [];
      return `<button class="arm-element${arm.elements.has(trackId) ? ' is-selected' : ''}" type="button" data-arm-element="${trackId}" aria-pressed="${arm.elements.has(trackId)}">
        <strong>${track.name}</strong>
        <span>${track.hasPattern ? 'patrón' : 'generativo'}</span>
      </button>`;
    }).join('');
  }

  const kitRoot = q('#arm-kits');
  if (kitRoot) {
    kitRoot.innerHTML =
      kits
        .map(
          kit => `<div class="arm-kit-card${kit.id === arm.kitId ? ' is-selected' : ''}">
            <button class="arm-kit-select" type="button" data-arm-kit="${kit.id}" aria-pressed="${kit.id === arm.kitId}">
              <strong>${kit.name}</strong>
              <span>${kit.description}</span>
            </button>
            ${
              kit.builtin
                ? ''
                : `<button class="arm-kit-remove" type="button" data-arm-kit-remove="${kit.id}" aria-label="Eliminar ${kit.name}">×</button>`
            }
          </div>`
        )
        .join('') +
      `<div class="arm-kit-card${arm.kitId === 'custom' ? ' is-selected' : ''}">
        <button class="arm-kit-select" type="button" data-arm-kit="custom" aria-pressed="${arm.kitId === 'custom'}">
          <strong>Custom</strong>
          <span>Tu selección actual</span>
        </button>
      </div>`;
  }

  const soundsRoot = q('#arm-sounds');
  if (soundsRoot) {
    soundsRoot.innerHTML = ARM_ELEMENT_IDS.flatMap(trackId => {
      const track = state.kit.tracks[trackId];
      if (!track) return [];
      const options = soundOptionsForTrack(trackId);
      if (options.length === 0) return [];
      const selected = arm.elements.has(trackId);
      const value = arm.sounds[trackId] ?? options[0]?.id ?? '';
      return `<label class="arm-sound${selected ? '' : ' is-disabled'}">
        <span>${track.name}</span>
        <select data-arm-sound="${trackId}"${selected ? '' : ' disabled'}>
          ${options
            .map(
              option =>
                `<option value="${option.id}"${option.id === value ? ' selected' : ''}>${option.name}</option>`
            )
            .join('')}
        </select>
      </label>`;
    }).join('');
  }

  const selectedKit =
    arm.kitId === 'custom'
      ? { name: 'Custom' }
      : kits.find(kit => kit.id === arm.kitId);
  const kitStatus = q('#arm-kit-status');
  if (kitStatus) {
    kitStatus.textContent = `Kit: ${selectedKit?.name ?? 'Custom'}`;
  }

  const build = q<HTMLButtonElement>('#arm-build');
  if (build) build.disabled = arm.elements.size === 0;

  const load = q<HTMLButtonElement>('#arm-load-session');
  if (load) load.disabled = !arm.hasSavedSession;

  const cancel = q<HTMLButtonElement>('#arm-cancel');
  if (cancel) cancel.hidden = !arm.canCancel;

  const status = q('#arm-status');
  if (status) {
    const preset = presets.find(entry => entry.id === arm.presetId);
    const scene = catalog.scenes.find(entry => entry.id === arm.sceneId);
    status.textContent = `${preset?.name ?? arm.presetId} · ${scene?.label ?? arm.sceneId} · ${arm.bpm} BPM · ${arm.elements.size} elementos · ${selectedKit?.name ?? 'Custom'}`;
  }
}

function pendingForTrack(
  state: InstrumentState,
  runtime: PlaybackRuntime | undefined,
  trackId: string
): { kind: 'clip'; clipId: string; targetStep: number } | { kind: 'stop'; targetStep: number } | null {
  if (!runtime) return null;
  const actions = runtime.pendingClipActions;
  const stopAll = actions.find(action => action.kind === 'stop-all');
  if (stopAll) return { kind: 'stop', targetStep: stopAll.targetStep };
  const action = actions.find(candidate =>
    candidate.kind === 'stop-track'
      ? candidate.trackId === trackId
      : candidate.kind === 'clip'
        ? state.clips[candidate.clipId]?.trackId === trackId
        : false
  );
  if (!action) return null;
  return action.kind === 'clip'
    ? { kind: 'clip', clipId: action.clipId, targetStep: action.targetStep }
    : { kind: 'stop', targetStep: action.targetStep };
}

function pendingLabel(targetStep: number, currentStep: number): string {
  const remaining = Math.max(1, targetStep - currentStep);
  if (remaining >= 16) {
    const bars = Math.ceil(remaining / 16);
    return `en ${bars} compás${bars === 1 ? '' : 'es'}`;
  }
  const beats = Math.ceil(remaining / 4);
  return `en ${beats} beat${beats === 1 ? '' : 's'}`;
}

function renderClipInspector(
  state: InstrumentState,
  track: TrackState | undefined,
  clip: ClipState | undefined,
  pending: ReturnType<typeof pendingForTrack>,
  currentStep: number
): void {
  const inspector = q('#clip-inspector');
  if (!inspector) return;

  if (!track || !track.hasPattern) {
    inspector.innerHTML =
      '<p class="lock-empty">Seleccioná un track con patrón para ver su clip.</p>';
    return;
  }

  if (pending?.kind === 'clip' && pending.clipId) {
    const pendingClip = state.clips[pending.clipId];
    if (pendingClip) {
      inspector.innerHTML = `<div class="clip-inspector-head">
          <div>
            <p class="section-label">Clip en cola</p>
            <p class="sound-readout">${pendingClip.name}</p>
          </div>
          <p class="section-meta">${state.scenes[pendingClip.sceneId]?.name ?? pendingClip.sceneId} · ${pendingLabel(pending.targetStep, currentStep)}</p>
        </div>`;
      return;
    }
  }

  if (!clip) {
    inspector.innerHTML = `<p class="lock-empty">${track.name} está detenido. Lanzá un clip para editarlo.</p>`;
    return;
  }

  const scene = state.scenes[clip.sceneId];
  inspector.innerHTML = `<div class="clip-inspector-head">
      <div>
        <p class="section-label">Clip activo</p>
        <p class="sound-readout">${clip.name}</p>
      </div>
      <p class="section-meta">${scene?.name ?? clip.sceneId}</p>
    </div>
    <div class="clip-inspector-controls">
      <label class="clip-field clip-field--name">
        <span>Nombre</span>
        <input data-clip-name="${clip.id}" value="${clip.name}" maxlength="40" aria-label="Nombre de ${clip.name}">
      </label>
      <label class="clip-field clip-field--color">
        <span>Color</span>
        <input type="color" data-clip-color="${clip.id}" value="${clip.color}" aria-label="Color de ${clip.name}">
      </label>
      <button class="line-action" type="button" data-clip-duplicate="${clip.id}">Duplicar</button>
      <button class="line-action" type="button" data-clip-delete="${clip.id}">Eliminar</button>
    </div>
    <div class="clip-inspector-controls">
      <label class="clip-field">
        <span>Follow</span>
        <select data-clip-follow-action="${clip.id}" aria-label="Follow action de ${clip.name}">
          ${followActionOptions(clip.followAction)}
        </select>
      </label>
      <label class="clip-field">
        <span>Cada</span>
        <select data-clip-follow-after="${clip.id}" aria-label="Compases de follow de ${clip.name}">
          ${followAfterOptions(clip.followAfter)}
        </select>
      </label>
    </div>`;
}

function followActionOptions(current: ClipFollowAction): string {
  const options: readonly { value: ClipFollowAction; label: string }[] = [
    { value: 'none', label: 'No follow' },
    { value: 'next', label: 'Siguiente' },
    { value: 'previous', label: 'Anterior' },
    { value: 'random', label: 'Aleatorio' },
    { value: 'stop', label: 'Stop' }
  ];
  return options
    .map(
      option =>
        `<option value="${option.value}"${option.value === current ? ' selected' : ''}>${option.label}</option>`
    )
    .join('');
}

function followAfterOptions(current: number): string {
  return [0, 1, 2, 4, 8, 16]
    .map(
      bars =>
        `<option value="${bars}"${bars === current ? ' selected' : ''}>${bars === 0 ? '—' : `${bars} ${bars === 1 ? 'compás' : 'compases'}`}</option>`
    )
    .join('');
}

export function renderArrangement(
  state: InstrumentState,
  _catalog: Catalog
): void {
  const timeline = q('#arrangement-timeline');
  if (!timeline) return;

  syncSceneOptions(state);
  syncLoopOptions(state);

  const toggle = q<HTMLButtonElement>('#arrangement-toggle');
  if (toggle) {
    toggle.textContent = state.arrangement.enabled ? 'Detener' : 'Activar';
    toggle.setAttribute(
      'aria-pressed',
      state.arrangement.enabled ? 'true' : 'false'
    );
    toggle.classList.toggle('is-active', state.arrangement.enabled);
  }

  const loop = q<HTMLButtonElement>('#arrangement-loop');
  if (loop) {
    loop.setAttribute('aria-pressed', state.arrangement.loop ? 'true' : 'false');
    loop.classList.toggle('is-active', state.arrangement.loop);
  }

  const record = q<HTMLButtonElement>('#arrangement-record');
  if (record) {
    record.textContent = state.arrangement.recording
      ? 'Detener grabación'
      : 'Grabar';
    record.setAttribute(
      'aria-pressed',
      state.arrangement.recording ? 'true' : 'false'
    );
    record.classList.toggle('is-active', state.arrangement.recording);
  }

  const activeBlock =
    state.arrangement.blocks[state.arrangement.blockIndex];
  const activeScene = activeBlock
    ? state.scenes[activeBlock.sceneId]
    : undefined;
  const loopLabel = state.arrangement.loop
    ? ` · loop ${state.arrangement.loopStart + 1}–${state.arrangement.loopEnd}`
    : '';
  const readout = q('#arrangement-readout');
  if (readout) {
    readout.textContent = state.arrangement.recording
      ? `Grabando · ${state.arrangement.blocks.length} bloques`
      : state.arrangement.enabled
        ? `Bloque ${state.arrangement.blockIndex + 1}/${state.arrangement.blocks.length} · ${activeScene?.name ?? activeBlock?.sceneId ?? '—'} · compás ${state.arrangement.bar + 1}/${activeBlock?.bars ?? 0}${loopLabel}`
        : `Arrangement detenido · ${state.arrangement.blocks.length} bloques${loopLabel}`;
  }

  timeline.innerHTML = state.arrangement.blocks
    .map((block, index) => {
      const scene = state.scenes[block.sceneId];
      const active =
        state.arrangement.enabled &&
        index === state.arrangement.blockIndex;
      const looped =
        state.arrangement.loop &&
        index >= state.arrangement.loopStart &&
        index < state.arrangement.loopEnd;
      return `<div class="arrangement-block${active ? ' is-active' : ''}${looped ? ' is-loop' : ''}" data-arrangement-block="${block.id}">
        <div class="arrangement-block-head">
          <span class="arrangement-index">${String(index + 1).padStart(2, '0')}</span>
          <strong>${scene?.name ?? block.sceneId}</strong>
        </div>
        <label class="arrangement-bars">
          <span>Compases</span>
          <input type="number" min="1" max="64" step="1" value="${block.bars}" data-arrangement-bars="${block.id}" aria-label="Compases de ${scene?.name ?? block.sceneId}">
        </label>
        <div class="arrangement-block-actions">
          <button class="small-toggle" type="button" data-arrangement-move="-1" data-arrangement-block="${block.id}" aria-label="Mover bloque a la izquierda">←</button>
          <button class="small-toggle" type="button" data-arrangement-move="1" data-arrangement-block="${block.id}" aria-label="Mover bloque a la derecha">→</button>
          <button class="small-toggle" type="button" data-arrangement-remove="${block.id}" aria-label="Eliminar bloque">×</button>
        </div>
      </div>`;
    })
    .join('');
}

function syncLoopOptions(state: InstrumentState): void {
  const blocks = state.arrangement.blocks;
  const start = q<HTMLSelectElement>('#arrangement-loop-start');
  if (start) {
    start.innerHTML = blocks
      .map(
        (block, index) =>
          `<option value="${index}">${String(index + 1).padStart(2, '0')} · ${state.scenes[block.sceneId]?.name ?? block.sceneId}</option>`
      )
      .join('');
    start.value = String(
      Math.min(state.arrangement.loopStart, Math.max(0, blocks.length - 1))
    );
  }

  const end = q<HTMLSelectElement>('#arrangement-loop-end');
  if (end) {
    end.innerHTML = blocks
      .map(
        (block, index) =>
          `<option value="${index + 1}">${String(index + 1).padStart(2, '0')} · ${state.scenes[block.sceneId]?.name ?? block.sceneId}</option>`
      )
      .join('');
    end.value = String(
      Math.max(
        1,
        Math.min(state.arrangement.loopEnd, Math.max(1, blocks.length))
      )
    );
  }
}

function syncSceneOptions(state: InstrumentState): void {
  const options = sceneIdList(state.scenes)
    .map(sceneId => {
      const scene = state.scenes[sceneId];
      return `<option value="${sceneId}">${scene?.name ?? sceneId}</option>`;
    })
    .join('');

  const arrangementSelect = q<HTMLSelectElement>('#arrangement-scene');
  if (arrangementSelect) {
    const current = arrangementSelect.value;
    arrangementSelect.innerHTML = options;
    if (state.scenes[current]) arrangementSelect.value = current;
  }

  const exportSelect = q<HTMLSelectElement>('#export-scene');
  if (exportSelect) {
    const current = exportSelect.value;
    exportSelect.innerHTML = '<option value="">Actual</option>' + options;
    if (current && state.scenes[current]) exportSelect.value = current;
  }
}

export function renderSequencer(state: InstrumentState, _catalog: Catalog): void {
  const keys = Object.keys(state.pattern.steps);
  const tracks = kitTracks(state.kit);
  const tabs = q('#sequencer-channel-list');
  if (tabs) {
    tabs.innerHTML = tracks
      .map(
        track =>
          `<button class="channel-tab${track.id === state.selected ? ' is-active' : ''}${track.hasPattern ? '' : ' is-generative'}" type="button" data-select="${track.id}" aria-pressed="${track.id === state.selected}">${track.name}</button>`
      )
      .join('');
  }

  const selected = state.kit.tracks[state.selected];
  const selectedPattern = state.pattern.steps[state.selected];
  const radial = q('#radial-editor');
  if (radial) {
    radial.innerHTML = selectedPattern
      ? `<div class="radial-ring">${selectedPattern
          .map(
            (_, index) =>
              `<button class="radial-step${selectedPattern[index] === 1 ? ' is-active' : ''}" type="button" data-pattern-channel="${state.selected}" data-pattern-step="${index}" data-radial-step="${index}" style="--i:${index}" aria-label="Paso ${index + 1}" aria-pressed="${selectedPattern[index] === 1}">${index + 1}</button>`
          )
          .join('')}<div class="radial-center"><strong id="radial-center-name">${trackName(state, state.selected)}</strong><span id="radial-center-count">${countSteps(selectedPattern)}/${PATTERN_LENGTH}</span></div></div>`
      : `<div class="seq-empty-pattern">
          <p class="section-label">Modo generativo</p>
          <p class="seq-readout">${trackName(state, state.selected)} no tiene patrón.</p>
          ${
            selected && isGenerativeRole(selected.role)
              ? `<button class="line-action" type="button" data-pattern-toggle="${selected.id}">+ agregar patrón</button>`
              : ''
          }
        </div>`;
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
  mixService: MixService,
  chains: readonly DeviceChainPreset[] = []
): void {
  const container = q('#sound-channels');
  if (!container) return;

  const plugins = mixService.listPlugins().filter(plugin => plugin.kind === 'effect');
  const tracks = kitTracks(state.kit);
  const anySolo = kitHasSolo(state.kit);
  const selected = state.kit.tracks[state.selected] ?? tracks[0];
  if (!selected) {
    container.innerHTML = '';
    return;
  }

  const mixer = tracks
    .map(track => {
      const isolated = anySolo && !track.solo;
      const active = track.id === selected.id;
      return `<div class="mixer-row${active ? ' is-selected' : ''}${isolated ? ' is-isolated' : ''}" data-sound-channel="${track.id}" data-drop-track="${track.id}">
        <button class="mixer-name" type="button" data-sound-select="${track.id}" aria-pressed="${active}">
          <strong>${track.name}</strong>
          <span>${track.hasPattern ? 'patrón' : 'generativo'}</span>
        </button>
        <div class="node-meter" data-track-meter="${track.id}" aria-label="Nivel de ${track.name}">
          <span class="node-meter__track"><span class="node-meter__fill" data-track-meter-fill="${track.id}"></span></span>
          <button class="node-meter__clip" type="button" data-meter-reset="track:${track.id}" aria-pressed="false" aria-label="Reset clip de ${track.name}">CLIP</button>
        </div>
        <input class="sound-fader" type="range" min="-20" max="0" step="0.5" value="${track.gainDb}" data-sound-fader="${track.id}" aria-label="Volumen de ${track.name}">
        <output class="sound-value" data-sound-value="${track.id}">${track.gainDb.toFixed(1)} dB</output>
        <div class="sound-pan mixer-pan">
          <span>Pan</span>
          <input type="range" min="-1" max="1" step="0.01" value="${track.pan}" data-sound-pan="${track.id}" aria-label="Paneo de ${track.name}">
          <output data-sound-pan-value="${track.id}">${formatPan(track.pan)}</output>
        </div>
        <div class="sound-controls">
          <button class="small-toggle${track.muted ? ' is-active' : ''}" type="button" data-sound-mute="${track.id}" aria-label="Silenciar ${track.name}" aria-pressed="${track.muted}">M</button>
          <button class="small-toggle${track.solo ? ' is-active' : ''}" type="button" data-sound-solo="${track.id}" aria-label="Aislar ${track.name}" aria-pressed="${track.solo}">S</button>
          ${track.hasPattern ? `<button class="small-toggle${state.pattern.frozen[track.id] ? ' is-active' : ''}" type="button" data-sound-freeze="${track.id}" aria-label="Congelar ${track.name}" aria-pressed="${state.pattern.frozen[track.id] ?? false}">F</button>` : ''}
        </div>
      </div>`;
    })
    .join('');

  const rack = selected.inserts
    .map(insert => {
      const plugin = plugins.find(definition => definition.id === insert.pluginId);
      const name = plugin?.name ?? insert.pluginId;
      const ref = `${selected.id}:${insert.id}`;
      return `<div class="insert-row" data-insert-row="${ref}">
        <div class="insert-head">
          <div class="insert-title">
            <span class="insert-drag" draggable="true" data-insert-drag="${ref}" title="Arrastrar para reordenar" aria-hidden="true">⠿</span>
            <strong>${name}</strong>
          </div>
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
    ? `<select class="insert-add" data-add-insert="${selected.id}" aria-label="Agregar plugin a ${selected.name}">
        <option value="">+ insert</option>
        ${plugins.map(plugin => `<option value="${plugin.id}">${plugin.name}</option>`).join('')}
      </select>`
    : '<span class="sound-none">rack no disponible</span>';

  const chainControls = mixService.supportsInserts
    ? `<div class="insert-chain-presets">
        <label class="insert-chain-field">
          <span>Cadena</span>
          <select data-chain-select aria-label="Cadenas guardadas">
            <option value="">Elegir…</option>
            ${chains
              .map(
                preset =>
                  `<option value="${preset.id}">${escapeHtml(preset.name)}</option>`
              )
              .join('')}
          </select>
        </label>
        <button class="small-toggle" type="button" data-chain-apply aria-label="Aplicar cadena"${chains.length === 0 ? ' disabled' : ''}>Aplicar</button>
        <button class="small-toggle" type="button" data-chain-remove aria-label="Eliminar cadena"${chains.length === 0 ? ' disabled' : ''}>×</button>
        <input class="insert-chain-name" data-chain-name maxlength="40" placeholder="Nombre de la cadena" aria-label="Nombre de la cadena">
        <button class="line-action" type="button" data-chain-save${selected.inserts.length === 0 ? ' disabled' : ''}>Guardar cadena</button>
      </div>`
    : '';

  const sends =
    mixService.supportsRouting && state.kit.buses.length > 0
      ? `<div class="sound-sends">${state.kit.buses
          .map(bus => {
            const ref = `${selected.id}:${bus.id}`;
            const send = selected.sends.find(entry => entry.busId === bus.id);
            const amount = Math.round((send?.amount ?? 0) * 100);
            return `<label class="sound-send">
              <span>${bus.name}</span>
              <input type="range" min="0" max="100" step="1" value="${amount}" data-sound-send="${ref}" aria-label="Enviar ${selected.name} a ${bus.name}">
              <output data-sound-send-value="${ref}">${amount}%</output>
            </label>`;
          })
          .join('')}</div>`
      : '';

  const machineControl = canEditTrackSound(selected)
    ? `<select class="machine-select" data-machine="${selected.id}" aria-label="Máquina de ${selected.name}"${mixService.supportsMachineChange ? '' : ' disabled'}>${machineOptions(
        mixService
      )
        .map(
          option =>
            `<option value="${option.id}"${selected.machineId === option.id ? ' selected' : ''}>${option.name}</option>`
        )
        .join('')}</select>`
    : `<span class="machine-label">${machineLabel(selected.machineId)}</span>`;

  const machineParams = canEditTrackSound(selected)
    ? renderMachineParams(selected, mixService)
    : '';

  const macroEnabled = mixService.supportsRouting;
  const trackMacros = selected.macros
    .map((value, index) => {
      const ref = `${selected.id}:${index}`;
      const percent = Math.round(value * 100);
      return `<label class="track-macro">
        <span>M${index + 1}</span>
        <input type="range" min="0" max="100" step="1" value="${percent}" data-track-macro="${ref}" aria-label="Macro ${index + 1} de ${selected.name}"${macroEnabled ? '' : ' disabled'}>
        <output data-track-macro-value="${ref}">${percent}%</output>
      </label>`;
    })
    .join('');

  const detail = `<section class="sound-detail" data-sound-detail="${selected.id}" aria-labelledby="sound-detail-name">
    <div class="sound-detail-head">
      <div>
        <p class="section-label">Track seleccionado</p>
        <input id="sound-detail-name" class="sound-detail-title sound-detail-name" data-track-name="${selected.id}" value="${selected.name}" maxlength="40" aria-label="Nombre de ${selected.name}">
        <p class="section-meta">${selected.hasPattern ? 'patrón' : 'generativo'} · ${machineLabel(selected.machineId)}</p>
      </div>
      <div class="sound-detail-machine">${machineControl}</div>
    </div>
    <div class="sound-detail-grid">
      <div class="sound-pan">
        <span>Pan</span>
        <input type="range" min="-1" max="1" step="0.01" value="${selected.pan}" data-sound-pan="${selected.id}" aria-label="Paneo de ${selected.name}">
        <output data-sound-pan-value="${selected.id}">${formatPan(selected.pan)}</output>
      </div>
      <div class="track-macros">${trackMacros}</div>
      ${sends}
    </div>
    <div class="machine-params" data-machine-params="${selected.id}">${machineParams}</div>
    <div class="sound-effects">
      <div class="insert-rack">${rack}</div>
      ${add}
      ${chainControls}
    </div>
  </section>`;

  container.innerHTML = `<div class="mixer-compact" aria-label="Mixer compacto">${mixer}</div>${detail}`;

  if (mixService.supportsInserts) {
    selected.inserts.forEach(insert => {
      const plugin = plugins.find(definition => definition.id === insert.pluginId);
      const target = q(`[data-insert-params="${selected.id}:${insert.id}"]`);
      if (!plugin || !target) return;
      renderPluginControls(target, plugin, insert.params, (paramId, value) => {
        mixService.setInsertParam(selected.id, insert.id, paramId, value);
      });
    });
  }

  syncMixValues(state, mixService);
  renderSoundBank(state, mixService);
}

function renderSoundBank(state: InstrumentState, mixService: MixService): void {
  const root = q('#sound-bank');
  if (!root) return;

  const editableTracks = kitTracks(state.kit).filter(canEditTrackSound);
  const selected = state.kit.tracks[state.selected];
  const target = selected && canEditTrackSound(selected) ? selected : null;
  const canApply = Boolean(target) && mixService.supportsMachineChange;
  const active = target
    ? SOUND_BANK.find(preset => matchesSoundPreset(target, preset))
    : undefined;
  const status = !target
    ? 'Elegí un track editable para cargar un sonido.'
    : active
      ? `Activo: ${active.name} · ${target.name}`
      : `Destino: ${target.name}`;

  const options = editableTracks
    .map(
      track =>
        `<option value="${track.id}"${track.id === target?.id ? ' selected' : ''}>${track.name}</option>`
    )
    .join('');

  const summary = q('#sound-bank-summary');
  if (summary) summary.textContent = status;

  const favoriteIds = new Set(state.favorites);
  const card = (preset: SoundPreset): string => {
    const favorite = favoriteIds.has(preset.id);
    return `<div class="sound-bank-item">
      <button class="sound-bank-card${preset === active ? ' is-active' : ''}" type="button" draggable="true" data-sound-preset="${preset.id}" data-sound-category="${preset.category}" aria-pressed="${preset === active}"${canApply ? '' : ' disabled'}>
        <span class="sound-bank-name">${preset.name}</span>
        <span class="sound-bank-desc">${preset.description}</span>
      </button>
      <button class="sound-bank-favorite${favorite ? ' is-active' : ''}" type="button" data-sound-favorite="${preset.id}" aria-pressed="${favorite}" aria-label="${favorite ? 'Quitar de favoritos' : 'Agregar a favoritos'}: ${preset.name}">${favorite ? '★' : '☆'}</button>
      <button class="sound-bank-preview" type="button" data-sound-preview="${preset.id}" aria-label="Escuchar ${preset.name}" title="Escuchar">▶</button>
    </div>`;
  };
  const section = (
    id: string,
    label: string,
    presets: readonly SoundPreset[],
    action = ''
  ): string =>
    presets.length === 0
      ? ''
      : `<section class="sound-bank-category" data-sound-category="${id}">
        <p class="sound-bank-category-label">${label}${action}</p>
        <div class="sound-bank-grid">${presets.map(card).join('')}</div>
      </section>`;
  const recent = state.recentSounds
    .map(id => SOUND_BANK.find(preset => preset.id === id))
    .filter((preset): preset is SoundPreset => preset !== undefined);
  const favorites = state.favorites
    .map(id => SOUND_BANK.find(preset => preset.id === id))
    .filter((preset): preset is SoundPreset => preset !== undefined);

  root.innerHTML = `<div class="sound-bank-head">
    <p id="sound-bank-status" class="section-meta">${status}</p>
    <label class="sound-bank-target">
      <span>Destino</span>
      <select id="sound-bank-target" aria-label="Track destino del banco"${mixService.supportsMachineChange ? '' : ' disabled'}>
        ${target ? '' : '<option value="">Elegí un track editable…</option>'}
        ${options}
      </select>
    </label>
  </div>
  <div class="sound-bank-categories">
    ${section('favorites', 'Favoritos', favorites)}
    ${section(
      'recent',
      'Recientes',
      recent,
      '<button class="sound-bank-clear" type="button" data-sound-clear-recent>Limpiar</button>'
    )}
    ${SOUND_CATEGORIES.map(category => {
      const entries = SOUND_BANK.filter(
        preset => preset.category === category.id
      );
      return section(category.id, category.label, entries);
    }).join('')}
  </div>`;

  filterSoundBank(root, q<HTMLInputElement>('#sound-bank-search')?.value ?? '');
}

export function filterSoundBank(root: HTMLElement, query: string): void {
  const normalized = query.trim().toLowerCase();
  root.querySelectorAll<HTMLElement>('.sound-bank-item').forEach(item => {
    const card = item.querySelector<HTMLElement>('.sound-bank-card');
    const text = (card?.textContent ?? '').toLowerCase();
    item.hidden = normalized !== '' && !text.includes(normalized);
  });
  root.querySelectorAll<HTMLElement>('.sound-bank-category').forEach(section => {
    const items = Array.from(
      section.querySelectorAll<HTMLElement>('.sound-bank-item')
    );
    section.hidden = items.length > 0 && items.every(item => item.hidden);
  });
}

function matchesSoundPreset(track: TrackState, preset: SoundPreset): boolean {
  return soundFingerprint(track) === soundFingerprint(preset);
}

function soundFingerprint(value: {
  readonly machineId: string;
  readonly machine: TrackState['machine'];
  readonly noteSource: TrackState['noteSource'];
}): string {
  return JSON.stringify({
    machineId: value.machineId,
    machine: value.machine,
    noteSource: value.noteSource
  });
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
  const bpmNumber = q<HTMLInputElement>('#bpm-number');
  const bpmValue = q('#bpm-value');
  if (bpm) bpm.value = String(state.transport.bpm);
  if (bpmNumber) bpmNumber.value = String(state.transport.bpm);
  if (bpmValue) bpmValue.textContent = String(state.transport.bpm);

  const swing = q<HTMLInputElement>('#swing-control');
  const swingValue = q('#swing-value');
  if (swing) swing.value = String(Math.round(state.transport.swing * 100));
  if (swingValue) swingValue.textContent = `${Math.round(state.transport.swing * 100)}%`;

  const humanize = q<HTMLInputElement>('#humanize-control');
  const humanizeValue = q('#humanize-value');
  if (humanize) humanize.value = String(Math.round(state.transport.humanize * 100));
  if (humanizeValue) humanizeValue.textContent = `${Math.round(state.transport.humanize * 100)}%`;

  const lookAhead = q<HTMLInputElement>('#lookahead-control');
  const lookAheadValue = q('#lookahead-value');
  const lookAheadMs = Math.round(state.transport.lookAhead * 1000);
  if (lookAhead) lookAhead.value = String(lookAheadMs);
  if (lookAheadValue) lookAheadValue.textContent = `${lookAheadMs} ms`;

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

  const hasPattern = state.pattern.steps[state.selected] !== undefined;
  [
    '#mutate-selected',
    '#density-up',
    '#density-down',
    '#rotate-pattern',
    '#copy-pattern',
    '#apply-euclid'
  ].forEach(selector => {
    const button = q<HTMLButtonElement>(selector);
    if (button) button.disabled = !hasPattern;
  });
}

export function syncFreeze(state: InstrumentState): void {
  Object.keys(state.pattern.steps).forEach(key => {
    qa(`[data-freeze="${key}"], [data-sound-freeze="${key}"]`).forEach(button => {
      button.setAttribute('aria-pressed', state.pattern.frozen[key] ? 'true' : 'false');
      button.classList.toggle('is-active', state.pattern.frozen[key] === true);
    });
  });

  const freezeButton = q<HTMLButtonElement>('#freeze-selected');
  if (freezeButton) {
    const hasPattern = state.pattern.steps[state.selected] !== undefined;
    freezeButton.disabled = !hasPattern;
    freezeButton.setAttribute(
      'aria-pressed',
      state.pattern.frozen[state.selected] ? 'true' : 'false'
    );
    freezeButton.textContent = hasPattern
      ? state.pattern.frozen[state.selected]
        ? 'Descongelar track'
        : 'Congelar track'
      : 'Sin patrón';
  }
}

export function syncUndo(state: InstrumentState): void {
  const button = q<HTMLButtonElement>('#undo-pattern');
  if (button) button.disabled = state.history.length === 0;
}

export function syncGlobalHistory(canUndo: boolean, canRedo: boolean): void {
  const undo = q<HTMLButtonElement>('#undo-global');
  if (undo) undo.disabled = !canUndo;
  const redo = q<HTMLButtonElement>('#redo-global');
  if (redo) redo.disabled = !canRedo;
}

export function syncPaste(state: InstrumentState): void {
  const button = q<HTMLButtonElement>('#paste-pattern');
  if (button) {
    button.disabled =
      state.clipboard === null ||
      state.pattern.steps[state.selected] === undefined;
  }
}

export function syncPlayhead(state: InstrumentState): void {
  const current = state.transport.currentStep;

  qa('.is-current[data-pattern-step], .is-current[data-pulse-step]').forEach(
    element => element.classList.remove('is-current')
  );
  if (current >= 0) {
    qa(`[data-pattern-step="${current}"], [data-pulse-step="${current}"]`).forEach(
      element => element.classList.add('is-current')
    );
  }

  const pulseStep = q('#pulse-step');
  if (pulseStep) {
    pulseStep.textContent =
      current >= 0 ? String(current + 1).padStart(2, '0') : '00';
  }
  const pulseState = q('#pulse-state');
  if (pulseState) {
    pulseState.textContent = state.transport.playing ? 'en curso' : 'detenido';
  }
  const performanceReadout = q('#performance-readout');
  if (performanceReadout) {
    const auto = state.automation.enabled ? ' · auto' : '';
    performanceReadout.textContent = state.transport.playing
      ? `Paso ${current + 1} / ${PATTERN_LENGTH}${auto}`
      : `Instrumento detenido${auto}`;
  }
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
    readout.textContent =
      state.pattern.steps[state.selected] === undefined
        ? `${trackName(state, state.selected)} · generativo`
        : `${trackName(state, state.selected)} · ${countSteps(statePattern(state, state.selected))} pasos${state.pattern.frozen[state.selected] ? ' · congelado' : ''}`;
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
  const freezeButton = q<HTMLButtonElement>('#freeze-selected');
  if (freezeButton) {
    const hasPattern = state.pattern.steps[state.selected] !== undefined;
    freezeButton.disabled = !hasPattern;
    freezeButton.setAttribute(
      'aria-pressed',
      state.pattern.frozen[state.selected] ? 'true' : 'false'
    );
    freezeButton.textContent = hasPattern
      ? state.pattern.frozen[state.selected]
        ? 'Descongelar track'
        : 'Congelar track'
      : 'Sin patrón';
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
    track.macros.forEach((value, index) => {
      const ref = `${track.id}:${index}`;
      const input = q<HTMLInputElement>(`[data-track-macro="${ref}"]`);
      if (input) input.value = String(Math.round(value * 100));
      const output = q(`[data-track-macro-value="${ref}"]`);
      if (output) output.textContent = `${Math.round(value * 100)}%`;
    });
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
  mixService: MixService
): void {
  const supportsTrackManagement = mixService.supportsTrackManagement;
  const count = q('#track-count');
  if (count) count.textContent = String(Object.keys(state.kit.tracks).length);

  const machineSelect = q<HTMLSelectElement>('#add-track-machine');
  if (machineSelect && machineSelect.options.length === 0) {
    machineSelect.innerHTML = machineOptions(mixService)
      .map(option => `<option value="${option.id}">${option.name}</option>`)
      .join('');
  }
  if (machineSelect) machineSelect.disabled = !supportsTrackManagement;

  const add = q<HTMLButtonElement>('#add-track');
  if (add) {
    add.disabled = !supportsTrackManagement;
    add.title = supportsTrackManagement
      ? 'Crear un track de usuario'
      : 'No disponible';
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
          <div class="routing-bus-name">
            <div class="routing-bus-title">
              <strong>${bus.name}</strong>
              <button class="routing-bus-remove" type="button" data-bus-remove="${bus.id}" aria-label="Eliminar ${bus.name}">×</button>
            </div>
            <span>return</span>
          </div>
          <input class="routing-range" type="range" min="-60" max="6" step="0.5" value="${bus.returnDb}" data-bus-return="${bus.id}" aria-label="Retorno de ${bus.name}"${supports ? '' : ' disabled'}>
          <output class="routing-value" data-bus-value="${bus.id}">${bus.returnDb.toFixed(1)} dB</output>
          <div class="node-meter" data-bus-meter="${bus.id}" aria-label="Nivel de ${bus.name}">
            <span class="node-meter__track"><span class="node-meter__fill" data-bus-meter-fill="${bus.id}"></span></span>
            <button class="node-meter__clip" type="button" data-meter-reset="bus:${bus.id}" aria-pressed="false" aria-label="Reset clip de ${bus.name}">CLIP</button>
          </div>
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

  const patch = q('#patch-matrix');
  if (patch) {
    const buses = state.kit.buses;
    const patchColumns = `minmax(6.5rem, 9rem) repeat(${Math.max(1, buses.length)}, minmax(7rem, 1fr))`;
    patch.innerHTML =
      `<div class="routing-row routing-row--head" style="grid-template-columns:${patchColumns}">
        <span class="routing-track-label">Desde</span>
        ${buses.map(bus => `<span class="routing-bus-label">${bus.name}</span>`).join('')}
      </div>` +
      buses
        .map(sourceBus => {
          const cells = buses
            .map(targetBus => {
              if (sourceBus.id === targetBus.id) {
                return '<div class="routing-cell routing-cell--self"><span>—</span></div>';
              }
              const ref = `${sourceBus.id}:${targetBus.id}`;
              const send = sourceBus.sends.find(
                entry => entry.busId === targetBus.id
              );
              const amount = Math.round((send?.amount ?? 0) * 100);
              return `<div class="routing-cell">
                <input class="routing-range" type="range" min="0" max="100" step="1" value="${amount}" data-bus-send="${ref}" aria-label="Enviar ${sourceBus.name} a ${targetBus.name}"${supports ? '' : ' disabled'}>
                <output class="routing-value" data-bus-send-value="${ref}">${amount}%</output>
              </div>`;
            })
            .join('');
          return `<div class="routing-row" style="grid-template-columns:${patchColumns}">
            <span class="routing-track-label">${sourceBus.name}</span>
            ${cells}
          </div>`;
        })
        .join('');
  }

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
      : 'routing no disponible';
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

  qa<HTMLInputElement>('[data-bus-send]').forEach(input => {
    const ref = input.getAttribute('data-bus-send');
    if (!ref) return;
    const [fromBusId, toBusId] = ref.split(':');
    if (!fromBusId || !toBusId) return;
    const send = state.kit.buses
      .find(bus => bus.id === fromBusId)
      ?.sends.find(entry => entry.busId === toBusId);
    const amount = Math.round((send?.amount ?? 0) * 100);
    input.value = String(amount);
    input.disabled = !supports;
    const output = q(`[data-bus-send-value="${ref}"]`);
    if (output) output.textContent = `${amount}%`;
  });

  const patchStatus = q('#patch-status');
  if (patchStatus) {
    const total = state.kit.buses.reduce(
      (count, bus) => count + bus.sends.filter(send => send.amount > 0).length,
      0
    );
    patchStatus.textContent = `${total} ${total === 1 ? 'conexión' : 'conexiones'}`;
  }
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

export type LockDescriptor =
  | {
      readonly kind: 'insert';
      readonly trackId: string;
      readonly step: number;
      readonly insertId: string;
      readonly paramId: string;
      readonly param: PluginDefinition['params'][number];
      readonly value: number;
    }
  | {
      readonly kind: 'track';
      readonly trackId: string;
      readonly step: number;
      readonly paramId: 'gain' | 'pan';
      readonly value: number;
      readonly min: number;
      readonly max: number;
      readonly stepSize: number;
      readonly unit: 'db' | 'none';
    };

interface LockTargetOption {
  readonly value: string;
  readonly label: string;
  readonly scope: 'insert' | 'track';
  readonly paramId: string;
  readonly param?: PluginDefinition['params'][number];
  readonly min?: number;
  readonly max?: number;
  readonly stepSize?: number;
  readonly unit?: 'db' | 'none';
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
      ? '<option value="">Locks no disponibles</option>'
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
              const target =
                lock.kind === 'track'
                  ? targets.find(
                      entry => entry.value === `@track:${lock.paramId}`
                    )
                  : targets.find(
                      entry => entry.value === `${lock.insertId}:${lock.paramId}`
                    );
              const label =
                target?.label ??
                (lock.kind === 'track'
                  ? `Track · ${lock.paramId}`
                  : `${lock.insertId} · ${lock.paramId}`);
              const value =
                lock.kind === 'track'
                  ? formatTrackLockValue(lock.paramId, lock.value)
                  : formatPluginParam(
                      target?.param ?? fallbackParam(lock.value),
                      lock.value
                    );
              return `<div class="lock-row">
                <div class="lock-info"><strong>${label}</strong><span>paso ${String(step + 1).padStart(2, '0')}</span></div>
                <output class="lock-value-display">${value}</output>
                <button class="small-toggle" type="button" data-lock-remove data-lock-track="${state.selected}" data-lock-step="${step}" data-lock-scope="${lock.kind === 'track' ? 'track' : 'insert'}" data-lock-insert="${lock.kind === 'track' ? '' : lock.insertId}" data-lock-param="${lock.paramId}" aria-label="Quitar lock de ${label}">×</button>
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
  if (descriptor.kind === 'track') {
    if (input) {
      input.disabled = !supports;
      input.min = String(descriptor.min);
      input.max = String(descriptor.max);
      input.step = String(descriptor.stepSize);
      input.value = String(value);
    }
    if (output) output.textContent = formatTrackLockValue(descriptor.paramId, value);
    return;
  }

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
  if (!track) return null;

  if (parsed.kind === 'track') {
    const lock = state.pattern.locks[state.selected]?.[step]?.find(
      entry => entry.kind === 'track' && entry.paramId === parsed.paramId
    );
    const min = parsed.paramId === 'gain' ? -60 : -1;
    const max = parsed.paramId === 'gain' ? 6 : 1;
    return {
      kind: 'track',
      trackId: state.selected,
      step,
      paramId: parsed.paramId,
      value:
        lock?.value ??
        (parsed.paramId === 'gain' ? track.gainDb : track.pan),
      min,
      max,
      stepSize: parsed.paramId === 'gain' ? 0.5 : 0.01,
      unit: parsed.paramId === 'gain' ? 'db' : 'none'
    };
  }

  const insert = track.inserts.find(entry => entry.id === parsed.insertId);
  if (!insert) return null;
  const definition = mixService
    .listPlugins()
    .find(plugin => plugin.id === insert.pluginId);
  const param = definition?.params.find(entry => entry.id === parsed.paramId);
  if (!param) return null;

  const lock = state.pattern.locks[state.selected]?.[step]?.find(
    entry =>
      entry.kind !== 'track' &&
      entry.insertId === parsed.insertId &&
      entry.paramId === parsed.paramId
  );

  return {
    kind: 'insert',
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
): readonly LockTargetOption[] {
  const track = state.kit.tracks[state.selected];
  if (!track) return [];
  const plugins = mixService.listPlugins();
  const targets: LockTargetOption[] = [
    {
      value: '@track:gain',
      label: 'Track · Gain',
      scope: 'track',
      paramId: 'gain',
      min: -60,
      max: 6,
      stepSize: 0.5,
      unit: 'db'
    },
    {
      value: '@track:pan',
      label: 'Track · Pan',
      scope: 'track',
      paramId: 'pan',
      min: -1,
      max: 1,
      stepSize: 0.01,
      unit: 'none'
    }
  ];
  track.inserts.forEach(insert => {
    const definition = plugins.find(plugin => plugin.id === insert.pluginId);
    if (!definition) return;
    definition.params.forEach(param => {
      targets.push({
        value: `${insert.id}:${param.id}`,
        label: `${definition.name} · ${param.label}`,
        scope: 'insert',
        paramId: param.id,
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
):
  | { kind: 'track'; paramId: 'gain' | 'pan' }
  | { kind: 'insert'; insertId: string; paramId: string }
  | null {
  if (value === '@track:gain' || value === '@track:pan') {
    return { kind: 'track', paramId: value === '@track:gain' ? 'gain' : 'pan' };
  }
  const [insertId, paramId] = value.split(':');
  if (!insertId || !paramId) return null;
  return { kind: 'insert', insertId, paramId };
}

export function formatTrackLockValue(
  paramId: 'gain' | 'pan',
  value: number
): string {
  if (paramId === 'gain') return `${value.toFixed(1)} dB`;
  if (Math.abs(value) < 0.005) return 'C';
  return `${value < 0 ? 'L' : 'R'} ${Math.round(Math.abs(value) * 100)}`;
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
    const options = [
      ...state.modulation.sources.map(source => ({
        id: source.id,
        name: source.name
      })),
      ...trackMacroSources(state)
    ];
    sourceSelect.innerHTML = options
      .map(
        option =>
          `<option value="${option.id}">${option.name}</option>`
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
              const source = modulationSourceLabel(state, route.sourceId);
              const target =
                targets.find(entry => entry.value === routeTargetValue(route))?.label ??
                `${route.target.trackId} · ${route.target.insertId} · ${route.target.paramId}`;
              const amount = Math.round(route.amount * 100);
              return `<div class="mod-route" data-mod-route="${route.id}">
                <div class="mod-route-info">
                  <strong>${source} → ${target}</strong>
                  <span data-mod-mode="${route.id}">${routeRateLabel(state, route, mixService)}</span>
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
      : 'modulación no disponible';
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
    if (!route) return;
    span.textContent = routeRateLabel(state, route, mixService);
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

function trackMacroSources(
  state: InstrumentState
): readonly { readonly id: string; readonly name: string }[] {
  return kitTracks(state.kit).flatMap(track =>
    [0, 1].map(index => ({
      id: `track-macro:${track.id}:${index}`,
      name: `${track.name} M${index + 1}`
    }))
  );
}

function modulationSourceLabel(
  state: InstrumentState,
  sourceId: string
): string {
  const source = state.modulation.sources.find(entry => entry.id === sourceId);
  if (source) return source.name;
  const [prefix, trackId, rawIndex] = sourceId.split(':');
  if (prefix === 'track-macro' && trackId) {
    const track = state.kit.tracks[trackId];
    if (track) return `${track.name} M${Number(rawIndex) + 1}`;
  }
  return sourceId;
}

function routeRateLabel(
  state: InstrumentState,
  route: ModulationRoute,
  mixService: MixService
): string {
  const source = state.modulation.sources.find(
    entry => entry.id === route.sourceId
  );
  const audio =
    source?.kind === 'lfo' && mixService.supportsAudioModulation(route.target);
  return `${audio ? 'audio-rate' : 'control-rate'} · ${route.bipolar ? 'bipolar' : 'unipolar'}`;
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

export type RenderView =
  | 'performance'
  | 'session'
  | 'arrangement'
  | 'sequencer'
  | 'sound'
  | 'routing'
  | 'modulation';

export function renderActiveView(
  state: InstrumentState,
  catalog: Catalog,
  mixService: MixService,
  currentView: RenderView,
  options: {
    runtime?: PlaybackRuntime;
    chains?: readonly DeviceChainPreset[];
  } = {}
): void {
  renderSceneSwitcher(state, catalog);
  syncSceneOptions(state);
  syncLoopOptions(state);

  if (currentView === 'performance') renderPerformance(state, catalog);
  else if (currentView === 'session') renderSession(state, options.runtime);
  else if (currentView === 'arrangement') renderArrangement(state, catalog);
  else if (currentView === 'sequencer') {
    renderSequencer(state, catalog);
    renderAutomation(state, catalog);
    renderLocks(state, mixService);
  } else if (currentView === 'sound') {
    renderSound(state, catalog, mixService, options.chains);
  } else if (currentView === 'routing') {
    renderRouting(state, mixService);
  } else {
    renderModulation(state, mixService);
  }

  syncDynamics(state);
  syncTrackManagement(state, mixService);
  syncParams(state);
  syncSeed(state);
  syncHarmony(state, catalog);
  syncSelected(state);
  syncTransport(state);
  syncFreeze(state);
  syncUndo(state);
  syncPaste(state);
  if (currentView === 'performance' || currentView === 'sequencer') {
    updatePatternClasses(state, catalog);
  }
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

function sessionTrackLabel(track: TrackState): string {
  if (/^Track \d+$/.test(track.name)) {
    return track.name.replace('Track ', 'T');
  }
  const numbered = /^(.+?)\s+(\d+)$/.exec(track.name);
  if (numbered) {
    const base = numbered[1] ?? '';
    const short = base.length > 5 ? base.slice(0, 3) : base;
    return `${short}${numbered[2]}`;
  }
  return track.name.split(' ')[0] ?? track.name;
}

function machineLabel(machineId: string): string {
  const preset = MACHINE_PRESETS[machineId];
  if (preset) return preset.name;
  return machineId.replace(/^core-/, '');
}

function machineOptions(
  mixService: MixService
): readonly { readonly id: string; readonly name: string }[] {
  const options = USER_MACHINE_IDS.flatMap(id => {
    const preset = MACHINE_PRESETS[id];
    return preset ? [{ id, name: preset.name }] : [];
  });
  const instruments = mixService.listInstruments().map(definition => ({
    id: `plugin-${definition.id}`,
    name: definition.name
  }));
  return [...options, ...instruments];
}

function presetForTrack(
  track: TrackState,
  mixService: MixService
) {
  const catalog = MACHINE_PRESETS[track.machineId];
  if (catalog) return catalog;
  if (track.machine.kind === 'plugin' && track.machine.pluginId) {
    const definition = mixService
      .listInstruments()
      .find(entry => entry.id === track.machine.pluginId);
    return definition ? instrumentMachinePreset(definition) : null;
  }
  return null;
}

function renderMachineParams(track: TrackState, mixService: MixService): string {
  const preset = presetForTrack(track, mixService);
  if (!preset || preset.params.length === 0) return '';
  const enabled = mixService.supportsMachineChange;

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

function escapeHtml(value: string): string {
  return value.replace(
    /[&<>"']/g,
    character =>
      ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;'
      })[character] ?? character
  );
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
