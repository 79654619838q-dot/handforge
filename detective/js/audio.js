// Голос персонажей (заранее записанные mp3 — tools/build_voice.py), субтитры, звуки и фоновая музыка.
import { load } from './store.js';
import { person } from './data/people.js';
import { h, qs } from './util.js';

const MUTE = qs.has('mute');
const FAST = qs.has('fast');
let index = null;
const indexReady = fetch('assets/voice/index.json', { cache: 'no-cache' }).then((r) => (r.ok ? r.json() : {})).then((j) => { index = j; }).catch(() => { index = {}; });
window.__voiceMissing = [];
window.__sayLog = [];

let subs, subName, subText, cur = null, skipFn = null;
function ensureSubs() {
  if (subs) return;
  subName = h('div.sub-name');
  subText = h('div.sub-text');
  subs = h('div#subs', { onclick: () => skipFn?.() }, subName, subText, h('div.sub-skip', 'нажмите, чтобы пропустить'));
  document.body.append(subs);
}

// listeners: портрет на допросе меняет выражение по настроению реплики
const lineListeners = new Set();
export const onLine = (fn) => { lineListeners.add(fn); return () => lineListeners.delete(fn); };

let queue = Promise.resolve();
let token = 0;
export function stopSpeech() { token++; skipFn?.(); if (cur) { cur.pause(); cur = null; } subs?.classList.remove('show'); }

// проиграть реплики по очереди; новая очередь не прерывает текущую, а встаёт за ней
export function say(lines) {
  if (!lines?.length) return Promise.resolve();
  const my = token;
  queue = queue.then(() => playAll(lines, my));
  return queue;
}

async function playAll(lines, my) {
  await indexReady;
  ensureSubs();
  if (my !== token) return; // очередь отменена, пока ждала своей очереди
  for (const [who, text, mood] of lines) {
    if (my !== token) break;
    const p = person(who);
    window.__sayLog.push(who + '|' + text);
    for (const fn of lineListeners) fn(who, mood || 'calm');
    subName.textContent = p.name;
    subName.dataset.who = who;
    subText.textContent = text;
    // без субтитров остаётся только имя говорящего
    subs.classList.add('show');
    subs.classList.toggle('nosubs', !load().settings.subs);
    await playOne(who, text);
  }
  // прятать всегда: следующая очередь начнётся только после этой и сама покажет свою строку
  subs.classList.remove('show');
  for (const fn of lineListeners) fn(null, 'calm');
}

function playOne(who, text) {
  return new Promise((resolve) => {
    let done = false;
    const finish = () => { if (done) return; done = true; skipFn = null; if (cur) { cur.pause(); cur = null; } setTimeout(resolve, FAST ? 0 : 180); };
    skipFn = finish;
    const file = index?.[who + '|' + text];
    const vol = load().settings.voice;
    const timed = () => setTimeout(finish, FAST ? 30 : Math.max(1600, text.length * 62));
    if (!file) { window.__voiceMissing.push(who + '|' + text); timed(); return; }
    if (MUTE || vol <= 0) { timed(); return; }
    const a = new Audio('assets/voice/' + file);
    a.volume = vol;
    cur = a;
    a.onended = finish;
    a.onerror = () => { window.__voiceMissing.push('ERR ' + who + '|' + text); timed(); };
    a.play().catch(() => timed());
  });
}

// ——— звуки (синтез Web Audio, без файлов) ———
let ctx = null, master = null, musicGain = null, amb = null;
function ac() {
  if (MUTE) return null;
  if (!ctx) {
    try {
      ctx = new (window.AudioContext || window.webkitAudioContext)();
      master = ctx.createGain(); master.gain.value = 0.6; master.connect(ctx.destination);
      musicGain = ctx.createGain(); musicGain.gain.value = load().settings.music; musicGain.connect(ctx.destination);
    } catch { return null; }
  }
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}
document.addEventListener('pointerdown', () => { ac(); }, { once: true });

function tone(freq, dur, type = 'sine', vol = 0.2, when = 0, slide = 0) {
  const c = ac(); if (!c) return;
  const t = c.currentTime + when;
  const o = c.createOscillator(), g = c.createGain();
  o.type = type; o.frequency.setValueAtTime(freq, t);
  if (slide) o.frequency.exponentialRampToValueAtTime(freq * slide, t + dur);
  g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vol, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g); g.connect(master); o.start(t); o.stop(t + dur + 0.05);
}
function noise(dur, vol = 0.15, freq = 1200, when = 0) {
  const c = ac(); if (!c) return;
  const t = c.currentTime + when;
  const b = c.createBuffer(1, c.sampleRate * dur, c.sampleRate);
  const d = b.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length);
  const s = c.createBufferSource(); s.buffer = b;
  const f = c.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = freq;
  const g = c.createGain(); g.gain.value = vol;
  s.connect(f); f.connect(g); g.connect(master); s.start(t);
}

export const sfx = {
  click: () => tone(660, 0.06, 'triangle', 0.08),
  found: () => { tone(523, 0.18, 'sine', 0.18); tone(784, 0.25, 'sine', 0.16, 0.09); tone(1046, 0.4, 'sine', 0.12, 0.18); },
  miss: () => noise(0.12, 0.06, 500),
  wrong: () => { tone(220, 0.25, 'sawtooth', 0.09); tone(196, 0.3, 'sawtooth', 0.08, 0.12); },
  right: () => { tone(392, 0.15, 'triangle', 0.15); tone(587, 0.3, 'triangle', 0.15, 0.1); },
  stamp: () => { noise(0.2, 0.35, 180); tone(90, 0.25, 'sine', 0.3); },
  paper: () => noise(0.25, 0.08, 3000),
  sting: () => { tone(110, 1.6, 'sawtooth', 0.07, 0, 0.5); tone(164, 1.6, 'sawtooth', 0.05, 0.05, 0.5); noise(1.2, 0.05, 300); },
  win: () => [523, 659, 784, 1046].forEach((f, i) => tone(f, 0.5, 'triangle', 0.12, i * 0.12)),
  lose: () => [392, 349, 311, 262].forEach((f, i) => tone(f, 0.6, 'sine', 0.12, i * 0.18)),
};

// фоновый гул: два расстроенных тона + «дождь»; mood: 'calm' | 'tense'
export function ambient(mood = 'calm') {
  const c = ac(); if (!c) return;
  if (amb?.mood === mood) return;
  stopAmbient();
  const g = c.createGain(); g.gain.value = 0; g.connect(musicGain);
  const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = mood === 'tense' ? 520 : 380; f.connect(g);
  const base = mood === 'tense' ? 55 : 49;
  const oscs = [base, base * 1.5 + 0.7, base * 2.01].map((fr) => { const o = c.createOscillator(); o.type = 'sawtooth'; o.frequency.value = fr; o.connect(f); o.start(); return o; });
  const lfo = c.createOscillator(); lfo.frequency.value = 0.07; const lg = c.createGain(); lg.gain.value = 120; lfo.connect(lg); lg.connect(f.frequency); lfo.start();
  const len = c.sampleRate * 2, b = c.createBuffer(1, len, c.sampleRate), d = b.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  const rain = c.createBufferSource(); rain.buffer = b; rain.loop = true;
  const rf = c.createBiquadFilter(); rf.type = 'highpass'; rf.frequency.value = 2500;
  const rg = c.createGain(); rg.gain.value = 0.05; rain.connect(rf); rf.connect(rg); rg.connect(g); rain.start();
  g.gain.linearRampToValueAtTime(0.12, c.currentTime + 3);
  amb = { mood, g, nodes: [...oscs, lfo, rain] };
}
export function stopAmbient() {
  if (!amb || !ctx) return;
  const a = amb; amb = null;
  a.g.gain.linearRampToValueAtTime(0, ctx.currentTime + 1);
  setTimeout(() => a.nodes.forEach((n) => { try { n.stop(); } catch { } }), 1200);
}
export function setMusicVolume(v) { if (musicGain) musicGain.gain.value = v; }
