import { Music } from './Music.js';

// Звук синтезируется Web Audio — файлов нет, но API одинаковое:
// позже любой звук можно заменить сэмплом из assets/ без правок вызывающего кода.
export class AudioManager {
  constructor(settings) {
    this.ctx = null;
    this.settings = settings;
    this.track = null;
    this.trackNodes = [];
    this.trackTimer = null;
  }

  // Браузер разрешает звук только после первого жеста пользователя.
  unlock() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const C = window.AudioContext || window.webkitAudioContext;
    if (!C) return;
    this.ctx = new C();
    this.master = this.ctx.createGain();
    this.master.connect(this.ctx.destination);
    this.musicBus = this.ctx.createGain();
    this.sfxBus = this.ctx.createGain();
    this.musicBus.connect(this.master);
    this.sfxBus.connect(this.master);
    this.applyVolumes();
    if (this.pending) { const p = this.pending; this.pending = null; this.playMusic(p); }
  }

  applyVolumes() {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    this.musicBus.gain.setTargetAtTime(this.settings.music * 0.7, now, 0.1);
    this.sfxBus.gain.setTargetAtTime(this.settings.sfx, now, 0.05);
  }

  // ---------- Музыка (src/managers/Music.js) ----------
  playMusic(name) {
    if (!this.ctx) { this.pending = name; return; }
    this.music ||= new Music(this.ctx, this.musicBus);
    this.music.play(name);
  }

  stopMusic() { this.music?.stop(); }

  // ---------- Эффекты ----------
  _env(node, t0, a, d, peak) {
    node.gain.setValueAtTime(0.0001, t0);
    node.gain.exponentialRampToValueAtTime(peak, t0 + a);
    node.gain.exponentialRampToValueAtTime(0.0001, t0 + a + d);
  }

  _tone(freq, dur, type = 'sine', peak = 0.3, slideTo = null, delay = 0) {
    if (!this.ctx) return;
    const t0 = this.ctx.currentTime + delay;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t0);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t0 + dur);
    this._env(g, t0, 0.005, dur, peak);
    o.connect(g).connect(this.sfxBus);
    o.start(t0); o.stop(t0 + dur + 0.05);
  }

  _noise(dur, peak = 0.4, freq = 800, type = 'lowpass', delay = 0) {
    if (!this.ctx) return;
    const t0 = this.ctx.currentTime + delay;
    const len = Math.floor(this.ctx.sampleRate * dur);
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    const f = this.ctx.createBiquadFilter();
    f.type = type; f.frequency.value = freq;
    const g = this.ctx.createGain();
    this._env(g, t0, 0.01, dur, peak);
    src.connect(f).connect(g).connect(this.sfxBus);
    src.start(t0);
  }

  hover() { this._tone(1800, 0.05, 'sine', 0.05); }
  click() { this._tone(900, 0.08, 'triangle', 0.15, 600); }
  select() { this._tone(520, 0.12, 'triangle', 0.2, 780); this._tone(1040, 0.2, 'sine', 0.08, null, 0.05); }
  confirm() { [392, 523, 784].forEach((f, i) => this._tone(f, 0.4, 'triangle', 0.18, null, i * 0.07)); this._noise(0.3, 0.08, 3000, 'highpass'); }
  tick() { this._tone(1200, 0.04, 'square', 0.05); }
  tickUrgent(n) { this._tone(n <= 3 ? 1600 : 1320, 0.09, 'square', 0.12); this._tone(80, 0.15, 'sine', 0.35, 50); }
  roulette() { this._tone(700 + Math.random() * 300, 0.04, 'triangle', 0.07); }
  charge() { this._tone(60, 1.2, 'sawtooth', 0.12, 240); this._noise(1.2, 0.05, 400); }
  crack() { this._noise(0.25, 0.35, 2500, 'bandpass'); this._tone(200, 0.15, 'square', 0.1, 90); }
  destroy() {
    this._noise(1.6, 0.9, 500);
    this._tone(90, 1.4, 'sine', 0.6, 28);
    this._noise(0.6, 0.3, 4000, 'highpass', 0.05);
  }
  // рычание монстра: низкая дрожащая «пила» и шипение
  monster() {
    if (!this.ctx) return;
    const t0 = this.ctx.currentTime;
    const o = this.ctx.createOscillator(), g = this.ctx.createGain(), f = this.ctx.createBiquadFilter();
    const lfo = this.ctx.createOscillator(), lg = this.ctx.createGain();
    o.type = 'sawtooth'; o.frequency.setValueAtTime(70, t0); o.frequency.exponentialRampToValueAtTime(45, t0 + 1.4);
    lfo.frequency.value = 23; lg.gain.value = 18; lfo.connect(lg).connect(o.frequency);
    f.type = 'lowpass'; f.frequency.value = 420;
    this._env(g, t0, 0.08, 1.4, 0.55);
    o.connect(f).connect(g).connect(this.sfxBus);
    o.start(t0); lfo.start(t0); o.stop(t0 + 1.6); lfo.stop(t0 + 1.6);
    this._noise(1.2, 0.2, 900, 'bandpass', 0.1);
  }

  survived() { [523, 659, 784, 1046].forEach((f, i) => this._tone(f, 0.5, 'triangle', 0.16, null, i * 0.09)); }
  eliminated() { [392, 311, 261, 196].forEach((f, i) => this._tone(f, 0.7, 'sawtooth', 0.12, f * 0.97, i * 0.22)); this._tone(55, 2, 'sine', 0.5, 30, 0.3); }
  victory() {
    [523, 659, 784, 1046, 784, 1046, 1318].forEach((f, i) => this._tone(f, 0.6, 'triangle', 0.18, null, i * 0.13));
    this._noise(2, 0.12, 6000, 'highpass', 0.9);
  }
}
