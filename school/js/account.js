// Вход по имени и паролю: прохождение (звёзды, уровни, наклейки) хранится на сервере
// (/school/api, hub/school-accounts.js) и копией — в браузере. Без входа играть тоже можно,
// тогда прогресс только в этом браузере.
import { ls } from './storage.js';

const API = 'api';
const PREFIX = 'school.';
// что считается прохождением (остальное в localStorage — настройки этого устройства)
const isProgressKey = (k) => k === 'stars' || k === 'stickers' || k.startsWith('prog.');

function readLocal() {
  const out = {};
  for (const k of ls.keys()) {
    try { if (k.startsWith(PREFIX) && isProgressKey(k.slice(PREFIX.length))) out[k.slice(PREFIX.length)] = JSON.parse(ls.getItem(k)); } catch {}
  }
  return out;
}
function writeLocal(p) {
  try {
    Object.entries(p).forEach(([k, v]) => { if (isProgressKey(k)) ls.setItem(PREFIX + k, JSON.stringify(v)); });
  } catch {}
}
function clearLocal() {
  Object.keys(readLocal()).forEach((k) => ls.removeItem(PREFIX + k));
}
// слияние: берём лучшее из двух (с другого устройства могли пройти больше)
export function merge(a = {}, b = {}) {
  const out = { ...a };
  for (const [k, v] of Object.entries(b)) {
    const w = out[k];
    if (w === undefined) out[k] = v;
    else if (k === 'stars') out[k] = Math.max(+w || 0, +v || 0);
    else if (k === 'stickers') out[k] = [...new Set([...(w || []), ...(v || [])])];
    else if (k.startsWith('prog.') && Array.isArray(v)) out[k] = Array.from({ length: Math.max(w.length || 0, v.length) }, (_, i) => Math.max(w[i] || 0, v[i] || 0));
  }
  return out;
}

export const account = () => { try { return JSON.parse(ls.getItem(PREFIX + 'account')); } catch { return null; } };
function setAccount(a) { a ? ls.setItem(PREFIX + 'account', JSON.stringify(a)) : ls.removeItem(PREFIX + 'account'); }

async function call(path, { method = 'GET', body, token } = {}) {
  const r = await fetch(`${API}/${path}`, {
    method, headers: { 'content-type': 'application/json', ...(token ? { authorization: 'Bearer ' + token } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw Object.assign(new Error(j.error || 'Нет связи с сервером. Проверь интернет.'), { status: r.status });
  return j;
}

// Вход или регистрация. Прогресс, набранный до входа на этом устройстве, не теряется — сливается.
export async function signIn(nick, pass, isNew) {
  const j = await call(isNew ? 'register' : 'login', { method: 'POST', body: { nick, pass } });
  const merged = merge(j.progress, readLocal());
  setAccount({ nick: j.nick, token: j.token });
  writeLocal(merged);
  await push();
  return j.nick;
}
export function signOut() { setAccount(null); clearLocal(); }

// При запуске: подтянуть прохождение с сервера (могли играть на другом устройстве). Сайт на бесплатном
// Render после сна просыпается до минуты — повторяем, пока не получится; меню ждёт этого (loaded).
let loadedResolve;
export const loaded = new Promise((r) => { loadedResolve = r; });
export async function pull() {
  const a = account();
  if (!a) { loadedResolve(true); return true; }
  for (let attempt = 0; attempt < 6; attempt++) {
    try {
      const j = await call('progress', { token: a.token });
      writeLocal(merge(j.progress, readLocal()));
      loadedResolve(true); return true;
    } catch (e) {
      if (e.status === 401) { setAccount(null); loadedResolve(true); return true; } // вход устарел — попросим войти снова
      await new Promise((r) => setTimeout(r, 3000 + attempt * 4000));
    }
  }
  loadedResolve(false); return false; // сервер так и не ответил — играем, отправка всё равно только добавит
}

let timer = null;
async function push() {
  const a = account();
  if (!a) return;
  try {
    const j = await call('progress', { method: 'PUT', token: a.token, body: { progress: readLocal() } });
    if (j.progress) writeLocal(merge(j.progress, readLocal())); // сервер вернул объединённое — берём всё
  } catch { /* нет сети — отправим при следующем сохранении */ }
}
// звать после каждого изменения прохождения: отправка с задержкой, чтобы не слать на каждую звезду
export function schedulePush() { if (!account()) return; clearTimeout(timer); timer = setTimeout(push, 1500); }
