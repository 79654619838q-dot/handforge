const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const jwt = require('jsonwebtoken');
const fs = require('fs');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// Единая авторизация с PhotoQuest: тот же JWT_SECRET, что и у server/.env там.
// Ник больше не берётся из формы — сервер сам подставляет username из токена,
// so игрока нельзя выдать себя за другого и лобби не спрашивает "как вас зовут".
const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-me';

io.use((socket, next) => {
    const token = socket.handshake.auth && socket.handshake.auth.token;
    if (!token) return next(new Error('unauthorized'));
    try {
        const payload = jwt.verify(token, JWT_SECRET);
        if (!payload.username) return next(new Error('unauthorized'));
        socket.authUser = { id: payload.sub, username: payload.username };
        next();
    } catch (e) {
        next(new Error('unauthorized'));
    }
});

app.use(express.static('public', {
    setHeaders: (res) => res.setHeader('Cache-Control', 'no-cache')
}));

const rooms = {};
const players = {};

// ---------- Библиотека аватарок ----------
// Папка проекта, куда можно просто СКОПИРОВАТЬ картинки (PNG/JPG/JPEG/WEBP) —
// без правки кода они сами появятся в меню выбора аватарки в лобби. Сервер
// сканирует её "вживую" по каждому запросу (не только один раз при старте),
// поэтому добавленный на лету файл подхватится уже на следующем открытии
// лобби/пикера, без перезапуска сервера.
const AVATARS_DIRS = [
    path.join(__dirname, 'public', 'images', 'avatars'),
    path.join(__dirname, 'public', 'images', 'avatar')
];
const AVATAR_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.webp']);

function scanAvatarLibrary() {
    const seen = new Set();
    const result = [];
    for (const dir of AVATARS_DIRS) {
        let files;
        try {
            files = fs.readdirSync(dir);
        } catch (e) {
            continue;
        }
        const folderName = path.basename(dir);
        for (const f of files) {
            if (!AVATAR_EXTENSIONS.has(path.extname(f).toLowerCase())) continue;
            if (seen.has(f)) continue;
            seen.add(f);
            result.push({
                id: f,
                name: path.basename(f, path.extname(f)).replace(/[_-]+/g, ' ').trim() || f,
                url: 'images/' + folderName + '/' + encodeURIComponent(f)
            });
        }
    }
    return result.sort((a, b) => a.name.localeCompare(b.name, 'ru'));
}

// Название стола задаётся организатором при создании — обрезаем пробелы,
// ограничиваем длину и подставляем дефолт по номеру стола, если пусто.
function sanitizeRoomName(name, fallbackId) {
    const trimmed = typeof name === 'string' ? name.trim().slice(0, 40) : '';
    return trimmed || `Стол ${fallbackId}`;
}

// ---------- Итоги кэш-столов (закуп/стек/профит каждого игрока) ----------
// Пока стол жив, эти данные и так лежат в room.players (см. p.totalBuyIn),
// а клиенты получают их через playersUpdate. Но когда стол закрывается
// (последний живой игрок вышел), room целиком удаляется из памяти — чтобы
// итоги не терялись, снимаем "снимок" перед удалением и держим его отдельно:
// сначала в памяти (closedRoomLedgers), а также пишем на диск, чтобы данные
// пережили и перезапуск сервера.
const LEDGER_DIR = path.join(__dirname, 'data', 'ledgers');
try { fs.mkdirSync(LEDGER_DIR, { recursive: true }); } catch (e) { /* уже существует */ }

const closedRoomLedgers = {};
const MAX_STORED_LEDGERS = 200; // защита от бесконечного роста папки/памяти

try {
    fs.readdirSync(LEDGER_DIR)
        .filter(f => f.endsWith('.json'))
        .forEach(file => {
            try {
                const data = JSON.parse(fs.readFileSync(path.join(LEDGER_DIR, file), 'utf8'));
                if (data && data.id) closedRoomLedgers[data.id] = data;
            } catch (e) { /* повреждённый файл — пропускаем */ }
        });
} catch (e) { /* папки ещё нет — ничего страшного */ }

function buildLedgerSnapshot(room, closed) {
    return {
        id: room.id,
        name: room.name || `Стол ${room.id}`,
        mode: room.mode || 'race',
        maxPlayers: room.maxPlayers,
        startingStack: room.startingStack,
        closed: !!closed,
        closedAt: closed ? Date.now() : null,
        updatedAt: Date.now(),
        players: room.players.map(p => ({
            name: p.name,
            color: p.color,
            avatar: p.avatar || null,
            totalBuyIn: p.totalBuyIn || 0,
            rebuys: p.rebuys || 0,
            chips: p.chips || 0,
            seated: p.seated !== false,
            connected: !!p.connected,
            eliminated: !!p.eliminated
        }))
    };
}

// Итоги кэш-стола пишутся НЕ только при закрытии стола, а на каждом заметном
// изменении денег: при закупе/рёбае и в конце каждой раздачи. Раньше снимок
// делался единственный раз — в closeRoom() — поэтому пока стол жив, раздел
// "История столов" в лобби был пуст, а при падении/перезапуске сервера все
// закупы терялись вообще. Теперь на диске всегда лежит свежая картина.
function saveRoomLedger(room, closed) {
    if (!room || room.mode !== 'holdem-cash') return;
    if (!closed && !room.players.some(p => (p.totalBuyIn || 0) > 0)) return;
    const snapshot = buildLedgerSnapshot(room, closed);
    closedRoomLedgers[room.id] = snapshot;
    persistClosedLedger(snapshot);
}

function persistClosedLedger(snapshot) {
    try {
        fs.writeFileSync(path.join(LEDGER_DIR, `${snapshot.id}.json`), JSON.stringify(snapshot));
    } catch (e) {
        console.error('Не удалось сохранить итоги стола на диск:', e.message);
    }
    // Держим не больше MAX_STORED_LEDGERS записей — удаляем самые старые.
    const ids = Object.keys(closedRoomLedgers);
    if (ids.length > MAX_STORED_LEDGERS) {
        const sorted = ids.sort((a, b) => (closedRoomLedgers[a].closedAt || 0) - (closedRoomLedgers[b].closedAt || 0));
        const toRemove = sorted.slice(0, ids.length - MAX_STORED_LEDGERS);
        toRemove.forEach(id => {
            delete closedRoomLedgers[id];
            try { fs.unlinkSync(path.join(LEDGER_DIR, `${id}.json`)); } catch (e) { /* уже нет файла */ }
        });
    }
}

// ---------- Сессия игрока за конкретным столом ----------
// Статистика (общий закуп, число докупок) живёт в объекте комнаты, т.е.
// привязана к УНИКАЛЬНОМУ ID стола, а не к его названию. Два стола с
// одинаковым названием «2/5», созданные в разные дни, — это два разных
// room.id и, соответственно, две полностью независимые сессии. Комната
// удаляется — сессии вместе с ней, новый стол начинает счёт с нуля.
//
// Ключ — ник в нижнем регистре: игрок может выйти со стола и вернуться под
// тем же ником (даже с другого устройства/сокета) и продолжит свою сессию.
function sessionKey(name) {
    return String(name == null ? '' : name).trim().toLowerCase();
}

function getRoomSession(room, name) {
    if (!room.sessions) room.sessions = {};
    const key = sessionKey(name);
    if (!room.sessions[key]) {
        room.sessions[key] = { name, totalBuyIn: 0, rebuys: 0 };
    }
    return room.sessions[key];
}

// Записать закуп в сессию стола. first === true — это первая посадка за этот
// стол, всё последующее считается докупкой и суммируется.
function addBuyInToSession(room, player, amount) {
    const session = getRoomSession(room, player.name);
    const isRebuy = session.totalBuyIn > 0;
    session.totalBuyIn += amount;
    if (isRebuy) session.rebuys += 1;
    player.totalBuyIn = session.totalBuyIn;
    player.rebuys = session.rebuys;
    return session;
}

// Подтянуть сессию на игрока при (пере)входе за стол.
function restoreSessionOntoPlayer(room, player) {
    const session = getRoomSession(room, player.name);
    player.totalBuyIn = session.totalBuyIn;
    player.rebuys = session.rebuys;
}

const COLORS = ['#e74c3c', '#3498db', '#2ecc71', '#f39c12', '#9b59b6', '#1abc9c', '#e91e63', '#ff5722'];

function generateId() {
    return Math.random().toString(36).substring(2, 9);
}

function createDeck() {
    const suits = ['♠', '♥', '♦', '♣'];
    const ranks = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];
    const deck = [];
    for (const suit of suits) {
        for (const rank of ranks) {
            deck.push({ suit, rank, value: ranks.indexOf(rank) + 2 });
        }
    }
    for (let i = deck.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [deck[i], deck[j]] = [deck[j], deck[i]];
    }
    return deck;
}

// Оценка ровно 5 карт: возвращает ранг категории (0-8) и полный список
// тай-брейкеров в правильном порядке значимости (не просто "карты по убыванию" —
// например для фулл-хауса важно сначала сравнить номинал тройки, а не старшую
// карту в руке, иначе "44466" мог бы ошибочно выиграть у "66677").
function getHandRank(cards) {
    const sorted = [...cards].sort((a, b) => b.value - a.value);
    const values = sorted.map(c => c.value);

    const isFlush = cards.every(c => c.suit === cards[0].suit);

    const uniqueValues = [...new Set(values)];
    let isStraight = false;
    let straightHigh = 0;
    if (uniqueValues.length === 5) {
        if (uniqueValues[0] - uniqueValues[4] === 4) {
            isStraight = true;
            straightHigh = uniqueValues[0];
        } else if (uniqueValues[0] === 14 && uniqueValues[1] === 5 &&
                   uniqueValues[2] === 4 && uniqueValues[3] === 3 && uniqueValues[4] === 2) {
            // "колесо" A-2-3-4-5 — стрит со старшей картой 5
            isStraight = true;
            straightHigh = 5;
        }
    }

    // Группируем по номиналу: сначала по количеству карт (каре/трипс/пара впереди
    // кикеров), затем внутри одинакового количества — по номиналу, по убыванию.
    const counts = {};
    values.forEach(v => counts[v] = (counts[v] || 0) + 1);
    const groups = Object.keys(counts)
        .map(v => ({ value: parseInt(v, 10), count: counts[v] }))
        .sort((a, b) => (b.count - a.count) || (b.value - a.value));

    if (isStraight && isFlush) {
        return { rank: 8, name: 'Стрит-флеш', tiebreak: [straightHigh], cards: sorted };
    }
    if (groups[0].count === 4) {
        return { rank: 7, name: 'Каре', tiebreak: [groups[0].value, groups[1].value], cards: sorted };
    }
    if (groups[0].count === 3 && groups[1] && groups[1].count >= 2) {
        return { rank: 6, name: 'Фулл-хаус', tiebreak: [groups[0].value, groups[1].value], cards: sorted };
    }
    if (isFlush) {
        return { rank: 5, name: 'Флеш', tiebreak: values, cards: sorted };
    }
    if (isStraight) {
        return { rank: 4, name: 'Стрит', tiebreak: [straightHigh], cards: sorted };
    }
    if (groups[0].count === 3) {
        const kickers = groups.slice(1).map(g => g.value);
        return { rank: 3, name: 'Тройка', tiebreak: [groups[0].value, ...kickers], cards: sorted };
    }
    if (groups[0].count === 2 && groups[1] && groups[1].count === 2) {
        return {
            rank: 2, name: 'Две пары',
            tiebreak: [groups[0].value, groups[1].value, groups[2].value],
            cards: sorted
        };
    }
    if (groups[0].count === 2) {
        const kickers = groups.slice(1).map(g => g.value);
        return { rank: 1, name: 'Пара', tiebreak: [groups[0].value, ...kickers], cards: sorted };
    }
    return { rank: 0, name: 'Старшая карта', tiebreak: values, cards: sorted };
}

// Сравнивает два результата getHandRank/evaluateHoldingHand: >0 если a сильнее,
// <0 если b сильнее, 0 — точная ничья (для сплита банка).
function compareHandResults(a, b) {
    if (a.rank !== b.rank) return a.rank - b.rank;
    const len = Math.max(a.tiebreak.length, b.tiebreak.length);
    for (let i = 0; i < len; i++) {
        const av = a.tiebreak[i] ?? 0;
        const bv = b.tiebreak[i] ?? 0;
        if (av !== bv) return av - bv;
    }
    return 0;
}

// Omaha-style: строго 2 карты из руки + 3 со стола (п.13 регламента).
// Перебирает все сочетания и выбирает по-настоящему лучшую комбинацию —
// сравнивая не только категорию (пара/фулл-хаус/...), но и тай-брейкеры внутри неё.
function evaluateHoldingHand(holeCards, communityCards) {
    let best = null;
    let bestHoleValueSum = -1;

    for (let i = 0; i < holeCards.length; i++) {
        for (let j = i + 1; j < holeCards.length; j++) {
            const holeValueSum = holeCards[i].value + holeCards[j].value;
            for (let a = 0; a < communityCards.length; a++) {
                for (let b = a + 1; b < communityCards.length; b++) {
                    for (let c = b + 1; c < communityCards.length; c++) {
                        const hand = [holeCards[i], holeCards[j], communityCards[a], communityCards[b], communityCards[c]];
                        const result = getHandRank(hand);
                        const cmp = best ? compareHandResults(result, best) : 1;
                        // При точной ничьей по силе руки (cmp === 0) между разными парами
                        // карт из руки — выбираем ту пару, где карты старше. Раньше в таком
                        // случае оставался первый найденный вариант перебора, из-за чего
                        // подсветка иногда падала на "случайную" пару вместо интуитивно
                        // ожидаемой (например, не подсвечивались тузы в руке).
                        if (cmp > 0 || (cmp === 0 && holeValueSum > bestHoleValueSum)) {
                            best = result;
                            best.cards = hand;
                            bestHoleValueSum = holeValueSum;
                        }
                    }
                }
            }
        }
    }

    return best;
}

// Все сочетания по k элементов из массива — нужно для HandForge Pro, где у
// игрока может быть 0, 1 или 2 карты в руке (часть могла "сгореть"), и лучшую
// комбинацию нужно искать по всем 5-картовым наборам из руки+борда, как в
// обычном техасском холдеме (а не строго "2 из руки + 3 со стола", как в Omaha).
function kCombinations(arr, k) {
    const results = [];
    const combo = [];
    function helper(start) {
        if (combo.length === k) {
            results.push(combo.slice());
            return;
        }
        for (let i = start; i < arr.length; i++) {
            combo.push(arr[i]);
            helper(i + 1);
            combo.pop();
        }
    }
    helper(0);
    return results;
}

// HandForge Pro (п.11 регламента: "стандартное определение победителя по
// правилам техасского холдема") — лучшая комбинация из любых 5 карт среди
// карманных карт игрока (0-2 шт., часть могла сгореть) и борда (5 карт).
function evaluateHoldemBest(holeCards, communityCards) {
    const all = [...holeCards, ...communityCards];
    let best = null;
    for (const combo of kCombinations(all, 5)) {
        const result = getHandRank(combo);
        if (!best || compareHandResults(result, best) > 0) {
            best = result;
            best.cards = combo;
        }
    }
    return best;
}

// HandForge Race: на ривере игрок получает 4-ю карманную карту, но по
// регламенту в игре по-прежнему используются только 2 карманные + 3 бордовые.
// Вместо того чтобы заставлять игрока сбрасывать карты руками, сервер сам
// находит лучшую пару из 4 карманных карт (перебором через evaluateHoldingHand)
// и оставляет в p.hand только её — остальные 2 карты сгорают. Возвращает для
// каждого игрока список сгоревших карт (для лога/анимации на клиенте).
function trimRaceHoleCardsAfterRiver(room, activePlayers) {
    const burned = {};
    activePlayers.forEach(p => {
        if (!p.hand || p.hand.length <= 2) return;
        const best = evaluateHoldingHand(p.hand, room.communityCards);
        if (!best || !best.cards) return;
        const keep = p.hand.filter(c => best.cards.some(bc => bc === c));
        if (keep.length !== 2) return; // на всякий случай — не трогаем руку, если что-то пошло не так
        const discarded = p.hand.filter(c => !keep.includes(c));
        p.hand = keep;
        if (discarded.length) burned[p.id] = discarded;
    });
    return burned;
}

// Игрок, который завис/вылетел, но ещё не выбыл по фишкам: карты ему сдаём и
// блайнды/анте с него списываем как обычно (это уже сделано до вызова этой
// функции), но действовать он не может — поэтому сразу фолдим его в начале
// раздачи, а не ждём, пока истечёт таймер хода.
function autoFoldDisconnected(room, tournamentPlayers) {
    tournamentPlayers.forEach(p => {
        if (!p.connected && !p.folded) {
            p.folded = true;
            io.to(room.id).emit('playerFolded', p.name);
        }
    });
}

// Для позиции баттона/блайндов зависший игрок не пропускается (он должен
// продолжать платить блайнды/анте, пока не выбыл по фишкам) — в отличие от
// getNextPlayer, который используется для того, кто РЕАЛЬНО ходит, и там
// отключённый пропускается, т.к. действовать он не может.
function getNextSeatAny(room, currentIndex) {
    const list = room.players;
    let idx = (currentIndex + 1) % list.length;
    let attempts = 0;
    while (attempts < list.length) {
        if (!list[idx].eliminated && list[idx].seated !== false) return idx;
        idx = (idx + 1) % list.length;
        attempts++;
    }
    return -1;
}

function getNextPlayer(room, currentIndex) {
    const list = room.players;
    let idx = (currentIndex + 1) % list.length;
    let attempts = 0;
    while (attempts < list.length) {
        const p = list[idx];
        if (!p.folded && !p.eliminated && p.connected && p.chips > 0 && !p.allIn && p.seated !== false) return idx;
        idx = (idx + 1) % list.length;
        attempts++;
    }
    return -1;
}

function getActivePlayers(room) {
    // Игроки, ещё в текущей раздаче (не сбросили карты). В кэше наблюдатели
    // (ещё не заняли место за столом) в раздаче не участвуют.
    return room.players.filter(p => !p.folded && !p.eliminated && p.connected && p.seated !== false);
}

function getTournamentPlayers(room) {
    // Игроки, ещё в турнире (не выбыли по фишкам). Специально НЕ фильтруем по
    // connected — зависший/вылетевший игрок продолжает получать карты и
    // платить блайнды/анте (просто сразу фолдится каждую раздачу), пока не
    // вернётся или не спустит все фишки. Наблюдателей (кэш) тоже исключаем.
    return room.players.filter(p => !p.eliminated && p.seated !== false);
}

// Поздняя регистрация в турнире открыта первые LATE_REG_LEVELS уровней блайндов
const LATE_REG_LEVELS = 6;

// Стандартная турнирная структура блайндов (25 уровней) — задана явно, как в
// обычных покерных приложениях, а не рассчитывается по формуле.
const HOLDEM_TOURNEY_LEVELS = [
    { sb: 25, bb: 50, ante: 0 },
    { sb: 50, bb: 100, ante: 0 },
    { sb: 75, bb: 150, ante: 0 },
    { sb: 100, bb: 200, ante: 0 },
    { sb: 150, bb: 300, ante: 0 },
    { sb: 150, bb: 300, ante: 25 },
    { sb: 200, bb: 300, ante: 25 },
    { sb: 300, bb: 600, ante: 50 },
    { sb: 400, bb: 800, ante: 50 },
    { sb: 500, bb: 1000, ante: 100 },
    { sb: 750, bb: 1500, ante: 100 },
    { sb: 1000, bb: 2000, ante: 200 },
    { sb: 1500, bb: 3000, ante: 300 },
    { sb: 2000, bb: 4000, ante: 400 },
    { sb: 2500, bb: 5000, ante: 500 },
    { sb: 3000, bb: 6000, ante: 500 },
    { sb: 4000, bb: 8000, ante: 800 },
    { sb: 5000, bb: 10000, ante: 1000 },
    { sb: 6000, bb: 12000, ante: 1000 },
    { sb: 8000, bb: 16000, ante: 1500 },
    { sb: 10000, bb: 20000, ante: 2000 },
    { sb: 12000, bb: 24000, ante: 2000 },
    { sb: 15000, bb: 30000, ante: 3000 },
    { sb: 20000, bb: 40000, ante: 4000 },
    { sb: 25000, bb: 50000, ante: 5000 }
];

function generateBlindSchedule(startBB, growing) {
    if (!growing) {
        const bb0 = Math.max(2, startBB);
        return [{ sb: Math.max(1, Math.round(bb0 / 2)), bb: bb0, ante: 0 }];
    }
    // Берём стандартную структуру начиная с уровня, чей ББ ближе всего к
    // выбранному стартовому размеру (чтобы "быстрый"/"глубокий" старт стека
    // так же влиял на стартовые блайнды, как и раньше).
    let startIdx = HOLDEM_TOURNEY_LEVELS.findIndex(l => l.bb >= startBB);
    if (startIdx === -1) startIdx = 0;
    return HOLDEM_TOURNEY_LEVELS.slice(startIdx);
}

function getRoomList() {
    return Object.values(rooms)
        .filter(r => r.stage === 'waiting' || r.mode === 'holdem-cash')
        .map(r => ({
            id: r.id,
            name: r.name || `Стол ${r.id}`,
            mode: r.mode || 'race',
            players: r.players.filter(p => p.seated !== false).length,
            maxPlayers: r.maxPlayers,
            ante: r.ante,
            startingStack: r.startingStack,
            inProgress: r.stage !== 'waiting'
        }));
}

function broadcastRoomList() {
    io.emit('roomList', getRoomList());
}

// Полная остановка и удаление комнаты — используется, когда стол больше
// никому не нужен (например, кэш-стол опустел). Останавливаем все таймеры,
// чтобы не осталось "висящих" интервалов на удалённой комнате.
function closeRoom(room) {
    clearInterval(room.blindTimer);
    clearTimeout(room.emptyCloseTimer);
    clearTimeout(room.turnTimer);
    clearTimeout(room.proPickTimer);
    // Снимаем итоги кэш-стола перед удалением (только если кто-то реально
    // закупался — не сохраняем пустые/несостоявшиеся столы).
    if (room.mode === 'holdem-cash' && room.players.some(p => (p.totalBuyIn || 0) > 0)) {
        saveRoomLedger(room, true);
    }
    delete rooms[room.id];
    broadcastRoomList();
}

// Кэш-стол закрывается сам, как только за столом не осталось ни одного
// живого (подключённого) игрока — не важно, ушли ли они по кнопке "Выйти"
// или просто закрыли вкладку.
// Пустой кэш-стол закрывается НЕ мгновенно, а через минуту — чтобы игрок,
// который случайно закрыл вкладку или у которого отвалился интернет, успел
// вернуться на свой же стол и продолжить сессию (закуп/докупки сохраняются).
// Если за эту минуту кто-то зашёл — таймер отменяется.
const EMPTY_CASH_ROOM_TTL = 60000;

function cancelEmptyRoomClose(room) {
    if (room && room.emptyCloseTimer) {
        clearTimeout(room.emptyCloseTimer);
        room.emptyCloseTimer = null;
    }
}

function scheduleEmptyRoomClose(room) {
    if (room.emptyCloseTimer) return;
    const roomId = room.id;
    room.emptyCloseTimer = setTimeout(() => {
        const current = rooms[roomId];
        if (!current) return;
        current.emptyCloseTimer = null;
        if (current.players.some(p => p.connected)) return; // кто-то вернулся
        console.log(`Кэш-стол ${roomId} пуст больше минуты — закрываем`);
        closeRoom(current);
    }, EMPTY_CASH_ROOM_TTL);
}

function closeCashRoomIfEmpty(room) {
    if (room.mode !== 'holdem-cash') return false;
    const anyoneLeft = room.players.some(p => p.connected);
    if (anyoneLeft) {
        cancelEmptyRoomClose(room);
        return false;
    }
    scheduleEmptyRoomClose(room);
    return false;
}

// Отдельно от EMPTY_CASH_ROOM_TTL (которая закрывает СТОЛ целиком, когда
// ушли ВСЕ): здесь про конкретное МЕСТО конкретного игрока, пока за столом
// остаются другие игроки. Причина дисконнекта не важна — закрыл вкладку,
// вышел кнопкой из кэша, пропал интернет — во всех случаях место игрока
// держится за ним минуту на случай быстрого возврата, а по истечении
// минуты без реконнекта освобождается само, и на него может сесть кто-то
// другой. Таймер хранится прямо на объекте игрока (он не пропадает из
// room.players при обычном дисконнекте — см. keepForLedger), поэтому его
// легко отменить при реконнекте по этому же объекту.
const SEAT_RELEASE_TTL = 60000;

function cancelSeatRelease(player) {
    if (player && player.seatReleaseTimer) {
        clearTimeout(player.seatReleaseTimer);
        player.seatReleaseTimer = null;
    }
}

function scheduleSeatRelease(room, player) {
    if (!room || !player) return;
    if (room.mode !== 'holdem-cash') return;
    if (player.seated === false) return; // уже не сидит — освобождать нечего
    cancelSeatRelease(player);
    const roomId = room.id;
    const playerId = player.id;
    player.seatReleaseTimer = setTimeout(() => {
        player.seatReleaseTimer = null;
        if (player.connected) return; // успел вернуться — место не трогаем
        if (player.seated === false) return; // уже освобождено другим путём
        const current = rooms[roomId];
        if (!current) return;
        console.log(`Место игрока ${player.name} за столом ${roomId} освобождено — минута без реконнекта`);
        player.seated = false;
        player.seatSlot = null;
        player.folded = true;
        io.to(roomId).emit('seatLeft', player.name);
        broadcastPlayerStates(current);
        broadcastRoomList();
        closeCashRoomIfEmpty(current);
    }, SEAT_RELEASE_TTL);
}

// Кэш-игра стартует сама, как только за столом набирается 2 игрока — без
// нажатия организатором кнопки "Начать" (у него на кэш-столе такой кнопки
// теперь и вовсе нет).
function beginGame(room) {
    room.stage = 'preflop';
    broadcastRoomList();
    startBlindTimer(room);
    startNewHand(room);
}

function getPlayerStates(room) {
    return room.players.map(p => ({
        name: p.name,
        color: p.color,
        avatar: p.avatar || null,
        chips: p.chips,
        bet: p.bet,
        folded: p.folded,
        allIn: p.allIn,
        connected: p.connected,
        eliminated: p.eliminated,
        seated: p.seated !== false,
        seatSlot: p.seatSlot != null ? p.seatSlot : null,
        isOrganizer: p.id === room.organizerId,
        totalBuyIn: p.totalBuyIn || 0,
        rebuys: p.rebuys || 0
    }));
}

function broadcastPlayerStates(room) {
    io.to(room.id).emit('playersUpdate', {
        players: getPlayerStates(room),
        dealer: room.players[room.dealerIndex] ? room.players[room.dealerIndex].name : null
    });
}

// П.18: обычное решение — 60 сек, решение против чужого олл-ина — 90 сек
function getTurnTimeLimit(room) {
    const facingAllIn = getActivePlayers(room).some(p => p.allIn);
    return facingAllIn ? 90000 : 60000;
}

function joinPlayerToRoom(socket, player, room) {
    player.room = room.id;
    const isCash = room.mode === 'holdem-cash';
    // В кэше стек не выдаётся при входе — игрок сам вводит сумму закупа,
    // когда садится за конкретное место (см. обработчик 'takeSeat').
    player.chips = isCash ? 0 : room.startingStack;
    // Закуп считается ПО СТОЛУ, а не за всю жизнь сокета: объект игрока живёт
    // в players[socket.id] и переезжает из комнаты в комнату, поэтому без
    // сброса закуп со старого стола приплюсовывался бы к новому.
    player.totalBuyIn = 0;
    player.rebuys = 0;
    if (isCash) {
        // Кэш: если этот ник уже играл за ЭТИМ столом (вышел и вернулся) —
        // поднимаем его сессию: общий закуп и число докупок продолжаются.
        restoreSessionOntoPlayer(room, player);
    } else {
        player.totalBuyIn = room.startingStack;
    }
    cancelEmptyRoomClose(room);
    player.folded = false;
    player.hand = [];
    player.bet = 0;
    player.allIn = false;
    player.connected = true;
    player.eliminated = false;
    // В кэше игрок сначала наблюдатель — сам решает, когда сесть за стол
    // (п. "заходит и выбирает свободное место сам"). В остальных режимах
    // садится сразу, как раньше.
    player.seated = room.mode !== 'holdem-cash';
    player.seatSlot = null;
    // Если игрок присоединяется, когда раздача уже идёт (поздняя регистрация
    // в турнире, или новый игрок в кэше) — в текущей раздаче он не участвует,
    // подключится начиная со следующей.
    if (room.stage !== 'waiting') player.folded = true;

    room.players.push(player);
    socket.join(room.id);

    io.to(room.id).emit('playerJoined', {
        organizerId: room.organizerId,
        mode: room.mode || 'race',
        players: room.players.map(p => ({
            name: p.name,
            color: p.color,
            avatar: p.avatar || null,
            chips: p.chips,
            seated: p.seated !== false,
            seatSlot: p.seatSlot != null ? p.seatSlot : null,
            isOrganizer: p.id === room.organizerId
        }))
    });

    if (room.players.length >= 2) {
        io.to(room.id).emit('canStart', true);
    }
}

function startNewHand(room) {
    if (room.mode === 'pro') {
        startNewHandPro(room);
    } else if (room.mode === 'holdem-cash' || room.mode === 'holdem-tourney') {
        startNewHandHoldem(room);
    } else {
        startNewHandRace(room);
    }
}

// Общая часть начала раздачи для всех режимов: проверка конца
// турнира/паузы кэш-игры, новая колода, переход баттона, снимок стеков.
// Возвращает список участников раздачи или null, если раздачу начинать не
// нужно (турнир закончен / в кэше не хватает игроков с фишками).
function setupNewHandCommon(room) {
    const tournamentPlayers = getTournamentPlayers(room);

    clearTimeout(room.proPickTimer);
    room.proPick = null;

    if (tournamentPlayers.length <= 1) {
        room.stage = room.variant === 'cash' ? 'waiting' : 'finished';
        if (room.variant === 'cash') {
            // Кэш-игра не заканчивается победителем — она просто ставится на
            // паузу, пока не наберётся хотя бы 2 игрока с фишками (рёбай не
            // реализован в этой версии — присоединение новых игроков решает).
            io.to(room.id).emit('cashPaused', {
                reason: 'Не хватает игроков с фишками для продолжения'
            });
            broadcastRoomList();
        } else {
            clearInterval(room.blindTimer);
            io.to(room.id).emit('tournamentOver', {
                winner: tournamentPlayers[0] ? tournamentPlayers[0].name : null
            });
        }
        return null;
    }

    room.handNumber = (room.handNumber || 0) + 1;
    room.deck = createDeck();
    room.communityCards = [];
    room.revealedCount = 0;
    room.pot = 0;
    room.currentBet = 0;
    room.stage = 'preflop';

    // Баттон переходит следующему оставшемуся в игре игроку (зависших не
    // пропускаем — они всё ещё в игре и платят блайнды/анте)
    let nextDealer = getNextSeatAny(room, room.dealerIndex);
    if (nextDealer === -1) nextDealer = (room.dealerIndex + 1) % room.players.length;
    room.dealerIndex = nextDealer;

    const handStartChips = {};
    tournamentPlayers.forEach(p => {
        handStartChips[p.name] = p.chips;
        p.folded = false;
        p.hand = [];
        p.bet = 0;
        p.allIn = false;
    });
    room.handStartChips = handStartChips;
    room.handParticipants = tournamentPlayers.map(p => p.name);

    return tournamentPlayers;
}

// Общая часть начала раздачи для обоих режимов: проверка конца турнира,
// новая колода, переход баттона, сбор анте 1 ББ со всех. Возвращает список
// участников раздачи или null, если турнир уже закончился (и дальше
// продолжать раздачу не нужно).
function setupNewHand(room) {
    const tournamentPlayers = setupNewHandCommon(room);
    if (!tournamentPlayers) return null;

    // П.9: анте 1 ББ с каждого, блайндов нет
    tournamentPlayers.forEach(p => {
        const anteAmount = Math.min(room.ante, p.chips);
        p.chips -= anteAmount;
        room.pot += anteAmount;
        if (p.chips === 0) p.allIn = true;
    });

    return tournamentPlayers;
}

// ---------- HandForge Race (как было) ----------
function startNewHandRace(room) {
    const tournamentPlayers = setupNewHand(room);
    if (!tournamentPlayers) return;

    tournamentPlayers.forEach(p => {
        p.hand = [room.deck.pop(), room.deck.pop()];
    });
    autoFoldDisconnected(room, tournamentPlayers);

    io.to(room.id).emit('newHand', {
        dealer: room.players[room.dealerIndex].name,
        pot: room.pot,
        stage: room.stage,
        handNumber: room.handNumber,
        ante: room.ante,
        mode: 'race'
    });

    tournamentPlayers.forEach(p => {
        io.to(p.id).emit('yourCards', p.hand);
    });

    broadcastPlayerStates(room);

    // П.9-10: на префлопе торгов нет — сразу открываем флоп
    setTimeout(() => dealFlop(room), 1400);
}

// ---------- HandForge Pro ----------
// Карманные карты НЕ раздаются автоматически — игроки выбирают их сами из
// личной колоды после флопа и после терна (см. регламент п.1-10).
function startNewHandPro(room) {
    const tournamentPlayers = setupNewHand(room);
    if (!tournamentPlayers) return;

    // Хвост руки формируется только выбором карт — на старте у всех пусто
    tournamentPlayers.forEach(p => { p.hand = []; });
    autoFoldDisconnected(room, tournamentPlayers);

    io.to(room.id).emit('newHand', {
        dealer: room.players[room.dealerIndex].name,
        pot: room.pot,
        stage: room.stage,
        handNumber: room.handNumber,
        ante: room.ante,
        mode: 'pro'
    });

    broadcastPlayerStates(room);

    // П.2-3: сразу открываем флоп, дальше — выбор первой карты
    setTimeout(() => dealFlop(room), 1400);
}

// ---------- HandForge Hold'em (кэш и турнир) ----------
// Обычный техасский холдем: блайнды вместо анте, 2 карманные карты сразу,
// полноценные торги на префлопе, флопе, тёрне и ривере, без лимита ставок.
function startNewHandHoldem(room) {
    const tournamentPlayers = setupNewHandCommon(room);
    if (!tournamentPlayers) return;

    tournamentPlayers.forEach(p => { p.hand = []; });

    // Хедз-ап (2 игрока) — особое правило: баттон = малый блайнд, и он же
    // первый ход на префлопе (но последний на постфлоп-улицах).
    let sbIndex, bbIndex;
    if (tournamentPlayers.length === 2) {
        sbIndex = room.dealerIndex;
        bbIndex = getNextSeatAny(room, room.dealerIndex);
    } else {
        sbIndex = getNextSeatAny(room, room.dealerIndex);
        bbIndex = getNextSeatAny(room, sbIndex);
    }
    room.sbIndex = sbIndex;
    room.bbIndex = bbIndex;

    const sbPlayer = room.players[sbIndex];
    const bbPlayer = room.players[bbIndex];

    // Анте (только в турнире с определённого уровня) — со всех участников
    if (room.currentAnte > 0) {
        tournamentPlayers.forEach(p => {
            const anteAmount = Math.min(room.currentAnte, p.chips);
            p.chips -= anteAmount;
            room.pot += anteAmount;
            if (p.chips === 0) p.allIn = true;
        });
    }

    const sbAmount = Math.min(room.smallBlind, sbPlayer.chips);
    sbPlayer.chips -= sbAmount;
    sbPlayer.bet = sbAmount;
    if (sbPlayer.chips === 0) sbPlayer.allIn = true;

    const bbAmount = Math.min(room.bigBlind, bbPlayer.chips);
    bbPlayer.chips -= bbAmount;
    bbPlayer.bet = bbAmount;
    if (bbPlayer.chips === 0) bbPlayer.allIn = true;

    room.currentBet = Math.max(sbPlayer.bet, bbPlayer.bet);

    tournamentPlayers.forEach(p => {
        p.hand = [room.deck.pop(), room.deck.pop()];
    });
    autoFoldDisconnected(room, tournamentPlayers);

    io.to(room.id).emit('newHand', {
        dealer: room.players[room.dealerIndex].name,
        pot: room.pot,
        stage: room.stage,
        handNumber: room.handNumber,
        ante: room.currentAnte,
        sb: room.smallBlind,
        bb: room.bigBlind,
        sbName: sbPlayer.name,
        bbName: bbPlayer.name,
        mode: room.mode,
        level: (room.blindLevelIndex || 0) + 1,
        levelDeadline: room.blindLevelDeadline || null,
        lateRegOpen: room.mode === 'holdem-tourney' ? (room.blindLevelIndex < LATE_REG_LEVELS) : null
    });

    tournamentPlayers.forEach(p => {
        io.to(p.id).emit('yourCards', p.hand);
    });

    broadcastPlayerStates(room);

    setTimeout(() => beginPreflopBettingHoldem(room), 1200);
}

function beginPreflopBettingHoldem(room) {
    if (room.stage !== 'preflop') return;
    room.roundCap = null; // Hold'em без лимита ставок

    const canAct = getActivePlayers(room).filter(p => p.chips > 0 && !p.allIn);
    if (canAct.length < 2) {
        setTimeout(() => autoAdvance(room), 900);
        return;
    }

    // Первый ход на префлопе — игрок после большого блайнда (UTG)
    room.currentPlayerIndex = getNextPlayer(room, room.bbIndex);
    if (room.currentPlayerIndex === -1) {
        setTimeout(() => autoAdvance(room), 900);
        return;
    }

    const currentPlayer = room.players[room.currentPlayerIndex];
    io.to(room.id).emit('turn', {
        player: currentPlayer.name,
        timeLimit: getTurnTimeLimit(room)
    });
    startTurnTimer(room);
}

// Переход на следующий уровень блайндов (только турнир Hold'em)
function advanceBlindLevel(room) {
    if (!room || room.mode !== 'holdem-tourney' || room.stage === 'finished') {
        clearInterval(room && room.blindTimer);
        return;
    }
    room.blindLevelIndex = Math.min(room.blindLevelIndex + 1, room.blindSchedule.length - 1);
    const level = room.blindSchedule[room.blindLevelIndex];
    room.smallBlind = level.sb;
    room.bigBlind = level.bb;
    room.currentAnte = level.ante;
    room.blindLevelDeadline = Date.now() + room.levelMinutes * 60000;
    io.to(room.id).emit('blindLevelUp', {
        level: room.blindLevelIndex + 1,
        sb: room.smallBlind,
        bb: room.bigBlind,
        ante: room.currentAnte,
        levelMs: room.levelMinutes * 60000,
        levelDeadline: room.blindLevelDeadline,
        lateRegOpen: room.blindLevelIndex < LATE_REG_LEVELS
    });
}

function startBlindTimer(room) {
    if (room.mode !== 'holdem-tourney' || room.blindTimer) return;
    room.blindLevelDeadline = Date.now() + room.levelMinutes * 60000;
    room.blindTimer = setInterval(() => advanceBlindLevel(room), room.levelMinutes * 60000);
}

function dealFlop(room) {
    if (room.stage !== 'preflop') return; // комната могла закрыться/смениться
    room.stage = 'flop';
    room.communityCards = [room.deck.pop(), room.deck.pop(), room.deck.pop()];
    room.revealedCount = 3;
    io.to(room.id).emit('flop', { cards: room.communityCards, pot: room.pot });
    broadcastPlayerStates(room);
    if (room.mode === 'pro') {
        beginProPick(room, 1);
    } else {
        beginBettingRound(room);
    }
}

function beginBettingRound(room) {
    // Сбрасываем флаг "уже походил" здесь же (а не только в advanceStage),
    // иначе на самом первом круге торгов (флоп после анте) остаются
    // устаревшие значения с прошлой раздачи, и торги могут быть пропущены.
    room.players.forEach(p => { p.bet = 0; p.hasActed = false; });
    room.currentBet = 0;

    // П.4/6/7 регламента HandForge Pro: максимальный размер ставки/повышения
    // за раз — 2 ББ на флопе, 4 ББ на терне, 8 ББ на ривере. В Race лимита нет.
    if (room.mode === 'pro') {
        const capBB = { flop: 2, turn: 4, river: 8 }[room.stage] || 8;
        room.roundCap = capBB * room.ante;
    } else {
        room.roundCap = null;
    }

    const canAct = getActivePlayers(room).filter(p => p.chips > 0 && !p.allIn);
    if (canAct.length < 2) {
        // Все, кроме максимум одного, уже олл-ин — торги невозможны, докручиваем стадии автоматически
        setTimeout(() => autoAdvance(room), 900);
        return;
    }

    room.currentPlayerIndex = getNextPlayer(room, room.dealerIndex);
    if (room.currentPlayerIndex === -1) {
        setTimeout(() => autoAdvance(room), 900);
        return;
    }

    const currentPlayer = room.players[room.currentPlayerIndex];
    io.to(room.id).emit('turn', {
        player: currentPlayer.name,
        timeLimit: getTurnTimeLimit(room)
    });
    startTurnTimer(room);
}

function autoAdvance(room) {
    if (room.stage === 'river') {
        endHand(room);
        return;
    }
    advanceStage(room, true);
}

function startTurnTimer(room) {
    if (room.turnTimer) clearTimeout(room.turnTimer);
    const timeLimit = getTurnTimeLimit(room);
    room.turnTimer = setTimeout(() => handleTimeout(room), timeLimit);
}

// Если время на ход вышло, но игроку ничего не нужно докладывать (чек
// бесплатный — например, ББ на префлопе, если никто не рейзил) — таймаут
// делает чек, а не фолд. Раньше игрок терял карты за одно только молчание,
// даже когда мог бесплатно остаться в раздаче — это несправедливо.
function handleTimeout(room) {
    const player = room.players[room.currentPlayerIndex];
    if (!player) return;
    player.hasActed = true;
    if (room.currentBet <= player.bet) {
        io.to(room.id).emit('playerAction', { player: player.name, action: 'check' });
        broadcastPlayerStates(room);
        nextPlayer(room);
    } else {
        handleFold(room, player);
    }
}

function handleFold(room, player) {
    player.folded = true;
    io.to(room.id).emit('playerFolded', player.name);
    broadcastPlayerStates(room);

    const active = getActivePlayers(room);
    if (active.length <= 1) {
        endHand(room);
        return;
    }
    nextPlayer(room);
}

function nextPlayer(room) {
    const active = getActivePlayers(room);
    if (active.length <= 1) {
        endHand(room);
        return;
    }

    const contestants = room.players.filter(p => !p.folded && !p.eliminated && p.connected);
    const allBetsEqual = contestants.every(p => p.allIn || p.bet === room.currentBet);
    const allActed = contestants.every(p => p.hasActed || p.allIn);

    if (allBetsEqual && allActed) {
        advanceStage(room, false);
        return;
    }

    room.currentPlayerIndex = getNextPlayer(room, room.currentPlayerIndex);
    if (room.currentPlayerIndex === -1) {
        advanceStage(room, false);
        return;
    }

    const currentPlayer = room.players[room.currentPlayerIndex];
    io.to(room.id).emit('turn', {
        player: currentPlayer.name,
        timeLimit: getTurnTimeLimit(room)
    });
    startTurnTimer(room);
}

function advanceStage(room, silent) {
    clearTimeout(room.turnTimer);

    room.players.forEach(p => {
        room.pot += p.bet;
        p.bet = 0;
        p.hasActed = false;
    });
    room.currentBet = 0;

    const active = getActivePlayers(room);

    switch (room.stage) {
        case 'preflop': {
            // HandForge Hold'em: после круга торгов на префлопе открываем флоп
            // (Race/Pro сюда никогда не попадают — у них флоп открывается
            // сразу после анте, минуя торги на префлопе).
            room.stage = 'flop';
            room.communityCards = [room.deck.pop(), room.deck.pop(), room.deck.pop()];
            room.revealedCount = 3;
            io.to(room.id).emit('flop', { cards: room.communityCards, pot: room.pot });
            break;
        }

        case 'flop': {
            room.stage = 'turn';
            const turnCard = room.deck.pop();
            room.communityCards.push(turnCard);
            room.revealedCount = 4;
            if (room.mode === 'pro') {
                applyProBurns(room, turnCard, active);
            } else if (room.mode === 'race') {
                active.forEach(p => p.hand.push(room.deck.pop()));
            }
            io.to(room.id).emit('turnCard', {
                cards: room.communityCards,
                pot: room.pot,
                playersDealt: room.mode === 'race' ? active.map(p => p.name) : []
            });
            if (room.mode === 'race') active.forEach(p => io.to(p.id).emit('yourCards', p.hand));
            break;
        }

        case 'turn': {
            room.stage = 'river';
            const riverCard = room.deck.pop();
            room.communityCards.push(riverCard);
            room.revealedCount = 5;
            let raceBurned = null;
            if (room.mode === 'pro') {
                applyProBurns(room, riverCard, active);
            } else if (room.mode === 'race') {
                active.forEach(p => p.hand.push(room.deck.pop()));
                // Race: сразу после раздачи 4-й карманной карты сервер сам
                // выбирает лучшую пару под текущий борд и сбрасывает 2 лишние.
                raceBurned = trimRaceHoleCardsAfterRiver(room, active);
            }
            io.to(room.id).emit('river', {
                cards: room.communityCards,
                pot: room.pot,
                playersDealt: room.mode === 'race' ? active.map(p => p.name) : []
            });
            if (room.mode === 'race') {
                active.forEach(p => {
                    io.to(p.id).emit('yourCards', p.hand);
                    const discarded = raceBurned && raceBurned[p.id];
                    if (discarded && discarded.length) {
                        io.to(p.id).emit('raceHoleCardsDiscarded', discarded.map(c => ({ suit: c.suit, rank: c.rank })));
                    }
                });
            }
            break;
        }

        case 'river':
            endHand(room);
            return;
    }

    broadcastPlayerStates(room);

    // П.5: после терна — выбор второй карты (только HandForge Pro).
    // После ривера выбора нет — сразу финальный круг торгов.
    if (room.mode === 'pro' && room.stage === 'turn') {
        beginProPick(room, 2);
    } else {
        beginBettingRound(room);
    }
}

// П.10 регламента HandForge Pro: если новая карта борда (терн/ривер) точно
// совпадает по масти и номиналу с уже выбранной картой игрока — та сгорает.
function applyProBurns(room, newCard, activePlayers) {
    (activePlayers || getActivePlayers(room)).forEach(p => {
        const before = p.hand.length;
        p.hand = p.hand.filter(c => !(c.suit === newCard.suit && c.rank === newCard.rank));
        if (p.hand.length !== before) {
            io.to(p.id).emit('yourCards', p.hand);
            io.to(p.id).emit('cardBurned', { suit: newCard.suit, rank: newCard.rank });
        }
    });
}

// ---------- HandForge Pro: выбор карты игроком ----------
// pickNumber: 1 — после флопа, 2 — после терна.
function beginProPick(room, pickNumber) {
    const activePlayers = getActivePlayers(room);
    if (activePlayers.length <= 1) {
        endHand(room);
        return;
    }

    room.proPick = {
        pickNumber,
        pending: new Set(activePlayers.map(p => p.id)),
        // Регламент HandForge Pro, блокировки при выборе карты:
        //
        // 1) ФЛОП блокирует НОМИНАЛ целиком. Если на флопе лежит K♠, то из
        //    личной колоды нельзя взять ни одного короля — ни K♥, ни K♦, ни K♣.
        //
        // 2) ТЁРН (и ривер) блокирует только КОНКРЕТНУЮ КАРТУ — номинал+масть.
        //    Если на флопе королей не было, а на тёрне вышел K♦, то K♦ взять
        //    нельзя, а K♠ / K♥ / K♣ — можно, они свободны.
        //
        // Раньше карты борда после флопа не блокировались вообще, и игрок мог
        // выбрать себе точную копию тёрна — она тут же сгорала по п.10
        // (applyProBurns), т.е. ход просто пропадал. Теперь такой выбор
        // недоступен и на клиенте (кнопка неактивна), и на сервере.
        blockedRanks: [...new Set(room.communityCards.slice(0, 3).map(c => c.rank))],
        blockedCards: room.communityCards.slice(3).map(c => ({ suit: c.suit, rank: c.rank }))
    };

    activePlayers.forEach(p => {
        io.to(p.id).emit('proPickPhase', {
            pickNumber,
            blockedRanks: room.proPick.blockedRanks,
            blockedCards: room.proPick.blockedCards,
            timeLimit: 60000,
            yourHand: p.hand
        });
    });
    io.to(room.id).emit('proPickWaiting', {
        pickNumber,
        players: activePlayers.map(p => p.name)
    });

    clearTimeout(room.proPickTimer);
    room.proPickTimer = setTimeout(() => resolveProPick(room, true), 60000);
}

// Единая проверка "можно ли взять эту карту из личной колоды" — используется
// и при ручном выборе (socket 'chooseCard'), и при автовыборе по таймауту,
// чтобы правила нельзя было обойти, просто просидев 60 секунд.
// Возвращает текст ошибки или null, если карта доступна.
function proPickBlockReason(proPick, playerHand, suit, rank) {
    if (!proPick) return 'Сейчас не время выбирать карту';
    if ((proPick.blockedRanks || []).includes(rank)) {
        return 'Этот номинал есть на флопе — весь номинал заблокирован';
    }
    if ((proPick.blockedCards || []).some(c => c.suit === suit && c.rank === rank)) {
        return 'Эта карта уже лежит на столе — выберите другую масть этого номинала';
    }
    if ((playerHand || []).some(c => c.suit === suit && c.rank === rank)) {
        return 'Эта карта у вас уже выбрана';
    }
    return null;
}

function resolveProPick(room, timedOut) {
    if (!room.proPick) return;
    clearTimeout(room.proPickTimer);

    if (timedOut) {
        const SUITS = ['♠', '♥', '♦', '♣'];
        const RANKS = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];
        room.proPick.pending.forEach(id => {
            const p = room.players.find(pl => pl.id === id);
            if (!p) return;
            const available = [];
            for (const suit of SUITS) {
                for (const rank of RANKS) {
                    if (proPickBlockReason(room.proPick, p.hand, suit, rank)) continue;
                    available.push({ suit, rank, value: RANKS.indexOf(rank) + 2 });
                }
            }
            if (available.length) {
                const card = available[Math.floor(Math.random() * available.length)];
                p.hand.push(card);
                io.to(p.id).emit('yourCards', p.hand);
                io.to(room.id).emit('proPickProgress', { name: p.name, auto: true });
            }
        });
    }

    room.proPick = null;
    io.to(room.id).emit('proPickDone', {});
    beginBettingRound(room);
}

// Кэш: у игрока кончился стек. Со стола его НЕ снимаем и в лобби не
// выкидываем — место остаётся за ним, а ему сразу прилетает предложение
// докупиться на любую сумму в допустимых рамках. Купил — играет дальше с
// этого же места, ничего не теряя из сессии.
function offerRebuy(room, player) {
    if (room.mode !== 'holdem-cash') return;
    if (!player.connected || player.seated === false) return;
    const session = getRoomSession(room, player.name);
    io.to(player.id).emit('needRebuy', {
        slot: player.seatSlot,
        minBuyIn: Math.max(Math.round((room.bigBlind || room.ante || 1) * 10), 1),
        maxBuyIn: room.startingStack * 4,
        suggested: room.startingStack,
        totalBuyIn: session.totalBuyIn,
        rebuys: session.rebuys
    });
}

function checkEliminationsAndContinue(room) {
    room.players.forEach(p => {
        if (!p.eliminated && p.chips <= 0) {
            p.eliminated = true;
            if (room.mode === 'holdem-cash') {
                // В кэше "выбыл" означает лишь "стек на нуле" — предлагаем докупку.
                offerRebuy(room, p);
            } else {
                io.to(room.id).emit('playerEliminated', p.name);
            }
        }
    });
    // Раздача закончилась — стеки изменились, обновляем итоги стола.
    saveRoomLedger(room, false);
    broadcastPlayerStates(room);

    const remaining = getTournamentPlayers(room);
    if (remaining.length <= 1) {
        room.stage = room.variant === 'cash' ? 'waiting' : 'finished';
        if (room.variant === 'cash') {
            io.to(room.id).emit('cashPaused', {
                reason: 'Не хватает игроков с фишками для продолжения'
            });
            room.players.forEach(p => {
                if (p.seated !== false && (p.chips || 0) <= 0) offerRebuy(room, p);
            });
        } else {
            clearInterval(room.blindTimer);
            io.to(room.id).emit('tournamentOver', {
                winner: remaining[0] ? remaining[0].name : null
            });
        }
        broadcastRoomList();
        return;
    }

    setTimeout(() => startNewHand(room), 6000);
}

function pushHistory(room, entry) {
    room.history = room.history || [];
    room.history.unshift(entry);
    if (room.history.length > 50) room.history.length = 50;
    io.to(room.id).emit('handHistory', room.history);
}

// Реальный вклад каждого участника в банк за всю раздачу (анте + все круги
// торгов), посчитанный по разнице фишек, а не по room.pot — так это верно,
// даже если раздача закончилась фолдами посреди ещё не «влитого» в room.pot
// круга торгов (например все, кроме одного, сбросили карты сразу после чужого олл-ина).
function getHandContributions(room) {
    const names = room.handParticipants || room.players.map(p => p.name);
    return names.map(name => {
        const p = room.players.find(pl => pl.name === name);
        const before = room.handStartChips ? room.handStartChips[name] : 0;
        const chipsNow = p ? p.chips : 0;
        const contributed = Math.max(0, before - chipsNow);
        return { name, player: p, contributed, folded: p ? p.folded : true };
    }).filter(c => c.contributed > 0);
}

// Сайд-поты: если кто-то идёт олл-ин на сумму меньше, чем поставили остальные
// (например у одного стек 200, у другого 2000, и оба жмут «олл-ин»), банк
// нельзя выдавать одним куском — иначе игрок с 200 мог бы выиграть чужие 2000,
// хотя по правилам вправе забрать только то, что было поставлено против его 200.
// Банк режется на слои по уровням ставок; каждый слой разыгрывается только
// между теми, кто в него внёс деньги и не сбросил карты.
function buildSidePots(contributions) {
    const list = contributions.filter(c => c.contributed > 0);
    const levels = [...new Set(list.map(c => c.contributed))].sort((a, b) => a - b);
    const pots = [];
    let prevLevel = 0;
    let carry = 0; // деньги слоя, где не осталось ни одного не сбросившего игрока
    for (const level of levels) {
        const layerSize = level - prevLevel;
        const layerContributors = list.filter(c => c.contributed >= level);
        const amount = layerSize * layerContributors.length + carry;
        const eligible = layerContributors.filter(c => !c.folded).map(c => c.name);
        if (eligible.length > 0) {
            pots.push({ amount, eligible });
            carry = 0;
        } else {
            carry = amount;
        }
        prevLevel = level;
    }
    if (carry > 0) {
        if (pots.length > 0) pots[pots.length - 1].amount += carry;
        else pots.push({ amount: carry, eligible: list.filter(c => !c.folded).map(c => c.name) });
    }
    return pots;
}

function endHand(room) {
    clearTimeout(room.turnTimer);
    const active = getActivePlayers(room);

    if (active.length === 0) {
        checkEliminationsAndContinue(room);
        return;
    }

    if (active.length === 1) {
        // П.17: раздача закончилась без вскрытия — докручиваем борд, но прячем непоказанные карты
        const winner = active[0];
        const alreadyShown = room.communityCards.length;
        while (room.communityCards.length < 5) {
            room.communityCards.push(room.deck.pop());
        }
        const hiddenCards = room.communityCards.slice(alreadyShown);
        room.pendingRunout = hiddenCards.length ? hiddenCards.slice() : null;

        // Считаем банк по фактическим вкладам игроков, а не по room.pot — там
        // могли остаться не «влитыми» ставки текущего, ещё не завершённого круга.
        const contributions = getHandContributions(room);
        const totalPot = contributions.reduce((sum, c) => sum + c.contributed, 0);

        winner.chips += totalPot;
        room.pot = 0;

        pushHistory(room, {
            handNumber: room.handNumber,
            board: room.communityCards.slice(0, alreadyShown),
            fullBoard: room.communityCards.slice(),
            winner: winner.name,
            amount: totalPot,
            handName: null,
            participants: (room.handParticipants || []).map(name => {
                const p = room.players.find(pl => pl.name === name);
                const before = room.handStartChips ? room.handStartChips[name] : null;
                return {
                    name,
                    net: p && before != null ? p.chips - before : null,
                    hand: name === winner.name ? winner.hand : null,
                    buyIn: p ? (p.totalBuyIn || 0) : null
                };
            })
        });

        io.to(room.id).emit('handResult', {
            winner: winner.name,
            amount: totalPot,
            reason: 'Все сбросили карты',
            hiddenCount: hiddenCards.length,
            board: room.communityCards.slice(0, alreadyShown)
        });

        checkEliminationsAndContinue(room);
        return;
    }

    // Вскрытие (п.13-15): считаем лучшую комбинацию каждого игрока и сравниваем
    // их по-настоящему (категория + тай-брейкеры), а не только по rank —
    // иначе при равном rank «побеждал» бы просто первый в списке игрок.
    const results = active.map(p => ({
        player: p,
        result: (room.mode === 'pro' || room.mode === 'holdem-cash' || room.mode === 'holdem-tourney')
            ? evaluateHoldemBest(p.hand, room.communityCards)
            : evaluateHoldingHand(p.hand, room.communityCards)
    }));

    // Общий лучший результат раздачи — используется только для заголовка
    // истории/сообщения, реальное распределение банка идёт по сайд-потам ниже.
    let bestResult = results[0].result;
    for (const r of results) {
        if (compareHandResults(r.result, bestResult) > 0) bestResult = r.result;
    }

    // П.16: банк режем на слои по фактическим вкладам (сайд-поты) — короткий
    // стек, ушедший в олл-ин на меньшую сумму, может выиграть только тот слой,
    // куда он реально внёс деньги, а не всё, что доставили за столом остальные.
    const contributions = getHandContributions(room);
    const totalPot = contributions.reduce((sum, c) => sum + c.contributed, 0);
    const sidePots = buildSidePots(contributions);
    if (!sidePots.length && totalPot > 0) {
        sidePots.push({ amount: totalPot, eligible: active.map(p => p.name) });
    }

    const potAwards = {}; // имя -> суммарно выигранные фишки по всем слоям
    const potBreakdown = []; // для истории/отладки: кто что выиграл в каждом слое
    const contestedWinnerNames = new Set(); // только реально оспоренные слои (2+ участника) — иначе это просто возврат непокрытой части ставки, а не выигрыш комбинации

    sidePots.forEach(pot => {
        const eligibleResults = results.filter(r => pot.eligible.includes(r.player.name));
        if (!eligibleResults.length) return; // подстраховка, в норме не должно случаться

        if (eligibleResults.length === 1) {
            // Единственный участник этого слоя — значит, это непокрытая часть
            // его же ставки (остальные либо сфолдили, либо не смогли столько
            // поставить), и она просто возвращается ему, без сравнения комбинаций.
            const w = eligibleResults[0];
            w.player.chips += pot.amount;
            potAwards[w.player.name] = (potAwards[w.player.name] || 0) + pot.amount;
            potBreakdown.push({ amount: pot.amount, handName: null, winners: [w.player.name], uncalledReturn: true });
            return;
        }

        let potBest = eligibleResults[0].result;
        for (const r of eligibleResults) {
            if (compareHandResults(r.result, potBest) > 0) potBest = r.result;
        }
        const potWinners = eligibleResults.filter(r => compareHandResults(r.result, potBest) === 0);

        const share = Math.floor(pot.amount / potWinners.length);
        let remainder = pot.amount - share * potWinners.length;
        potWinners.forEach(w => {
            const amount = share + (remainder > 0 ? 1 : 0);
            if (remainder > 0) remainder--;
            w.player.chips += amount;
            potAwards[w.player.name] = (potAwards[w.player.name] || 0) + amount;
            contestedWinnerNames.add(w.player.name);
        });

        potBreakdown.push({
            amount: pot.amount,
            handName: potBest.name,
            winners: potWinners.map(w => w.player.name)
        });
    });

    room.pot = 0;

    // Заголовок/тег "Победитель" — только по реально оспоренным слоям. Тот, кто
    // получил деньги обратно лишь как возврат непокрытой ставки, победителем не
    // считается, даже если формально что-то "выиграл" в potAwards.
    const winnerNames = [...contestedWinnerNames];
    const winners = results.filter(r => contestedWinnerNames.has(r.player.name));

    const winningHoleCardsByPlayer = {};
    const usedHoleCardsByPlayer = {};
    results.forEach(r => {
        const used = r.player.hand.filter(hc =>
            r.result.cards.some(bc => bc.suit === hc.suit && bc.rank === hc.rank)
        );
        usedHoleCardsByPlayer[r.player.name] = used;
        if (winnerNames.includes(r.player.name)) winningHoleCardsByPlayer[r.player.name] = used;
    });
    // Обратная совместимость с клиентом, который ждёт одного победителя:
    const primaryWinner = winners[0];
    const winningHoleCards = primaryWinner ? winningHoleCardsByPlayer[primaryWinner.player.name] : [];

    pushHistory(room, {
        handNumber: room.handNumber,
        board: room.communityCards.slice(),
        fullBoard: room.communityCards.slice(),
        winner: winnerNames.join(' и '),
        amount: totalPot,
        handName: bestResult.name,
        pots: potBreakdown,
        participants: active.map(p => {
            const before = room.handStartChips ? room.handStartChips[p.name] : null;
            const r = results.find(x => x.player === p);
            return {
                name: p.name,
                net: before != null ? p.chips - before : null,
                hand: p.hand,
                handName: r ? r.result.name : null,
                usedHoleCards: usedHoleCardsByPlayer[p.name] || [],
                buyIn: p.totalBuyIn || 0
            };
        })
    });

    io.to(room.id).emit('handResult', {
        winner: winnerNames.join(' и '),
        amount: totalPot,
        hand: bestResult.name,
        cards: bestResult.cards,
        winnerHand: primaryWinner ? primaryWinner.player.hand : [],
        winningHoleCards,
        pots: potBreakdown,
        winners: winners.map(w => ({
            name: w.player.name,
            amount: potAwards[w.player.name] || 0,
            hand: w.result.name,
            winningHoleCards: winningHoleCardsByPlayer[w.player.name]
        })),
        revealedHands: active.map(p => ({ name: p.name, hand: p.hand }))
    });

    checkEliminationsAndContinue(room);
}

// Аватарка — data URL картинки, которую игрок сам выбрал/загрузил в лобби.
// Ужимается на клиенте до маленького квадрата перед отправкой, но на
// сервере на всякий случай тоже ограничиваем размер и формат строки.
const MAX_AVATAR_LEN = 60000;
function sanitizeAvatar(avatar) {
    if (typeof avatar !== 'string') return null;
    if (!avatar.startsWith('data:image/')) return null;
    if (avatar.length > MAX_AVATAR_LEN) return null;
    return avatar;
}

io.on('connection', (socket) => {
    console.log('Игрок подключился:', socket.id);

    // Лобби запрашивает это один раз при открытии страницы — отдаём
    // актуальное содержимое папки на этот момент (см. scanAvatarLibrary).
    socket.on('getAvatarLibrary', () => {
        socket.emit('avatarLibrary', scanAvatarLibrary());
    });

    socket.on('joinLobby', (data) => {
        const { color, avatar } = data || {};
        // Имя всегда берём из проверенного токена, а не из того, что прислал
        // клиент — data.name игнорируется намеренно (см. io.use выше).
        players[socket.id] = {
            id: socket.id,
            name: socket.authUser.username,
            color: color || COLORS[Math.floor(Math.random() * COLORS.length)],
            avatar: sanitizeAvatar(avatar),
            room: null
        };
        socket.emit('lobbyJoined', { id: socket.id, name: players[socket.id].name });
        socket.emit('roomList', getRoomList());
    });

    // Список кэш-столов для раздела "Итоги столов" в лобби. Раньше сюда
    // попадали ТОЛЬКО уже закрытые столы, поэтому список почти всегда был
    // пустой: пока за столом кто-то сидит, стол не закрывается. Теперь
    // отдаём и живые столы (прямо из rooms), и архив — живые первыми.
    socket.on('getClosedRoomsList', () => {
        const liveCash = Object.values(rooms).filter(r => r.mode === 'holdem-cash');
        const liveIds = new Set(liveCash.map(r => r.id));

        const live = liveCash
            .filter(r => r.players.some(p => (p.totalBuyIn || 0) > 0))
            .map(r => ({
                id: r.id,
                name: r.name || `Стол ${r.id}`,
                mode: r.mode,
                closed: false,
                closedAt: null,
                playersCount: r.players.length,
                totalBuyIn: r.players.reduce((s, p) => s + (p.totalBuyIn || 0), 0)
            }));

        const archived = Object.values(closedRoomLedgers)
            // Если стол ещё живой, его актуальная версия уже добавлена выше —
            // старый снимок из архива не показываем, чтобы не двоилось.
            .filter(r => !liveIds.has(r.id))
            .sort((a, b) => (b.closedAt || b.updatedAt || 0) - (a.closedAt || a.updatedAt || 0))
            .slice(0, 30)
            .map(r => ({
                id: r.id,
                name: r.name || `Стол ${r.id}`,
                mode: r.mode,
                closed: true,
                closedAt: r.closedAt || r.updatedAt || null,
                playersCount: r.players.length,
                totalBuyIn: r.players.reduce((s, p) => s + (p.totalBuyIn || 0), 0)
            }));

        socket.emit('closedRoomsList', [...live, ...archived]);
    });

    // Итоги по конкретному столу (закуп/финальный стек/профит каждого) —
    // работает и для ещё идущего стола, и для уже закрытого (из архива).
    socket.on('getRoomLedger', (data) => {
        const roomId = data && data.roomId;
        if (!roomId) return;
        const room = rooms[roomId];
        if (room) {
            socket.emit('roomLedger', {
                id: room.id,
                name: room.name || `Стол ${room.id}`,
                mode: room.mode || 'race',
                closed: false,
                closedAt: null,
                players: room.players.map(p => ({
                    name: p.name,
                    color: p.color,
                    avatar: p.avatar || null,
                    totalBuyIn: p.totalBuyIn || 0,
                    rebuys: p.rebuys || 0,
                    chips: p.chips || 0,
                    seated: p.seated !== false,
                    connected: !!p.connected,
                    eliminated: !!p.eliminated
                }))
            });
            return;
        }
        const closed = closedRoomLedgers[roomId];
        socket.emit('roomLedger', closed ? { ...closed, closed: true } : null);
    });

    socket.on('createRoom', (data) => {
        const { maxPlayers, ante, startingStack, mode, levelMinutes, smallBlind, name } = data;
        const roomId = generateId();
        const player = players[socket.id];
        const validModes = ['race', 'pro', 'holdem-cash', 'holdem-tourney'];
        const roomMode = validModes.includes(mode) ? mode : 'race';
        const isHoldem = roomMode === 'holdem-cash' || roomMode === 'holdem-tourney';

        const room = {
            id: roomId,
            name: sanitizeRoomName(name, roomId),
            mode: roomMode,
            players: [],
            maxPlayers: maxPlayers || 6,
            ante: ante || 20, // для Race/Pro — анте (1 ББ); для Hold'em — стартовый размер ББ
            startingStack: startingStack || 2000,
            organizerId: socket.id,
            organizerName: player ? player.name : null,
            dealerIndex: -1,
            deck: [],
            communityCards: [],
            pot: 0,
            currentBet: 0,
            stage: 'waiting',
            currentPlayerIndex: -1,
            turnTimer: null,
            handNumber: 0,
            history: []
        };

        if (isHoldem) {
            room.variant = roomMode === 'holdem-cash' ? 'cash' : 'tournament';
            room.levelMinutes = levelMinutes || 8;
            room.blindLevelIndex = 0;
            room.blindSchedule = generateBlindSchedule(ante || 20, room.variant === 'tournament');
            room.bigBlind = room.blindSchedule[0].bb;
            room.currentAnte = room.blindSchedule[0].ante;
            if (room.variant === 'cash' && smallBlind) {
                // Кэш: малый блайнд задаётся отдельно — от половины ББ и выше
                // (но не больше самого ББ — иначе это уже не малый блайнд).
                room.smallBlind = Math.min(Math.max(1, smallBlind), room.bigBlind);
            } else {
                room.smallBlind = room.blindSchedule[0].sb;
            }
        }

        rooms[roomId] = room;
        socket.emit('roomCreated', roomId);
        broadcastRoomList();
    });

    socket.on('joinRoom', (data) => {
        const { roomId } = data;
        const room = rooms[roomId];
        const player = players[socket.id];

        if (!room || !player) {
            socket.emit('error', 'Комната не найдена');
            return;
        }

        if (room.stage !== 'waiting') {
            // Игра уже идёт — новых игроков не подсаживаем, но разрешаем
            // вернуться тому, кто завис/вылетел (по имени, то же место, те же фишки).
            const existing = room.players.find(p => p.name === player.name && !p.connected);
            if (!existing) {
                // Кэш-стол принимает новых игроков в любой момент (садятся
                // наблюдателями, место занимают сами). Турнир — только пока не
                // закрылась поздняя регистрация (первые LATE_REG_LEVELS уровней).
                const lateRegOk = room.mode === 'holdem-cash'
                    || (room.mode === 'holdem-tourney' && room.blindLevelIndex < LATE_REG_LEVELS);
                if (!lateRegOk) {
                    socket.emit('error', room.mode === 'holdem-tourney' ? 'Регистрация на турнир закрыта' : 'Турнир уже идёт');
                    return;
                }
                if (room.players.length >= room.maxPlayers) {
                    socket.emit('error', 'Комната заполнена');
                    return;
                }
                socket.emit('roomJoined', { roomId, name: room.name || `Стол ${room.id}`, organizerId: room.organizerId, mode: room.mode || 'race', maxPlayers: room.maxPlayers, startingStack: room.startingStack, bigBlind: room.bigBlind || room.ante });
                joinPlayerToRoom(socket, player, room);
                socket.emit('boardSync', {
                    communityCards: room.communityCards,
                    pot: room.pot,
                    stage: room.stage,
                    handNumber: room.handNumber
                });
                return;
            }
            // Важно: players[socket.id] должен быть ТЕМ ЖЕ объектом, что лежит
            // в room.players (как при обычном входе через joinPlayerToRoom),
            // иначе обработчик 'action' будет менять состояние не того объекта.
            existing.id = socket.id;
            existing.connected = true;
            existing.room = room.id;
            restoreSessionOntoPlayer(room, existing);
            cancelEmptyRoomClose(room);
            cancelSeatRelease(existing);
            players[socket.id] = existing;
            socket.join(room.id);
            if (room.organizerName && existing.name === room.organizerName) {
                room.organizerId = socket.id;
            }
            socket.emit('roomJoined', { roomId, name: room.name || `Стол ${room.id}`, organizerId: room.organizerId, mode: room.mode || 'race', maxPlayers: room.maxPlayers, startingStack: room.startingStack, bigBlind: room.bigBlind || room.ante });
            io.to(room.id).emit('playerReconnected', existing.name);
            broadcastPlayerStates(room);
            if (existing.hand && existing.hand.length) {
                socket.emit('yourCards', existing.hand);
            }
            socket.emit('boardSync', {
                communityCards: room.communityCards,
                pot: room.pot,
                stage: room.stage,
                handNumber: room.handNumber
            });
            return;
        }

        // Стол стоит в паузе (stage 'waiting'), но за ним уже играли, и в
        // room.players может лежать запись вернувшегося игрока — с его закупом.
        // Возвращаем его на ту же запись, а не создаём вторую с тем же ником,
        // иначе в итогах стола один человек задваивался бы.
        const idleExisting = room.players.find(p => p.name === player.name && !p.connected);
        if (idleExisting) {
            idleExisting.id = socket.id;
            idleExisting.connected = true;
            idleExisting.room = room.id;
            idleExisting.folded = false;
            idleExisting.hand = [];
            idleExisting.bet = 0;
            idleExisting.allIn = false;
            restoreSessionOntoPlayer(room, idleExisting);
            cancelEmptyRoomClose(room);
            cancelSeatRelease(idleExisting);
            players[socket.id] = idleExisting;
            socket.join(room.id);
            if (room.organizerName && idleExisting.name === room.organizerName) {
                room.organizerId = socket.id;
            }
            socket.emit('roomJoined', { roomId, name: room.name || `Стол ${room.id}`, organizerId: room.organizerId, mode: room.mode || 'race', maxPlayers: room.maxPlayers, startingStack: room.startingStack, bigBlind: room.bigBlind || room.ante });
            io.to(room.id).emit('playerReconnected', idleExisting.name);
            broadcastPlayerStates(room);
            broadcastRoomList();
            return;
        }

        // Свободные места считаем по реально сидящим, а не по длине
        // room.players — в кэше там же лежат наблюдатели и уже ушедшие игроки,
        // которых мы держим ради итогов стола.
        const occupied = room.mode === 'holdem-cash'
            ? room.players.filter(p => p.connected && p.seated !== false).length
            : room.players.length;
        if (occupied >= room.maxPlayers) {
            socket.emit('error', 'Комната заполнена');
            return;
        }

        // Стол создавался с другого (лобби-)сокета, который уже отключился при
        // переходе на game.html — здесь мы узнаём организатора по имени и
        // перепривязываем organizerId к его текущему, реальному сокету.
        if (room.organizerName && player.name === room.organizerName) {
            room.organizerId = socket.id;
        }

        socket.emit('roomJoined', { roomId, name: room.name || `Стол ${room.id}`, organizerId: room.organizerId, mode: room.mode || 'race', maxPlayers: room.maxPlayers, startingStack: room.startingStack, bigBlind: room.bigBlind || room.ante });
        joinPlayerToRoom(socket, player, room);
        broadcastRoomList();
    });

    // Кэш: наблюдатель занимает свободное место сам
    socket.on('takeSeat', (data) => {
        const player = players[socket.id];
        if (!player || !player.room) return;
        const room = rooms[player.room];
        if (!room || room.mode !== 'holdem-cash') return;
        cancelSeatRelease(player);

        const slot = data && Number.isInteger(data.slot) ? data.slot : null;
        if (slot === null || slot < 0 || slot >= room.maxPlayers) {
            socket.emit('error', 'Выберите место за столом');
            return;
        }

        // Рёбай: при обнулении фишек в кэше игрок помечается только eliminated
        // (см. checkEliminationsAndContinue) — player.seated при этом НЕ
        // сбрасывается в false, он остаётся "за столом", просто без фишек,
        // пока сам не закупится заново или не встанет (leaveSeat). Раньше это
        // приводило к тому, что повторный 'takeSeat' на своё же место молча
        // отбрасывался ниже (player.seated уже true) — рёбай зависал на
        // закрытой модалке. Отличаем "рёбай на своё место" от обычной посадки
        // отдельным флагом и пропускаем и эту проверку, и проверку "место
        // занято" (иначе игрок находил бы там сам себя).
        const isRebuy = player.seated && player.eliminated && player.seatSlot === slot;
        if (player.seated && !isRebuy) return;

        const takenBy = room.players.find(p => p !== player && p.seated !== false && p.seatSlot === slot);
        if (takenBy) {
            socket.emit('error', 'Это место уже занято');
            return;
        }
        if (!isRebuy) {
            const seatedCount = room.players.filter(p => p.seated !== false).length;
            if (seatedCount >= room.maxPlayers) {
                socket.emit('error', 'За столом уже нет свободных мест');
                return;
            }
        }

        // Игрок сам выбирает размер закупа при посадке — ограничиваем разумными
        // рамками: минимум ~10 ББ (иначе играть почти нечем), максимум — 4
        // стартовых стека комнаты (защита от абсурдных значений).
        const minBuyIn = Math.max(Math.round((room.bigBlind || room.ante || 1) * 10), 1);
        const maxBuyIn = room.startingStack * 4;
        let buyIn = Number(data && data.buyIn);
        if (!Number.isFinite(buyIn) || buyIn <= 0) buyIn = room.startingStack;
        buyIn = Math.round(Math.min(Math.max(buyIn, minBuyIn), maxBuyIn));

        player.seated = true;
        player.seatSlot = slot;
        player.chips = buyIn;
        // Закуп идёт в сессию стола: первая посадка — закуп, всё дальнейшее —
        // докупка. Суммы складываются, докупки считаются отдельно.
        addBuyInToSession(room, player, buyIn);
        player.eliminated = false;
        cancelEmptyRoomClose(room);
        saveRoomLedger(room, false);
        broadcastPlayerStates(room);
        broadcastRoomList();
        io.to(room.id).emit('seatTaken', player.name);

        if (room.stage === 'waiting' && room.players.filter(p => p.seated !== false).length >= 2) {
            // Кэш: как только за столом два игрока — раздача начинается сама.
            beginGame(room);
        }
    });

    socket.on('leaveSeat', () => {
        const player = players[socket.id];
        if (!player || !player.room) return;
        const room = rooms[player.room];
        if (!room || room.mode !== 'holdem-cash') return;
        if (!player.seated) return;
        player.seated = false;
        player.seatSlot = null;
        player.folded = true;
        if (closeCashRoomIfEmpty(room)) return;
        broadcastPlayerStates(room);
        broadcastRoomList();
        io.to(room.id).emit('seatLeft', player.name);
    });

    // Осознанный выход из комнаты (кнопка "Выйти" на game.html, см. комментарий
    // в game.js). В отличие от обычного разрыва связи ('disconnect' ниже),
    // который оставляет игрока сидеть с пометкой "Отключён" в расчёте на
    // реконнект, здесь игрок сам решил уйти — поэтому сразу освобождаем его
    // место (во всех режимах, не только в кэше), фолдим его в текущей
    // раздаче, если он ещё в ней участвует, и передаём ход дальше, не
    // дожидаясь таймаута. Работает одинаково в Race/Pro/Hold'em Cash/Турнире.
    socket.on('leaveRoom', () => {
        const player = players[socket.id];
        if (!player || !player.room) return;
        const room = rooms[player.room];
        if (!room) { delete players[socket.id]; return; }
        // Явный выход отменяет отложенное автоосвобождение места (из
        // scheduleSeatRelease) — место освобождается немедленно чуть ниже,
        // повторный таймер тут уже ни к чему.
        cancelSeatRelease(player);

        // Стол ещё не стартовал — просто убираем игрока из списка целиком,
        // как при обычном дисконнекте на этой стадии.
        //
        // ИСКЛЮЧЕНИЕ (кэш): если игрок уже закупался (totalBuyIn > 0), удалять
        // его нельзя — вместе с ним из room.players пропал бы весь его закуп,
        // и вкладка "Игроки" / итоги стола показали бы неполную картину.
        // Кэш-стол между раздачами часто стоит именно в stage 'waiting'
        // (см. checkEliminationsAndContinue), так что раньше достаточно было
        // выйти в паузе — и человек исчезал из расчётов. Поэтому оставляем
        // его записью в room.players как отключённого наблюдателя.
        const keepForLedger = room.mode === 'holdem-cash' && (player.totalBuyIn || 0) > 0;

        if (room.stage === 'waiting' && !keepForLedger) {
            room.players = room.players.filter(p => p.id !== socket.id);
            if (room.players.length === 0) {
                clearInterval(room.blindTimer);
                delete rooms[room.id];
            } else {
                if (room.organizerId === socket.id) {
                    // П.6: организатор ушёл до старта — новый не назначается
                    room.organizerId = null;
                }
                io.to(room.id).emit('playerLeft', player.name);
                broadcastPlayerStates(room);
            }
            broadcastRoomList();
            delete players[socket.id];
            return;
        }

        const wasInHand = !player.folded && !player.eliminated && player.seated !== false;
        const wasCurrentTurn = !room.proPick && room.players[room.currentPlayerIndex]?.id === socket.id;

        player.connected = false;
        player.seated = false;
        player.seatSlot = null;
        if (wasInHand) player.folded = true;

        io.to(room.id).emit('seatLeft', player.name);
        io.to(room.id).emit('playerLeft', player.name);
        if (wasInHand) io.to(room.id).emit('playerFolded', player.name);

        if (closeCashRoomIfEmpty(room)) {
            delete players[socket.id];
            return;
        }

        broadcastPlayerStates(room);
        broadcastRoomList();

        // Если он как раз выбирал карту в HandForge Pro — убираем его из
        // ожидания, чтобы не блокировать раздачу остальным.
        if (room.proPick && room.proPick.pending.has(socket.id)) {
            room.proPick.pending.delete(socket.id);
            if (room.proPick.pending.size === 0) {
                resolveProPick(room, false);
            }
        } else if (wasCurrentTurn) {
            const active = getActivePlayers(room);
            if (active.length <= 1) {
                endHand(room);
            } else {
                nextPlayer(room);
            }
        }

        delete players[socket.id];
    });

    socket.on('startGame', () => {
        const player = players[socket.id];
        if (!player || !player.room) return;
        const room = rooms[player.room];
        if (!room || room.players.filter(p => p.seated !== false).length < 2) return;

        // П.5: кнопка "Начать игру" доступна только организатору
        if (room.organizerId !== socket.id) {
            socket.emit('error', 'Только организатор может начать турнир');
            return;
        }

        beginGame(room);
    });

    socket.on('revealRunout', () => {
        const player = players[socket.id];
        if (!player || !player.room) return;
        const room = rooms[player.room];
        if (!room || !room.pendingRunout) return;

        io.to(room.id).emit('runoutRevealed', room.pendingRunout);
        room.pendingRunout = null;
    });

    // Игрок сам решает показать свою руку сопернику (после фолда или уже
    // после завершения раздачи) — карты у него на сервере никуда не делись,
    // просто рассылаем их остальным по явному запросу.
    socket.on('showMyHand', () => {
        const player = players[socket.id];
        if (!player || !player.room) return;
        const room = rooms[player.room];
        if (!room || !player.hand || !player.hand.length) return;

        io.to(room.id).emit('handShown', { name: player.name, hand: player.hand });
    });

    socket.on('chatMessage', (data) => {
        const player = players[socket.id];
        if (!player || !player.room) return;
        const text = (data && data.text ? String(data.text) : '').slice(0, 300).trim();
        if (!text) return;
        io.to(player.room).emit('chatMessage', { name: player.name, text });
    });

    // HandForge Pro: игрок выбирает карту из своей личной колоды (п.8 регламента)
    socket.on('chooseCard', (data) => {
        const player = players[socket.id];
        if (!player || !player.room) return;
        const room = rooms[player.room];
        if (!room || room.mode !== 'pro' || !room.proPick) return;
        if (!room.proPick.pending.has(socket.id)) return;

        const SUITS = ['♠', '♥', '♦', '♣'];
        const RANKS = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];
        const suit = data && data.suit;
        const rank = data && data.rank;

        if (!SUITS.includes(suit) || !RANKS.includes(rank)) {
            socket.emit('error', 'Некорректная карта');
            return;
        }
        const blockReason = proPickBlockReason(room.proPick, player.hand, suit, rank);
        if (blockReason) {
            socket.emit('error', blockReason);
            return;
        }

        const value = RANKS.indexOf(rank) + 2;
        player.hand.push({ suit, rank, value });
        room.proPick.pending.delete(socket.id);

        socket.emit('yourCards', player.hand);
        io.to(room.id).emit('proPickProgress', { name: player.name });

        if (room.proPick.pending.size === 0) {
            resolveProPick(room, false);
        }
    });

    socket.on('action', (data) => {
        const { action, amount } = data;
        const player = players[socket.id];
        if (!player || !player.room) return;

        const room = rooms[player.room];
        if (!room || room.proPick || room.players[room.currentPlayerIndex]?.id !== socket.id) return;

        clearTimeout(room.turnTimer);
        player.hasActed = true;

        switch (action) {
            case 'fold':
                handleFold(room, player);
                break;

            case 'call': {
                const callAmount = room.currentBet - player.bet;
                if (callAmount > player.chips) {
                    player.allIn = true;
                    player.bet += player.chips;
                    player.chips = 0;
                } else {
                    player.chips -= callAmount;
                    player.bet += callAmount;
                }
                io.to(room.id).emit('playerAction', { player: player.name, action: 'call', amount: callAmount });
                broadcastPlayerStates(room);
                nextPlayer(room);
                break;
            }

            case 'raise': {
                let raiseAmount = amount || room.ante * 2;
                // П.4/6/7 HandForge Pro: размер ставки/повышения не может превышать
                // лимит текущей улицы (2/4/8 ББ). В Race лимита нет (room.roundCap = null).
                if (room.roundCap) raiseAmount = Math.min(raiseAmount, room.roundCap);
                const totalBet = room.currentBet + raiseAmount;
                const needToCall = totalBet - player.bet;

                if (needToCall >= player.chips) {
                    // Рейз на всю оставшуюся стопку — это уже олл-ин
                    room.currentBet = Math.max(room.currentBet, player.bet + player.chips);
                    player.bet += player.chips;
                    player.chips = 0;
                    player.allIn = true;
                } else {
                    player.chips -= needToCall;
                    player.bet = totalBet;
                    room.currentBet = totalBet;
                }

                room.players.forEach(p => {
                    if (p.id !== socket.id && !p.folded && !p.allIn) p.hasActed = false;
                });

                io.to(room.id).emit('playerAction', { player: player.name, action: 'raise', amount: player.bet });
                broadcastPlayerStates(room);
                nextPlayer(room);
                break;
            }

            case 'check':
                if (room.currentBet > player.bet) {
                    socket.emit('error', 'Нельзя чекнуть, нужно коллировать');
                    player.hasActed = false;
                    return;
                }
                io.to(room.id).emit('playerAction', { player: player.name, action: 'check' });
                broadcastPlayerStates(room);
                nextPlayer(room);
                break;

            case 'allin': {
                // В HandForge Pro лимиты фиксированные (2/4/8 ББ), олл-ина как
                // отдельного действия не предусмотрено — на всякий случай
                // отклоняем его и здесь, даже если запрос как-то пришёл от клиента.
                if (room.mode === 'pro') break;

                const allInAmount = player.chips;
                player.bet += allInAmount;
                player.chips = 0;
                player.allIn = true;
                if (player.bet > room.currentBet) {
                    room.currentBet = player.bet;
                    room.players.forEach(p => {
                        if (p.id !== socket.id && !p.folded && !p.allIn) p.hasActed = false;
                    });
                }
                io.to(room.id).emit('playerAction', { player: player.name, action: 'allin', amount: player.bet });
                broadcastPlayerStates(room);
                nextPlayer(room);
                break;
            }
        }
    });

    socket.on('disconnect', () => {
        const player = players[socket.id];
        if (player && player.room) {
            const room = rooms[player.room];
            if (room) {
                // Кэш: если игрок уже закупался за этим столом, его нельзя
                // молча стирать из room.players при разрыве связи в паузе
                // между раздачами (stage 'waiting') — вместе с ним пропал бы
                // весь его закуп из итогов стола, и его место занял бы
                // следующий севший игрок, как будто это место вообще не его.
                // Та же логика уже есть в 'leaveRoom' — здесь просто
                // применяем её и к обычному дисконнекту (закрытие вкладки,
                // потеря сети), а не только к явному выходу по кнопке.
                const keepForLedger = room.mode === 'holdem-cash' && (player.totalBuyIn || 0) > 0;
                if (room.stage === 'waiting' && !keepForLedger) {
                    room.players = room.players.filter(p => p.id !== socket.id);
                    if (room.players.length === 0) {
                        clearInterval(room.blindTimer);
                        delete rooms[room.id];
                    } else {
                        if (room.organizerId === socket.id) {
                            // П.6: организатор ушёл до старта — новый не назначается
                            room.organizerId = null;
                        }
                        io.to(room.id).emit('playerLeft', player.name);
                        broadcastPlayerStates(room);
                    }
                } else {
                    player.connected = false;
                    // Кэш: держим место минуту на случай быстрого реконнекта
                    // (перезагрузка страницы, моргнувший интернет), а если за
                    // это время игрок не вернулся — место освобождается само
                    // (см. scheduleSeatRelease) и на него можно сесть заново.
                    scheduleSeatRelease(room, player);
                    // Кэш: если это был последний живой игрок за столом — стол
                    // закрывается сам, никого больше уведомлять не нужно.
                    if (!closeCashRoomIfEmpty(room)) {
                        io.to(room.id).emit('playerDisconnected', player.name);
                        broadcastPlayerStates(room);
                    }
                }
                broadcastRoomList();
            }
        }
        delete players[socket.id];
        console.log('Игрок отключился:', socket.id);
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Сервер запущен на порту ${PORT}`);
});