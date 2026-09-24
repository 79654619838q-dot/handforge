// Мини-движок анимаций: обновляется из кадра мира, возвращает Promise.
const active = new Set();

export const ease = {
  linear: (k) => k,
  outCubic: (k) => 1 - Math.pow(1 - k, 3),
  inCubic: (k) => k * k * k,
  inOutCubic: (k) => (k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2),
  outBack: (k) => { const c = 1.7; return 1 + (c + 1) * Math.pow(k - 1, 3) + c * Math.pow(k - 1, 2); },
  inQuad: (k) => k * k,
};

export function tween(duration, onUpdate, fn = ease.outCubic) {
  return new Promise((resolve) => {
    active.add({ t: 0, duration, onUpdate, fn, resolve });
  });
}

export function wait(sec) { return tween(sec, () => {}); }

export function updateTweens(dt) {
  for (const tw of active) {
    tw.t += dt;
    const k = Math.min(1, tw.t / tw.duration);
    tw.onUpdate(tw.fn(k), k);
    if (k >= 1) { active.delete(tw); tw.resolve(); }
  }
}

export function clearTweens() { active.clear(); }
