// Звуки синтезом Web Audio — без файлов. ?mute=1 или кнопка в верхней полосе выключают.
let ctx = null;
let muted = new URLSearchParams(location.search).has('mute');
try { if (localStorage.getItem('realm.mute') === '1') muted = true; } catch { }
export const isMuted = () => muted;
export function toggleMute() { muted = !muted; try { localStorage.setItem('realm.mute', muted ? '1' : '0'); } catch { } return muted; }

function ac() {
  if (muted) return null;
  if (!ctx) { try { ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch { return null; } }
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}
function tone(f, d, { type = 'sine', vol = 0.15, slide = 0, delay = 0 } = {}) {
  const c = ac(); if (!c) return;
  const t = c.currentTime + delay;
  const o = c.createOscillator(), g = c.createGain();
  o.type = type; o.frequency.setValueAtTime(f, t);
  if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, f + slide), t + d);
  g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + d);
  o.connect(g).connect(c.destination); o.start(t); o.stop(t + d + 0.02);
}
function noise(d, { vol = 0.25, freq = 1200, delay = 0 } = {}) {
  const c = ac(); if (!c) return;
  const t = c.currentTime + delay;
  const b = c.createBuffer(1, Math.floor(c.sampleRate * d), c.sampleRate);
  const a = b.getChannelData(0); for (let i = 0; i < a.length; i++) a[i] = (Math.random() * 2 - 1) * (1 - i / a.length);
  const s = c.createBufferSource(); s.buffer = b;
  const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = freq;
  const g = c.createGain(); g.gain.value = vol;
  s.connect(f).connect(g).connect(c.destination); s.start(t);
}
export const sfx = {
  click: () => tone(520, 0.06, { type: 'triangle', vol: 0.06 }),
  hit: () => { noise(0.18, { freq: 900 }); tone(140, 0.15, { type: 'square', vol: 0.08, slide: -60 }); },
  crit: () => { noise(0.3, { freq: 2200, vol: 0.35 }); tone(90, 0.3, { type: 'sawtooth', vol: 0.12, slide: -40 }); },
  hurt: () => { noise(0.22, { freq: 500, vol: 0.3 }); tone(110, 0.2, { type: 'sawtooth', vol: 0.08, slide: -50 }); },
  magic: () => { tone(300, 0.4, { type: 'sine', vol: 0.12, slide: 900 }); noise(0.4, { freq: 3000, vol: 0.1 }); },
  heal: () => { [523, 659, 784].forEach((f, i) => tone(f, 0.3, { vol: 0.08, delay: i * 0.08 })); },
  coin: () => { tone(988, 0.08, { type: 'square', vol: 0.05 }); tone(1319, 0.2, { type: 'square', vol: 0.05, delay: 0.07 }); },
  reveal: () => { [392, 523, 659, 784, 1046].forEach((f, i) => tone(f, 0.5, { type: 'triangle', vol: 0.07, delay: i * 0.09 })); },
  level: () => { [523, 659, 784, 1046, 1319].forEach((f, i) => tone(f, 0.35, { type: 'square', vol: 0.05, delay: i * 0.1 })); },
  dodge: () => tone(800, 0.15, { type: 'sine', vol: 0.07, slide: 600 }),
  roar: () => { noise(0.8, { freq: 400, vol: 0.35 }); tone(70, 0.8, { type: 'sawtooth', vol: 0.12, slide: -30 }); },
  death: () => { [392, 330, 262, 196].forEach((f, i) => tone(f, 0.5, { type: 'triangle', vol: 0.09, delay: i * 0.22 })); },
  win: () => { [523, 659, 784].forEach((f, i) => tone(f, 0.4, { type: 'triangle', vol: 0.08, delay: i * 0.12 })); tone(1046, 0.7, { type: 'triangle', vol: 0.08, delay: 0.36 }); },
  flip: () => noise(0.12, { freq: 4000, vol: 0.12 }),
};
