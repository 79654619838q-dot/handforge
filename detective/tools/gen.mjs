// Очередь картинок в ChatGPT (приложение на рабочем столе, порт отладки 9222 — ярлык «ChatGPT (для Claude)»).
// node detective/tools/gen.mjs detective-art/jobs/<файл>.json [ещё файлы…]
// Каждая картинка — в НОВОМ чате; готовые (detective-art/raw/<name>.png) пропускаются — очередь можно перезапускать.
// На сообщении о лимите рисования очередь останавливается сама и пишет время.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(path.dirname(path.dirname(fileURLToPath(import.meta.url))));
const OUT = path.join(ROOT, 'detective-art', 'raw');
fs.mkdirSync(OUT, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (...a) => { const s = new Date().toTimeString().slice(0, 8) + ' ' + a.join(' '); console.log(s); fs.appendFileSync(path.join(OUT, 'gen.log'), s + '\n'); };

let ws, id = 0;
const pend = {};
async function connect() {
  const list = await (await fetch('http://127.0.0.1:9222/json')).json();
  const p = list.find((x) => x.type === 'page' && x.url.startsWith('https://chatgpt.com'));
  if (!p) throw new Error('нет вкладки ChatGPT');
  ws = new WebSocket(p.webSocketDebuggerUrl);
  await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
  ws.onmessage = (m) => { const d = JSON.parse(m.data); if (d.id && pend[d.id]) { pend[d.id](d); delete pend[d.id]; } };
  await send('Runtime.enable'); await send('Page.enable');
}
const send = (method, params = {}) => new Promise((r) => { const i = ++id; pend[i] = r; ws.send(JSON.stringify({ id: i, method, params })); });
async function js(expr) {
  const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
  if (r.result?.exceptionDetails) throw new Error(JSON.stringify(r.result.exceptionDetails).slice(0, 300));
  return r.result?.result?.value;
}

// Картинки-ответы: только из ВИДИМОЙ галереи текущего чата. ChatGPT держит в странице невидимые
// галереи прошлых чатов — 05.10 без этого фильтра сарай сохранился копией заставки.
const IMGS = `[...document.querySelectorAll('[data-testid="generated-image-gallery"]')].filter(g => g.offsetParent !== null).flatMap(g => [...g.querySelectorAll('img')]).filter(i => i.naturalWidth > 500).map(i => i.src)`;
// ещё строже: только галерея, стоящая в странице ПОСЛЕ нашего запроса (ищем его по куску текста)
const imgsAfter = (snippet) => `(() => {
  const anchor = [...document.querySelectorAll('main div, main p, main span')].filter((e) => e.offsetParent !== null && e.children.length === 0 && e.textContent.includes(${JSON.stringify(snippet)})).pop();
  if (!anchor) return null;
  return [...document.querySelectorAll('[data-testid="generated-image-gallery"]')]
    .filter((g) => g.offsetParent !== null && (anchor.compareDocumentPosition(g) & Node.DOCUMENT_POSITION_FOLLOWING))
    .flatMap((g) => [...g.querySelectorAll('img')]).filter((i) => i.naturalWidth > 500).map((i) => i.src);
})()`;

// отпечатки уже сохранённых картинок — повтор не сохраняем
import crypto from 'node:crypto';
const md5 = (b) => crypto.createHash('md5').update(b).digest('hex');
const known = new Set(fs.readdirSync(OUT).filter((f) => f.endsWith('.png')).map((f) => md5(fs.readFileSync(path.join(OUT, f)))));

async function newChat() {
  await send('Page.navigate', { url: 'https://chatgpt.com/' });
  for (let i = 0; i < 60; i++) {
    await sleep(1000);
    const ok = await js(`location.pathname === '/' && !!document.querySelector('.ProseMirror') && !document.querySelector('main [data-message-author-role]')`).catch(() => false);
    if (ok) break;
  }
  await sleep(2000);
}

// приложить картинку к запросу (как будто выбрали файл вручную) — для правки уже нарисованного
async function attach(file) {
  // 05.10: ни выбор файла через input, ни DOM.setFileInputFiles ChatGPT не принимает —
  // работает только вставка картинки в поле ввода, как Ctrl+V (событие paste с файлом)
  const png = file.replace(/[.](webp|jpg)$/i, '.attach.png');
  if (png !== file && !fs.existsSync(png)) {
    const { execFileSync } = await import('node:child_process');
    execFileSync('python', ['-c', `from PIL import Image; Image.open(r'${file}').convert('RGB').save(r'${png}')`]);
  }
  const src = png !== file ? png : file;
  const b64 = fs.readFileSync(src).toString('base64');
  // сразу после открытия нового чата поле ещё не принимает вставку — пробуем до трёх раз
  for (let attempt = 0; attempt < 3; attempt++) {
  await sleep(2500);
  await js(`(async () => {
    const bin = atob(${JSON.stringify(b64)}); const u8 = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
    const dt = new DataTransfer(); dt.items.add(new File([u8], 'ref.png', { type: 'image/png' }));
    const ed = [...document.querySelectorAll('.ProseMirror')].find(e => e.offsetParent !== null); ed.focus();
    ed.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }));
    return true;
  })()`);
  for (let i = 0; i < 15; i++) {
    await sleep(1000);
    const st = await js(`(() => { const ed = [...document.querySelectorAll('.ProseMirror')].find(e => e.offsetParent !== null); const f = ed && ed.closest('form'); if (!f) return { n: 0, busy: true }; const n = [...f.querySelectorAll('img')].filter(i => i.src.startsWith('blob:') && i.naturalWidth > 50).length; const busy = !!f.querySelector('[role="progressbar"], circle[stroke-dashoffset]'); return { n, busy }; })()`).catch(() => ({ n: 0, busy: true }));
    if (st.n > 0 && !st.busy && i >= 3) return true;
  }
  }
  return false;
}

async function ask(text) {
  await js(`(() => { const ed = [...document.querySelectorAll('.ProseMirror')].find(e => e.offsetParent !== null); ed.focus(); document.execCommand('insertText', false, ${JSON.stringify(text)}); return true; })()`);
  await sleep(1200);
  for (let i = 0; i < 60; i++) {
    const ok = await js(`(() => { const b = document.querySelector('[data-testid="send-button"], button[aria-label="Отправить"], button[aria-label="Send prompt"]'); if (b && !b.disabled) { b.click(); return true; } return false; })()`);
    if (ok) return true;
    await sleep(1000);
  }
  return false;
}

async function waitImage(before, snippet, maxMs = 9 * 60000) {
  const t0 = Date.now();
  let quiet = null, idle = null;
  while (Date.now() - t0 < maxMs) {
    await sleep(5000);
    // «Какое изображение вам больше нравится?» — выбираем первое
    await js(`(() => { const b = [...document.querySelectorAll('button')].find(b => /Изображение 1|1 изображение|Image 1 is better/i.test(b.innerText)); if (b) b.click(); })()`).catch(() => {});
    let now = snippet ? await js(imgsAfter(snippet)).catch(() => null) : null;
    if (now == null) now = await js(IMGS).catch(() => []);
    const fresh = now.filter((x) => !before.includes(x));
    const busy = await js(`!!document.querySelector('[data-testid="stop-button"], button[aria-label*="Остановить"], button[aria-label*="Stop"]')`).catch(() => true);
    if (fresh.length && !busy) { await sleep(3000); return fresh[fresh.length - 1]; }
    const tail = await js(`(() => { const m = [...document.querySelectorAll('main [data-message-author-role="assistant"]')].pop(); return m ? m.innerText.slice(-500) : ''; })()`).catch(() => '');
    // 05.10: ChatGPT иногда оставляет вечную заглушку без картинки и без «стоп» — не ждём 9 минут
    if (!busy) { idle ??= Date.now(); if (Date.now() - idle > 240000) return { stuck: true }; } else idle = null;
    if (!busy && tail && Date.now() - t0 > 30000) {
      quiet ??= Date.now();
      if (Date.now() - quiet > 20000) return { text: tail };
    } else quiet = null;
  }
  return { timeout: true };
}

async function save(src, out) {
  const b64 = await js(`(async () => { const buf = await (await fetch(${JSON.stringify(src)})).arrayBuffer(); let s = ''; const b = new Uint8Array(buf); for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode.apply(null, b.subarray(i, i + 0x8000)); return btoa(s); })()`);
  const buf = Buffer.from(b64, 'base64');
  const sum = md5(buf);
  if (known.has(sum)) return -1;
  known.add(sum);
  fs.writeFileSync(out, buf);
  return buf.length;
}

const jobs = process.argv.slice(2).flatMap((f) => JSON.parse(fs.readFileSync(f, 'utf8')));
await connect();
for (let pass = 0; pass < 2; pass++) {
  for (const j of jobs) {
    const out = path.join(OUT, j.name + '.png');
    if (fs.existsSync(out)) continue;
    try {
      // keep: картинка уже вложена в поле ввода вручную — не открывать новый чат и не вкладывать заново
      if (!j.keep) await newChat();
      if (j.attach && !j.keep) {
        const f = path.isAbsolute(j.attach) ? j.attach : path.join(ROOT, j.attach);
        if (!fs.existsSync(f)) { log('SKIP', j.name, '(нет файла', j.attach + ')'); continue; }
        if (!(await attach(f))) { log('ATTACH FAIL', j.name); continue; }
      }
      const before = await js(IMGS);
      if (!(await ask(j.prompt))) { log('SEND FAIL', j.name); continue; }
      log('SENT', j.name);
      const r = await waitImage(before, j.prompt.slice(-40));
      if (typeof r === 'string') {
        const n = await save(r, out);
        if (n < 0) { log('DUP', j.name, '— та же картинка, что уже есть; повторю во втором проходе'); continue; }
        log('OK', j.name, Math.round(n / 1024) + ' КБ'); continue;
      }
      log('NO IMAGE', j.name, JSON.stringify(r).slice(0, 300));
      if (r.text && /лимит|limit|Попробуйте снова через|достигли/i.test(r.text)) { log('ЛИМИТ — стоп'); process.exit(2); }
    } catch (e) {
      log('ERR', j.name, e.message);
      try { ws.close(); } catch { }
      await sleep(3000);
      await connect();
    }
  }
}
log('DONE');
process.exit(0);
