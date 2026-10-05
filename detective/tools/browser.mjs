// Невидимый Chrome без звука для проверки игры (порт отладки 9333, свой профиль).
// import { open } from './browser.mjs'; const p = await open(url, {w,h,mobile}); await p.eval('1+1'); await p.shot('a.png'); p.errors; await p.close()
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = +(process.env.CDP_PORT || 9333);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function ensureChrome() {
  try { await fetch(`http://127.0.0.1:${PORT}/json/version`); return; } catch { }
  const prof = path.join(os.tmpdir(), 'archiv-chrome-' + PORT);
  fs.rmSync(prof, { recursive: true, force: true });
  spawn(CHROME, ['--headless=new', '--mute-audio', `--remote-debugging-port=${PORT}`, `--user-data-dir=${prof}`, '--window-size=1440,900',
    '--autoplay-policy=no-user-gesture-required', '--disable-features=Translate', 'about:blank'], { detached: true, stdio: 'ignore' }).unref();
  for (let i = 0; i < 50; i++) { await sleep(200); try { await fetch(`http://127.0.0.1:${PORT}/json/version`); return; } catch { } }
  throw new Error('Chrome не поднялся');
}

export async function open(url, { w = 1440, h = 900, mobile = false } = {}) {
  await ensureChrome();
  const t = await (await fetch(`http://127.0.0.1:${PORT}/json/new?about:blank`, { method: 'PUT' })).json();
  const ws = new WebSocket(t.webSocketDebuggerUrl);
  await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
  let id = 0; const pend = {}; const errors = []; const logs = [];
  ws.onmessage = (m) => {
    const d = JSON.parse(m.data);
    if (d.id && pend[d.id]) { pend[d.id](d); delete pend[d.id]; }
    if (d.method === 'Runtime.exceptionThrown') errors.push(d.params.exceptionDetails.exception?.description || d.params.exceptionDetails.text);
    if (d.method === 'Runtime.consoleAPICalled') {
      const s = d.params.args.map((a) => a.value ?? a.description ?? '').join(' ');
      (d.params.type === 'error' ? errors : logs).push(s);
    }
    if (d.method === 'Log.entryAdded' && d.params.entry.level === 'error') errors.push(d.params.entry.text + ' ' + (d.params.entry.url || ''));
  };
  const send = (method, params = {}) => new Promise((r) => { const i = ++id; pend[i] = r; ws.send(JSON.stringify({ id: i, method, params })); });
  await send('Runtime.enable'); await send('Page.enable'); await send('Log.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile });
  if (mobile) await send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
  const p = {
    errors, logs, send,
    async go(u) { await send('Page.navigate', { url: u }); await sleep(1500); },
    async eval(expr) {
      const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
      if (r.result?.exceptionDetails) throw new Error('eval: ' + (r.result.exceptionDetails.exception?.description || r.result.exceptionDetails.text));
      return r.result?.result?.value;
    },
    async shot(file) { const r = await send('Page.captureScreenshot', { format: 'png' }); fs.writeFileSync(file, Buffer.from(r.result.data, 'base64')); },
    async click(x, y) {
      for (const type of ['mouseMoved', 'mousePressed', 'mouseReleased']) await send('Input.dispatchMouseEvent', { type, x, y, button: 'left', clickCount: 1 });
    },
    async close() { try { await fetch(`http://127.0.0.1:${PORT}/json/close/${t.id}`); } catch { } ws.close(); },
    sleep,
  };
  await p.go(url);
  return p;
}
