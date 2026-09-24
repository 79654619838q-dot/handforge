import { h } from '../managers/UIManager.js';
import { t, getLang } from '../i18n.js';
import { CHALLENGE_META } from '../../shared/match.js';
import { renderPortrait, ensurePerson } from '../managers/AvatarManager.js';
import { THEME_IDS } from '../scene/themes.js';
import { VIEWS } from './views/index.js';

const RULE = { lastcell: 'ruleLastcell', doors: 'ruleDoors', time: 'ruleTime', mines: 'ruleMines', memory: 'ruleMemory', center: 'ruleCenter', unique: 'ruleUnique', shoot: 'ruleShoot', bomb: 'ruleBomb', cards: 'ruleCards', roulette: 'ruleRoulette' };
export const cname = (cid) => CHALLENGE_META[cid]?.[getLang()] || cid;

// Портреты игроков для списков: рендер по одному, с кэшем (реалистичные модели тяжёлые).
const portraitCache = new Map();
let chain = Promise.resolve();
export function portraitOf(profile) {
  const key = JSON.stringify(profile || {});
  if (!portraitCache.has(key)) {
    portraitCache.set(key, chain = chain.then(async () => { await ensurePerson(profile); return renderPortrait(profile, 160, 200); }).catch(() => ''));
  }
  return portraitCache.get(key);
}

// Экран матча: общая «рамка» (испытание, раунд, таймер, игроки, заставки) + вид конкретного испытания.
export class MatchView {
  constructor({ game, session, onExit, isHost, onAgain }) {
    this.game = game;
    this.session = session;
    this.onExit = onExit;
    this.onAgain = onAgain;
    this.isHost = isHost || (() => false);
    this.myId = session.myId;
    this.view = null;
    this.viewCid = null;
    this.viewIndex = -1;
    this.offset = 0;
    this.lastPhaseKey = '';

    const s = h('div', 'screen');
    s.id = 'match';
    const R = 58, C = 2 * Math.PI * R;
    this.C = C;
    s.innerHTML = `
      <div class="m-stage" data-stage></div>
      <div class="m-head panel hit"><div class="kicker" data-kick></div><div class="m-title" data-title></div><div class="label" data-round></div></div>
      <div class="timer idle m-timer"><div class="ring" style="width:128px;height:128px">
        <svg viewBox="0 0 130 130"><circle cx="65" cy="65" r="${R}" fill="rgba(0,0,0,.5)" stroke="rgba(217,178,95,.15)" stroke-width="5"/>
        <circle data-arc cx="65" cy="65" r="${R}" fill="none" stroke="#f6dc97" stroke-width="5" stroke-linecap="round" stroke-dasharray="${C}"/></svg>
        <div class="t" data-time style="font-size:30px">—</div></div></div>
      <div class="m-players panel hit" data-players></div>
      <div class="hint" data-hint></div>
      <button class="btn ghost hud-exit hit" data-exit>${t('leave')}</button>
      <div data-overlay></div>`;
    this.el = s;
    this.q = (sel) => s.querySelector(sel);
    this.stageEl = this.q('[data-stage]');
    this.q('[data-exit]').onclick = () => this.onExit();

    this.unsub = session.onState((st) => this.onState(st));
    this.tick = setInterval(() => this.updateTimer(), 100);
  }

  now() { return Date.now() + this.offset; }

  onState(st) {
    this.offset = st.now - Date.now();
    this.st = st;
    const me = st.players.find((p) => p.id === this.myId);
    this.renderHead(st);
    this.renderPlayers(st);

    // смена испытания — новый вид
    if (st.cid && (st.cid !== this.viewCid || st.index !== this.viewIndex) && st.phase !== 'final') this.switchView(st);
    const key = `${st.index}:${st.phase}:${st.round}`;
    const phaseChanged = key !== this.lastPhaseKey;
    this.lastPhaseKey = key;
    if (phaseChanged) this.onPhase(st, me);
    this.view?.update(st, phaseChanged);
  }

  switchView(st) {
    this.view?.leave();
    this.stageEl.innerHTML = '';
    const View = VIEWS[st.cid];
    this.viewCid = st.cid;
    this.viewIndex = st.index;
    const pref = this.game.save.settings.theme; // тема из «Настроек» — и для испытаний
    const theme = THEME_IDS.includes(pref) ? pref : THEME_IDS[Math.floor(Math.random() * THEME_IDS.length)];
    this.view = new View({ game: this.game, stage: this.game.stage, root: this.stageEl, audio: this.game.audio, act: (a) => this.session.act(a), myId: this.myId, theme, hint: (s) => this.setHint(s), mv: this });
    this.view.enter(st);
  }

  onPhase(st, me) {
    const a = this.game.audio;
    this.phaseTotal = st.deadline ? st.deadline - st.now : 0; // полная длина фазы — для кольца таймера
    this.setHint('');
    if (st.phase === 'intro') { a.confirm(); this.overlayIntro(st); }
    else this.clearOverlay('intro');
    // в «Останови время» верхний таймер выдаёт прошедшее время — там его нет совсем
    // таймер сверху скрыт там, где он выдаёт тайну (время, фитиль бомбы) или не нужен (рулетка по очереди)
    this.timerOn(!['time', 'bomb', 'roulette'].includes(st.cid) && (st.phase === 'act' || st.phase === 'show'));
    if (st.phase === 'reveal' && st.reveal) {
      const out = st.reveal.eliminated || [];
      // «Вы выбыли» — когда вид доиграет анимацию выбывания (showOut); таймер — страховка
      if (out.includes(this.myId)) {
        this.outPending = true;
        if (!this.view?.revealFxSec) this.showOut();
        else setTimeout(() => this.showOut(), (this.view.revealFxSec + 4) * 1000);
      }
      else if (st.reveal.replay) this.banner(t('replay'), '', '', 2.5);
      else if (st.alive?.includes(this.myId)) setTimeout(() => a.survived(), 1800);
    }
    if (st.phase === 'end') { this.overlayEnd(st); if (st.winners?.includes(this.myId)) a.victory(); }
    if (st.phase === 'final') { this.view?.leave(); this.view = null; this.overlayFinal(st); a.playMusic('final'); }
  }

  renderHead(st) {
    this.q('.m-head').style.visibility = st.phase === 'final' ? 'hidden' : '';
    if (st.phase === 'final') return;
    this.q('[data-kick]').textContent = st.chain.length > 1 ? `${t('challenge')} ${st.index + 1} ${t('of')} ${st.chain.length}` : t('challenge');
    this.q('[data-title]').textContent = st.cid ? cname(st.cid) : '';
    this.q('[data-round]').textContent = st.round ? `${t('round')} ${st.round}` : '';
  }

  renderPlayers(st) {
    const box = this.q('[data-players]');
    const alive = new Set(st.alive || []);
    const done = new Set(st.done || []);
    const winners = new Set(st.winners || []);
    const sorted = st.players.slice().sort((a, b) => (alive.has(b.id) - alive.has(a.id)) || b.points - a.points);
    box.innerHTML = `<div class="label" style="margin-bottom:8px">${t('players')}</div>` + sorted.map((p) => {
      const status = winners.has(p.id) ? `<span class="pl-st win">★</span>` : !st.cid || alive.has(p.id) ? (done.has(p.id) && st.phase === 'act' ? `<span class="pl-st ok">✓</span>` : '') : `<span class="pl-st out">✕</span>`;
      return `<div class="pl ${alive.has(p.id) || !st.cid ? '' : 'dead'} ${p.id === this.myId ? 'me' : ''}" data-pid="${p.id}">
        <div class="pl-ava"><img alt=""></div><div class="pl-name">${esc(p.name)}${p.isBot ? ` <small>${t('bot')}</small>` : ''}${p.connected ? '' : ' <small>⚡</small>'}</div>
        <div class="pl-pts">${p.points}</div>${status}</div>`;
    }).join('');
    for (const p of sorted) {
      const img = box.querySelector(`[data-pid="${p.id}"] img`);
      portraitOf(p.profile).then((url) => { if (url && img) img.src = url; });
    }
  }

  timerOn(on) { this.q('.m-timer').classList.toggle('idle', !on); }

  updateTimer() {
    const st = this.st;
    if (!st || !st.deadline) { this.q('[data-time]').textContent = '—'; return; }
    const total = Math.max(1, this.phaseTotal || 1);
    const left = Math.max(0, st.deadline - this.now());
    const sec = Math.ceil(left / 1000);
    const el = this.q('[data-time]');
    const tm = this.q('.m-timer');
    if (st.phase === 'act' || st.phase === 'show') {
      el.textContent = sec >= 60 ? `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}` : `00:${String(sec).padStart(2, '0')}`;
      this.q('[data-arc]').setAttribute('stroke-dashoffset', String(this.C * (1 - Math.min(1, left / total))));
      tm.classList.toggle('crit', st.phase === 'act' && sec <= 5);
      if (st.phase === 'act' && !['time', 'bomb', 'roulette'].includes(st.cid) && sec !== this.lastSec && sec <= 5 && sec > 0 && st.alive?.includes(this.myId) && !st.done?.includes(this.myId)) this.game.audio.tickUrgent(sec);
      this.lastSec = sec;
    } else { el.textContent = '—'; tm.classList.remove('crit'); }
    this.view?.frame?.(this.now());
  }

  showOut() {
    if (!this.outPending) return;
    this.outPending = false;
    this.game.audio.eliminated();
    this.banner(t('eliminated'), 'red');
  }

  setHint(s) { const e = this.q('[data-hint]'); if (e.textContent !== s) e.textContent = s; }

  banner(text, kind = '', sub = '', dur = 2.4) {
    const b = h('div', `banner ${kind}`, `<div class="band"><h1 class="title">${text}</h1>${sub ? `<div class="kicker sub">${sub}</div>` : ''}</div>`);
    this.el.appendChild(b);
    setTimeout(() => { b.classList.add('out'); setTimeout(() => b.remove(), 500); }, dur * 1000);
  }

  clearOverlay(kind) { const o = this.q(`[data-overlay] .ov-${kind}`); if (o) { o.classList.add('out'); setTimeout(() => o.remove(), 400); } }

  overlayIntro(st) {
    const rule = st.cid === 'doors' && st.solo ? 'ruleDoorsSolo' : RULE[st.cid];
    const o = h('div', 'm-overlay ov-intro', `<div class="m-card panel">
      <div class="kicker">${st.chain.length > 1 ? `${t('challenge')} ${st.index + 1} ${t('of')} ${st.chain.length}` : t('challenge')} · ${CHALLENGE_META[st.cid].skill[getLang()]}</div>
      <h1 class="title">${cname(st.cid)}</h1><p>${t(rule)}</p></div>`);
    this.q('[data-overlay]').appendChild(o);
  }

  overlayEnd(st) {
    const last = st.history[st.history.length - 1];
    const byId = (id) => st.players.find((p) => p.id === id);
    let body;
    if (last.solo && last.cid === 'doors') {
      const won = last.winners.length > 0;
      body = `<h1 class="title">${won ? t('winner') : t('gameOver')}</h1><div class="big">${last.passed} / ${last.startDoors - 1}</div><div class="label">${t('passedDoors')}</div>`;
    } else {
      const w = last.winners.map(byId).filter(Boolean);
      body = `<div class="kicker">${w.length > 1 ? t('challengeWinners') : t('challengeWinner')}</div>
        <h1 class="title">${w.map((p) => esc(p.name)).join(' · ') || '—'}</h1><div class="label" style="margin-top:10px">+${last.winGain} ${t('pts')}</div>
        <div class="m-winners">${w.map((p) => `<img data-p="${p.id}" alt="">`).join('')}</div>`;
    }
    const o = h('div', 'm-overlay ov-end', `<div class="m-card panel">${body}</div>`);
    this.q('[data-overlay]').appendChild(o);
    o.querySelectorAll('img[data-p]').forEach((img) => portraitOf(byId(img.dataset.p)?.profile).then((u) => { img.src = u; }));
    setTimeout(() => this.clearOverlay('end'), 6000);
  }

  overlayFinal(st) {
    this.q('[data-overlay]').innerHTML = '';
    const sorted = st.players.slice().sort((a, b) => b.points - a.points);
    const top = sorted[0];
    const solo = this.session.local;
    const hist = st.history[0];
    const o = h('div', 'm-overlay ov-final', `<div class="m-card panel m-final">
      <div class="kicker">${t('finalWinner')}</div>
      <h1 class="title">${esc(top?.name || '')}</h1>
      <div class="m-podium"><img data-top alt=""></div>
      <div class="label" style="margin:18px 0 8px">${t('standings')}</div>
      <table class="m-table">${sorted.map((p, i) => `<tr class="${p.id === this.myId ? 'me' : ''}"><td>${i + 1}</td><td>${esc(p.name)}${p.isBot ? ` <small>${t('bot')}</small>` : ''}</td><td>${p.points}</td></tr>`).join('')}</table>
      <div class="btns">${solo || this.isHost() ? `<button class="btn primary" data-again>${t('playAgainRoom')}</button>` : ''}<button class="btn" data-leave>${solo ? t('toMenu') : t('leaveRoom')}</button></div></div>`);
    this.q('[data-overlay]').appendChild(o);
    portraitOf(top?.profile).then((u) => { o.querySelector('[data-top]').src = u; });
    o.querySelector('[data-again]')?.addEventListener('click', () => this.onAgain?.());
    o.querySelector('[data-leave]').onclick = () => this.onExit();
    if (top?.id === this.myId) this.game.audio.victory();
    this.onFinal?.(st, hist);
  }

  dispose() {
    clearInterval(this.tick);
    this.unsub?.();
    this.view?.leave();
    this.view = null;
  }
}

export function esc(s) { return String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }
