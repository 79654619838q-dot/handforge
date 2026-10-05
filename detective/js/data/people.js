// Все персонажи игры. Портрет: assets/img/p/<id>.webp (спокойный) и <id>_t.webp (напряжённый).
// voice — голос нейросети (edge-tts) и его настройка; у каждого свой, чтобы слышно было, кто говорит.
// Голоса проверены распознаванием речи на чистоту русского (scratchpad vt/asr2.txt, 05.10.2026):
// Florian и Remy отброшены — акцент; Ava и Vivienne хуже остальных на трудных словах (vt/hard.py: «Латум», «Платунь»).

const V = {
  dmitry: 'ru-RU-DmitryNeural', svetlana: 'ru-RU-SvetlanaNeural',
  andrew: 'en-US-AndrewMultilingualNeural', brian: 'en-US-BrianMultilingualNeural', william: 'en-AU-WilliamMultilingualNeural',
  giuseppe: 'it-IT-GiuseppeMultilingualNeural', hyunsu: 'ko-KR-HyunsuMultilingualNeural',
  ava: 'en-US-AvaMultilingualNeural', emma: 'en-US-EmmaMultilingualNeural', seraphina: 'de-DE-SeraphinaMultilingualNeural',
  vivienne: 'fr-FR-VivienneMultilingualNeural', thalita: 'pt-BR-ThalitaMultilingualNeural',
};
const v = (voice, pitch = '+0Hz', rate = '+0%') => ({ voice: V[voice], pitch, rate });

export const PEOPLE = {
  // ——— постоянные ———
  volkova: { name: 'Ирина Волкова', role: 'полковник, начальник угрозыска', sex: 'f', voice: v('svetlana', '-8Hz', '-4%') },
  artyom: { name: 'Артём Лебедев', role: 'напарник', sex: 'm', voice: v('dmitry', '+0Hz', '+4%') },
  granin: { name: 'Лев Гранин', role: 'главный эксперт-криминалист', sex: 'm', voice: v('andrew', '-10Hz', '-6%') },
  maya: { name: 'Майя Ким', role: 'аналитический отдел', sex: 'f', voice: v('svetlana', '+8Hz', '+6%') },

  // ——— Дело 1 ———
  shubin: { name: 'Олег Шубин', role: 'владелец «Вольво»', sex: 'm', voice: v('brian', '-2Hz', '+6%') },
  zina: { name: 'Зинаида Павловна', role: 'соседка', sex: 'f', voice: v('thalita', '-6Hz', '-8%') },
  kirill: { name: 'Кирилл Белкин', role: 'страховой агент', sex: 'm', voice: v('hyunsu', '+4Hz', '+8%') },

  // ——— Дело 2 ———
  katya: { name: 'Екатерина Лунёва', role: 'учительница', sex: 'f', voice: v('seraphina', '+2Hz', '+0%') },
  maxim: { name: 'Максим Горелов', role: 'бармен', sex: 'm', voice: v('giuseppe', '+4Hz', '+4%') },
  galina: { name: 'Галина Петровна', role: 'уборщица', sex: 'f', voice: v('svetlana', '-2Hz', '-10%') },
  ruslan: { name: 'Руслан Демченко', role: 'монтажник охранной фирмы', sex: 'm', voice: v('brian', '-6Hz', '-4%') },

  // ——— Дела 3–4 ———
  lyudmila: { name: 'Людмила Сомова', role: 'жена таксиста', sex: 'f', voice: v('thalita', '-2Hz', '-4%') },
  vera: { name: 'Вера Сомова', role: 'сестра таксиста', sex: 'f', voice: v('seraphina', '-6Hz', '-6%') },
  somov: { name: 'Виктор Сомов', role: 'таксист', sex: 'm', voice: v('william', '-2Hz', '+2%') },
  igor: { name: 'Игорь Белов', role: 'зять Сомова', sex: 'm', voice: v('giuseppe', '+0Hz', '+6%') },
  savely: { name: 'Савелий Кузьмич', role: 'сосед, рыбак', sex: 'm', voice: v('william', '-8Hz', '-10%') },
  krotov: { name: 'Роман Кротов', role: 'рыбак', sex: 'm', voice: v('brian', '-8Hz', '-6%') },

  // ——— Дело 5 ———
  pestov: { name: 'Аркадий Пестов', role: 'хозяин складов', sex: 'm', voice: v('giuseppe', '-6Hz', '-2%') },
  laptev: { name: 'Сергей Лаптев', role: 'ночной охранник', sex: 'm', voice: v('hyunsu', '-4Hz', '+0%') },
  markova: { name: 'Ирина Маркова', role: 'стоматолог', sex: 'f', voice: v('emma', '-6Hz', '-4%') },

  // ——— Дело 6 ———
  nina: { name: 'Нина Руднева', role: 'медсестра', sex: 'f', voice: v('emma', '+4Hz', '+2%') },
  gleb: { name: 'Глеб Соколов', role: 'бывший муж Нины', sex: 'm', voice: v('giuseppe', '+2Hz', '+6%') },
  alla: { name: 'Алла Вишнякова', role: 'актриса драмтеатра', sex: 'f', voice: v('seraphina', '-4Hz', '-2%') },
  konstantin: { name: 'Константин Рябинин', role: 'актёр драмтеатра', sex: 'm', voice: v('andrew', '+2Hz', '+2%') },

  // ——— Дело 7 ———
  kravets: { name: 'Степан Кравец', role: 'майор в отставке', sex: 'm', voice: v('william', '-6Hz', '-4%') },
  mamontov: { name: 'Георгий Мамонтов', role: 'автомеханик', sex: 'm', voice: v('giuseppe', '-10Hz', '-6%') },

  // ——— Дело 8 ———
  olga: { name: 'Ольга Лисицына', role: 'жена зампрокурора', sex: 'f', voice: v('seraphina', '+0Hz', '+2%') },
  zubov: { name: 'Олег Зубов', role: 'друг Лисицына', sex: 'm', voice: v('brian', '+2Hz', '+2%') },
  lisitsyn: { name: 'Андрей Лисицын', role: 'заместитель прокурора', sex: 'm', voice: v('william', '+2Hz', '+0%') },

  // ——— Дело 9 ———
  svetlana: { name: 'Светлана Орлова', role: 'мать Лизы', sex: 'f', voice: v('thalita', '-4Hz', '-6%') },

  // ——— Дела 10–11 ———
  timur: { name: 'Тимур Юсупов', role: 'подмастерье механика', sex: 'm', voice: v('hyunsu', '+6Hz', '+6%') },
  ryabov: { name: 'Геннадий Рябов', role: 'охранник портовой компании', sex: 'm', voice: v('brian', '-12Hz', '-4%') },
  lukich: { name: 'Пётр Лукич', role: 'сосед по гаражам', sex: 'm', voice: v('william', '-10Hz', '-12%') },

  // ——— Дело 12 ———
  pahomych: { name: 'Пахомыч', role: 'завсегдатай бара', sex: 'm', voice: v('giuseppe', '-8Hz', '-10%') },
  dasha: { name: 'Даша', role: 'официантка', sex: 'f', voice: v('ava', '+6Hz', '+6%') },
  aram: { name: 'Арам', role: 'таксист', sex: 'm', voice: v('hyunsu', '-6Hz', '+0%') },
  lenya: { name: 'Лёня', role: 'повар', sex: 'm', voice: v('dmitry', '+6Hz', '+8%') },
  shramov: { name: 'Виталий Шрамов', role: 'охранник порта', sex: 'm', voice: v('andrew', '-14Hz', '-4%') },

  // ——— Дело 13 ———
  waiter: { name: 'Стас', role: 'официант', sex: 'm', voice: v('dmitry', '+4Hz', '+10%') },
  karimov: { name: 'Артур Каримов', role: 'зам. начальника охраны порта', sex: 'm', voice: v('giuseppe', '-12Hz', '-2%') },

  // ——— Дела 14–15 ———
  tamara: { name: 'Тамара Хохлова', role: 'хранитель вещдоков', sex: 'f', voice: v('svetlana', '+2Hz', '-8%') },
  safronov: { name: 'Олег Сафронов', role: 'курьер', sex: 'm', voice: v('hyunsu', '-2Hz', '+4%') },
  zhukov: { name: 'Денис Жуков', role: 'ИТ-аналитик управления', sex: 'm', voice: v('andrew', '+6Hz', '+8%') },
  pronin: { name: 'Олег Пронин', role: 'следователь', sex: 'm', voice: v('brian', '-4Hz', '-2%') },

  // ——— Дело 16 ———
  nosov: { name: 'Валерий Носов', role: 'рабочий кладбища', sex: 'm', voice: v('william', '-4Hz', '+4%') },
  teen: { name: 'Кирилл', role: 'школьник', sex: 'm', voice: v('dmitry', '+14Hz', '+10%') },
  rustam: { name: 'Рустам Алиев', role: 'водитель Зейналова', sex: 'm', voice: v('giuseppe', '-4Hz', '-6%') },

  // ——— Дело 17 ———
  glukhov: { name: 'Фёдор Глухов', role: 'постоялец ночлежки', sex: 'm', voice: v('william', '-12Hz', '-8%') },
  misha: { name: 'Миша', role: 'постоялец ночлежки', sex: 'm', voice: v('hyunsu', '-8Hz', '-4%') },
  zhanna: { name: 'Жанна Мокрова', role: 'ночная дежурная', sex: 'f', voice: v('seraphina', '-8Hz', '+2%') },

  // ——— Дело 18 ———
  lidia: { name: 'Лидия Павловна', role: 'медсестра хосписа', sex: 'f', voice: v('thalita', '+0Hz', '-2%') },
  pyatakov: { name: 'Григорий Пятаков', role: 'санитар хосписа', sex: 'm', voice: v('hyunsu', '+2Hz', '+6%') },
  rudnev: { name: 'Павел Руднев', role: 'бывший сторож склада №9', sex: 'm', voice: v('dmitry', '-16Hz', '-14%') },

  // ——— Дело 19 ———
  inna: { name: 'Инна', role: 'соседка', sex: 'f', voice: v('ava', '-2Hz', '+4%') },
  zamkov: { name: 'Виктор Замков', role: 'слесарь управляющей компании', sex: 'm', voice: v('william', '+0Hz', '+2%') },
};

// портреты «людей», которых нет в списке (например, «неизвестный в капюшоне») — силуэт
export const NOBODY = { name: 'Неизвестный', role: '', sex: 'm' };
export function person(id) { return PEOPLE[id] || NOBODY; }
