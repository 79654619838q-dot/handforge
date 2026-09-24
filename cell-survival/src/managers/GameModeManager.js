import { h } from './UIManager.js';
import { t } from '../i18n.js';
import { layout } from './GridManager.js';
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
      <div class="mode-card locked" data-m="team" style="background-image:url(${ASSETS}modes/team.jpg), radial-gradient(ellipse at 50% 30%, #2a1450, #0b0910 70%)">
        <div class="badge">${t('soon')}</div><div class="glyph">II</div>
        <div class="kicker">Squad</div><h2 class="title">${t('team')}</h2><p>${t('teamDesc')}</p>
      </div>`;
    s.querySelector('[data-m=single]').onclick = () => this.game.goSetup();
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
    s.querySelector('[data-back]').onclick = () => this.game.goModes();
    return s;
  }
}
