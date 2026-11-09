import './modular-demo.css';
import { defaultPluginState, type PluginDefinition } from './domain/plugin';
import { ModularAudioEngine } from './infrastructure/audio/modular/modular-audio-engine';
import { createDemoGraph } from './infrastructure/audio/modular/demo-graph';
import { ToneClock } from './infrastructure/audio/tone-clock';
import { renderPluginControls } from './presentation/plugin-controls';

function q<T extends HTMLElement>(id: string): T {
  const element = document.getElementById(id);
  if (!element) throw new Error(`Elemento no encontrado: ${id}`);
  return element as T;
}

const engine = new ModularAudioEngine(createDemoGraph());
const clock = new ToneClock(110);

const playButton = q<HTMLButtonElement>('demo-play');
const statusOutput = q<HTMLElement>('demo-status');
const stepOutput = q<HTMLOutputElement>('demo-step');
const errorOutput = q<HTMLElement>('demo-error');
const masterFill = q<HTMLElement>('master-fill');
const masterLevel = q<HTMLOutputElement>('master-level');
const pluginSelect = q<HTMLSelectElement>('bass-plugin');
const pluginParams = q<HTMLElement>('bass-plugin-params');

const effectPlugins = engine.listPlugins().filter(plugin => plugin.kind === 'effect');
pluginSelect.innerHTML = effectPlugins
  .map(plugin => `<option value="${plugin.id}">${plugin.name}</option>`)
  .join('');

let playing = false;

clock.onStep((time, stepCount) => {
  const step = ((stepCount % 16) + 16) % 16;

  if (step % 4 === 0) {
    engine.trigger({ type: 'kick', time });
  }
  if ([0, 3, 6, 10, 14].includes(step)) {
    engine.trigger({
      type: 'sample',
      channel: 'bass',
      time,
      sampleIndex: 0,
      playbackRate: 1,
      duration: '8n'
    });
  }

  stepOutput.textContent = String(step + 1).padStart(2, '0');
});

playButton.addEventListener('click', () => {
  void togglePlayback();
});

async function togglePlayback(): Promise<void> {
  if (playing) {
    stop();
    return;
  }

  playButton.disabled = true;
  statusOutput.textContent = 'Preparando';
  errorOutput.textContent = '';

  try {
    await engine.prepare();
    await clock.start();
    playing = true;
    playButton.textContent = 'Detener';
    statusOutput.textContent = 'Reproduciendo';
  } catch (error) {
    console.error(error);
    clock.stop();
    engine.stop();
    statusOutput.textContent = 'Detenido';
    errorOutput.textContent = 'No se pudo iniciar el audio.';
  } finally {
    playButton.disabled = false;
  }
}

function stop(): void {
  playing = false;
  clock.stop();
  engine.stop();
  playButton.textContent = 'Reproducir';
  statusOutput.textContent = 'Detenido';
  stepOutput.textContent = '00';
}

bindRange('kick-volume', value => `${value.toFixed(1)} dB`, value => {
  engine.setChannelVolume('kick', value);
});
bindRange('bass-volume', value => `${value.toFixed(1)} dB`, value => {
  engine.setChannelVolume('bass', value);
});
bindRange('bass-send', value => `${Math.round(value * 100)}%`, value => {
  engine.setTrackSend('bass', 'space', value, false);
});
bindRange('bus-return', value => `${value.toFixed(1)} dB`, value => {
  engine.setBusReturn('space', value);
});
bindRange('bus-decay', value => `${value.toFixed(1)} s`, value => {
  engine.setInsertParam('space', 'reverb', 'decay', value);
});

const initialPlugin = effectPlugins.find(plugin => plugin.id === 'filter') ?? effectPlugins[0];
if (initialPlugin) {
  let activePlugin: PluginDefinition = initialPlugin;
  let state: Record<string, number> = defaultPluginState(initialPlugin);

  const renderControls = (): void => {
    renderPluginControls(pluginParams, activePlugin, state, (paramId, value) => {
      state = { ...state, [paramId]: value };
      engine.setInsertParam('bass', 'insert', paramId, value);
    });
  };

  renderControls();
  pluginSelect.value = initialPlugin.id;

  const applyPlugin = async (next: PluginDefinition): Promise<void> => {
    try {
      await engine.preparePlugin(next.id);
      await engine.setTrackInserts('bass', [
        {
          id: 'insert',
          pluginId: next.id,
          bypass: false,
          params: defaultPluginState(next)
        }
      ]);
      activePlugin = next;
      state = defaultPluginState(next);
      renderControls();
      errorOutput.textContent = '';
    } catch (error) {
      console.error(error);
      errorOutput.textContent = 'No se pudo cargar el plugin.';
    }
  };

  pluginSelect.addEventListener('change', () => {
    const next = effectPlugins.find(plugin => plugin.id === pluginSelect.value);
    if (!next) return;
    void applyPlugin(next);
  });
}

function bindRange(
  id: string,
  format: (value: number) => string,
  onChange: (value: number) => void
): void {
  const input = q<HTMLInputElement>(id);
  const output = q<HTMLOutputElement>(`${id}-value`);
  const update = (): void => {
    const value = Number(input.value);
    output.textContent = format(value);
    onChange(value);
  };
  input.addEventListener('input', update);
  update();
}

function tickMeter(): void {
  const db = engine.getMasterLevel();
  const level = Number.isFinite(db) ? Math.max(0, Math.min(1, (db + 60) / 60)) : 0;
  masterFill.style.setProperty('--level', level.toFixed(3));
  masterLevel.textContent = Number.isFinite(db) ? `${db.toFixed(1)} dB` : '-∞ dB';
  requestAnimationFrame(tickMeter);
}

requestAnimationFrame(tickMeter);

window.addEventListener('beforeunload', () => {
  clock.dispose();
  engine.dispose();
});
