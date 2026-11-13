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
  await page.waitForFunction(
    () => document.querySelectorAll('[data-arm-preset]').length > 0,
    undefined,
    { timeout: 6000 }
  );
  const armPresets = await page.locator('[data-arm-preset]').count();
  if (armPresets !== 8) {
    throw new Error(`Se esperaban 8 presets de armado, hay ${armPresets}.`);
  }
  const padDefault = await page
    .locator('[data-arm-element="pad"]')
    .getAttribute('aria-pressed');
  if (padDefault !== 'false') {
    throw new Error('El pad debería arrancar desmarcado en el armado por defecto.');
  }
  await page.locator('#arm-bpm').fill('130');
  await page.locator('#arm-bpm').blur();
  await page.locator('[data-arm-kit="dub-kit"]').click();
  await page.locator('#arm-build').click();
  await page.waitForFunction(
    () => document.querySelector('#arm-wizard')?.hasAttribute('hidden') === true,
    undefined,
    { timeout: 12_000 }
  );

  const armedBpm = (await page.locator('#bpm-value').textContent())?.trim();
  if (armedBpm !== '130') {
    throw new Error(`El wizard no aplicó BPM 130: ${armedBpm}.`);
  }
  const padMuted = await page
    .locator('[data-mute="pad"]')
    .getAttribute('aria-pressed');
  if (padMuted !== 'true') {
    throw new Error(`El pad debería quedar muteado por defecto: ${padMuted}.`);
  }

  const trackRows = await page.locator('#activity-list .activity-row').count();
  if (trackRows !== 16) throw new Error(`Se esperaban 16 tracks, hay ${trackRows}.`);
  const drumNames = await page
    .locator('#activity-list .activity-name')
    .evaluateAll(elements => elements.slice(0, 8).map(el => el.textContent?.trim()));
  const expectedDrums = [
    'Kick',
    'Shaker',
    'Snare',
    'Hat Closed',
    'Hat Open',
    'Perc',
    'Clap',
    'Tom'
  ];
  if (JSON.stringify(drumNames) !== JSON.stringify(expectedDrums)) {
    throw new Error(`Orden de drums inesperado: ${drumNames.join(', ')}.`);
  }

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
    '#tab-arrangement',
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

  await page.locator('#session-add-scene').click();
  await page.waitForTimeout(150);
  const rowsAfterAdd = await page.locator('.session-row').count();
  const dynamicClip = await page
    .locator('[data-clip-launch="clip-escena-5-kick"]')
    .count();
  const arrangementHasDynamic = await page
    .locator('#arrangement-scene option[value="escena-5"]')
    .count();
  if (rowsAfterAdd !== 6 || dynamicClip !== 1 || arrangementHasDynamic !== 1) {
    throw new Error(
      `Escena dinámica incompleta: ${rowsAfterAdd} filas, ${dynamicClip} clips, ${arrangementHasDynamic} opciones.`
    );
  }
  await page.setViewportSize({ width: 1440, height: 1400 });
  await page.locator('[data-clip-launch="clip-umbral-kick"]').click();
  await page.waitForTimeout(120);
  const dragSource = page.locator('[data-clip-launch="clip-umbral-kick"]');
  const dragTarget = page.locator('[data-clip-launch="clip-escena-5-kick"]');
  const sourceBox = await dragSource.boundingBox();
  const targetBox = await dragTarget.boundingBox();
  if (!sourceBox || !targetBox) throw new Error('No se pudo medir el drag/drop.');
  await page.mouse.move(
    sourceBox.x + sourceBox.width / 2,
    sourceBox.y + sourceBox.height / 2
  );
  await page.mouse.down();
  await page.mouse.move(
    targetBox.x + targetBox.width / 2,
    targetBox.y + targetBox.height / 2,
    { steps: 20 }
  );
  await page.mouse.up();
  await page.waitForTimeout(250);
  const movedActive = await page
    .locator('[data-clip-launch="clip-escena-5-kick"]')
    .getAttribute('aria-pressed');
  if (movedActive !== 'true') {
    throw new Error(`El drag/drop no conservó el clip activo: ${movedActive}.`);
  }
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.locator('[data-scene-delete="escena-5"]').click();
  await page.waitForTimeout(150);
  const rowsAfterDelete = await page.locator('.session-row').count();
  if (rowsAfterDelete !== 5) {
    throw new Error(`Eliminar escena dejó ${rowsAfterDelete} filas.`);
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

  await page.locator('#tab-arrangement').click();
  const arrangementBlocks = await page.locator('.arrangement-block').count();
  await page.locator('#arrangement-toggle').click();
  await page.waitForTimeout(150);
  const arrangementReadout = (await page.locator('#arrangement-readout').textContent())?.trim();
  await page.locator('#arrangement-toggle').click();
  if (arrangementBlocks !== 4 || !arrangementReadout?.includes('Bloque')) {
    throw new Error(
      `Arrangement inesperado: ${arrangementBlocks} bloques, readout=${arrangementReadout}.`
    );
  }

  await page.locator('#tab-sound').click();
  const mixerRows = await page.locator('.mixer-row').count();
  const bankDrawerOpen = await page
    .locator('#sound-bank-drawer')
    .evaluate(el => el.hasAttribute('open'));
  if (mixerRows !== 16 || bankDrawerOpen) {
    throw new Error(
      `Sound compacto inesperado: ${mixerRows} filas, drawer abierto=${bankDrawerOpen}.`
    );
  }
  await page.locator('[data-sound-select="bass"]').click();
  await page.waitForTimeout(150);
  const detailTrack = (await page.locator('.sound-detail-title').inputValue())?.trim();
  if (detailTrack !== 'Bass') {
    throw new Error(`El detalle de Sound no siguió la selección: ${detailTrack}.`);
  }
  await page.locator('#sound-bank-drawer summary').click();
  await page.waitForTimeout(150);
  const bankCards = await page.locator('[data-sound-preset]').count();
  if (bankCards === 0) throw new Error('El banco de sonidos no tiene presets.');
  await page.locator('#sound-bank-target').selectOption('track-08');
  await page.waitForTimeout(200);
  await page.locator('#sound-bank-search').fill('acid');
  await page.waitForTimeout(120);
  const filteredSounds = await page.locator('.sound-bank-card:visible').count();
  await page.locator('#sound-bank-search').fill('');
  if (filteredSounds !== 1) {
    throw new Error(`La búsqueda de sonidos devolvió ${filteredSounds} tarjetas.`);
  }
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
  const recentSounds = await page
    .locator('section[data-sound-category="recent"] [data-sound-preset]')
    .count();
  if (recentSounds !== 1) {
    throw new Error(`Recientes no registró Warm Pad: ${recentSounds}.`);
  }
  await page.locator('[data-sound-favorite="warm-pad"]').first().click();
  await page.waitForTimeout(150);
  const favoriteOn = await page
    .locator('[data-sound-favorite="warm-pad"]')
    .first()
    .getAttribute('aria-pressed');
  const favoriteSection = await page
    .locator('section[data-sound-category="favorites"]')
    .count();
  if (favoriteOn !== 'true' || favoriteSection !== 1) {
    throw new Error(
      `Favoritos no se actualizó: pressed=${favoriteOn}, sección=${favoriteSection}.`
    );
  }

  await page.locator('#mix-preset').selectOption('dub');
  await page.waitForTimeout(700);
  const bpm = (await page.locator('#bpm-value').textContent())?.trim();
  if (bpm !== '126') throw new Error(`El preset Dub no aplicó BPM 126: ${bpm}.`);

  await page.locator('#mix-preset').selectOption('triphop');
  await page.waitForTimeout(700);
  const tripHopBpm = (await page.locator('#bpm-value').textContent())?.trim();
  if (tripHopBpm !== '86') {
    throw new Error(`El preset Trip-Hop no aplicó BPM 86: ${tripHopBpm}.`);
  }

  const failedSamples = samples.filter(sample => sample.status !== 200);
  if (samples.length === 0) throw new Error('No se solicitó ningún sample.');
  if (failedSamples.length > 0) {
    throw new Error(`Samples con error: ${failedSamples.map(sample => sample.url).join(', ')}`);
  }

  await page.locator('#performance-mode').click();
  const performanceHeader = await page
    .locator('.espiral-header')
    .evaluate(el => getComputedStyle(el).display);
  await page.locator('#performance-mode').click();
  if (performanceHeader !== 'none') {
    throw new Error('Performance mode no ocultó el header.');
  }

  if (errors.length > 0) throw new Error(`Errores de consola:\n${errors.join('\n')}`);

  console.log(
    JSON.stringify(
      {
        tracks: trackRows,
        drumNames,
        pulse,
        playing,
        stopped,
        bpm,
        tripHopBpm,
        armedBpm,
        armPresets,
        padDefault,
        padMuted,
        bankCards,
        bankMachine,
        clipRows,
        clipCells,
        keyboardCol,
        keyboardQueue,
        keyboardCancel,
        mixerRows,
        bankDrawerOpen,
        arrangementBlocks,
        filteredSounds,
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
