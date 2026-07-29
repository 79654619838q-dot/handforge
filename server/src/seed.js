import bcrypt from "bcryptjs";
import { prisma, toJson } from "./lib/prisma.js";
import { basePoints } from "./services/scoring.js";

const TASKS = [
  ["Красный автомобиль", "Найдите и сфотографируйте припаркованный красный легковой автомобиль", "TRANSPORT", 2, { object: "легковой автомобиль", attributes: { color: "красный" }, must_be_visible: ["кузов автомобиля целиком или почти целиком"], reject_if: ["игрушечная машина", "изображение на экране", "рекламный плакат"], ocr_expect: null }],
  ["Велосипед", "Сфотографируйте велосипед на улице", "TRANSPORT", 1, { object: "велосипед", attributes: {}, must_be_visible: ["рама и оба колеса"], reject_if: ["детская игрушка", "изображение на экране"], ocr_expect: null }],
  ["Жёлтое такси", "Сфотографируйте автомобиль такси с опознавательными знаками", "TRANSPORT", 3, { object: "автомобиль такси", attributes: {}, must_be_visible: ["шашечки, наклейка или фонарь такси"], reject_if: ["обычный жёлтый автомобиль без опознавательных знаков"], ocr_expect: null }],
  ["Грузовик", "Найдите и сфотографируйте грузовой автомобиль", "TRANSPORT", 2, { object: "грузовой автомобиль", attributes: {}, must_be_visible: ["кабина и кузов"], reject_if: ["легковой автомобиль", "модель"], ocr_expect: null }],
  ["Человек в шляпе", "Сфотографируйте прохожего в шляпе — так, чтобы в кадре была именно шляпа, а не лицо крупным планом", "PEOPLE", 3, { object: "человек в шляпе", attributes: {}, must_be_visible: ["головной убор типа шляпы"], reject_if: ["кепка или капюшон", "лицо крупным планом", "манекен", "изображение на плакате"], ocr_expect: null }],
  ["Зонт на улице", "Сфотографируйте раскрытый зонт", "PEOPLE", 2, { object: "раскрытый зонт", attributes: {}, must_be_visible: ["купол зонта"], reject_if: ["зонт от солнца у кафе", "сложенный зонт"], ocr_expect: null }],
  ["Памятник", "Сфотографируйте памятник или скульптуру", "ARCHITECTURE", 3, { object: "памятник или скульптура", attributes: {}, must_be_visible: ["фигура или композиция целиком"], reject_if: ["фонтан без скульптуры", "изображение на открытке"], ocr_expect: null }],
  ["Арка", "Найдите арку в здании или отдельно стоящую и сфотографируйте её", "ARCHITECTURE", 2, { object: "арка", attributes: {}, must_be_visible: ["полукруглый или стрельчатый свод"], reject_if: ["обычный прямоугольный проём"], ocr_expect: null }],
  ["Балкон с цветами", "Сфотографируйте балкон с растениями", "ARCHITECTURE", 3, { object: "балкон с растениями", attributes: {}, must_be_visible: ["балкон и растения на нём"], reject_if: ["окно без балкона"], ocr_expect: null }],
  ["Красная дверь", "Найдите дверь красного цвета", "ARCHITECTURE", 3, { object: "дверь", attributes: { color: "красный" }, must_be_visible: ["дверное полотно целиком"], reject_if: ["ворота", "изображение двери"], ocr_expect: null }],
  ["Номер дома 67", "Найдите дом с номером 67 и сфотографируйте табличку", "TEXT_AND_NUMBERS", 4, { object: "номерная табличка дома", attributes: {}, must_be_visible: ["читаемая цифра 67"], reject_if: ["номер квартиры", "номер на бумаге"], ocr_expect: "67" }],
  ["Дом с чётным номером", "Сфотографируйте табличку дома с любым чётным номером", "TEXT_AND_NUMBERS", 2, { object: "номерная табличка дома", attributes: {}, must_be_visible: ["читаемый номер"], reject_if: ["нечитаемая табличка"], ocr_expect: "even" }],
  ["Указатель улицы", "Сфотографируйте табличку с названием улицы", "TEXT_AND_NUMBERS", 2, { object: "табличка с названием улицы", attributes: {}, must_be_visible: ["читаемое название"], reject_if: ["дорожный знак без названия"], ocr_expect: "any" }],
  ["Вывеска кафе", "Сфотографируйте вывеску кафе или ресторана", "SIGNS", 2, { object: "вывеска заведения общепита", attributes: {}, must_be_visible: ["читаемая вывеска"], reject_if: ["меню на бумаге", "витрина без вывески"], ocr_expect: "any" }],
  ["Знак «Стоп»", "Найдите дорожный знак STOP", "SIGNS", 3, { object: "дорожный знак STOP", attributes: { shape: "восьмиугольник", color: "красный" }, must_be_visible: ["знак целиком"], reject_if: ["наклейка", "изображение знака на экране"], ocr_expect: "STOP" }],
  ["Пешеходный переход", "Сфотографируйте разметку пешеходного перехода с тротуара", "SIGNS", 1, { object: "разметка пешеходного перехода", attributes: {}, must_be_visible: ["полосы разметки"], reject_if: ["съёмка с проезжей части"], ocr_expect: null }],
  ["Граффити", "Найдите настенную роспись или граффити", "STREET_OBJECTS", 2, { object: "граффити или мурал", attributes: {}, must_be_visible: ["рисунок целиком или крупный фрагмент"], reject_if: ["случайная надпись маркером"], ocr_expect: null }],
  ["Скамейка", "Сфотографируйте уличную скамейку", "STREET_OBJECTS", 1, { object: "скамейка", attributes: {}, must_be_visible: ["скамейка целиком"], reject_if: ["стул кафе"], ocr_expect: null }],
  ["Почтовый ящик", "Найдите уличный почтовый ящик", "STREET_OBJECTS", 3, { object: "почтовый ящик", attributes: {}, must_be_visible: ["корпус ящика"], reject_if: ["урна", "домофон"], ocr_expect: null }],
  ["Фонарный столб", "Сфотографируйте уличный фонарь", "STREET_OBJECTS", 1, { object: "уличный фонарь", attributes: {}, must_be_visible: ["плафон и столб"], reject_if: ["светофор"], ocr_expect: null }],
  ["Цветущее дерево", "Найдите дерево или куст с цветами", "NATURE", 2, { object: "цветущее растение", attributes: {}, must_be_visible: ["цветы на ветках"], reject_if: ["срезанные цветы", "искусственные растения"], ocr_expect: null }],
  ["Лужа с отражением", "Сфотографируйте лужу, в которой что-то отражается", "NATURE", 4, { object: "лужа с отражением", attributes: {}, must_be_visible: ["вода и различимое отражение"], reject_if: ["сухой асфальт"], ocr_expect: null }],
  ["Собака на прогулке", "Сфотографируйте собаку на улице", "ANIMALS", 2, { object: "собака", attributes: {}, must_be_visible: ["животное целиком"], reject_if: ["игрушка", "изображение собаки", "фото с экрана"], ocr_expect: null }],
  ["Птица", "Сфотографируйте птицу", "ANIMALS", 3, { object: "птица", attributes: {}, must_be_visible: ["птица различима"], reject_if: ["изображение птицы", "чучело"], ocr_expect: null }],
];

const ACHIEVEMENTS = [
  ["FIRST_BLOOD", "Первый кадр", "Первое принятое задание", "camera", { type: "approved_count", value: 1 }, 20],
  ["TEN_SHOTS", "Разогрев", "10 принятых заданий", "flame", { type: "approved_count", value: 10 }, 50],
  ["HUNDRED_SHOTS", "Сотня", "100 принятых заданий", "trophy", { type: "approved_count", value: 100 }, 300],
  ["SPEED_DEMON", "Молния", "Выполнить задание за первые 10% времени", "zap", { type: "speed_ratio", value: 0.1 }, 80],
  ["STREAK_5", "На волне", "Серия из 5 заданий", "wave", { type: "streak", value: 5 }, 60],
  ["STREAK_20", "Непрерывный", "Серия из 20 заданий", "infinity", { type: "streak", value: 20 }, 250],
  ["NIGHT_OWL", "Ночная смена", "5 заданий между 00:00 и 05:00", "moon", { type: "time_window", from: 0, to: 5, value: 5 }, 120],
  ["POLYGLOT", "Всеядный", "По заданию в каждой категории", "grid", { type: "category_sweep", value: 8 }, 200],
  ["SHARP_EYE", "Точный глаз", "20 подряд без единого отказа", "eye", { type: "clean_run", value: 20 }, 220],
  ["HARD_MODE", "Тяжёлый режим", "10 заданий сложности 5", "mountain", { type: "difficulty_count", difficulty: 5, value: 10 }, 300],
];

async function main() {
  for (const [title, description, category, difficulty, criteria] of TASKS) {
    const exists = await prisma.task.findFirst({ where: { title } });
    if (exists) continue;
    await prisma.task.create({
      data: {
        title,
        description,
        category,
        difficulty,
        points: basePoints(difficulty),
        timeLimitSec: 43200, // 12 часов; дифференциация по сложности — TODO позже
        criteria: toJson(criteria),
        source: "MANUAL",
      },
    });
  }

  for (const [code, title, description, icon, rule, points] of ACHIEVEMENTS) {
    await prisma.achievement.upsert({
      where: { code },
      update: { title, description, icon, rule: toJson(rule), points },
      create: { code, title, description, icon, rule: toJson(rule), points },
    });
  }

  const adminEmail = "admin@photoquest.local";
  const admin = await prisma.user.findUnique({ where: { email: adminEmail } });
  if (!admin) {
    await prisma.user.create({
      data: {
        email: adminEmail,
        username: "admin",
        passwordHash: await bcrypt.hash("admin12345", 12),
        role: "ADMIN",
        level: 10,
      },
    });
  }

  const tasks = await prisma.task.count();
  const achievements = await prisma.achievement.count();
  console.log(`Готово: заданий ${tasks}, достижений ${achievements}.`);
  console.log("Админ: admin@photoquest.local / admin12345");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
