import { ls } from './storage.js';
// Все звуки синтезируются в браузере (Web Audio) — файлов нет, грузить нечего.
// Голос ведущего — встроенный синтез речи браузера (русский голос).
let ctx, master, musicGain, musicTimer = null;
// ?mute=1 — полная тишина (для проверок): ни музыки, ни эффектов, ни голоса
const MUTE = new URLSearchParams(location.search).has('mute');
// ?check=1 — для проверок: каждая фраза проходит настоящий путь (поиск записи, загрузка, раскодирование),
// но не играет; итог — в window.__voiceTrace
const CHECK = new URLSearchParams(location.search).has('check');
const trace = (part, how, extra) => { if (CHECK) (window.__voiceTrace ||= []).push({ part, how, extra }); };
let musicOn = true;
musicOn = ls.getItem('school.music') !== '0';

function ac() {
  if (!ctx) {
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    master = ctx.createGain(); master.gain.value = MUTE ? 0 : 0.8;
    const comp = ctx.createDynamicsCompressor();
    master.connect(comp).connect(ctx.destination);
    musicGain = ctx.createGain(); musicGain.gain.value = 0.05;
    musicGain.connect(master);
  }
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}

function tone(freq, t0, dur, { type = 'sine', vol = 0.3, to = null, out = null, attack = 0.01 } = {}) {
  const c = ac();
  const o = c.createOscillator(), g = c.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t0);
  if (to) o.frequency.exponentialRampToValueAtTime(to, t0 + dur);
  g.gain.setValueAtTime(0, t0);
  g.gain.linearRampToValueAtTime(vol, t0 + attack);
  g.gain.exponentialRampToValueAtTime(0.0008, t0 + dur);
  o.connect(g).connect(out || master);
  o.start(t0); o.stop(t0 + dur + 0.05);
}

function noise(t0, dur, { vol = 0.4, freq = 1800, q = 1, type = 'bandpass', sweepTo = null } = {}) {
  const c = ac();
  const len = Math.ceil(c.sampleRate * dur);
  const buf = c.createBuffer(1, len, c.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  const src = c.createBufferSource(); src.buffer = buf;
  const f = c.createBiquadFilter(); f.type = type; f.frequency.setValueAtTime(freq, t0); f.Q.value = q;
  if (sweepTo) f.frequency.exponentialRampToValueAtTime(sweepTo, t0 + dur);
  const g = c.createGain();
  g.gain.setValueAtTime(vol, t0); g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
  src.connect(f).connect(g).connect(master);
  src.start(t0);
}

const N = (n) => 440 * 2 ** ((n - 69) / 12); // MIDI → Гц

export const sfx = {
  tap() { const t = ac().currentTime; tone(880, t, 0.08, { type: 'triangle', vol: 0.25, to: 1300 }); },
  pop() { const t = ac().currentTime; tone(500, t, 0.12, { vol: 0.35, to: 1400 }); },
  good() {
    const t = ac().currentTime;
    [72, 76, 79, 84].forEach((n, i) => tone(N(n), t + i * 0.09, 0.35, { type: 'triangle', vol: 0.3 }));
    [96, 100, 103].forEach((n, i) => tone(N(n), t + 0.36 + i * 0.05, 0.25, { vol: 0.12 }));
  },
  bad() {
    const t = ac().currentTime;
    tone(330, t, 0.22, { type: 'triangle', vol: 0.25, to: 300 });
    tone(262, t + 0.2, 0.35, { type: 'triangle', vol: 0.25, to: 200 });
  },
  clap() { const t = ac().currentTime; noise(t, 0.12, { vol: 0.9, freq: 1500, q: 0.8 }); noise(t + 0.01, 0.08, { vol: 0.5, freq: 3000 }); },
  whoosh() { const t = ac().currentTime; noise(t, 0.5, { vol: 0.35, freq: 400, sweepTo: 4000, q: 2 }); },
  star() {
    const t = ac().currentTime;
    for (let i = 0; i < 6; i++) tone(N(88 + i * 2), t + i * 0.04, 0.3, { vol: 0.08 });
  },
  choo() {
    const t = ac().currentTime;
    for (const [d, dur] of [[0, 0.35], [0.45, 0.6]]) {
      tone(N(74), t + d, dur, { type: 'sawtooth', vol: 0.06, attack: 0.05 });
      tone(N(78), t + d, dur, { type: 'sawtooth', vol: 0.05, attack: 0.05 });
      tone(N(81), t + d, dur, { type: 'square', vol: 0.03, attack: 0.05 });
    }
    for (let i = 0; i < 6; i++) noise(t + 1.1 + i * 0.16, 0.1, { vol: 0.25, freq: 900, q: 0.7 });
  },
  fanfare() {
    const t = ac().currentTime;
    const mel = [[67, 0, 0.15], [72, 0.15, 0.15], [76, 0.3, 0.15], [79, 0.45, 0.35], [76, 0.8, 0.15], [79, 0.95, 0.7]];
    mel.forEach(([n, d, dur]) => { tone(N(n), t + d, dur + 0.1, { type: 'square', vol: 0.09 }); tone(N(n - 12), t + d, dur + 0.1, { type: 'triangle', vol: 0.15 }); });
    [60, 64, 67, 72].forEach((n) => tone(N(n), t + 0.95, 1.2, { type: 'triangle', vol: 0.1 }));
    for (let i = 0; i < 14; i++) tone(N(84 + (i * 5) % 17), t + 1 + i * 0.06, 0.25, { vol: 0.05 });
  },
};

// Тихая музыкальная шкатулка на фоне. Во время речи притихает.
const SONG = [
  [72, 76, 79, 76], [74, 77, 81, 77], [72, 76, 79, 84], [83, 79, 74, 79],
  [72, 76, 79, 76], [77, 81, 84, 81], [79, 76, 72, 76], [74, 71, 67, 71],
];
const BASS = [48, 53, 48, 55, 48, 53, 48, 55];
function musicLoop() {
  const c = ac();
  const beat = 0.42;
  let t = c.currentTime + 0.05;
  SONG.forEach((bar, b) => {
    tone(N(BASS[b]), t, beat * 4, { type: 'triangle', vol: 0.5, out: musicGain, attack: 0.05 });
    bar.forEach((n, i) => tone(N(n), t + i * beat, beat * 1.8, { vol: 0.45, out: musicGain }));
    t += beat * 4;
  });
  musicTimer = setTimeout(musicLoop, (t - c.currentTime - 0.1) * 1000);
}
export function setMusic(on) {
  musicOn = on;
  ls.setItem('school.music', on ? '1' : '0');
  if (on && !musicTimer) musicLoop();
  if (!on && musicTimer) { clearTimeout(musicTimer); musicTimer = null; }
}
export const isMusicOn = () => musicOn;
export function startAudio() { ac(); if (musicOn && !musicTimer && !MUTE) musicLoop(); }

function duck(on) {
  if (!musicGain) return;
  const t = ctx.currentTime;
  musicGain.gain.cancelScheduledValues(t);
  musicGain.gain.linearRampToValueAtTime(on ? 0.015 : 0.05, t + 0.2);
}

// ---------- голос ----------
// Все фразы заранее записаны нейронным голосом (tools/build_voice.py → assets/voice/*.mp3,
// список — assets/voice/index.json). Чего нет в записях — говорит встроенный голос браузера.
let voiceIndex = {};
const indexReady = fetch('assets/voice/index.json', { cache: 'no-cache' }).then((r) => (r.ok ? r.json() : {})).then((j) => { voiceIndex = j; }).catch(() => {});
const buffers = new Map();
let current = null;
function loadVoice(file) {
  if (!buffers.has(file)) {
    buffers.set(file, fetch('assets/voice/' + file).then((r) => r.arrayBuffer())
      .then((b) => new Promise((res, rej) => { const p = ac().decodeAudioData(b, res, rej); if (p && p.catch) p.catch(() => {}); })) // ошибку уже передаёт rej
      .catch((e) => { buffers.delete(file); throw e; }));
  }
  return buffers.get(file);
}
export function preloadVoice(texts) { texts.forEach((t) => { const f = voiceIndex[t.trim()]; if (f) loadVoice(f).catch(() => {}); }); }
function playFile(file, isMine) {
  return loadVoice(file).then((buf) => new Promise((res) => {
    if (!isMine()) return res();
    const src = ac().createBufferSource();
    src.buffer = buf;
    src.connect(master);
    current = src;
    let done = false;
    const fin = () => { if (!done) { done = true; if (current === src) current = null; res(); } };
    src.onended = fin;
    setTimeout(fin, buf.duration * 1000 + 400);
    src.start();
  }));
}

let voice = null;
function pickVoice() {
  const vs = speechSynthesis.getVoices().filter((v) => /^ru/i.test(v.lang));
  const pref = [/svetlana.*natural|natural.*svetlana/i, /dariya.*natural/i, /natural/i, /google/i, /milena/i, /svetlana/i, /irina/i];
  voice = pref.map((r) => vs.find((v) => r.test(v.name))).find(Boolean) || vs[0] || null;
}
if ('speechSynthesis' in window) {
  pickVoice();
  speechSynthesis.onvoiceschanged = pickVoice;
}
function speakTTS(text, rate, pitch, isMine) {
  return new Promise((res) => {
    if (!('speechSynthesis' in window) || !isMine()) return res();
    (window.__voiceMissing ||= new Set()).add(text);
    const u = new SpeechSynthesisUtterance(text);
    u.lang = 'ru-RU';
    if (voice) u.voice = voice;
    u.rate = rate; u.pitch = pitch;
    let done = false;
    const fin = () => { if (!done) { done = true; res(); } };
    u.onend = fin; u.onerror = fin;
    setTimeout(fin, 900 + text.length * 160); // страховка: onend иногда не приходит
    speechSynthesis.speak(u);
  });
}

let speakId = 0;
// Говорит фразы по очереди (число в списке — пауза в мс); промис заканчивается, когда всё сказано
// или когда началась новая речь — старая прерывается.
export function say(parts, { rate = 0.9, pitch = 1.1 } = {}) {
  const my = ++speakId;
  const isMine = () => CHECK || my === speakId; // в проверке каждую фразу доводим до конца, даже если её перебили
  stopVoice();
  const list = (Array.isArray(parts) ? parts : [parts]).filter((p) => p || p === 0);
  if (window.__sayLog) window.__sayLog.push(...list.filter((p) => typeof p === 'string')); // для проверок: что говорилось
  duck(true);
  return list.reduce((p, part) => p.then(() => {
    if (!isMine()) return;
    return Promise.race([indexReady, new Promise((r) => setTimeout(r, 3000))]);
  }).then(() => {
    if (!isMine()) return;
    if (typeof part === 'number') return new Promise((r) => setTimeout(r, part));
    if (MUTE) return new Promise((r) => setTimeout(r, 30));
    if (CHECK) {
      const f = voiceIndex[part.trim()];
      if (!f) { trace(part, 'НЕТ ЗАПИСИ'); return; }
      return loadVoice(f).then((b) => trace(part, b.duration > 0.15 ? 'ok' : 'ПУСТО', +b.duration.toFixed(2)), (e) => trace(part, 'ОШИБКА ЗАГРУЗКИ', String(e)));
    }
    const file = voiceIndex[part.trim()];
    return (file ? playFile(file, isMine).catch(() => speakTTS(part, rate, pitch, isMine)) : speakTTS(part, rate, pitch, isMine))
      .then(() => new Promise((r) => setTimeout(r, 140))); // короткий вдох между фразами
  }), Promise.resolve()).then(() => { if (isMine()) duck(false); });
}
function stopVoice() {
  if ('speechSynthesis' in window) speechSynthesis.cancel();
  if (current) { try { current.stop(); } catch {} current = null; }
}
export function hush() { speakId++; stopVoice(); duck(false); }
