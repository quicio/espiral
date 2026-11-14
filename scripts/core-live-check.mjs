import { spawn } from 'node:child_process';
import { statSync } from 'node:fs';
import { chromium } from 'playwright';

const port = 4780 + Math.floor(Math.random() * 100);
const url = `http://127.0.0.1:${port}/?engine=core`;

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

  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => {
    if (message.type() === 'error') errors.push(message.text());
  });

  await page.goto(url, { waitUntil: 'networkidle' });
  await page.waitForFunction(
    () => document.querySelectorAll('[data-arm-preset]').length > 0,
    undefined,
    { timeout: 8_000 }
  );

  const arm = page.locator('#arm-build');
  if ((await arm.count()) > 0) {
    await arm.click();
    await page.waitForTimeout(500);
  }

  await page.locator('#tab-sound').click();
  await page.waitForTimeout(300);
  await page.locator('#sound-bank-drawer summary').click().catch(() => {});
  const preview = page.locator('[data-sound-preview]').first();
  if ((await preview.count()) === 0) {
    throw new Error('No hay previews en el banco de sonidos.');
  }
  await preview.click();
  let previewLevel = 0;
  for (let index = 0; index < 30; index += 1) {
    await page.waitForTimeout(50);
    previewLevel = Math.max(
      previewLevel,
      await page.evaluate(() =>
        Number(
          document
            .querySelector('#master-meter-fill')
            ?.style.getPropertyValue('--level') ?? 0
        )
      )
    );
  }
  if (!(previewLevel > 0.01)) {
    throw new Error(`El preview del banco quedó en silencio: ${previewLevel}.`);
  }
  await page.locator('#tab-performance').click();
  await page.waitForTimeout(300);

  await page.locator('#transport-play').click();
  await page.waitForFunction(
    () => (document.querySelector('#instrument-status')?.textContent ?? '').includes('Reproduciendo'),
    undefined,
    { timeout: 20_000 }
  );
  await page.waitForFunction(
    () => {
      const level = Number(
        document
          .querySelector('#master-meter-fill')
          ?.style.getPropertyValue('--level') ?? 0
      );
      return level > 0.01;
    },
    undefined,
    { timeout: 10_000 }
  );

  const engine = await page.evaluate(() => window.__espiralEngine);
  if (engine !== 'core') {
    throw new Error(`Se esperaba el AudioCore, se cargó: ${engine}.`);
  }

  await page.locator('#tab-session').click();
  await page.locator('[data-scene-launch="deriva"]').click();
  await page.waitForTimeout(1_500);

  const status = (await page.locator('#instrument-status').textContent())?.trim();
  if (status !== 'Reproduciendo') {
    throw new Error(`El transporte se detuvo al cambiar de escena: ${status}.`);
  }

  const level = await page.evaluate(() =>
    Number(
      document
        .querySelector('#master-meter-fill')
        ?.style.getPropertyValue('--level') ?? 0
    )
  );
  if (!(level > 0.01)) {
    throw new Error(`El master quedó en silencio: ${level}.`);
  }

  await page.locator('#tab-sound').click();
  let trackLevel = 0;
  for (let index = 0; index < 30 && trackLevel <= 0.01; index += 1) {
    await page.waitForTimeout(100);
    trackLevel = await page.evaluate(() =>
      Math.max(
        0,
        ...[...document.querySelectorAll('[data-track-meter-fill]')].map(element =>
          Number(element.style.getPropertyValue('--level') ?? 0)
        )
      )
    );
  }
  if (!(trackLevel > 0.01)) {
    throw new Error(`Los medidores por track quedaron en silencio: ${trackLevel}.`);
  }

  await page.locator('#tab-session').click();
  await page.waitForTimeout(200);
  const downloadPromise = page.waitForEvent('download', { timeout: 60_000 });
  await page.locator('#export-audio').click();
  const download = await downloadPromise;
  const path = await download.path();
  const exportBytes = path ? statSync(path).size : 0;
  if (exportBytes < 100_000) {
    throw new Error(`El export WAV quedó vacío: ${exportBytes} bytes.`);
  }

  if (errors.length > 0) {
    throw new Error(`Errores de consola:\n${errors.join('\n')}`);
  }

  console.log(
    `AudioCore live OK · preview ${previewLevel.toFixed(3)} · master ${level.toFixed(3)} · track ${trackLevel.toFixed(3)} · export ${Math.round(exportBytes / 1024)} kB · escena Deriva`
  );
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
