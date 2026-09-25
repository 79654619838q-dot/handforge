// Фоны мест — только картинки из ChatGPT (assets/bg/<id>.jpg). Места без картинки в игре не показываются.
import { BG_FILES } from './bg-list.js';

export const hasBg = (id) => BG_FILES.includes(id);
export const photoURL = (id) => (hasBg(id) ? `assets/bg/${id}.jpg` : null);
// Запасной фон — просто цвет, без рисунка.
export const bgCSS = (id) => (hasBg(id) ? `url("assets/bg/${id}.jpg")` : 'linear-gradient(#f7d6e8, #efc1da)');
