import { spawn } from 'node:child_process';
import { chromium } from 'playwright';

const port = 4180 + Math.floor(Math.random() * 100);
const url = `http://127.0.0.1:${port}/offline-test.html`;

const server = spawn(
  process.execPath,
  ['node_modules/vite/bin/vite.js', '--host', '127.0.0.1', '--port', String(port)],
  { stdio: ['ignore', 'pipe', 'pipe'] }
);

let browser;

try {
  await waitForServer(url, 30_000);

  browser = await chromium.launch({
    headless: true,
    executablePath: process.env.CHROMIUM_PATH,
    args: ['--autoplay-policy=no-user-gesture-required']
  });

  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => {
    if (message.type() === 'error') errors.push(message.text());
  });

  await page.goto(url, { waitUntil: 'networkidle' });
  await page.waitForSelector('#result[data-done="true"], #result[data-done="error"]', {
    timeout: 180_000
  });

  const result = await page.$eval('#result', element => ({
    done: element.getAttribute('data-done'),
    text: element.textContent ?? ''
  }));

  if (result.done === 'error') throw new Error(result.text);

  const metrics = JSON.parse(result.text);
  if (!Array.isArray(metrics) || metrics.length === 0) {
    throw new Error('El audio check no devolvió métricas.');
  }

  const expected = [
    'modular-initial',
    'modular-automation',
    'modular-ambient',
    'modular-max',
    'modular-solo-mute',
    'modular-scene-change',
    'modular-stress'
  ];
  for (const name of expected) {
    if (!metrics.some(metric => metric.name === name)) {
      throw new Error(`Falta el escenario ${name}.`);
    }
  }

  for (const metric of metrics) {
    if (metric.nan) throw new Error(`${metric.name}: NaN/Infinity en el render.`);
    if (metric.silent) throw new Error(`${metric.name}: el render es silencio.`);
    if (metric.peakDb > -1) {
      throw new Error(`${metric.name}: peak ${metric.peakDb.toFixed(2)} dBFS > -1 dBFS.`);
    }
    if (metric.dc >= 0.001) {
      throw new Error(`${metric.name}: DC offset ${metric.dc.toFixed(5)} >= 0.001.`);
    }
  }

  if (errors.length > 0) throw new Error(`Errores de consola:\n${errors.join('\n')}`);

  console.log(
    'Render baseline (ms): ' +
      metrics.map(metric => `${metric.name} ${metric.renderMs.toFixed(0)}`).join(' · ')
  );

  console.log(JSON.stringify(metrics, null, 2));
  console.log('Audio check OK');
} catch (error) {
  console.error(error);
  process.exitCode = 1;
} finally {
  await browser?.close();
  server.kill('SIGTERM');
}

async function waitForServer(target, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(target);
      if (response.ok) return;
    } catch {
      // Vite todavía no está listo.
    }
    await new Promise(resolve => setTimeout(resolve, 250));
  }
  throw new Error(`Vite no respondió en ${timeoutMs} ms.`);
}
