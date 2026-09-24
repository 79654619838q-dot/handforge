import { h } from './UIManager.js';
import { t } from '../i18n.js';
import { CHALLENGE_IDS } from '../../shared/match.js';
import { CELL_COUNTS } from './GameModeManager.js';
import { cname, portraitOf, esc } from '../team/MatchView.js';

// Состояния комнаты (ведёт сервер hub/cell-server.js).
export const ROOM = { WAITING: 'WAITING', READY: 'READY', PLAYING: 'PLAYING', FINISHED: 'FINISHED' };

// Командная игра: список комнат, создание, комната ожидания.
export class LobbyManager {
  constructor(game) {
    this.game = game;
    this.draft = { name: '', cells: 25, maxPlayers: 8, chain: CHALLENGE_IDS.slice() };
  }

  get net() { return this.game.net(); }

  status(s) {
    let el = document.querySelector('.lb-status');
    if (!el) { el = h('div', 'lb-status'); document.body.appendChild(el); }
    el.textContent = s === 'offline' ? t('offline') : '';
  }

  errorText(e) { return t('err' + e) !== 'err' + e ? t('err' + e) : e || '?'; }

  lobbyScreen() {
    const s = h('div', 'screen vignette');
    s.id = 'lobby';
    const d = this.draft;
    if (!d.name) d.name = `${this.game.save.profile.name}`.slice(0, 20);
    const chip = (k, v, label, on) => `<button class="chip ${on ? 'on' : ''}" data-k="${k}" data-v="${v}">${label}</button>`;
    s.innerHTML = `
      <div class="topbar"><h1 class="title">${t('team')}</h1><div class="spacer"></div><button class="btn ghost" data-back>${t('back')}</button></div>
      <div class="lb-wrap">
        <div class="panel">
          <div class="kicker">${t('createRoom')}</div>
          <div class="field" style="margin-top:14px"><span class="label">${t('roomName')}</span><input class="input" maxlength="28" data-name value="${esc(d.name)}"></div>
          <div class="field"><span class="label">${t('chainTitle')}</span><div class="lb-chain" data-chain>${CHALLENGE_IDS.map((c) => chip('chain', c, cname(c), d.chain.includes(c))).join('')}</div></div>
          <div class="field"><span class="label">${t('cellsCount')} · ${cname('lastcell')}</span><div class="chips" data-cells>${CELL_COUNTS.map((n) => chip('cells', n, n, n === d.cells)).join('')}</div></div>
          <div class="field"><span class="label">${t('maxPlayers')}</span><div class="chips" data-max>${[2, 4, 6, 8, 12, 16, 20].map((n) => chip('max', n, n, n === d.maxPlayers)).join('')}</div></div>
          <button class="btn primary" data-create style="width:100%">${t('create')}</button>
        </div>
        <div class="panel">
          <div class="kicker">${t('rooms')}</div>
          <div class="lb-list" data-list style="margin-top:14px"></div>
          <div class="lb-row"><input class="input" maxlength="5" placeholder="${t('enterCode')}" data-code style="text-transform:uppercase"><button class="btn" data-join>${t('join')}</button></div>
          <div class="cv-out" data-err></div>
        </div>
      </div>`;
    const err = (e) => { s.querySelector('[data-err]').textContent = e ? this.errorText(e) : ''; };
    s.querySelector('[data-back]').onclick = () => this.game.goModes();
    s.querySelector('[data-name]').oninput = (e) => { d.name = e.target.value; };
    s.querySelector('[data-chain]').onclick = (e) => {
      const b = e.target.closest('.chip'); if (!b) return;
      const c = b.dataset.v;
      d.chain = d.chain.includes(c) ? d.chain.filter((x) => x !== c) : CHALLENGE_IDS.filter((x) => x === c || d.chain.includes(x));
      if (!d.chain.length) d.chain = [c];
      s.querySelectorAll('[data-chain] .chip').forEach((x) => x.classList.toggle('on', d.chain.includes(x.dataset.v)));
    };
    const single = (sel, key) => s.querySelector(sel).onclick = (e) => {
      const b = e.target.closest('.chip'); if (!b) return;
      d[key] = Number(b.dataset.v);
      s.querySelectorAll(`${sel} .chip`).forEach((x) => x.classList.toggle('on', x === b));
    };
    single('[data-cells]', 'cells');
    single('[data-max]', 'maxPlayers');
    s.querySelector('[data-create]').onclick = async () => {
      const r = await this.net.call('create', d);
      if (r?.ok) this.game.goRoom(); else err(r?.error);
    };
    const join = async (id) => {
      const r = await this.net.call('join', { roomId: id });
      if (r?.ok) this.game.goRoom(); else err(r?.error);
    };
    s.querySelector('[data-join]').onclick = () => join(s.querySelector('[data-code]').value.trim().toUpperCase());
    const list = s.querySelector('[data-list]');
    const renderList = (rooms) => {
      list.innerHTML = rooms?.length ? rooms.map((r) => `<div class="lb-room"><b>${esc(r.name)}</b><button class="btn ghost" data-id="${r.id}">${t('join')}</button>
        <small>${t('host')}: ${esc(r.host)} · ${t('players')}: ${r.players}/${r.max} · ${r.chain.length} ${t('challenge').toLowerCase()}</small></div>`).join('')
        : `<div class="label" style="padding:14px 0">${t('noRooms')}</div>`;
      list.querySelectorAll('[data-id]').forEach((b) => b.onclick = () => join(b.dataset.id));
    };
    this.offRooms = this.net.on('rooms', renderList);
    this.net.call('rooms').then((r) => Array.isArray(r) && renderList(r));
    return s;
  }

  roomScreen() {
    const s = h('div', 'screen vignette');
    s.id = 'room';
    s.innerHTML = `
      <div class="topbar"><h1 class="title" data-title></h1><div class="spacer"></div><button class="btn ghost" data-leave>${t('leaveRoom')}</button></div>
      <div class="lb-wrap">
        <div class="panel">
          <div class="label">${t('code')}</div><div class="rm-code" data-code></div>
          <div class="lb-row" style="margin-top:6px"><button class="btn ghost" data-copy>${t('inviteLink')}</button></div>
          <div class="field" style="margin-top:16px"><span class="label">${t('chainTitle')}</span><div class="label" style="color:var(--ink);letter-spacing:.05em;text-transform:none;font-size:15px" data-chain></div></div>
          <div class="kicker" data-status style="margin-top:10px"></div>
          <div class="rm-actions" data-actions></div>
          <div class="label" style="margin-top:12px" data-hint>${t('startHint')}</div>
        </div>
        <div class="panel"><div class="label" style="margin-bottom:10px">${t('players')} <span data-count></span></div><div class="rm-players" data-players></div></div>
      </div>`;
    s.querySelector('[data-leave]').onclick = async () => { await this.net.call('leave'); this.game.goLobby(); };
    const render = (r) => {
      if (!r || !s.isConnected && this.rendered) return;
      this.rendered = true;
      const me = this.net.myId;
      const host = r.hostId === me;
      s.querySelector('[data-title]').textContent = r.name;
      s.querySelector('[data-code]').textContent = r.id;
      s.querySelector('[data-chain]').textContent = r.chain.map(cname).join(' → ');
      s.querySelector('[data-status]').textContent = t('status' + r.status);
      s.querySelector('[data-count]').textContent = `${r.members.length}/${r.maxPlayers}`;
      const mine = r.members.find((m) => m.id === me);
      const acts = s.querySelector('[data-actions]');
      acts.innerHTML = host
        ? `<button class="btn" data-bot ${r.members.length >= r.maxPlayers ? 'disabled' : ''}>${t('addBot')}</button><button class="btn primary" data-start ${r.status !== 'READY' ? 'disabled' : ''}>${t('startGame')}</button>`
        : `<button class="btn ${mine?.ready ? '' : 'primary'}" data-ready>${mine?.ready ? t('notReady') : t('ready')}</button>`;
      acts.querySelector('[data-bot]')?.addEventListener('click', () => this.net.send('addBot'));
      acts.querySelector('[data-start]')?.addEventListener('click', () => this.net.call('start'));
      acts.querySelector('[data-ready]')?.addEventListener('click', () => this.net.send('ready', { ready: !mine?.ready }));
      const box = s.querySelector('[data-players]');
      box.innerHTML = r.members.map((m) => `<div class="rm-p" data-p="${m.id}">${m.id === r.hostId ? '<span class="crown">♛</span>' : ''}
        ${host && m.isBot ? `<button class="x" data-rm="${m.id}">✕</button>` : ''}<img alt=""><b>${esc(m.name)}${m.isBot ? ` <small>${t('bot')}</small>` : ''}</b>
        <span class="st ${m.ready ? 'r' : 'n'}">${m.connected ? (m.ready ? t('ready') : t('notReady')) : '⚡'}</span></div>`).join('');
      box.querySelectorAll('[data-rm]').forEach((b) => b.onclick = () => this.net.send('removeBot', { id: b.dataset.rm }));
      for (const m of r.members) portraitOf(m.profile).then((u) => { const img = box.querySelector(`[data-p="${m.id}"] img`); if (img && u) img.src = u; });
    };
    s.querySelector('[data-copy]').onclick = async () => {
      const url = `${location.origin}${import.meta.env.BASE_URL}?room=${this.net.room?.id || ''}`;
      try { await navigator.clipboard.writeText(url); s.querySelector('[data-copy]').textContent = t('copied'); }
      catch { prompt(t('inviteLink'), url); }
    };
    this.offRoom = this.net.on('room', render);
    render(this.net.room);
    return s;
  }

  cleanup() { this.offRooms?.(); this.offRoom?.(); this.offRooms = this.offRoom = null; this.rendered = false; }
}
