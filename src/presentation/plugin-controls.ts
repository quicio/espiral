import {
  denormalizePluginParam,
  normalizePluginParam,
  type PluginDefinition,
  type PluginParam,
  type PluginState
} from '../domain/plugin';

export function renderPluginControls(
  container: HTMLElement,
  definition: PluginDefinition,
  state: PluginState,
  onChange: (paramId: string, value: number) => void
): void {
  container.replaceChildren();
  const list = document.createElement('div');
  list.className = 'plugin-params';

  definition.params.forEach(param => {
    const value = state[param.id] ?? param.defaultValue;
    const label = document.createElement('label');
    label.className = 'plugin-param';

    const name = document.createElement('span');
    name.textContent = param.label;

    const input = document.createElement('input');
    input.type = 'range';
    input.min = '0';
    input.max = '1';
    input.step = '0.001';
    input.value = String(normalizePluginParam(param, value));
    input.dataset.pluginParam = param.id;

    const output = document.createElement('output');
    output.textContent = formatPluginParam(param, value);

    input.addEventListener('input', () => {
      const next = denormalizePluginParam(param, Number(input.value));
      output.textContent = formatPluginParam(param, next);
      onChange(param.id, next);
    });

    label.append(name, input, output);
    list.append(label);
  });

  container.append(list);
}

export function formatPluginParam(param: PluginParam, value: number): string {
  switch (param.unit) {
    case 'db':
      return `${value.toFixed(1)} dB`;
    case 'hz':
      return value >= 1000 ? `${(value / 1000).toFixed(1)} kHz` : `${Math.round(value)} Hz`;
    case 'ms':
      return `${value.toFixed(1)} ms`;
    case 's':
      return value < 1 ? `${Math.round(value * 1000)} ms` : `${value.toFixed(2)} s`;
    case '%':
      return `${Math.round(value * 100)}%`;
    case 'q':
      return value.toFixed(2);
    case 'ratio':
      return `${value.toFixed(1)}:1`;
    default:
      return value.toFixed(2);
  }
}
