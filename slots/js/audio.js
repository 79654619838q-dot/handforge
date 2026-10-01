// Звуки автомата синтезируются в браузере (Web Audio) — файлов нет.
// ?mute=1 — полная тишина (для проверок).
import { state } from './state.js';

const MUTE = new URLSearchParams(location.search).has('mute');
let ctx, master, spinLoop = null, antLoop = null;

function ac() {
  if (!ctx) {
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    master = ctx.createGain();
    master.gain.value = 0.7;
    const comp = ctx.createDynamicsCompressor();
    master.connect(comp).connect(ctx.destination);
  }
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}

const on = () => !MUTE && state.sound;

function tone(freq, t0, dur, { type = 'sine', vol = 0.3, to = null, attack = 0.005 } = {}) {
  const c = ac();
  const o = c.createOscillator(), g = c.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t0);
  if (to) o.frequency.exponentialRampToValueAtTime(to, t0 + dur);
  g.gain.setValueAtTime(0, t0);
  g.gain.linearRampToValueAtTime(vol, t0 + attack);
  g.gain.exponentialRampToValueAtTime(0.0008, t0 + dur);
  o.connect(g).connect(master);
  o.start(t0); o.stop(t0 + dur + 0.05);
}

let noiseBuf = null;
function noise(t0, dur, { vol = 0.3, freq = 1800, q = 1, type = 'bandpass', sweepTo = null } = {}) {
  const c = ac();
  if (!noiseBuf) {
    noiseBuf = c.createBuffer(1, c.sampleRate, c.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  const src = c.createBufferSource(); src.buffer = noiseBuf;
  const f = c.createBiquadFilter(); f.type = type; f.frequency.setValueAtTime(freq, t0); f.Q.value = q;
  if (sweepTo) f.frequency.exponentialRampToValueAtTime(sweepTo, t0 + dur);
  const g = c.createGain();
  g.gain.setValueAtTime(vol, t0); g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
  src.connect(f).connect(g).connect(master);
  src.start(t0, Math.random() * 0.5, dur + 0.05);
}

const N = (n) => 440 * 2 ** ((n - 69) / 12); // MIDI → Гц

function arp(notes, step, dur, opt) {
  const t = ac().currentTime;
  notes.forEach((n, i) => tone(N(n), t + i * step, dur, opt));
}

export const sfx = {
  click() { if (!on()) return; const t = ac().currentTime; tone(1400, t, 0.04, { type: 'square', vol: 0.05 }); },
  bet(up) { if (!on()) return; const t = ac().currentTime; tone(up ? 700 : 500, t, 0.07, { type: 'triangle', vol: 0.2, to: up ? 1000 : 380 }); },

  // шорох вращения: частые щелчки, пока крутится хоть один барабан
  spinStart(turbo) {
    if (!on()) return;
    const t = ac().currentTime;
    noise(t, 0.35, { vol: 0.25, freq: 600, sweepTo: 3000, q: 1.5 });
    this.spinStop();
    let k = 0;
    spinLoop = setInterval(() => {
      if (!on()) return;
      const tt = ac().currentTime;
      noise(tt, 0.03, { vol: 0.09, freq: 2600 + (k++ % 3) * 400, q: 4 });
    }, turbo ? 45 : 65);
  },
  spinStop() { if (spinLoop) clearInterval(spinLoop); spinLoop = null; },

  reelStop() {
    if (!on()) return;
    const t = ac().currentTime;
    tone(150, t, 0.16, { vol: 0.45, to: 55 });
    noise(t, 0.06, { vol: 0.35, freq: 1200, q: 0.8 });
  },
  // особый символ лёг на барабан: чем больше уже легло, тем выше звон
  scatterLand(n) {
    if (!on()) return;
    const base = [76, 79, 83, 86, 88][Math.min(n - 1, 4)];
    arp([base, base + 7, base + 12], 0.05, 0.5, { type: 'triangle', vol: 0.22 });
  },
  jackpotLand(n) {
    if (!on()) return;
    const t = ac().currentTime;
    for (let i = 0; i < 4 + n; i++) tone(N(84 + i * 2 + n), t + i * 0.03, 0.35, { vol: 0.07 });
  },
  // ожидание на последних барабанах: дрожащий нарастающий гул
  anticipation(start) {
    if (antLoop) { clearInterval(antLoop); antLoop = null; }
    if (!start || !on()) return;
    let k = 0;
    antLoop = setInterval(() => {
      if (!on()) return;
      const t = ac().currentTime;
      tone(N(60 + (k % 2 ? 7 : 0) + Math.floor(k / 6)), t, 0.14, { type: 'sawtooth', vol: 0.05 });
      k++;
    }, 110);
  },

  win(level) { // 0 — мелкий, 1 — заметный, 2 — крупный
    if (!on()) return;
    if (level === 0) arp([72, 76, 79], 0.07, 0.25, { type: 'triangle', vol: 0.22 });
    else if (level === 1) arp([72, 76, 79, 84, 88], 0.07, 0.35, { type: 'triangle', vol: 0.25 });
    else {
      arp([60, 64, 67, 72, 76, 79, 84], 0.09, 0.5, { type: 'square', vol: 0.08 });
      arp([72, 76, 79, 84, 88, 91, 96], 0.09, 0.45, { type: 'triangle', vol: 0.22 });
    }
  },
  tick() { if (!on()) return; const t = ac().currentTime; tone(2200 + Math.random() * 600, t, 0.03, { vol: 0.05 }); },
  coins() {
    if (!on()) return;
    const t = ac().currentTime;
    for (let i = 0; i < 14; i++) tone(2400 + Math.random() * 1800, t + i * 0.045 + Math.random() * 0.02, 0.09, { vol: 0.06, type: 'triangle' });
  },
  fanfare() {
    if (!on()) return;
    const t = ac().currentTime;
    const seq = [[67, 0], [72, 0.15], [76, 0.3], [79, 0.45], [76, 0.65], [79, 0.8], [84, 1.0]];
    seq.forEach(([n, d]) => {
      tone(N(n), t + d, 0.5, { type: 'sawtooth', vol: 0.06 });
      tone(N(n + 12), t + d, 0.45, { type: 'triangle', vol: 0.15 });
    });
    tone(N(48), t + 1.0, 1.2, { type: 'triangle', vol: 0.25 });
  },
  // «?» переворачиваются
  reveal() {
    if (!on()) return;
    const t = ac().currentTime;
    noise(t, 0.4, { vol: 0.25, freq: 800, sweepTo: 5000, q: 3 });
    arp([79, 83, 86, 91], 0.06, 0.3, { type: 'triangle', vol: 0.15 });
  },
  // прилетели подарочные WILD
  gift() {
    if (!on()) return;
    const t = ac().currentTime;
    for (let i = 0; i < 4; i++) { noise(t + i * 0.12, 0.15, { vol: 0.2, freq: 2500, sweepTo: 600, q: 2 }); tone(N(84 + i * 3), t + i * 0.12 + 0.1, 0.25, { type: 'triangle', vol: 0.15 }); }
  },
  // маска растягивается на весь барабан
  expand() {
    if (!on()) return;
    const t = ac().currentTime;
    tone(110, t, 0.6, { type: 'sawtooth', vol: 0.12, to: 440 });
    tone(220, t + 0.05, 0.6, { type: 'triangle', vol: 0.2, to: 880 });
  },
  // множитель сработал
  mult(k = 2) {
    if (!on()) return;
    const base = 72 + Math.min(12, k * 2);
    arp([base, base + 4, base + 7, base + 12, base + 16], 0.05, 0.3, { type: 'square', vol: 0.07 });
  },
  chest() {
    if (!on()) return;
    const t = ac().currentTime;
    noise(t, 0.12, { vol: 0.3, freq: 500, q: 1 });
    tone(330, t, 0.15, { type: 'triangle', vol: 0.2, to: 660 });
  },
  prize(big) {
    if (!on()) return;
    arp(big ? [76, 79, 84, 88, 91] : [79, 84, 88], 0.05, 0.3, { type: 'triangle', vol: 0.22 });
  },
  empty() {
    if (!on()) return;
    const t = ac().currentTime;
    tone(300, t, 0.3, { type: 'triangle', vol: 0.2, to: 180 });
  },
  levelUp() {
    if (!on()) return;
    arp([72, 76, 79, 84, 79, 84, 88], 0.08, 0.35, { type: 'triangle', vol: 0.22 });
  },
  medal() {
    if (!on()) return;
    arp([88, 91, 96], 0.07, 0.4, { type: 'sine', vol: 0.2 });
  },
  wheelTick() {
    if (!on()) return;
    const t = ac().currentTime;
    tone(1800, t, 0.03, { type: 'square', vol: 0.04 });
  },
  jackpot() {
    if (!on()) return;
    this.fanfare();
    const t = ac().currentTime + 1.2;
    for (let i = 0; i < 24; i++) tone(N(84 + (i % 8) * 2), t + i * 0.06, 0.4, { vol: 0.06 });
    tone(N(36), t, 2, { type: 'triangle', vol: 0.3 });
  },
};

// Браузер разрешает звук только после первого нажатия
addEventListener('pointerdown', () => { if (on()) ac(); }, { once: true });
