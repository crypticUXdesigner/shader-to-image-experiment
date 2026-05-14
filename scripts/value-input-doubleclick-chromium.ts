/**
 * Chromium smoke: ValueInput strict tap-then-down opens edit mode and the `<input>` stays
 * focused so typing works (regression guard for the consume-branch `pointerdown` fix).
 *
 * Serves `storybook-static/` over HTTP (Storybook must be built first).
 *
 * **Stale bundle:** this reads the last `npm run build-storybook` output. `npm run verify:pages`
 * runs `build-storybook` immediately before this script. If you run this alone after changing
 * ValueInput, run `npm run build-storybook` first.
 *
 * Usage: `npm run test:value-input-chromium`
 */

import { spawnSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as http from 'node:http';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..');
const STORYBOOK_STATIC = path.join(REPO_ROOT, 'storybook-static');
const IFRAME_HTML = path.join(STORYBOOK_STATIC, 'iframe.html');
const STORY_ID = 'shadernoice-ui-input-valueinput--default';

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.woff2': 'font/woff2',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
};

function ensureStorybookBuilt(): void {
  if (fs.existsSync(IFRAME_HTML)) return;
  console.log('storybook-static missing; running npm run build-storybook …');
  const r = spawnSync('npm', ['run', 'build-storybook'], {
    cwd: REPO_ROOT,
    stdio: 'inherit',
    shell: true,
  });
  if (r.status !== 0 || !fs.existsSync(IFRAME_HTML)) {
    throw new Error('build-storybook failed or iframe.html still missing');
  }
}

function startStaticServer(root: string): Promise<{ port: number; close: () => Promise<void> }> {
  const rootNorm = path.resolve(root);
  const server = http.createServer((req, res) => {
    try {
      const u = new URL(req.url ?? '/', 'http://127.0.0.1');
      let pathname = decodeURIComponent(u.pathname);
      if (pathname === '/') pathname = '/index.html';
      const candidate = path.normalize(path.join(rootNorm, pathname));
      if (!candidate.startsWith(rootNorm)) {
        res.writeHead(403).end();
        return;
      }
      if (!fs.existsSync(candidate) || fs.statSync(candidate).isDirectory()) {
        res.writeHead(404).end();
        return;
      }
      const ext = path.extname(candidate).toLowerCase();
      res.writeHead(200, { 'Content-Type': MIME[ext] ?? 'application/octet-stream' });
      fs.createReadStream(candidate).pipe(res);
    } catch {
      res.writeHead(500).end();
    }
  });

  return new Promise((resolve, reject) => {
    server.listen(0, '127.0.0.1', () => {
      const addr = server.address();
      const port = typeof addr === 'object' && addr && 'port' in addr ? addr.port : 0;
      if (!port) {
        server.close();
        reject(new Error('static server: no port'));
        return;
      }
      resolve({
        port,
        close: () =>
          new Promise<void>((res, rej) => {
            server.close((err) => (err ? rej(err) : res()));
          }),
      });
    });
    server.on('error', reject);
  });
}

function waitForUrl(url: string, attempts = 100, delayMs = 300): Promise<void> {
  return new Promise((resolve, reject) => {
    let n = 0;
    const tryOnce = (): void => {
      n++;
      const req = http.get(url, (res) => {
        if (res.statusCode !== undefined && res.statusCode < 500) {
          res.resume();
          resolve();
          return;
        }
        if (n >= attempts) reject(new Error(`URL not ready: ${url}`));
        else setTimeout(tryOnce, delayMs);
      });
      req.on('error', () => {
        if (n >= attempts) reject(new Error(`URL not ready: ${url}`));
        else setTimeout(tryOnce, delayMs);
      });
    };
    tryOnce();
  });
}

async function main(): Promise<void> {
  ensureStorybookBuilt();
  const { port, close } = await startStaticServer(STORYBOOK_STATIC);
  const storyUrl = `http://127.0.0.1:${port}/iframe.html?id=${encodeURIComponent(STORY_ID)}&viewMode=story`;

  const { chromium } = await import('playwright');
  const browser = await chromium.launch({ headless: true });
  try {
    await waitForUrl(`http://127.0.0.1:${port}/iframe.html`);
    const page = await browser.newPage();
    page.on('pageerror', (err) => {
      console.error('[browser:pageerror]', err.stack ?? err.message);
    });

    await page.goto(storyUrl, { waitUntil: 'networkidle', timeout: 120_000 });

    const readout = page.getByRole('textbox', { name: /Value:/ });
    await readout.waitFor({ state: 'visible', timeout: 60_000 });

    // Strict tap-then-down: two activations within the util window (not native dblclick).
    await readout.click();
    await new Promise((r) => setTimeout(r, 40));
    await readout.click();

    const editor = page.locator('input[aria-label="Edit value"]');
    await editor.waitFor({ state: 'visible', timeout: 10_000 });

    const inputFocused = await editor.evaluate((el) => el === document.activeElement);
    if (!inputFocused) {
      const ae = await page.evaluate(() =>
        document.activeElement instanceof HTMLElement
          ? document.activeElement.tagName + (document.activeElement.getAttribute('aria-label') ?? '')
          : String(document.activeElement)
      );
      throw new Error(
        `Expected edit <input> to stay focused after strict double activation; activeElement=${ae}`
      );
    }

    await editor.fill('');
    await page.keyboard.type('0.42');
    const v = await editor.inputValue();
    if (!v.includes('0.42')) {
      throw new Error(`Expected typed text in input; got "${v}"`);
    }
    console.log('value-input-doubleclick-chromium: OK');
  } finally {
    await browser.close();
    await close();
  }
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
