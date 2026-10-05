// Список дел по главам. Новое дело — файл js/cases/cNN.js и строка здесь.
import c01 from '../cases/c01.js';
import c02 from '../cases/c02.js';
import c03 from '../cases/c03.js';
import c04 from '../cases/c04.js';
import c05 from '../cases/c05.js';
import c06 from '../cases/c06.js';
import c07 from '../cases/c07.js';
import c08 from '../cases/c08.js';
import c09 from '../cases/c09.js';
import c10 from '../cases/c10.js';
import c11 from '../cases/c11.js';
import c12 from '../cases/c12.js';
import c13 from '../cases/c13.js';
import c14 from '../cases/c14.js';
import c15 from '../cases/c15.js';
import c16 from '../cases/c16.js';
import c17 from '../cases/c17.js';
import c18 from '../cases/c18.js';
import c19 from '../cases/c19.js';
import c20 from '../cases/c20.js';

export const CHAPTERS = [
  { no: 1, title: 'Первый след', sub: 'Глава I', img: 'ui/ch1' },
  { no: 2, title: 'Сеть', sub: 'Глава II', img: 'ui/ch2' },
  { no: 3, title: 'Архитектор', sub: 'Глава III', img: 'ui/ch3' },
];

export const CASES = [c01, c02, c03, c04, c05, c06, c07, c08, c09, c10,
  c11, c12, c13, c14, c15, c16, c17, c18, c19, c20];

// сколько дел будет в главе всего (ещё не написанные показываются закрытыми «скоро»)
export const PLANNED = 30;
export const PLANNED_TITLES = [
  'Пропавший автомобиль', 'Квартира №17', 'Последний звонок', 'Мёртвый свидетель', 'Пожар',
  'Чужое имя', 'Двойник', 'Исчезновение', 'Старое дело', 'Связь',
  'Ошибка', 'Три свидетеля', 'Эксперимент', 'Исчезнувшая улика', 'Предатель',
  'Мёртвый город', 'Цена ошибки', 'Человек без прошлого', 'Охота', 'Сеть',
  'Начало', 'Архив', 'Семья', 'Исчезнувший детектив', 'Последний свидетель',
  'Лабиринт', 'Предательство', 'Последняя схема', 'Архитектор', 'Последнее дело',
];
