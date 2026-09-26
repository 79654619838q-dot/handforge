import { SaveManager } from './SaveManager.js';
import { AudioManager } from './AudioManager.js';
import { UIManager, Hud, h } from './UIManager.js';
import { MenuManager } from './MenuManager.js';
import { ProfileManager } from './ProfileManager.js';
import { GameModeManager } from './GameModeManager.js';
import { LobbyManager } from './LobbyManager.js';
import { RoundManager } from './RoundManager.js';
import { ResultManager } from './ResultManager.js';
import { renderPortrait, portraitSrc, ensurePerson } from './AvatarManager.js';
import { ASSETS, ART_V } from '../paths.js';
import { Stage } from '../scene/Stage.js';
import { MenuWorld, ProfileWorld } from '../scene/worlds.js';
import { GameWorld } from '../scene/GameWorld.js';
import { THEMES, THEME_IDS } from '../scene/themes.js';
import { clearTweens } from '../scene/tween.js';
import { t, setLang, getLang } from '../i18n.js';
import { LocalSession, RemoteSession } from '../net/session.js';
import { MatchView } from '../team/MatchView.js';

// Точка сборки: знает все системы и переводит игру между экранами.
export class GameManager {
  constructor() {
    // картинки интерфейса (нарисованы в ChatGPT) — в CSS как переменные: путь зависит от базы сборки (/cell/)
    const ui = (n) => `url("${ASSETS}ui/${n}${ART_V}")`;
    for (const n of ['card_back.jpg', 'card_face.jpg', 'bullet_blank.png', 'bullet_live.png', 'bomb.png', 'stopwatch.png', 'victory.jpg', 'defeat.jpg', 'panel_frame.png', 'icon_crown.png', 'icon_skull.png', 'icon_star.png']) {
      document.documentElement.style.setProperty('--img-' + n.split('.')[0].replace('_', '-'), ui(n));
    }
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
    this.renderPortrait = renderPortrait; // для tools: заранее нарисованные портреты героев
  }

  start() {
    this.goMenu();
    // ссылка-приглашение ?room=КОД: после профиля сразу в комнату
    const code = new URLSearchParams(location.search).get('room');
    if (code) this.pendingRoom = code.toUpperCase();
    if (code && this.save.profile) setTimeout(() => this.joinPending(), 600);
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
    this.inRoom = false;
    if (this.remote?.room) { this.remote.call('leave'); this.remote.room = null; }
    this._leaveGame();
    this._leaveMatch();
    this.lobby?.cleanup();
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
    if (this.pendingRoom) return this.joinPending();
    this._menuBackdrop();
    this.ui.show(this.modes.modesScreen());
  }

  goSetup() { this._menuBackdrop(); this.ui.show(this.modes.setupScreen()); }

  goChallenges() { this._leaveMatch(); this._menuBackdrop(); this.ui.show(this.modes.challengesScreen()); }

  // ---------- Командная игра ----------
  // Одно подключение к серверу комнат на всю вкладку; профиль отправляется при каждом входе.
  net() {
    if (!this.remote) {
      this.remote = new RemoteSession(this.save.profile);
      this.remote.on('status', (s) => this.lobby.status(s));
      this.remote.on('game', (g) => {
        if (g && g.phase !== 'final' && !this.matchView && this.inRoom) this.startMatch(this.remote); // создатель нажал «Начать»
        if (!g && this.matchView && !this.matchView.session.local) this.goRoom(); // «Сыграть ещё» — назад в комнату
      });
    } else if (this.remote.profile !== this.save.profile) { this.remote.profile = this.save.profile; this.remote.hello(); }
    return this.remote;
  }

  goLobby() {
    if (!this.save.profile) return this.goProfile(true);
    this._leaveMatch(); this.lobby.cleanup();
    const net = this.net();
    this.inRoom = false;
    if (net.room) { net.call('leave'); net.room = null; } // из лобби — значит, из комнаты вышли
    this._menuBackdrop();
    this.ui.show(this.lobby.lobbyScreen());
  }

  goRoom() {
    this._leaveMatch(); this.lobby.cleanup();
    this.inRoom = true;
    this._menuBackdrop();
    this.ui.show(this.lobby.roomScreen());
  }

  async joinPending() {
    const code = this.pendingRoom;
    this.pendingRoom = null;
    history.replaceState(null, '', location.pathname);
    const net = this.net();
    for (let i = 0; i < 20 && !net.socket.connected; i++) await new Promise((r) => setTimeout(r, 250));
    const r = await net.call('join', { roomId: code });
    if (r?.ok) this.goRoom(); else this.goLobby();
  }

  // ---------- Матч испытаний (одиночный с ботами или командный) ----------
  startLocal(cid, options = {}) {
    const session = new LocalSession({ profile: this.save.profile, chain: [cid], bots: cid === 'doors' ? 0 : 5, options });
    this.startMatch(session, () => this.startLocal(cid, options));
    session.start();
  }

  startMatch(session, again) {
    this._leaveGame();
    this._leaveMatch();
    this.lobby.cleanup();
    this.menuWorld = null;
    const mv = new MatchView({
      game: this,
      session,
      isHost: () => this.remote?.room?.hostId === this.remote?.myId,
      onExit: () => {
        if (session.local) this.ui.dip(() => this.goChallenges());
        else { this.remote.call('leave'); this.ui.dip(() => this.goLobby()); }
      },
      onAgain: () => (session.local ? again?.() : this.remote.send('again')),
    });
    mv.onFinal = (st) => { if (session.local) this.results.recordChallenge(st, session.myId); };
    this.matchView = mv;
    this.audio.playMusic('game');
    this.ui.show(mv.el, { dip: true });
    // у удалённой сессии состояние уже могло прийти до создания экрана
    if (!session.local && session.game) mv.onState(session.game);
  }

  _leaveMatch() {
    if (!this.matchView) return;
    const mv = this.matchView;
    this.matchView = null;
    mv.dispose();
    if (mv.session.local) mv.session.close();
    clearTweens();
  }

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
      const hud = new Hud(screen, profile.name, portraitSrc(profile, 320, 400), THEMES[themeId].name[getLang()]);
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
    s.classList.add(rec.won ? 'won' : 'lost'); // фон: пьедестал в золотом свете / рушащаяся клетка
    const date = new Date(rec.date).toLocaleString(getLang() === 'ru' ? 'ru-RU' : 'en-GB', { day: '2-digit', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' });
    s.innerHTML = `
      <div class="hero" style="background-image:url(${portraitSrc(profile, 480, 600, true)})"></div>
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
