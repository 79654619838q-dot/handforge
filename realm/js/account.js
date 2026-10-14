// Вход по нику и паролю (/realm/api, hub/realm-accounts.js). Сохранение лежит на сервере и копией в браузере.
// У сохранения есть номер версии rev: сервер принимает только более новую версию; если на сервере новее
// (играли с другого устройства) — берём серверную.
const API = 'api';
const ls = {
  get(k) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch { } },
  del(k) { try { localStorage.removeItem(k); } catch { } },
};

export const account = () => { try { return JSON.parse(ls.get('realm.account')); } catch { return null; } };
const keyOf = (nick) => String(nick).toLowerCase().replace(/ё/g, 'е');
export const saveKey = (a = account()) => `realm.save.v2.${a ? keyOf(a.nick) : 'guest'}`;

async function call(path, { method = 'GET', body, token } = {}) {
  let r;
  try {
    r = await fetch(`${API}/${path}`, {
      method, cache: 'no-store', keepalive: method === 'PUT',
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch { throw new Error('Нет связи с сервером. Проверь интернет и попробуй ещё раз.'); }
  let data = {};
  try { data = await r.json(); } catch { }
  if (!r.ok && r.status !== 409) { const e = new Error(data.error || 'Ошибка сервера'); e.status = r.status; throw e; }
  return { status: r.status, ...data };
}

export function loadLocal(a = account()) { try { return JSON.parse(ls.get(saveKey(a))); } catch { return null; } }
export function storeLocal(S, a = account()) { ls.set(saveKey(a), JSON.stringify(S)); }

// Вход или регистрация. Возвращает сохранение — более новое из серверного и местного.
export async function enter(mode, nick, pass) {
  const d = await call(mode === 'register' ? 'register' : 'login', { method: 'POST', body: { nick, pass } });
  const a = { token: d.token, nick: d.nick };
  ls.set('realm.account', JSON.stringify(a));
  const local = loadLocal(a);
  const S = (d.save && (d.rev || 0) >= (local?.rev || 0)) ? { ...d.save, rev: d.rev } : local;
  return S;
}
export function logout() { clearTimeout(timer); ls.del('realm.account'); }

// Фоновая сверка при запуске: если на сервере новее — вернуть его
export async function pull() {
  const a = account(); if (!a) return null;
  try { const d = await call('save', { token: a.token }); return d.save ? { ...d.save, rev: d.rev } : null; }
  catch (e) { if (e.status === 401) logout(); return null; }
}

let timer = null, latest = null, onNewer = null;
export function onServerNewer(f) { onNewer = f; }
export function push(S, now = false) {
  const a = account(); if (!a) return;
  latest = S;
  clearTimeout(timer);
  timer = setTimeout(send, now ? 0 : 1500);
}
async function send() {
  const a = account(); if (!a || !latest) return;
  const S = latest;
  try {
    const d = await call('save', { method: 'PUT', token: a.token, body: { save: S, rev: S.rev } });
    if (d.status === 409 && d.save && d.rev > S.rev && onNewer) onNewer({ ...d.save, rev: d.rev });
  } catch (e) { if (e.status === 401) logout(); }
}
// уходя со страницы — отправить без задержки
addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden' && timer) { clearTimeout(timer); send(); } });
