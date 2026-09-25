// Сохранение в браузере: образы, цвет волос принцесс, задания, настройки.

const KEY = 'princess-dressup-v2';
const def = () => ({
  looks: [],
  princesses: {},
  tasksDone: {},
  stats: { looks: 0, places: {} },
  settings: { sound: true, music: true },
  seenIntro: false,
});

let S = def();
try {
  const raw = localStorage.getItem(KEY);
  if (raw) S = { ...def(), ...JSON.parse(raw) };
} catch { /* пустое хранилище или запрет — играем с нуля */ }

export const state = () => S;
export function save() {
  try { localStorage.setItem(KEY, JSON.stringify(S)); } catch { /* места нет или запрещено */ }
}
export function reset() { S = def(); save(); }

export function addLook(look) {
  S.looks.unshift(look);
  if (S.looks.length > 60) S.looks.length = 60;
  save();
}
export function updateLook(id, patch) {
  const l = S.looks.find((x) => x.id === id);
  if (l) Object.assign(l, patch);
  save();
}
export function deleteLook(id) { S.looks = S.looks.filter((x) => x.id !== id); save(); }
