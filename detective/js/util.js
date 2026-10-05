// Мелочи для экранов: создание элементов, картинки, всплывающие сообщения.

export const VER = '1';
export const img = (key) => `assets/img/${key}.webp?v=${VER}`;

// h('div.cls#id', {attrs/on…}, ...children)
export function h(sel, attrs, ...kids) {
  const m = sel.match(/^([a-z0-9]+)?((?:[.#][\w-]+)*)$/i);
  const el = document.createElement(m[1] || 'div');
  for (const part of (m[2] || '').match(/[.#][\w-]+/g) || []) {
    if (part[0] === '.') el.classList.add(part.slice(1)); else el.id = part.slice(1);
  }
  // второй аргумент — не атрибуты, а содержимое (в том числе число 0)
  if (attrs != null && (typeof attrs !== 'object' || attrs instanceof Node || Array.isArray(attrs))) { kids.unshift(attrs); attrs = null; }
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k.startsWith('on')) el.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
    else if (k === 'html') el.innerHTML = v;
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const k of kids.flat(Infinity)) {
    if (k == null || k === false) continue;
    el.append(k instanceof Node ? k : document.createTextNode(String(k)));
  }
  return el;
}

// картинка с запасным видом, если файла ещё нет
export function pic(key, cls = '', alt = '') {
  const el = h('img' + (cls ? '.' + cls.split(' ').join('.') : ''), { src: img(key), alt, draggable: 'false', loading: 'lazy' });
  el.addEventListener('error', () => { el.classList.add('missing'); el.removeAttribute('src'); el.dataset.key = key; }, { once: true });
  return el;
}

export function toast(text, kind = '') {
  const t = h('div.toast' + (kind ? '.' + kind : ''), text);
  document.body.append(t);
  requestAnimationFrame(() => t.classList.add('show'));
  setTimeout(() => { t.classList.remove('show'); setTimeout(() => t.remove(), 400); }, 2200);
}

export function points(n) {
  if (!n) return;
  toast((n > 0 ? '+' : '−') + Math.abs(n) + ' очков', n > 0 ? 'good' : 'bad');
}

// модальное окно; возвращает {el, close}
export function modal(content, { cls = '', onClose, closable = true } = {}) {
  const box = h('div.modal-box' + (cls ? '.' + cls : ''), content);
  const wrap = h('div.modal', box);
  const close = () => { wrap.classList.remove('show'); setTimeout(() => wrap.remove(), 250); onClose?.(); };
  if (closable) {
    wrap.addEventListener('click', (e) => { if (e.target === wrap) close(); });
    box.prepend(h('button.modal-x', { onclick: close, 'aria-label': 'Закрыть' }, '✕'));
  }
  document.body.append(wrap);
  requestAnimationFrame(() => wrap.classList.add('show'));
  return { el: box, close };
}

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
export const plural = (n, a, b, c) => { const m = n % 10, mm = n % 100; return m === 1 && mm !== 11 ? a : m >= 2 && m <= 4 && (mm < 10 || mm >= 20) ? b : c; };
export const qs = new URLSearchParams(location.search);
