import { spawn } from 'node:child_process';
import { chromium } from 'playwright';

const port = 4900 + Math.floor(Math.random() * 100);
const url = `http://127.0.0.1:${port}/acid303-bench.html`;
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
    timeout: 120_000
  });
  const result = await page.$eval('#result', element => ({
    done: element.getAttribute('data-done'),
    text: element.textContent ?? ''
  }));
  if (result.done === 'error') throw new Error(result.text);
  if (errors.length > 0) throw new Error(errors.join('\n'));
  console.log(result.text);
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
