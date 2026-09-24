// Локальное сохранение. Весь доступ к хранилищу — только здесь,
// чтобы потом заменить localStorage на сервер без правок остального кода.
const KEY = 'cellsurvival.save.v1';

const DEFAULTS = () => ({
  version: 1,
  qualityV2: true,
  profile: null,
  settings: {
    music: 0.55,
    sfx: 0.8,
    fullscreen: false,
    renderScale: 1,
    quality: 'auto', // ultra на компьютере, high на телефоне (Stage.resolveQuality)
    lang: 'ru',
    theme: 'random',
  },
  best: { percent: null, cells: null, date: null }, // лучший = наименьший % (глубже всех дожил)
  history: [],
  stats: { games: 0, rounds: 0, wins: 0, eliminations: 0 },
});

export class SaveManager {
  constructor() {
    this.data = this._load();
  }

  _load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) return DEFAULTS();
      const parsed = JSON.parse(raw);
      const d = DEFAULTS();
      // до 25.09 выбор был только «высокое/низкое»; «высокое» было по умолчанию — переводим на «Авто»
      if (!parsed.qualityV2) { if (parsed.settings?.quality === 'high') parsed.settings.quality = 'auto'; parsed.qualityV2 = true; }
      return { ...d, ...parsed, settings: { ...d.settings, ...parsed.settings }, best: { ...d.best, ...parsed.best }, stats: { ...d.stats, ...parsed.stats } };
    } catch {
      return DEFAULTS();
    }
  }

  save() {
    try { localStorage.setItem(KEY, JSON.stringify(this.data)); } catch { /* приватное окно — игра работает без сохранения */ }
  }

  get profile() { return this.data.profile; }
  setProfile(p) { this.data.profile = p; this.save(); }

  get settings() { return this.data.settings; }
  setSetting(k, v) { this.data.settings[k] = v; this.save(); }

  // Возвращает true, если это новый лучший результат.
  recordGame(entry) {
    this.data.history.unshift(entry);
    this.data.history = this.data.history.slice(0, 100);
    const s = this.data.stats;
    s.games += 1;
    s.rounds += entry.rounds;
    if (entry.won) s.wins += 1; else s.eliminations += 1;
    const b = this.data.best;
    const isBest = b.percent === null || entry.percent < b.percent;
    if (isBest) this.data.best = { percent: entry.percent, cells: entry.initialCells, date: entry.date };
    this.save();
    return isBest;
  }
}
