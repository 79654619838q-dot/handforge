import Anthropic from "@anthropic-ai/sdk";
import { config, hasAI, aiProvider } from "../config.js";
import {
  TASK_GENERATOR_SYSTEM,
  buildTaskGeneratorPrompt,
  VERIFIER_SYSTEM,
  buildVerifierPrompt,
} from "./prompts.js";

const provider = aiProvider(); // "openrouter" | "anthropic" | null
const anthropicClient = provider === "anthropic" ? new Anthropic({ apiKey: config.anthropicKey }) : null;

/** Модель просят вернуть чистый JSON, но подстраховаться дешевле, чем ловить падения. */
function parseJson(text, fallback = null) {
  const cleaned = String(text)
    .replace(/```json/gi, "")
    .replace(/```/g, "")
    .trim();
  try {
    return JSON.parse(cleaned);
  } catch {
    const start = cleaned.search(/[[{]/);
    const end = Math.max(cleaned.lastIndexOf("]"), cleaned.lastIndexOf("}"));
    if (start !== -1 && end > start) {
      try {
        return JSON.parse(cleaned.slice(start, end + 1));
      } catch {
        /* ignore */
      }
    }
    return fallback;
  }
}

const textOf = (msg) =>
  (msg?.content || [])
    .filter((b) => b.type === "text")
    .map((b) => b.text)
    .join("\n");

/**
 * Единая точка вызова модели. Картинка необязательна (для генерации заданий не нужна).
 * OpenRouter говорит по OpenAI-совместимому /chat/completions, Anthropic — своим SDK.
 */
async function chatComplete({ system, prompt, imageBuffer, model, maxTokens }) {
  if (provider === "openrouter") {
    const content = imageBuffer
      ? [
          { type: "image_url", image_url: { url: `data:image/jpeg;base64,${imageBuffer.toString("base64")}` } },
          { type: "text", text: prompt },
        ]
      : prompt;

    const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.openrouterKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "https://photoquest.local",
        "X-Title": "PhotoQuest",
      },
      body: JSON.stringify({
        model,
        max_tokens: maxTokens,
        messages: [
          { role: "system", content: system },
          { role: "user", content },
        ],
      }),
      signal: AbortSignal.timeout(config.aiTimeoutMs),
    });

    if (!res.ok) throw new Error(`OpenRouter ${res.status}: ${await res.text().catch(() => res.statusText)}`);
    const data = await res.json();
    return data.choices?.[0]?.message?.content || "";
  }

  if (provider === "anthropic") {
    const msg = await anthropicClient.messages.create(
      {
        model,
        max_tokens: maxTokens,
        system,
        messages: [
          {
            role: "user",
            content: imageBuffer
              ? [
                  { type: "image", source: { type: "base64", media_type: "image/jpeg", data: imageBuffer.toString("base64") } },
                  { type: "text", text: prompt },
                ]
              : prompt,
          },
        ],
      },
      { timeout: config.aiTimeoutMs }
    );
    return textOf(msg);
  }

  throw new Error("Нет подключённого ИИ-провайдера");
}

/** Генерация пула заданий. */
export async function generateTasks({ count = 12, city = null, exclude = [] } = {}) {
  if (!hasAI()) return mockTasks(count);

  const text = await chatComplete({
    system: TASK_GENERATOR_SYSTEM,
    prompt: buildTaskGeneratorPrompt({ count, city, exclude }),
    model: config.models.tasks,
    maxTokens: 4000,
  });

  const parsed = parseJson(text, []);
  if (!Array.isArray(parsed)) return [];
  return parsed.filter(isValidTask).map(normalizeTask);
}

function isValidTask(t) {
  return t && typeof t.title === "string" && typeof t.description === "string" && t.criteria;
}

function normalizeTask(t) {
  const difficulty = Math.min(5, Math.max(1, Number(t.difficulty) || 2));
  return {
    title: String(t.title).slice(0, 120),
    description: String(t.description).slice(0, 400),
    category: String(t.category || "STREET_OBJECTS").toUpperCase(),
    difficulty,
    timeLimitSec: 43200, // 12 часов; дифференциация по сложности — TODO позже
    criteria: t.criteria,
  };
}

/** Проверка фотографии vision-моделью. */
export async function verifyPhoto({ task, criteria, imageBuffer, signals, model }) {
  if (!hasAI()) return mockVerdict(signals);

  const text = await chatComplete({
    system: VERIFIER_SYSTEM,
    prompt: buildVerifierPrompt({ task, criteria, signals }),
    imageBuffer,
    model: model || config.models.vision,
    maxTokens: 1200,
  });

  const verdict = parseJson(text, null);
  if (!verdict) throw new Error("Модель вернула нераспознаваемый ответ");
  return normalizeVerdict(verdict);
}

function normalizeVerdict(v) {
  return {
    match: Boolean(v.match),
    confidence: Math.min(1, Math.max(0, Number(v.confidence) || 0)),
    object_visible: Boolean(v.object_visible),
    quality: v.quality || "acceptable",
    flags: {
      blurry: Boolean(v.flags?.blurry),
      screen_or_print: Boolean(v.flags?.screen_or_print),
      ai_generated: Boolean(v.flags?.ai_generated),
      edited: Boolean(v.flags?.edited),
      night_unclear: Boolean(v.flags?.night_unclear),
    },
    detected: Array.isArray(v.detected) ? v.detected.slice(0, 10) : [],
    extracted_text: v.extracted_text ?? null,
    reasons: Array.isArray(v.reasons) ? v.reasons.slice(0, 5) : [],
  };
}

// --- Режим без ключа: приложение остаётся играбельным для разработки UI ---
function mockVerdict(signals) {
  const ok = signals.blurScore >= 60 && signals.brightness > 25 && signals.brightness < 240;
  return {
    match: ok,
    confidence: ok ? 0.82 : 0.3,
    object_visible: ok,
    quality: ok ? "good" : "poor",
    flags: { blurry: !ok, screen_or_print: false, ai_generated: false, edited: false, night_unclear: false },
    detected: ["режим без ключа ИИ: проверка только по локальным метрикам"],
    extracted_text: null,
    reasons: [ok ? "Фото прошло локальные проверки (ключ ИИ не задан)" : "Кадр смазан или плохо освещён"],
    mock: true,
  };
}

/**
 * Резервный банк заданий без ИИ. Список большой и разнообразный специально —
 * без ключа ИИ это единственный источник новых заданий,
 * а refillPool() отсеивает те, что уже есть в базе по названию.
 */
function mockTasks(count) {
  const pool = [
    ["Синий автомобиль", "Сфотографируйте припаркованный синий легковой автомобиль", "TRANSPORT", 2, { object: "легковой автомобиль", attributes: { color: "синий" } }],
    ["Мотоцикл", "Найдите и сфотографируйте мотоцикл", "TRANSPORT", 2, { object: "мотоцикл", attributes: {} }],
    ["Автобус", "Сфотографируйте городской автобус", "TRANSPORT", 1, { object: "автобус", attributes: {} }],
    ["Скорая помощь", "Найдите и сфотографируйте автомобиль скорой помощи", "TRANSPORT", 4, { object: "автомобиль скорой помощи", attributes: {} }],
    ["Электросамокат", "Сфотографируйте припаркованный электросамокат", "TRANSPORT", 1, { object: "электросамокат", attributes: {} }],
    ["Трамвай", "Сфотографируйте трамвай на путях или на остановке", "TRANSPORT", 3, { object: "трамвай", attributes: {} }],
    ["Прицеп", "Найдите автомобиль с прицепом", "TRANSPORT", 3, { object: "автомобиль с прицепом", attributes: {} }],

    ["Человек с зонтом", "Сфотографируйте прохожего с раскрытым зонтом", "PEOPLE", 2, { object: "человек с зонтом", attributes: {} }],
    ["Велосипедист в шлеме", "Сфотографируйте велосипедиста в защитном шлеме", "PEOPLE", 3, { object: "велосипедист в шлеме", attributes: {} }],
    ["Человек с рюкзаком", "Сфотографируйте прохожего с рюкзаком", "PEOPLE", 1, { object: "человек с рюкзаком", attributes: {} }],

    ["Кирпичная стена", "Сфотографируйте участок кирпичной кладки", "ARCHITECTURE", 1, { object: "кирпичная стена", attributes: {} }],
    ["Витраж", "Найдите и сфотографируйте витражное окно", "ARCHITECTURE", 4, { object: "витражное окно", attributes: {} }],
    ["Наружная лестница", "Сфотографируйте лестницу на улице", "ARCHITECTURE", 1, { object: "уличная лестница", attributes: {} }],
    ["Фонтан", "Найдите и сфотографируйте фонтан", "ARCHITECTURE", 3, { object: "фонтан", attributes: {} }],
    ["Колонна", "Сфотографируйте архитектурную колонну у здания", "ARCHITECTURE", 3, { object: "колонна", attributes: {} }],
    ["Крыша со шпилем", "Найдите здание со шпилем на крыше", "ARCHITECTURE", 4, { object: "шпиль на крыше", attributes: {} }],
    ["Кованые ворота", "Сфотографируйте кованые ворота или решётку", "ARCHITECTURE", 3, { object: "кованые ворота или решётка", attributes: {} }],

    ["Знак парковки", "Сфотографируйте дорожный знак парковки", "SIGNS", 1, { object: "знак парковки", attributes: {} }],
    ["Вывеска аптеки", "Найдите и сфотографируйте вывеску аптеки", "SIGNS", 2, { object: "вывеска аптеки", attributes: {} }],
    ["Указатель метро", "Сфотографируйте указатель входа в метро", "SIGNS", 2, { object: "указатель метро", attributes: {} }],
    ["Знак «Уступи дорогу»", "Найдите дорожный знак «Уступите дорогу»", "SIGNS", 3, { object: "знак уступи дорогу", attributes: {} }],
    ["Вывеска банка", "Сфотографируйте вывеску отделения банка", "SIGNS", 2, { object: "вывеска банка", attributes: {} }],
    ["Знак ограничения скорости", "Сфотографируйте знак ограничения скорости", "SIGNS", 2, { object: "знак ограничения скорости", attributes: {} }],

    ["Одуванчик", "Сфотографируйте одуванчик", "NATURE", 1, { object: "одуванчик", attributes: {} }],
    ["Опавшие листья", "Сфотографируйте кучу опавших листьев", "NATURE", 1, { object: "опавшие листья", attributes: {} }],
    ["Мох на камне", "Найдите камень, поросший мхом", "NATURE", 3, { object: "мох на камне", attributes: {} }],
    ["Дерево с дуплом", "Сфотографируйте дерево с дуплом", "NATURE", 4, { object: "дерево с дуплом", attributes: {} }],
    ["Закат между домами", "Сфотографируйте закат, видимый между зданиями", "NATURE", 3, { object: "закат между зданиями", attributes: {} }],
    ["Иней или роса", "Сфотографируйте иней или капли росы на поверхности", "NATURE", 4, { object: "иней или роса", attributes: {} }],

    ["Кошка на подоконнике", "Найдите кошку на подоконнике", "ANIMALS", 3, { object: "кошка на подоконнике", attributes: {} }],
    ["Голубь", "Сфотографируйте голубя", "ANIMALS", 1, { object: "голубь", attributes: {} }],
    ["Белка", "Найдите и сфотографируйте белку", "ANIMALS", 4, { object: "белка", attributes: {} }],
    ["Улитка", "Сфотографируйте улитку", "ANIMALS", 3, { object: "улитка", attributes: {} }],
    ["Бабочка", "Сфотографируйте бабочку", "ANIMALS", 4, { object: "бабочка", attributes: {} }],

    ["Велопарковка", "Сфотографируйте велопарковку", "STREET_OBJECTS", 1, { object: "велопарковка", attributes: {} }],
    ["Шлагбаум", "Найдите и сфотографируйте шлагбаум", "STREET_OBJECTS", 2, { object: "шлагбаум", attributes: {} }],
    ["Канализационный люк", "Сфотографируйте канализационный люк", "STREET_OBJECTS", 1, { object: "канализационный люк", attributes: {} }],
    ["Пожарный гидрант", "Найдите пожарный гидрант", "STREET_OBJECTS", 3, { object: "пожарный гидрант", attributes: {} }],
    ["Вендинговый автомат", "Сфотографируйте торговый автомат", "STREET_OBJECTS", 1, { object: "вендинговый автомат", attributes: {} }],
    ["Детская площадка", "Сфотографируйте детскую площадку", "STREET_OBJECTS", 1, { object: "детская площадка", attributes: {} }],
    ["Велосипедная дорожка", "Сфотографируйте разметку велодорожки", "STREET_OBJECTS", 2, { object: "разметка велодорожки", attributes: {} }],

    ["Табличка «Осторожно, собака»", "Найдите табличку с предупреждением о собаке", "TEXT_AND_NUMBERS", 3, { object: "табличка про собаку", attributes: {}, ocr_expect: "any" }],
    ["Номер автобуса на остановке", "Сфотографируйте табло или табличку с номером маршрута", "TEXT_AND_NUMBERS", 3, { object: "номер автобусного маршрута", attributes: {}, ocr_expect: "any" }],
    ["Неоновая вывеска", "Найдите вывеску магазина, сделанную неоновыми буквами", "TEXT_AND_NUMBERS", 3, { object: "неоновая вывеска", attributes: {}, ocr_expect: "any" }],
    ["Дата на фасаде", "Найдите год постройки, указанный на здании", "TEXT_AND_NUMBERS", 4, { object: "дата на фасаде здания", attributes: {}, ocr_expect: "any" }],
    ["QR-код на афише", "Сфотографируйте афишу или объявление с QR-кодом", "TEXT_AND_NUMBERS", 2, { object: "QR-код на афише", attributes: {} }],
    ["Номер подъезда", "Сфотографируйте табличку с номером подъезда", "TEXT_AND_NUMBERS", 2, { object: "табличка с номером подъезда", attributes: {}, ocr_expect: "any" }],
  ];
  return Array.from({ length: Math.min(count, pool.length) }, (_, i) => {
    const [title, description, category, difficulty, criteria] = pool[i];
    return { title, description, category, difficulty, timeLimitSec: 43200, criteria };
  });
}
