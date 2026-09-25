// Звуки и музыкальная шкатулка — синтез в браузере, без файлов.
let ctx = null, master = null, musicGain = null, musicTimer = null;
let soundOn = true, musicOn = true;

function ac() {
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = 0.5;
    master.connect(ctx.destination);
    musicGain = ctx.createGain();
    musicGain.gain.value = 0.16;
    const delay = ctx.createDelay();
    delay.delayTime.value = 0.28;
    const fb = ctx.createGain();
    fb.gain.value = 0.3;
    musicGain.connect(master);
    musicGain.connect(delay);
    delay.connect(fb);
    fb.connect(delay);
    delay.connect(master);
  }
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}

function bell(freq, t, dur = 0.8, vol = 0.25, out) {
  const c = ac();
  if (!c) return;
  const o = c.createOscillator(), o2 = c.createOscillator(), g = c.createGain();
  o.type = 'sine';
  o2.type = 'sine';
  o.frequency.value = freq;
  o2.frequency.value = freq * 2.01;
  const g2 = c.createGain();
  g2.gain.value = 0.25;
  o.connect(g);
  o2.connect(g2);
  g2.connect(g);
  g.connect(out || master);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.start(t);
  o2.start(t);
  o.stop(t + dur + 0.05);
  o2.stop(t + dur + 0.05);
}

const N = (n) => 440 * Math.pow(2, (n - 69) / 12);

export const sfx = {
  tap() { if (!soundOn || !ac()) return; bell(N(84), ctx.currentTime, 0.15, 0.12); },
  wear() { if (!soundOn || !ac()) return; const t = ctx.currentTime; [88, 91, 96].forEach((n, i) => bell(N(n), t + i * 0.05, 0.35, 0.12)); },
  off() { if (!soundOn || !ac()) return; bell(N(76), ctx.currentTime, 0.2, 0.1); },
  coin() { if (!soundOn || !ac()) return; const t = ctx.currentTime; bell(N(88), t, 0.2, 0.18); bell(N(95), t + 0.08, 0.4, 0.18); },
  success() { if (!soundOn || !ac()) return; const t = ctx.currentTime; [72, 76, 79, 84, 88, 91, 96].forEach((n, i) => bell(N(n), t + i * 0.08, 0.9, 0.16)); },
  shutter() {
    if (!soundOn || !ac()) return;
    const t = ctx.currentTime, len = 0.12;
    const buf = ctx.createBuffer(1, ctx.sampleRate * len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / d.length, 3);
    const s = ctx.createBufferSource(), g = ctx.createGain();
    s.buffer = buf;
    g.gain.value = 0.35;
    s.connect(g);
    g.connect(master);
    s.start(t);
  },
  magic() { if (!soundOn || !ac()) return; const t = ctx.currentTime; for (let i = 0; i < 10; i++) bell(N(84 + ((i * 5) % 17)), t + i * 0.04, 0.5, 0.07); },
};

// Музыкальная шкатулка: спокойные аккорды по кругу.
const PROG = [[60, 64, 67, 72], [57, 60, 64, 69], [53, 57, 60, 65], [55, 59, 62, 67]];
let step = 0;
function tick() {
  if (!musicOn || !ctx) return;
  const t = ctx.currentTime + 0.05;
  const ch = PROG[Math.floor(step / 8) % PROG.length];
  const pat = [0, 2, 1, 3, 2, 1, 3, 2];
  bell(N(ch[pat[step % 8]] + 12), t, 1.2, 0.2, musicGain);
  if (step % 8 === 0) bell(N(ch[0]), t, 2.2, 0.14, musicGain);
  step++;
}
export function startMusic() {
  if (!musicOn || musicTimer || !ac()) return;
  musicTimer = setInterval(tick, 340);
}
export function stopMusic() { clearInterval(musicTimer); musicTimer = null; }
export function setSound(v) { soundOn = v; }
export function setMusic(v) { musicOn = v; if (v) startMusic(); else stopMusic(); }
