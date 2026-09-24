import * as THREE from 'three';
import { CELL } from './CellManager.js';
import { PLAYER } from './PlayerManager.js';
import { EliminationManager } from './EliminationManager.js';
import { TimerManager } from './TimerManager.js';
import { wait } from '../scene/tween.js';
import { t } from '../i18n.js';

export const CHOICE_SECONDS = 30;

// Цикл раундов: выбор (30 с) → подтверждение → событие раунда → итог.
// Написан под список игроков: для командной игры добавятся другие участники.
export class RoundManager {
  constructor({ world, hud, audio, onFinish }) {
    this.world = world;
    this.hud = hud;
    this.audio = audio;
    this.onFinish = onFinish;
    this.timer = new TimerManager();
    this.elim = new EliminationManager(world, audio);
    this.round = 0;
    this.aborted = false;
    this.picking = false;
    this.hovered = null;
    this.ndc = new THREE.Vector2();

    this.timer.onTick = (sec) => {
      this.hud.setTimer(sec);
      if (sec <= 10 && sec > 0) this.audio.tickUrgent(sec);
      else if (sec > 0) this.audio.tick();
    };
    this.timer.onFrame = (frac) => this.hud.setTimerFrac(frac);

    this._move = (e) => this.onMove(e);
    this._click = (e) => this.onClick(e);
    window.addEventListener('pointermove', this._move);
    window.addEventListener('pointerdown', this._click);
  }

  get totalRounds() { return this.initial - 1; }

  async start(count, profile) {
    this.initial = count;
    const w = this.world;
    w.grid.build(count);
    w.fitCamera(w.grid.extent, true);
    this.me = w.players.add(profile, true);
    this.hud.setCells(count);
    this.hud.setRound(0, this.totalRounds);
    this.hud.setStatus(PLAYER.ALIVE);
    await w.grid.intro();
    this.loop();
  }

  async loop() {
    const w = this.world;
    while (!this.aborted) {
      this.round += 1;
      const alive = w.grid.alive;
      this.hud.setRound(this.round, this.totalRounds);
      this.hud.setCells(alive.length);

      // --- выбор клетки ---
      const choice = await this.choose();
      if (this.aborted) return;
      await this.applyChoice(choice);
      if (this.aborted) return;

      // --- событие раунда ---
      this.hud.setHint(t('waiting'));
      await wait(0.5);
      const cells = w.grid.alive;
      const target = this.elim.pickTarget(cells);
      await this.elim.roulette(cells, target);
      if (this.aborted) return;
      const victims = await this.elim.destroy(target, w.players.players);
      if (this.aborted) return;
      this.hud.setCells(w.grid.alive.length);

      if (victims.includes(this.me)) {
        this.hud.setStatus(PLAYER.ELIMINATED);
        this.audio.eliminated();
        this.hud.banner(t('eliminated'), 'red');
        w.focusBeam(null);
        await wait(3.2);
        return this.finish(false, alive.length);
      }

      this.me.roundsSurvived += 1;
      if (w.grid.alive.length <= 1) return this.victory();

      this.audio.survived();
      this.hud.banner(t('survived'), 'green', `${t('cellsLeft')}: ${w.grid.alive.length}`);
      await wait(1.2);
      await Promise.all([w.grid.relayout(), w.fitCamera(w.grid.extent)]);
      w.focusBeam(this.me.cell);
      await wait(0.5);
    }
  }

  // Ждёт подтверждённого выбора или конца времени.
  choose() {
    return new Promise((resolve) => {
      this.resolveChoice = resolve;
      this.picking = true;
      this.hud.setHint(t('chooseCell'));
      this.hud.timerActive(true);
      this.timer.start(CHOICE_SECONDS);
      this.timer.onExpire = () => {
        this.hud.closeConfirm();
        this.endPicking();
        this.hud.banner(t('timeUp'), '', '', 1.2);
        resolve({ cell: null, timeout: true });
      };
    });
  }

  endPicking() {
    this.picking = false;
    this.timer.stop();
    this.hud.timerActive(false);
    if (this.hovered) { this.hovered.hover = false; this.hovered = null; }
    this.world.grid.clearSelection();
  }

  // Время вышло: остаётся на своей клетке, а в первом раунде — случайная клетка.
  async applyChoice({ cell, timeout }) {
    const me = this.me;
    const w = this.world;
    if (timeout) {
      if (me.cell && me.cell.alive) cell = me.cell;
      else { const a = w.grid.alive; cell = a[Math.floor(Math.random() * a.length)]; }
      await wait(1.0);
      this.hud.setHint(me.cell === cell ? t('autoKept') : t('autoRandom'));
    }
    if (me.cell && me.cell !== cell) me.cell.setState(CELL.AVAILABLE);
    cell.setState(CELL.CONFIRMED);
    w.focusBeam(cell);
    if (me.cell !== cell) await w.players.moveTo(me, cell);
    cell.setState(CELL.OCCUPIED);
  }

  onMove(e) {
    if (!this.picking || this.hud.confirmOpen) return;
    this.ndc.set((e.clientX / window.innerWidth) * 2 - 1, -(e.clientY / window.innerHeight) * 2 + 1);
    const c = this.world.grid.pick(this.ndc, this.world.camera);
    if (c !== this.hovered) {
      if (this.hovered) this.hovered.hover = false;
      this.hovered = c;
      if (c) { c.hover = true; this.audio.hover(); }
      document.body.style.cursor = c ? 'pointer' : '';
    }
  }

  async onClick(e) {
    if (!this.picking || this.hud.confirmOpen || e.button !== 0) return;
    if (e.target.closest && e.target.closest('.hit')) return;
    this.onMove(e);
    const c = this.hovered;
    if (!c) return;
    const prevState = c.state;
    this.world.grid.clearSelection();
    c.setState(CELL.SELECTED);
    this.audio.select();
    const ok = await this.hud.confirm();
    if (!this.picking) return; // время вышло, пока было открыто окно
    if (!ok) { c.setState(prevState); this.audio.click(); return; }
    this.audio.confirm();
    this.endPicking();
    document.body.style.cursor = '';
    this.resolveChoice({ cell: c, timeout: false });
  }

  async victory() {
    const w = this.world;
    this.me.state = PLAYER.WINNER;
    this.hud.setStatus(PLAYER.WINNER);
    this.hud.setHint('');
    w.focusBeam(this.me.cell);
    w.beamTarget = 140;
    w.startOrbit(this.me.cell);
    this.audio.victory();
    const p = new THREE.Vector3();
    this.me.cell.group.getWorldPosition(p);
    w.effects.burst(p.clone().add(new THREE.Vector3(0, 0.3, 0)), new THREE.Color('#f6dc97'), 400, 8, 0.12, true, -4, 3.5);
    this.hud.banner(t('winner'), '', this.me.name, 4);
    await wait(5);
    this.finish(true, 1);
  }

  finish(won, cellsAtEnd) {
    if (this.aborted) return;
    this.onFinish({
      won,
      initialCells: this.initial,
      cellsLeft: cellsAtEnd,
      rounds: this.me.roundsSurvived,
      theme: this.world.themeId,
    });
  }

  update() { this.timer.update(); }

  dispose() {
    this.aborted = true;
    this.timer.stop();
    this.hud.closeConfirm();
    document.body.style.cursor = '';
    window.removeEventListener('pointermove', this._move);
    window.removeEventListener('pointerdown', this._click);
  }
}
