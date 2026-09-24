const DICT = {
  ru: {
    play: 'Играть', profile: 'Профиль', settings: 'Настройки', exit: 'Выход', back: 'Назад',
    tagline: 'Выживает тот, кто выбрал верно', best: 'Лучший результат',
    exitHint: 'Закройте вкладку, чтобы выйти из игры',
    // профиль
    avatarTitle: 'Ваш аватар', tabPerson: 'Человек', person: 'Выберите внешность', tabLook: 'Внешность', tabClothes: 'Одежда', tabAcc: 'Аксессуары', tabBg: 'Фон', tabName: 'Имя',
    gender: 'Пол', male: 'Мужчина', female: 'Женщина', faceShape: 'Форма лица', skin: 'Оттенок кожи', hair: 'Причёска', hairColor: 'Цвет волос',
    eyes: 'Цвет глаз', brows: 'Брови', beard: 'Борода', mustache: 'Усы', top: 'Верх', topColor: 'Цвет верха', pants: 'Цвет брюк',
    eyewear: 'Очки', watch: 'Часы', chain: 'Цепь', rings: 'Кольца', headwear: 'Головной убор', background: 'Фон', name: 'Имя игрока',
    random: 'Случайно', continue: 'Продолжить', namePlaceholder: 'Введите имя',
    // режимы
    chooseMode: 'Выбор режима', single: 'Одиночная игра', singleDesc: 'Вы против системы. Переживите как можно больше раундов.',
    team: 'Командная игра', teamDesc: 'Создайте комнату или войдите в чужую. Последний выживший побеждает.', soon: 'Скоро',
    cellsCount: 'Количество клеток', startGame: 'Начать игру',
    // настройки
    music: 'Музыка', sfx: 'Эффекты', fullscreen: 'Полный экран', resolution: 'Разрешение', quality: 'Качество', lang: 'Язык', fieldTheme: 'Тема поля',
    on: 'Вкл', off: 'Выкл', high: 'Высокое', low: 'Низкое', randomTheme: 'Случайная',
    // игра
    round: 'Раунд', cellsLeft: 'Осталось клеток', theme: 'Тема', chooseCell: 'Выберите клетку', confirmQ: 'Выбрать эту клетку?',
    confirm: 'Подтвердить', cancel: 'Отмена', waiting: 'Жребий брошен', inGame: 'В игре', out: 'Выбыл', winner: 'Победитель',
    survived: 'Вы выжили', eliminated: 'Вы выбыли', timeUp: 'Время вышло', seconds: 'секунд', leave: 'Покинуть игру',
    autoKept: 'Вы остались на своей клетке', autoRandom: 'Клетка выбрана случайно', lastCell: 'Последняя клетка — ваша',
    // результат
    gameOver: 'Игра окончена', result: 'Результат', initialCells: 'Начальное количество клеток', roundsPassed: 'Пройдено раундов',
    cellsRemain: 'Осталось клеток', date: 'Дата игры', playAgain: 'Играть снова', toMenu: 'В главное меню', newBest: 'Рекорд',
  },
  en: {
    play: 'Play', profile: 'Profile', settings: 'Settings', exit: 'Exit', back: 'Back',
    tagline: 'Only the right choice survives', best: 'Best result',
    exitHint: 'Close the tab to exit the game',
    avatarTitle: 'Your avatar', tabPerson: 'Person', person: 'Choose a look', tabLook: 'Look', tabClothes: 'Clothes', tabAcc: 'Accessories', tabBg: 'Backdrop', tabName: 'Name',
    gender: 'Gender', male: 'Male', female: 'Female', faceShape: 'Face shape', skin: 'Skin tone', hair: 'Hairstyle', hairColor: 'Hair color',
    eyes: 'Eye color', brows: 'Brows', beard: 'Beard', mustache: 'Mustache', top: 'Top', topColor: 'Top color', pants: 'Pants color',
    eyewear: 'Eyewear', watch: 'Watch', chain: 'Chain', rings: 'Rings', headwear: 'Headwear', background: 'Backdrop', name: 'Player name',
    random: 'Random', continue: 'Continue', namePlaceholder: 'Enter name',
    chooseMode: 'Choose mode', single: 'Single player', singleDesc: 'You against the system. Survive as many rounds as you can.',
    team: 'Team game', teamDesc: 'Create a room or join one. The last survivor wins.', soon: 'Soon',
    cellsCount: 'Number of cells', startGame: 'Start game',
    music: 'Music', sfx: 'Effects', fullscreen: 'Fullscreen', resolution: 'Resolution', quality: 'Quality', lang: 'Language', fieldTheme: 'Field theme',
    on: 'On', off: 'Off', high: 'High', low: 'Low', randomTheme: 'Random',
    round: 'Round', cellsLeft: 'Cells left', theme: 'Theme', chooseCell: 'Choose a cell', confirmQ: 'Choose this cell?',
    confirm: 'Confirm', cancel: 'Cancel', waiting: 'The die is cast', inGame: 'Alive', out: 'Eliminated', winner: 'Winner',
    survived: 'You survived', eliminated: 'You are out', timeUp: 'Time is up', seconds: 'seconds', leave: 'Leave game',
    autoKept: 'You stayed on your cell', autoRandom: 'A random cell was chosen', lastCell: 'The last cell is yours',
    gameOver: 'Game over', result: 'Result', initialCells: 'Starting cells', roundsPassed: 'Rounds survived',
    cellsRemain: 'Cells left', date: 'Date', playAgain: 'Play again', toMenu: 'Main menu', newBest: 'Record',
  },
};

let lang = 'ru';
export const setLang = (l) => { lang = DICT[l] ? l : 'ru'; };
export const getLang = () => lang;
export const t = (k) => DICT[lang][k] ?? DICT.ru[k] ?? k;
