// Итог одиночной игры. Результат — доля клеток, оставшихся на поле к моменту выбывания
// (как в ТЗ: начал с 50, выжил до 40 → 80%; начал со 100, выжил до 27 → 27%).
// Чем меньше процент, тем дольше продержался; лучший результат — наименьший.
export class ResultManager {
  constructor(save) { this.save = save; }

  static percent(initialCells, cellsLeft) {
    return Math.round((cellsLeft / initialCells) * 100);
  }

  record(r) {
    const entry = {
      date: new Date().toISOString(),
      initialCells: r.initialCells,
      cellsLeft: r.cellsLeft,
      rounds: r.rounds,
      won: r.won,
      theme: r.theme,
      percent: ResultManager.percent(r.initialCells, r.cellsLeft),
    };
    const isBest = this.save.recordGame(entry);
    return { ...entry, isBest, best: this.save.data.best };
  }
}
