// Таймер выбора. Считает по настоящим часам (performance.now), а не по кадрам:
// при просадке FPS 30 секунд остаются 30 секундами. Проверяется из кадра сцены.
export class TimerManager {
  constructor() {
    this.running = false;
    this.left = 0;
    this.total = 0;
    this.lastWhole = null;
    this.onTick = null;    // (целые секунды) — раз в секунду
    this.onExpire = null;
  }

  start(seconds) {
    this.total = seconds;
    this.left = seconds;
    this.lastWhole = Math.ceil(seconds);
    this.running = true;
    this.last = performance.now();
    this.onTick?.(this.lastWhole, this.left / this.total);
  }

  stop() { this.running = false; }

  update() {
    if (!this.running) return;
    const now = performance.now();
    this.left = Math.max(0, this.left - (now - this.last) / 1000);
    this.last = now;
    const whole = Math.ceil(this.left);
    if (whole !== this.lastWhole) { this.lastWhole = whole; this.onTick?.(whole, this.left / this.total); }
    this.onFrame?.(this.left / this.total, this.left);
    if (this.left <= 0) { this.running = false; this.onExpire?.(); }
  }
}
