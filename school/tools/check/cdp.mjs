// Проверки «Школы Умки» в невидимом Chrome БЕЗ ЗВУКА (--mute-audio: звук выключен в самом браузере).
// node school/tools/check/cdp.mjs <скрипт.js> [ширина высота мобильный]
// Переменные: CDP_PORT (по умолчанию 9333; для параллельных прогонов — разные), BREAK_LS=1 — браузер
// без хранилища, BLOCK_API=1 — сервер «спит» (запросы /school/api блокируются, снять: __unblock()).
// В скрипте доступны go(url), js(выражение), shot(файл), sleep(мс), globalThis.__fs, globalThis.__env.
// Сервер для проверок: PORT=8890 node hub/server.js (JS отдаётся без кэша — всегда свежая версия).
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
globalThis.__fs = fs;
globalThis.__env = process.env;
const OUT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..', 'school-art', 'check');
fs.mkdirSync(OUT, { recursive: true });
globalThis.__out = OUT;
const PORT = process.env.CDP_PORT || '9333';
const [,, scriptFile, W = '1180', H = '820', mobile = '0'] = process.argv;
const prof = path.join(OUT, `prof-${PORT}-${Date.now()}`);
const ch = spawn('C:/Program Files/Google/Chrome/Application/chrome.exe', ['--headless=new', '--mute-audio', '--autoplay-policy=no-user-gesture-required',
  '--disable-gpu', `--remote-debugging-port=${PORT}`, `--user-data-dir=${prof}`, 'about:blank'], { stdio: 'ignore' });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let list;
for (let i = 0; i < 60; i++) { try { list = await (await fetch(`http://127.0.0.1:${PORT}/json`)).json(); if (list.length) break; } catch {} await sleep(250); }
const page = list.find((p) => p.type === 'page');
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((r) => (ws.onopen = r));
let id = 0; const pend = {};
ws.onmessage = (m) => { const d = JSON.parse(m.data); if (d.id && pend[d.id]) { pend[d.id](d); delete pend[d.id]; } };
const send = (method, params = {}) => new Promise((r) => { const i = ++id; pend[i] = r; ws.send(JSON.stringify({ id: i, method, params })); });
await send('Runtime.enable'); await send('Page.enable');
await send('Page.addScriptToEvaluateOnNewDocument', { source: 'window.__sayLog = []; window.__errs = []; addEventListener("error", (e) => window.__errs.push(String(e.message))); addEventListener("unhandledrejection", (e) => window.__errs.push(String(e.reason)));' });
if (process.env.BREAK_LS) await send('Page.addScriptToEvaluateOnNewDocument', { source: 'Object.defineProperty(window, "localStorage", { get() { throw new DOMException("denied", "SecurityError"); } });' });
if (process.env.BLOCK_API) { await send('Network.enable'); await send('Network.setBlockedURLs', { urls: ['*/school/api/*'] }); }
globalThis.__unblock = () => send('Network.setBlockedURLs', { urls: [] });
await send('Emulation.setDeviceMetricsOverride', { width: +W, height: +H, deviceScaleFactor: 1, mobile: mobile === '1' });
const go = async (url) => { await send('Page.navigate', { url }); await sleep(1500); };
const js = async (expr) => { const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true, timeout: 3600000 }); if (r.result?.exceptionDetails) return 'EXC ' + JSON.stringify(r.result.exceptionDetails).slice(0, 400); return r.result?.result?.value; };
const shot = async (file) => { const r = await send('Page.captureScreenshot', { format: 'png' }); fs.writeFileSync(path.join(OUT, file), Buffer.from(r.result.data, 'base64')); };
try {
  const body = fs.readFileSync(scriptFile, 'utf8');
  await (new Function('go', 'js', 'shot', 'sleep', `return (async () => { ${body} })()`))(go, js, shot, sleep);
} catch (e) { console.log('ERR', e.message); }
ws.close(); ch.kill();
setTimeout(() => { try { fs.rmSync(prof, { recursive: true, force: true }); } catch {} process.exit(0); }, 800);
