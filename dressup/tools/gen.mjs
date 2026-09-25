// Очередь картинок для ChatGPT (приложение на рабочем столе, порт отладки 9222).
// node gen.mjs jobs.json outDir — по очереди: (новый чат) → (приложить файл) → запрос → ждать картинку → сохранить outDir/<name>.png.
// Уже сохранённые пропускаются, поэтому очередь можно перезапускать.
import fs from 'node:fs';
import path from 'node:path';

const [,, jobsFile, outDir] = process.argv;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (...a) => { const s = new Date().toTimeString().slice(0, 8) + ' ' + a.join(' '); console.log(s); fs.appendFileSync(path.join(outDir, 'gen.log'), s + '\n'); };

let ws, id = 0;
const pend = {};
async function connect() {
  const list = await (await fetch('http://127.0.0.1:9222/json')).json();
  const p = list.find((x) => x.type === 'page' && x.url.startsWith('https://chatgpt.com'));
  if (!p) throw new Error('нет вкладки ChatGPT');
  ws = new WebSocket(p.webSocketDebuggerUrl);
  await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
  ws.onmessage = (m) => { const d = JSON.parse(m.data); if (d.id && pend[d.id]) { pend[d.id](d); delete pend[d.id]; } };
}
const send = (method, params = {}) => new Promise((r) => { const i = ++id; pend[i] = r; ws.send(JSON.stringify({ id: i, method, params })); });
async function js(expr) {
  const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
  if (r.result?.exceptionDetails) throw new Error(JSON.stringify(r.result.exceptionDetails).slice(0, 300));
  return r.result?.result?.value;
}

// Только картинки из ответов ChatGPT: вложения в наших сообщениях и в поле ввода не считаются.
const IMGS = `[...new Set([...document.querySelectorAll('img')].filter(i => i.src.includes('estuary/content') && i.naturalWidth > 500 && !i.closest('[data-message-author-role="user"]') && !i.closest('form') && !i.closest('#thread-bottom-container')).map(i => i.src.match(/id=([^&]+)/)?.[1]))]`;

async function newChat() {
  // кнопка «Новый чат» в боковой панели; если её нет — переход по адресу
  const clicked = await js(`(() => { const b = document.querySelector('[data-testid="create-new-chat-button"]') || [...document.querySelectorAll('a,button')].find((x) => x.innerText.trim() === 'Новый чат'); if (b) { b.click(); return true; } return false; })()`);
  if (!clicked) await send('Page.navigate', { url: 'https://chatgpt.com/' });
  for (let i = 0; i < 60; i++) {
    await sleep(1000);
    const ok = await js(`location.pathname === '/' && !!document.querySelector('#prompt-textarea') && !document.querySelector('[data-message-author-role]')`);
    if (ok) break;
  }
  await sleep(1500);
}

async function attach(file) {
  // Картинку кладём в поле выбора файла прямо из страницы (DataTransfer) — как если бы её выбрали вручную.
  const b64 = fs.readFileSync(file).toString('base64');
  const name = path.basename(file);
  const r = await js(`(async () => {
    const bin = atob(${JSON.stringify(b64)});
    const u8 = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
    const f = new File([u8], ${JSON.stringify(name)}, { type: 'image/png' });
    const dt = new DataTransfer();
    dt.items.add(f);
    const inp = [...document.querySelectorAll('input[type=file]')].find((i) => i.accept === 'image/*') || document.querySelector('input[type=file]');
    inp.files = dt.files;
    inp.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
  })()`);
  // ждём, пока картинка появится в поле ввода и загрузится
  for (let i = 0; i < 60; i++) {
    await sleep(1000);
    const st = await js(`(() => { const f = document.querySelector('form') || document; const n = [...f.querySelectorAll('img')].length; const busy = !!f.querySelector('[role="progressbar"], svg circle[stroke-dashoffset]'); return { n, busy }; })()`);
    if (st.n > 0 && !st.busy && i >= 2) return true;
  }
  return false;
}

async function ask(text) {
  for (let i = 0; i < 40; i++) { if (await js(`!!document.querySelector('#prompt-textarea')`)) break; await sleep(1000); }
  await js(`(async () => { const ed = document.querySelector('#prompt-textarea'); ed.focus(); document.execCommand('insertText', false, ${JSON.stringify(text)}); })()`);
  await sleep(900);
  for (let i = 0; i < 90; i++) {
    const ok = await js(`(() => { const b = document.querySelector('[data-testid="send-button"]'); if (b && !b.disabled) { b.click(); return true; } return false; })()`);
    if (ok) return true;
    await sleep(1000);
  }
  return false;
}

async function waitImage(before, maxMs = 8 * 60000) {
  const t0 = Date.now();
  let quietSince = null;
  while (Date.now() - t0 < maxMs) {
    await sleep(4000);
    const now = await js(IMGS);
    const fresh = now.filter((x) => !before.includes(x));
    if (fresh.length) { await sleep(4000); return fresh[fresh.length - 1]; }
    const busy = await js(`!!document.querySelector('[data-testid="stop-button"]')`);
    const tail = await js(`(() => { const t = document.querySelector('main')?.innerText || ''; return t.slice(-400); })()`);
    if (!busy && /нарушает|не могу|Не удалось|violat|can't|cannot|лимит|limit/i.test(tail) && Date.now() - t0 > 20000) {
      quietSince ??= Date.now();
      if (Date.now() - quietSince > 15000) return { refused: tail.slice(-200) };
    }
  }
  return { timeout: true };
}

async function save(fileId, out) {
  const b64 = await js(`(async () => { const img = [...document.querySelectorAll('img')].filter(i => i.src.includes(${JSON.stringify(fileId)})).pop(); const buf = await (await fetch(img.src)).arrayBuffer(); let s = ''; const b = new Uint8Array(buf); for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode.apply(null, b.subarray(i, i + 0x8000)); return btoa(s); })()`);
  fs.writeFileSync(out, Buffer.from(b64, 'base64'));
}

await connect();
await send('Runtime.enable');
await send('Page.enable');
await send('DOM.enable');
const jobs = JSON.parse(fs.readFileSync(jobsFile, 'utf8'));
// два прохода: во втором — всё, что не получилось в первом (сбой страницы, пустой ответ)
for (const j of [...jobs, ...jobs.map((x) => ({ ...x, newChat: x.newChat || !x.skipIfMissing }))]) {
  const out = path.join(outDir, j.name + '.png');
  if (fs.existsSync(out)) continue;
  if (j.skipIfMissing && !fs.existsSync(path.join(outDir, j.skipIfMissing + '.png'))) { log('SKIP', j.name, '(нет', j.skipIfMissing + ')'); continue; }
  try {
    if (j.newChat) await newChat();
    if (j.attach) { const ok = await attach(j.attach); if (!ok) { log('ATTACH FAIL', j.name); continue; } }
    const before = await js(IMGS);
    if (!(await ask(j.prompt))) { log('SEND FAIL', j.name); continue; }
    log('SENT', j.name);
    const r = await waitImage(before);
    if (typeof r === 'string') { await save(r, out); log('OK', j.name); }
    else log('NO IMAGE', j.name, JSON.stringify(r));
  } catch (e) {
    log('ERR', j.name, e.message);
    try { ws.close(); } catch {}
    await sleep(3000);
    await connect(); await send('Runtime.enable'); await send('Page.enable'); await send('DOM.enable');
  }
}
log('DONE');
process.exit(0);
