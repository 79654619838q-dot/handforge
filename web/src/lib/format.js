export const CATEGORIES = {
  TRANSPORT: "Транспорт",
  PEOPLE: "Люди",
  ARCHITECTURE: "Архитектура",
  SIGNS: "Вывески и знаки",
  NATURE: "Природа",
  ANIMALS: "Животные",
  STREET_OBJECTS: "Уличные объекты",
  TEXT_AND_NUMBERS: "Текст и номера",
};

export const REASONS = {
  NO_MATCH: "Объект не найден",
  BLURRY: "Смазанный кадр",
  DUPLICATE: "Повторное фото",
  SCREEN_PHOTO: "Съёмка экрана",
  AI_GENERATED: "Сгенерировано ИИ",
  EDITED: "Следы монтажа",
  LOW_QUALITY: "Низкое качество",
  EXPIRED: "Время истекло",
  NO_CAPTURE_TOKEN: "Кадр не подтверждён камерой",
  MANUAL_REJECTED: "Отклонено модератором",
  SUPERSEDED: "Задание уже засчитано по другому фото",
};

export const clock = (seconds) => {
  const s = Math.max(0, Math.floor(seconds));
  const m = Math.floor(s / 60);
  return `${String(m).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
};

export const date = (iso) =>
  new Date(iso).toLocaleString("ru-RU", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });

export const dateSec = (iso) =>
  new Date(iso).toLocaleString("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });

export const isOnline = (lastActiveAt) => Date.now() - new Date(lastActiveAt).getTime() < 5 * 60_000;

export const initials = (name = "") => name.slice(0, 2).toUpperCase();
