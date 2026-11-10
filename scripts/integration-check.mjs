import { spawn } from 'node:child_process';
import { chromium } from 'playwright';

const port = 4300 + Math.floor(Math.random() * 100);
const url = `http://127.0.0.1:${port}/`;

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
  const samples = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => {
    if (message.type() === 'error') errors.push(message.text());
  });
  page.on('response', response => {
    if (response.url().endsWith('.wav')) {
      samples.push({ url: response.url(), status: response.status() });
    }
  });

  await page.goto(url, { waitUntil: 'networkidle' });
  await page.waitForSelector('#transport-play');

  const trackRows = await page.locator('#activity-list .activity-row').count();
  if (trackRows !== 16) throw new Error(`Se esperaban 16 tracks, hay ${trackRows}.`);

  await page.locator('#transport-play').click();
  await page
    .waitForFunction(
      () => (document.querySelector('#pulse-step')?.textContent ?? '').trim() !== '00',
      undefined,
      { timeout: 6000 }
    )
    .catch(() => undefined);
  await page.waitForTimeout(300);

  const pulse = (await page.locator('#pulse-step').textContent())?.trim();
  const playing = (await page.locator('#instrument-status').textContent())?.trim();
  const clip = await page.locator('#master-clip').getAttribute('aria-pressed');
  if (playing !== 'Reproduciendo') throw new Error(`Estado inesperado al reproducir: ${playing}.`);
  if (pulse === '00' || !pulse) throw new Error('El pulso no avanzó.');
  if (clip === 'true') throw new Error('El master activó el clip latch.');

  await page.locator('#transport-play').click();
  await page.waitForTimeout(300);
  const stopped = (await page.locator('#instrument-status').textContent())?.trim();
  const stoppedPulse = (await page.locator('#pulse-step').textContent())?.trim();
  if (stopped !== 'Detenido') throw new Error(`Estado inesperado al detener: ${stopped}.`);
  if (stoppedPulse !== '00') throw new Error(`El pulso no se reinició: ${stoppedPulse}.`);

  for (const tab of [
    '#tab-session',
    '#tab-sequencer',
    '#tab-sound',
    '#tab-routing',
    '#tab-modulation',
    '#tab-performance'
  ]) {
    await page.locator(tab).click();
    await page.waitForTimeout(80);
  }

  await page.locator('#tab-session').click();
  const clipRows = await page.locator('.session-row').count();
  const clipCells = await page.locator('[data-clip-launch]').count();
  if (clipRows !== 5 || clipCells === 0) {
    throw new Error(`Clip grid incompleto: ${clipRows} filas, ${clipCells} clips.`);
  }
  await page.locator('[data-scene-launch="deriva"]').click();
  await page.waitForTimeout(300);
  const activeClips = await page
    .locator('.session-clip.is-active, .session-clip.is-armed')
    .count();
  const sessionReadout = (await page.locator('#session-readout').textContent())?.trim();
  if (activeClips === 0 || !sessionReadout?.includes('Deriva')) {
    throw new Error(`La escena Deriva no lanzó clips: ${activeClips}, ${sessionReadout}.`);
  }
  await page.locator('#clip-stop-all').click();
  await page.waitForTimeout(300);
  const activeAfterStop = await page
    .locator('.session-clip.is-active, .session-clip.is-armed')
    .count();
  if (activeAfterStop !== 0) {
    throw new Error(`Stop all dejó ${activeAfterStop} clips activos.`);
  }

  await page.locator('#tab-session').focus();
  await page.keyboard.press('Space');
  await page.waitForFunction(
    () =>
      (document.querySelector('#instrument-status')?.textContent ?? '').trim() ===
      'Reproduciendo',
    undefined,
    { timeout: 6000 }
  );
  await page.locator('[data-clip-launch="clip-umbral-kick"]').focus();
  await page.keyboard.press('ArrowRight');
  const keyboardCol = await page.evaluate(() =>
    document.activeElement?.getAttribute('data-session-col')
  );
  await page.keyboard.press('Enter');
  await page.waitForTimeout(150);
  const keyboardQueue = await page.locator('.session-clip.is-queued').count();
  await page.keyboard.press('Escape');
  await page.waitForTimeout(100);
  const keyboardCancel = await page.locator('.session-clip.is-queued').count();
  await page.keyboard.press('Space');
  await page.waitForTimeout(250);
  const keyboardStopped = (
    await page.locator('#instrument-status').textContent()
  )?.trim();
  if (
    keyboardCol !== '1' ||
    keyboardQueue === 0 ||
    keyboardCancel !== 0 ||
    keyboardStopped !== 'Detenido'
  ) {
    throw new Error(
      `Teclado de Session falló: col=${keyboardCol}, queue=${keyboardQueue}, cancel=${keyboardCancel}, stop=${keyboardStopped}.`
    );
  }

  await page.locator('#tab-sound').click();
  const bankCards = await page.locator('[data-sound-preset]').count();
  if (bankCards === 0) throw new Error('El banco de sonidos no tiene presets.');
  await page.locator('#sound-bank-target').selectOption('track-08');
  await page.waitForTimeout(200);
  await page.locator('[data-sound-preset="warm-pad"]').click();
  await page.waitForTimeout(400);
  const bankStatus = (await page.locator('#sound-bank-status').textContent())?.trim();
  const bankMachine = await page.locator('[data-machine="track-08"]').inputValue();
  if (!bankStatus?.includes('Warm Pad')) {
    throw new Error(`El banco no confirmó Warm Pad: ${bankStatus}.`);
  }
  if (bankMachine !== 'analog-pad') {
    throw new Error(`El banco no aplicó Analog Pad: ${bankMachine}.`);
  }

  await page.locator('#mix-preset').selectOption('dub');
  await page.waitForTimeout(700);
  const bpm = (await page.locator('#bpm-value').textContent())?.trim();
  if (bpm !== '126') throw new Error(`El preset Dub no aplicó BPM 126: ${bpm}.`);

  const failedSamples = samples.filter(sample => sample.status !== 200);
  if (samples.length === 0) throw new Error('No se solicitó ningún sample.');
  if (failedSamples.length > 0) {
    throw new Error(`Samples con error: ${failedSamples.map(sample => sample.url).join(', ')}`);
  }

  if (errors.length > 0) throw new Error(`Errores de consola:\n${errors.join('\n')}`);

  console.log(
    JSON.stringify(
      {
        tracks: trackRows,
        pulse,
        playing,
        stopped,
        bpm,
        bankCards,
        bankMachine,
        clipRows,
        clipCells,
        keyboardCol,
        keyboardQueue,
        keyboardCancel,
        samples: samples.length,
        clip
      },
      null,
      2
    )
  );
} finally {
  await browser?.close();
  server.kill('SIGTERM');
}

async function waitForServer(target, timeoutMs) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    try {
      const response = await fetch(target);
      if (response.ok) return;
    } catch {
      // Vite todavía no está escuchando.
    }
    await new Promise(resolve => setTimeout(resolve, 200));
  }
  throw new Error(`Vite no inició en ${timeoutMs} ms.`);
}
