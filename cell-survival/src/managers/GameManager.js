import { SaveManager } from './SaveManager.js';
import { AudioManager } from './AudioManager.js';
import { UIManager, Hud, h } from './UIManager.js';
import { MenuManager } from './MenuManager.js';
import { ProfileManager } from './ProfileManager.js';
import { GameModeManager } from './GameModeManager.js';
import { LobbyManager } from './LobbyManager.js';
import { RoundManager } from './RoundManager.js';
import { ResultManager } from './ResultManager.js';
import { renderPortrait, ensurePerson } from './AvatarManager.js';
import { Stage } from '../scene/Stage.js';
import { MenuWorld, ProfileWorld } from '../scene/worlds.js';
import { GameWorld } from '../scene/GameWorld.js';
import { THEMES, THEME_IDS } from '../scene/themes.js';
import { clearTweens } from '../scene/tween.js';
import { t, setLang, getLang } from '../i18n.js';

// Точка сборки: знает все системы и переводит игру между экранами.
export class GameManager {
  constructor() {
    this.save = new SaveManager();
    setLang(this.save.settings.lang);
    this.audio = new AudioManager(this.save.settings);
    this.stage = new Stage(document.getElementById('stage'), this.save.settings);
    this.ui = new UIManager(document.getElementById('ui'), this.audio);
    this.menu = new MenuManager(this);
    this.profile = new ProfileManager(this);
    this.modes = new GameModeManager(this);
    this.lobby = new LobbyManager(this);
    this.results = new ResultManager(this.save);
    this.menuWorld = null;
    this.round = null;

    const unlock = () => this.audio.unlock();
    window.addEventListener('pointerdown', unlock);
    window.addEventListener('keydown', unlock);
    window.cellSurvival = this; // для отладки из консоли
  }

  start() {
    this.goMenu();
    setTimeout(() => document.getElementById('boot')?.classList.add('gone'), 300);
  }

  _menuBackdrop() {
    if (!this.menuWorld || this.stage.world !== this.menuWorld) {
      this.menuWorld = new MenuWorld();
      this.stage.setWorld(this.menuWorld);
    }
    this.audio.playMusic('menu');
  }

  goMenu() {
    this._leaveGame();
    this._menuBackdrop();
    this.ui.show(this.menu.menuScreen());
  }

  goSettings() { this._menuBackdrop(); this.ui.show(this.menu.settingsScreen()); }

  goProfile(firstRun) {
    const world = new ProfileWorld();
    this.menuWorld = null;
    this.ui.dip(() => {
      this.stage.setWorld(world);
      this.ui.show(this.profile.screen(world, firstRun));
    });
  }

  goModes() {
    if (!this.save.profile) return this.goProfile(true); // сначала аватар
    this._menuBackdrop();
    this.ui.show(this.modes.modesScreen());
  }

  goSetup() { this._menuBackdrop(); this.ui.show(this.modes.setupScreen()); }

  pickTheme() {
    const s = this.save.settings.theme;
    return THEME_IDS.includes(s) ? s : THEME_IDS[Math.floor(Math.random() * THEME_IDS.length)];
  }

  startSingle(count) {
    const themeId = this.pickTheme();
    const profile = this.save.profile;
    this.ui.dip(async () => {
      this._leaveGame();
      await ensurePerson(profile); // реалистичный человек должен быть загружен до поля и портрета
      const world = new GameWorld(themeId);
      this.menuWorld = null;
      const screen = h('div', 'screen');
      screen.id = 'game';
      const hud = new Hud(screen, profile.name, renderPortrait(profile, 320, 400), THEMES[themeId].name[getLang()]);
      screen.querySelector('[data-exit]').onclick = () => this.goMenu();
      const round = new RoundManager({ world, hud, audio: this.audio, onFinish: (r) => this.showResult(r, count) });
      this.round = round;
      const baseUpdate = world.update.bind(world);
      world.update = (dt, tt) => { round.update(dt); baseUpdate(dt, tt); };
      this.stage.setWorld(world);
      this.ui.show(screen);
      this.audio.playMusic('game');
      round.start(count, profile);
    });
  }

  _leaveGame() {
    if (this.round) { this.round.dispose(); this.round = null; clearTweens(); }
  }

  showResult(r, count) {
    const rec = this.results.record(r);
    const profile = this.save.profile;
    const s = h('div', 'screen');
    s.id = 'result';
    const date = new Date(rec.date).toLocaleString(getLang() === 'ru' ? 'ru-RU' : 'en-GB', { day: '2-digit', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' });
    s.innerHTML = `
      <div class="hero" style="background-image:url(${renderPortrait(profile, 480, 600, true)})"></div>
      <div class="info">
        <div class="kicker">${rec.won ? t('winner') : profile.name}</div>
        <h1 class="title" style="font-size:54px">${t('gameOver')}</h1>
        <div class="label" style="margin-top:22px">${t('result')}${rec.isBest ? `<span class="newbest">${t('newBest')}</span>` : ''}</div>
        <div class="big">${rec.percent}%</div>
        <dl>
          <dt>${t('initialCells')}</dt><dd>${rec.initialCells}</dd>
          <dt>${t('roundsPassed')}</dt><dd>${rec.rounds}</dd>
          <dt>${t('cellsRemain')}</dt><dd>${rec.cellsLeft}</dd>
          <dt>${t('best')}</dt><dd class="gold">${rec.best.percent}%</dd>
          <dt>${t('date')}</dt><dd>${date}</dd>
        </dl>
        <div class="btns"><button class="btn primary" data-again>${t('playAgain')}</button><button class="btn" data-menu>${t('toMenu')}</button></div>
      </div>`;
    s.querySelector('[data-again]').onclick = () => this.startSingle(count);
    s.querySelector('[data-menu]').onclick = () => this.ui.dip(() => this.goMenu());
    this.ui.show(s);
  }
}
