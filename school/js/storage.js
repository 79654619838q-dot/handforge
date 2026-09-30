// Хранилище браузера с запасным вариантом. Некоторые браузеры на планшетах не дают сайту хранить
// данные (инкогнито, встроенный браузер мессенджера, строгая экономия памяти) — тогда localStorage
// бросает ошибку, и раньше прохождение молча не сохранялось даже у вошедшего игрока. Теперь в таком
// случае всё держится в памяти до закрытия страницы, а программа честно говорит, что без входа
// прохождение не запомнится (со входом оно на сервере и вернётся при следующем входе).
const mem = new Map();
function test() {
  try {
    const k = 'school.__test';
    localStorage.setItem(k, '1');
    const ok = localStorage.getItem(k) === '1';
    localStorage.removeItem(k);
    return ok;
  } catch { return false; }
}
export const storageWorks = test();

export const ls = storageWorks ? {
  getItem: (k) => { try { return localStorage.getItem(k); } catch { return mem.has(k) ? mem.get(k) : null; } },
  setItem: (k, v) => { mem.set(k, String(v)); try { localStorage.setItem(k, String(v)); } catch {} },
  removeItem: (k) => { mem.delete(k); try { localStorage.removeItem(k); } catch {} },
  keys: () => { try { return Object.keys(localStorage); } catch { return [...mem.keys()]; } },
} : {
  getItem: (k) => (mem.has(k) ? mem.get(k) : null),
  setItem: (k, v) => { mem.set(k, String(v)); },
  removeItem: (k) => { mem.delete(k); },
  keys: () => [...mem.keys()],
};

// Просим браузер не стирать данные сайта при нехватке места (Chrome/Android выполняет для часто открываемых сайтов).
try { navigator.storage?.persist?.().catch(() => {}); } catch {}
