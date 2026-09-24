import { h } from './UIManager.js';
import { t } from '../i18n.js';
import { layout } from './GridManager.js';
import { CHALLENGE_IDS, CHALLENGE_META } from '../../shared/match.js';
import { getLang } from '../i18n.js';
import { ASSETS } from '../paths.js';

// Список размеров поля. Расширяется добавлением числа — раскладка считается сама.
export const CELL_COUNTS = [16, 25, 36, 50, 64, 100];

export class GameModeManager {
  constructor(game) { this.game = game; this.lastCount = 25; }

  modesScreen() {
    const s = h('div', 'screen vignette');
    s.id = 'modes';
    s.innerHTML = `
      <div class="topbar"><h1 class="title">${t('chooseMode')}</h1><div class="spacer"></div><button class="btn ghost" data-back>${t('back')}</button></div>
      <div class="mode-card" data-m="single" style="background-image:url(${ASSETS}modes/single.jpg), radial-gradient(ellipse at 50% 30%, #3a2a0e, #0b0910 70%)">
        <div class="glyph">I</div>
        <div class="kicker">Solo</div><h2 class="title">${t('single')}</h2><p>${t('singleDesc')}</p>
      </div>
      <div class="mode-card" data-m="team" style="background-image:url(${ASSETS}modes/team.jpg), radial-gradient(ellipse at 50% 30%, #2a1450, #0b0910 70%)">
        <div class="glyph">II</div>
        <div class="kicker">Squad</div><h2 class="title">${t('team')}</h2><p>${t('teamDesc')}</p>
      </div>`;
    s.querySelector('[data-m=single]').onclick = () => this.game.goChallenges();
    s.querySelector('[data-m=team]').onclick = () => this.game.goLobby();
    s.querySelector('[data-back]').onclick = () => this.game.goMenu();
    return s;
  }

  setupScreen() {
    const s = h('div', 'screen vignette');
    s.id = 'setup';
    const mini = (n) => {
      const L = layout(n);
      const dots = Array.from({ length: n }, () => '<i></i>').join('');
      return `<div class="mini" style="grid-template-columns:repeat(${L.cols}, 5px)">${dots}</div>`;
    };
    s.innerHTML = `
      <div class="topbar"><h1 class="title">${t('single')}</h1><div class="spacer"></div><button class="btn ghost" data-back>${t('back')}</button></div>
      <div class="kicker">${t('cellsCount')}</div>
      <div class="grid-pick">${CELL_COUNTS.map((n) => `<div class="count ${n === this.lastCount ? 'on' : ''}" data-n="${n}"><b>${n}</b>${mini(n)}</div>`).join('')}</div>
      <button class="btn primary" data-go>${t('startGame')}</button>`;
    s.querySelector('.grid-pick').onclick = (e) => {
      const c = e.target.closest('.count'); if (!c) return;
      this.lastCount = +c.dataset.n;
      s.querySelectorAll('.count').forEach((x) => x.classList.toggle('on', x === c));
    };
    s.querySelector('[data-go]').onclick = () => this.game.startSingle(this.lastCount);
    s.querySelector('[data-back]').onclick = () => this.game.goChallenges();
    return s;
  }

  // Одиночная игра: выбор одного из 7 испытаний.
  challengesScreen() {
    const s = h('div', 'screen vignette');
    s.id = 'challenges';
    const RULE = { lastcell: 'ruleLastcell', doors: 'ruleDoorsSolo', time: 'ruleTime', mines: 'ruleMines', memory: 'ruleMemory', center: 'ruleCenter', unique: 'ruleUnique', shoot: 'ruleShoot', bomb: 'ruleBomb', cards: 'ruleCards', roulette: 'ruleRoulette' };
    s.innerHTML = `
      <div class="topbar"><h1 class="title">${t('chooseChallenge')}</h1><div class="spacer"></div><button class="btn ghost" data-back>${t('back')}</button></div>
      <div class="ch-grid">${CHALLENGE_IDS.map((c, i) => `<div class="ch-card" data-c="${c}" style="background-image:url(${ASSETS}challenges/${c}.jpg)">
        <div class="n">${i + 1}</div><h3>${CHALLENGE_META[c][getLang()]}</h3><p>${t(RULE[c])}</p></div>`).join('')}</div>`;
    s.querySelector('.ch-grid').onclick = (e) => {
      const c = e.target.closest('[data-c]')?.dataset.c;
      if (c === 'lastcell') this.game.goSetup();
      else if (c === 'doors') this.game.ui.show(this.doorsScreen());
      else if (c) this.game.startLocal(c);
    };
    s.querySelector('[data-back]').onclick = () => this.game.goModes();
    return s;
  }

  // «Двери» в одиночку: сколько дверей в начале (2–10).
  doorsScreen() {
    const s = h('div', 'screen vignette');
    s.id = 'setup';
    let n = this.lastDoors || 10;
    const nums = [2, 3, 4, 5, 6, 7, 8, 9, 10];
    s.innerHTML = `
      <div class="topbar"><h1 class="title">${CHALLENGE_META.doors[getLang()]}</h1><div class="spacer"></div><button class="btn ghost" data-back>${t('back')}</button></div>
      <div class="kicker">${t('doorsCount')}</div>
      <div class="grid-pick doors-pick">${nums.map((k) => `<div class="count ${k === n ? 'on' : ''}" data-n="${k}"><b>${k}</b></div>`).join('')}</div>
      <button class="btn primary" data-go>${t('startGame')}</button>`;
    s.querySelector('.grid-pick').onclick = (e) => {
      const c = e.target.closest('.count'); if (!c) return;
      n = +c.dataset.n; this.lastDoors = n;
      s.querySelectorAll('.count').forEach((x) => x.classList.toggle('on', x === c));
    };
    s.querySelector('[data-go]').onclick = () => this.game.startLocal('doors', { doors: n });
    s.querySelector('[data-back]').onclick = () => this.game.goChallenges();
    return s;
  }
}
