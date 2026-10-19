// Правила доступа: сроки, логины, пароли. Отдельно от сервера, чтобы их
// можно было проверять тестами без запуска сайта.
import bcrypt from "bcryptjs";

// Сроки, которые называл оператор: тест 3 дня, месяц, 3 месяца, год.
// Пятый вариант -- "своё число дней" на особые случаи.
export const PLANS = {
  test3: { title: "тест, 3 дня", days: 3 },
  month: { title: "1 месяц", days: 30 },
  months3: { title: "3 месяца", days: 90 },
  year: { title: "1 год", days: 365 },
  custom: { title: "свой срок", days: null },
};

export function planDays(plan, customDays) {
  const known = PLANS[plan];
  if (!known) return null;
  if (known.days !== null) return known.days;
  const days = Number(customDays);
  if (!Number.isInteger(days) || days < 1 || days > 3650) return null;
  return days;
}

export function planTitle(plan, days) {
  const known = PLANS[plan];
  if (!known) return plan;
  return known.days === null ? `свой срок, ${days} дн.` : known.title;
}

/** Дата окончания: срок считается от «сейчас», конец дня не округляем --
 *  клуб получает ровно оплаченные сутки. */
export function expiryFrom(startIso, days) {
  const start = new Date(startIso);
  return new Date(start.getTime() + days * 24 * 3600 * 1000).toISOString();
}

export function daysLeft(expiresAt, now = new Date()) {
  const ms = new Date(expiresAt).getTime() - now.getTime();
  return Math.ceil(ms / (24 * 3600 * 1000));
}

/** Состояние доступа клуба одним словом -- и для сайта, и для программы. */
export function accessState(club, now = new Date()) {
  if (!club) return { ok: false, reason: "unknown", text: "Логин или пароль не подходят" };
  if (club.blocked) return { ok: false, reason: "blocked", text: "Доступ закрыт. Свяжитесь с нами" };
  if (new Date(club.expiresAt).getTime() <= now.getTime()) {
    return {
      ok: false, reason: "expired",
      text: `Срок доступа закончился ${formatDate(club.expiresAt)}. Напишите нам, чтобы продлить`,
    };
  }
  return { ok: true, reason: "active", text: "Доступ открыт" };
}

export function formatDate(iso) {
  const d = new Date(iso);
  return `${String(d.getDate()).padStart(2, "0")}.${String(d.getMonth() + 1).padStart(2, "0")}.${d.getFullYear()}`;
}

// --- логин и пароль ---------------------------------------------------------
//
// Логин собирается из названия клуба, чтобы его было видно в списке
// ("klub-imperial-moskva"), и дополняется коротким хвостом -- два клуба
// с одинаковым названием не должны спорить за один логин.
const TRANSLIT = {
  а: "a", б: "b", в: "v", г: "g", д: "d", е: "e", ё: "e", ж: "zh", з: "z", и: "i",
  й: "y", к: "k", л: "l", м: "m", н: "n", о: "o", п: "p", р: "r", с: "s", т: "t",
  у: "u", ф: "f", х: "h", ц: "c", ч: "ch", ш: "sh", щ: "sch", ъ: "", ы: "y", ь: "",
  э: "e", ю: "yu", я: "ya",
};

export function slugify(name) {
  const lower = String(name || "").toLowerCase();
  let out = "";
  for (const ch of lower) {
    if (TRANSLIT[ch] !== undefined) out += TRANSLIT[ch];
    else if (/[a-z0-9]/.test(ch)) out += ch;
    else out += "-";
  }
  return out.replace(/-+/g, "-").replace(/^-|-$/g, "").slice(0, 28) || "klub";
}

// Буквы и цифры без похожих друг на друга (0/O, 1/l/I): пароль часто
// диктуют голосом или переписывают руками.
const SAFE = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export function makePassword(length = 10) {
  const bytes = crypto.getRandomValues(new Uint8Array(length));
  let out = "";
  for (const byte of bytes) out += SAFE[byte % SAFE.length];
  return out;
}

export function makeLogin(name, taken = new Set()) {
  // Название почти всегда начинается со слова «клуб» -- второй раз его в
  // логин не вставляем, иначе получается "klub-klub-imperial".
  const slug = slugify(name).replace(/^klub-?/, "") || "nameless";
  const base = `klub-${slug}`;
  let login = base;
  while (taken.has(login)) {
    login = `${base}-${makePassword(2).toLowerCase()}`;
  }
  return login;
}

export const hashPassword = (password) => bcrypt.hash(password, 10);
export const checkPassword = (password, hash) => bcrypt.compare(password, hash);

/** Готовое сообщение клубу -- оператор копирует одной кнопкой и
 *  отправляет в мессенджере. */
export function clubMessage({ name, login, password, expiresAt, siteUrl }) {
  return [
    `HandForge Manager — доступ для «${name}»`,
    ``,
    `Сайт: ${siteUrl}`,
    `Логин: ${login}`,
    `Пароль: ${password}`,
    `Доступ до: ${formatDate(expiresAt)}`,
    ``,
    `Войдите на сайте, скачайте программу и запустите её.`,
    `В программе те же логин и пароль — они нужны, чтобы создать турнир.`,
    `Камеры, микрофоны, регистрация игроков, архив и рейтинги работают и`,
    `без них.`,
  ].join("\n");
}
