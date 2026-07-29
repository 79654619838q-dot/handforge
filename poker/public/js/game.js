const socket = io({ auth: { token: localStorage.getItem('pq_access') } });
socket.on('connect_error', (err) => {
    if (err && err.message === 'unauthorized') {
        localStorage.removeItem('pq_access');
        location.replace('/quest/login?next=' + encodeURIComponent(location.pathname + location.search));
    }
});

const params = new URLSearchParams(window.location.search);
const roomId = params.get('room');
const playerName = sessionStorage.getItem('playerName');
const playerColor = sessionStorage.getItem('playerColor') || '#e74c3c';
// Аватар хранится в localStorage (не sessionStorage) — см. lobby.js. Раньше
// здесь оставалось старое sessionStorage.getItem, поэтому при переходе из
// лобби за стол аватар всегда терялся (выбирался, но не отображался).
const playerAvatar = localStorage.getItem('playerAvatar') || null;

let myName = playerName;
let myId = null;
let organizerId = null;
let dealerName = null;
let players = []; // {name,color,chips,bet,folded,allIn,connected,eliminated,isOrganizer}
let myHand = [];
let boardRevealed = [];
let boardHiddenCount = 0;
let handInProgress = false;
let handEnded = false;
let showdownHands = []; // [{name, hand}]
let winnerName = null;
let winningHoleCards = [];
let winningComboCards = []; // полная выигрышная комбинация (карманные + бордовые) — для затемнения неиспользованных карт борда при вскрытии
let winnerNamesSet = new Set();
let winningHoleCardsByPlayer = {};
let myHandRevealed = false;
let roomAnte = 20;
let turnTimerInterval = null;
let roomMode = 'race'; // 'race' | 'pro' | 'holdem-cash' | 'holdem-tourney'
let maxPlayersAtTable = 9;
let roomStartingStack = 2000;
let roomBigBlind = 20;
let pendingSeatSlot = null;
let isRebuyFlow = false; // окно закупа открыто как докупка после обнуления стека
let pickTimerInterval = null;
let proPickSuit = null; // выбранная масть на шаге 1 модалки выбора карты
let proPickBlockedRanks = [];   // номиналы, закрытые флопом (все 4 масти)
let proPickBlockedCards = [];   // конкретные карты борда после флопа (тёрн/ривер)
let activeTurnPlayer = null; // имя игрока, чей сейчас ход — для подсветки/таймера на ЛЮБОМ месте
let activeTurnDeadline = 0;
let activeTurnTotalTime = 1;
let seatTimerInterval = null;
let seatActionFlashes = {}; // name -> {label} — подпись действия у места игрока, висит до новой улицы/раздачи

const MODE_LABELS = {
    race: 'HandForge Race',
    pro: 'HandForge Pro',
    'holdem-cash': "HandForge Hold'em Cash",
    'holdem-tourney': "HandForge Hold'em Турнир"
};

// Названия категорий руки на русском (индекс = Poker.evaluateHand(...).rank)
const RANK_NAMES_RU = [
    'Старшая карта', 'Пара', 'Две пары', 'Тройка',
    'Стрит', 'Флеш', 'Фулл-хаус', 'Каре', 'Стрит-флеш'
];

const el = {
    roomIdLabel: document.getElementById('roomIdLabel'),
    handNumber: document.getElementById('handNumber'),
    playersCountHud: document.getElementById('playersCountHud'),
    dealerHud: document.getElementById('dealerHud'),
    dealerHudValue: document.getElementById('dealerHudValue'),
    potSize: document.getElementById('potSize'),
    stageLabel: document.getElementById('stageLabel'),
    leaveBtn: document.getElementById('leaveBtn'),
    felt: document.getElementById('felt'),
    potChip: document.getElementById('potChip'),
    boardCards: document.getElementById('boardCards'),
    runoutBtn: document.getElementById('runoutBtn'),
    seats: document.getElementById('seats'),
    waitingPanel: document.getElementById('waitingPanel'),
    waitingText: document.getElementById('waitingText'),
    waitingPanelCloseBtn: document.getElementById('waitingPanelCloseBtn'),
    startGameBtn: document.getElementById('startGameBtn'),
    logList: document.getElementById('logList'),
    historyList: document.getElementById('historyList'),
    chatLog: document.getElementById('chatLog'),
    chatInput: document.getElementById('chatInput'),
    sendChatBtn: document.getElementById('sendChatBtn'),
    actionBar: document.getElementById('actionBar'),
    // Резервный поиск по классу: если game.html не обновлялся (id="raiseGroup"
    // добавлен туда отдельной правкой) — ищем по классу .raise-group, который
    // существует в разметке с самого начала. Без этой подстраховки при
    // отсутствии id элемент был бы null, и любое обращение к el.raiseGroup
    // (например, в обработчике 'turn' — см. ниже) роняло бы весь обработчик
    // ошибкой ДО renderSeats()/startSeatTimers(), из-за чего стол вообще
    // переставал бы обновляться на каждый новый ход (в т.ч. аватарки).
    raiseGroup: document.getElementById('raiseGroup') || document.querySelector('.raise-group'),
    turnLabel: document.getElementById('turnLabel'),
    timerValue: document.getElementById('timerValue'),
    yourCards: document.getElementById('yourCards'),
    raiseRange: document.getElementById('raiseRange'),
    raiseInput: document.getElementById('raiseInput'),
    raiseX2: document.getElementById('raiseX2'),
    raiseX3: document.getElementById('raiseX3'),
    raiseX4: document.getElementById('raiseX4'),
    foldBtn: document.getElementById('foldBtn'),
    checkBtn: document.getElementById('checkBtn'),
    callBtn: document.getElementById('callBtn'),
    raiseBtn: document.getElementById('raiseBtn'),
    allInBtn: document.getElementById('allInBtn'),
    tournamentOverOverlay: document.getElementById('tournamentOverOverlay'),
    tournamentOverTitle: document.getElementById('tournamentOverTitle'),
    tournamentOverText: document.getElementById('tournamentOverText'),
    backToLobbyBtn: document.getElementById('backToLobbyBtn'),
    modeTag: document.getElementById('modeTag'),
    proPickWaitingPanel: document.getElementById('proPickWaitingPanel'),
    proPickWaitingText: document.getElementById('proPickWaitingText'),
    proPickWaitingList: document.getElementById('proPickWaitingList'),
    proPickOverlay: document.getElementById('proPickOverlay'),
    proPickTitle: document.getElementById('proPickTitle'),
    proPickTimer: document.getElementById('proPickTimer'),
    proPickHint: document.getElementById('proPickHint'),
    proPickSuits: document.getElementById('proPickSuits'),
    proPickRanks: document.getElementById('proPickRanks'),
    proPickBackBtn: document.getElementById('proPickBackBtn'),
    proPickGroup1: document.getElementById('proPickGroup1'),
    proPickGroup2: document.getElementById('proPickGroup2'),
    proPickOpenBtn: document.getElementById('proPickOpenBtn'),
    proPickOpenLabel: document.getElementById('proPickOpenLabel'),
    proPickOpenTimer: document.getElementById('proPickOpenTimer'),
    proPickCloseBtn: document.getElementById('proPickCloseBtn'),
    blindsHud: document.getElementById('blindsHud'),
    blindsHudLabel: document.getElementById('blindsHudLabel'),
    blindsHudValue: document.getElementById('blindsHudValue'),
    tourneyHud: document.getElementById('tourneyHud'),
    tourneyLevel: document.getElementById('tourneyLevel'),
    tourneyBlinds: document.getElementById('tourneyBlinds'),
    tourneyTimeLeft: document.getElementById('tourneyTimeLeft'),
    tourneyRegStatus: document.getElementById('tourneyRegStatus'),
    seatPickerOverlay: document.getElementById('seatPickerOverlay'),
    seatPickerGrid: document.getElementById('seatPickerGrid'),
    seatPickerHint: document.getElementById('seatPickerHint'),
    buyinOverlay: document.getElementById('buyinOverlay'),
    buyinHint: document.getElementById('buyinHint'),
    buyinInput: document.getElementById('buyinInput'),
    buyinCancelBtn: document.getElementById('buyinCancelBtn'),
    buyinConfirmBtn: document.getElementById('buyinConfirmBtn'),
    leaveSeatBtn: document.getElementById('leaveSeatBtn')
};

// Подписи кнопки "Рейз" для мобильного двухшагового раскрытия слайдера
// (см. isMobileLayout ниже) — объявлены здесь, до первого использования в
// обработчиках 'turn' и click, чтобы порядок объявления не имел значения.
const RAISE_BTN_DEFAULT_LABEL = el.raiseBtn.textContent;
const RAISE_BTN_CONFIRM_LABEL = 'Подтвердить';

if (!roomId || !playerName) {
    window.location.href = 'index.html';
} else {
    el.roomIdLabel.textContent = `Стол: ${roomId}`;
    socket.emit('joinLobby', { name: playerName, color: playerColor, avatar: playerAvatar });
}

socket.on('lobbyJoined', (data) => {
    myId = data.id;
    socket.emit('joinRoom', { roomId });
});

socket.on('roomJoined', (data) => {
    if (data.mode) setRoomMode(data.mode);
    if (data.maxPlayers) maxPlayersAtTable = data.maxPlayers;
    if (data.startingStack) roomStartingStack = data.startingStack;
    if (data.bigBlind) roomBigBlind = data.bigBlind;
    if (data.name) el.roomIdLabel.textContent = data.name;
});

socket.on('error', (message) => {
    logLine(message, 'err');
    if (message === 'Комната не найдена' || message === 'Комната заполнена' || message === 'Турнир уже идёт' || message === 'Регистрация на турнир закрыта') {
        alert(message);
        window.location.href = 'index.html';
        return;
    }
    // Действие отклонено (например, кликнули "Чек", когда нужно коллировать),
    // но ход всё ещё наш — вернуть панель действий, иначе игрок останется
    // без кнопок до конца раздачи (panель мы прячем сразу по клику, см.
    // submitAction выше).
    if (activeTurnPlayer === myName && Date.now() < activeTurnDeadline) {
        el.actionBar.style.display = 'flex';
        updateCallButtonLabel();
    }
});

socket.on('playerJoined', (data) => {
    organizerId = data.organizerId;
    if (data.mode) setRoomMode(data.mode);
    players = data.players.map(p => ({ ...p, bet: 0, folded: false, allIn: false, connected: true, eliminated: false, seated: p.seated !== false }));
    renderSeats();
    el.waitingText.textContent = players.length < 2
        ? 'Нужно минимум 2 игрока'
        : `Игроков за столом: ${players.length}.`;
    updateStartButton();
    updateSeatBanner();
});

const VALID_MODES = ['race', 'pro', 'holdem-cash', 'holdem-tourney'];
function setRoomMode(mode) {
    roomMode = VALID_MODES.includes(mode) ? mode : 'race';
    el.modeTag.textContent = MODE_LABELS[roomMode];
    el.modeTag.style.display = 'inline-block';
    document.body.classList.toggle('mode-race', roomMode === 'race');
    // HandForge Pro — фиксированные лимиты ставок (2/4/8 ББ), отдельного
    // олл-ина как действия нет (короткий стек уходит в олл-ин через колл/рейз).
    // В Hold'em (кэш/турнир) олл-ин обычный, как в классическом покере.
    el.allInBtn.style.display = roomMode === 'pro' ? 'none' : '';
    const isHoldem = roomMode === 'holdem-cash' || roomMode === 'holdem-tourney';
    el.blindsHud.style.display = isHoldem ? 'flex' : 'none';
    el.tourneyHud.style.display = roomMode === 'holdem-tourney' ? 'flex' : 'none';
    if (roomMode !== 'holdem-cash') {
        el.seatPickerOverlay.style.display = 'none';
        el.leaveSeatBtn.style.display = 'none';
    }
    const playersTabBtn = document.getElementById('playersTab');
    if (playersTabBtn) playersTabBtn.style.display = roomMode === 'holdem-cash' ? '' : 'none';
}

socket.on('canStart', () => {
    updateStartButton();
});

// Возврат после разрыва связи посреди раздачи: сервер прислал текущий борд/банк/этап
socket.on('boardSync', (data) => {
    handInProgress = true;
    boardRevealed = data.communityCards || [];
    boardHiddenCount = 0;
    updatePot(data.pot);
    renderBoard();
    el.waitingPanel.style.display = 'none';
    const stageLabels = { preflop: 'Префлоп', flop: 'Флоп', turn: 'Тёрн', river: 'Ривер' };
    el.stageLabel.textContent = stageLabels[data.stage] || data.stage;
    if (data.handNumber) el.handNumber.textContent = `#${data.handNumber}`;
    logLine('Вы вернулись за стол — состояние раздачи восстановлено.', 'deal');
});

socket.on('playerReconnected', (name) => {
    logLine(`${name} вернулся за стол`, 'deal');
});

function updateStartButton() {
    // Кэш-стол стартует сам, как только за ним оказывается 2 игрока — кнопки
    // "Начать" здесь нет и не нужна.
    if (roomMode === 'holdem-cash') {
        el.startGameBtn.style.display = 'none';
        // Игрок с 0 фишек всё ещё "сидит" (seated !== false), но реально
        // играть не может, пока не закупится заново — раньше это не
        // учитывалось, и после того как кто-то спускал стек, панель
        // ожидания продолжала врать "собираем стол, раздача вот-вот
        // начнётся" вместо настоящей причины паузы (см. cashPaused).
        const readyCount = players.filter(p => p.seated !== false && (p.chips || 0) > 0).length;
        el.waitingText.textContent = readyCount >= 2
            ? 'Собираем стол — раздача вот-вот начнётся...'
            : 'Нужно минимум 2 игрока с фишками за столом (наблюдатели и игроки без фишек не считаются).';
        return;
    }

    const amOrganizer = myId && organizerId === myId;
    const seatedCount = players.filter(p => p.seated !== false).length;
    if (amOrganizer && seatedCount >= 2) {
        el.startGameBtn.style.display = 'inline-block';
        el.waitingText.textContent = 'Можно начинать турнир!';
    } else if (seatedCount >= 2) {
        el.waitingText.textContent = 'Ждём, когда организатор начнёт турнир...';
    } else {
        el.waitingText.textContent = 'Нужно минимум 2 игрока';
    }
}

el.startGameBtn.addEventListener('click', () => {
    socket.emit('startGame');
});

socket.on('newHand', (data) => {
    dealerName = data.dealer;
    if (data.mode) setRoomMode(data.mode);
    if (typeof data.ante === 'number') roomAnte = data.ante;
    if (typeof data.bb === 'number') roomBigBlind = data.bb;
    handInProgress = true;
    handEnded = false;
    activeTurnPlayer = null;
    clearInterval(seatTimerInterval);
    seatActionFlashes = {};
    boardRevealed = [];
    boardHiddenCount = 0;
    showdownHands = [];
    winnerName = null;
    winningHoleCards = [];
    winningComboCards = [];
    winnerNamesSet = new Set();
    winningHoleCardsByPlayer = {};
    myHandRevealed = false;
    myHand = [];
    el.waitingPanel.style.display = 'none';
    el.proPickWaitingPanel.style.display = 'none';
    closeProPickModal();
    el.runoutBtn.style.display = 'none';
    el.handNumber.textContent = `#${data.handNumber}`;
    el.stageLabel.textContent = 'Префлоп';
    updatePot(data.pot);
    renderBoard();
    players.forEach(p => { p.folded = false; p.allIn = false; p.bet = 0; });
    renderSeats();
    const isHoldem = roomMode === 'holdem-cash' || roomMode === 'holdem-tourney';
    if (isHoldem) {
        el.blindsHudValue.textContent = data.ante
            ? `${data.sb}/${data.bb} (анте ${data.ante})`
            : `${data.sb}/${data.bb}`;
        logLine(`Раздача #${data.handNumber}. Дилер: ${data.dealer}. Блайнды ${data.sb}/${data.bb} (МБ: ${data.sbName}, ББ: ${data.bbName})`, 'deal');
        if (roomMode === 'holdem-tourney') updateTourneyHud(data);
    } else {
        logLine(`Раздача #${data.handNumber}. Дилер: ${data.dealer}`, 'deal');
    }
});

socket.on('yourCards', (cards) => {
    myHand = cards;
    renderSeats();
});

socket.on('flop', (data) => {
    el.stageLabel.textContent = 'Флоп';
    boardRevealed = data.cards;
    seatActionFlashes = {};
    renderBoard();
    renderSeats();
    updatePot(data.pot);
});

socket.on('turnCard', (data) => {
    el.stageLabel.textContent = 'Тёрн';
    boardRevealed = data.cards;
    seatActionFlashes = {};
    renderBoard();
    renderSeats();
    updatePot(data.pot);
});

socket.on('river', (data) => {
    el.stageLabel.textContent = 'Ривер';
    boardRevealed = data.cards;
    seatActionFlashes = {};
    renderBoard();
    renderSeats();
    updatePot(data.pot);
});

socket.on('turn', (data) => {
    const isMyTurn = data.player === myName;
    el.actionBar.style.display = isMyTurn ? 'flex' : 'none';
    // Мобильный слайдер рейза сворачиваем на каждый новый ход — иначе он
    // остался бы раскрытым с прошлого решения (см. isMobileLayout/раздел
    // "мобильная панель действий в одну строку" ниже).
    el.raiseGroup.classList.remove('open');
    el.raiseBtn.textContent = RAISE_BTN_DEFAULT_LABEL;
    activeTurnPlayer = data.player;
    activeTurnDeadline = Date.now() + data.timeLimit;
    activeTurnTotalTime = data.timeLimit || 1;
    renderSeats();
    startSeatTimers();

    if (isMyTurn) {
        el.turnLabel.textContent = 'Ваш ход';
        startTurnTimer(data.timeLimit);
        syncRaiseControls();
        updateCallButtonLabel();
    }
    fitMobileViewport();
});

socket.on('playersUpdate', (data) => {
    const prevByName = {};
    players.forEach(p => prevByName[p.name] = p);
    players = data.players.map(p => ({ ...prevByName[p.name], ...p }));
    dealerName = data.dealer || dealerName;
    renderSeats();
    updateSeatBanner();
    if (roomMode === 'holdem-cash') renderPlayersStatsTab();
});

socket.on('playerAction', (data) => {
    const labels = { fold: 'фолд', call: 'колл', raise: 'рейз', check: 'чек', allin: 'олл-ин' };
    const badgeLabels = { fold: 'Фолд', call: 'Колл', raise: 'Рейз', check: 'Чек', allin: 'Олл-ин' };
    const suffix = (data.amount != null && data.action !== 'check' && data.action !== 'fold') ? ` ${data.amount}` : '';
    logLine(`${data.player}: ${labels[data.action] || data.action}${suffix}`, 'action');
    flashSeatAction(data.player, `${badgeLabels[data.action] || data.action}${suffix}`, data.action);
});

socket.on('playerFolded', (name) => {
    const p = players.find(pl => pl.name === name);
    if (p) p.folded = true;
    renderSeats();
    flashSeatAction(name, 'Фолд', 'fold');
});

socket.on('playerEliminated', (name) => {
    logLine(`${name} выбывает из турнира`, 'elim');
});

socket.on('playerDisconnected', (name) => {
    logLine(`${name} отключился`, 'elim');
});

socket.on('playerLeft', (name) => {
    logLine(`${name} покинул стол`, 'elim');
});

socket.on('handResult', (data) => {
    handEnded = true;
    el.actionBar.style.display = 'none';
    clearInterval(turnTimerInterval);
    clearInterval(seatTimerInterval);
    activeTurnPlayer = null;
    winnerName = data.winner;
    winningHoleCards = data.winningHoleCards || [];
    winningComboCards = data.cards || [];
    if (data.winners && data.winners.length) {
        winnerNamesSet = new Set(data.winners.map(w => w.name));
        winningHoleCardsByPlayer = {};
        data.winners.forEach(w => { winningHoleCardsByPlayer[w.name] = w.winningHoleCards || []; });
    } else {
        winnerNamesSet = data.winner ? new Set([data.winner]) : new Set();
        winningHoleCardsByPlayer = data.winner ? { [data.winner]: winningHoleCards } : {};
    }

    if (data.revealedHands) {
        showdownHands = data.revealedHands;
    }

    if (data.hiddenCount) {
        boardRevealed = data.board;
        boardHiddenCount = data.hiddenCount;
        el.runoutBtn.style.display = 'inline-block';
    }
    renderBoard();
    renderSeats();

    const text = data.hand
        ? `${data.winner} забирает банк ${data.amount} — «${data.hand}»`
        : `${data.winner} забирает банк ${data.amount} (${data.reason})`;
    el.stageLabel.textContent = 'Вскрытие';
    logLine(text, 'win');
});

socket.on('runoutRevealed', (cards) => {
    boardRevealed = boardRevealed.concat(cards);
    boardHiddenCount = 0;
    el.runoutBtn.style.display = 'none';
    renderBoard();
});

socket.on('handShown', (data) => {
    if (data.name === myName) myHandRevealed = true;
    if (!showdownHands.some(h => h.name === data.name)) {
        showdownHands = showdownHands.concat([{ name: data.name, hand: data.hand }]);
    }
    renderSeats();
});

el.runoutBtn.addEventListener('click', () => {
    socket.emit('revealRunout');
});

// ---------- HandForge Pro: выбор карты (масть -> номинал) ----------
const RANK_GROUP_1 = ['2', '3', '4', '5', '6', '7', '8'];
const RANK_GROUP_2 = ['9', '10', 'J', 'Q', 'K', 'A'];
const RANK_DISPLAY = { 'J': 'В', 'Q': 'Д', 'K': 'К', 'A': 'Т' }; // Валет/Дама/Король/Туз

socket.on('proPickPhase', (data) => {
    proPickBlockedRanks = data.blockedRanks || [];
    proPickBlockedCards = data.blockedCards || [];
    proPickSuit = null;
    el.proPickTitle.textContent = data.pickNumber === 1 ? 'Выберите первую карту' : 'Выберите вторую карту';
    el.proPickHint.textContent = 'Шаг 1 — выберите масть';
    el.proPickSuits.style.display = 'grid';
    el.proPickRanks.style.display = 'none';
    // Модалка сама по себе НЕ открывается — она перекрывает карты на столе.
    // Вместо этого показываем маленькую кнопку с обратным отсчётом, и игрок
    // открывает выбор карты сам, когда посмотрел на стол и готов выбирать.
    el.proPickOpenLabel.textContent = data.pickNumber === 1 ? 'Выбрать 1-ю карту' : 'Выбрать 2-ю карту';
    el.proPickOpenBtn.style.display = 'flex';
    startPickTimer(data.timeLimit || 60000);
});

socket.on('proPickWaiting', (data) => {
    el.proPickWaitingText.textContent = data.pickNumber === 1
        ? 'Игроки выбирают первую карту…'
        : 'Игроки выбирают вторую карту…';
    el.proPickWaitingList.innerHTML = (data.players || [])
        .map(name => `<span class="pro-pick-waiting-item" data-player="${escapeAttr(name)}">${escapeAttr(name)}</span>`)
        .join('');
    // Себя из общего баннера не показываем — для меня открыта своя модалка
    if (myName) {
        const mine = el.proPickWaitingList.querySelector(`[data-player="${CSS.escape(myName)}"]`);
        if (mine) mine.remove();
    }
    el.proPickWaitingPanel.style.display = el.proPickWaitingList.children.length ? 'block' : 'none';
});

socket.on('proPickProgress', (data) => {
    const item = el.proPickWaitingList.querySelector(`[data-player="${CSS.escape(data.name)}"]`);
    if (item) item.classList.add('done');
    if (data.name === myName) closeProPickModal();
});

socket.on('proPickDone', () => {
    closeProPickModal();
    el.proPickWaitingPanel.style.display = 'none';
    clearInterval(pickTimerInterval);
});

socket.on('cardBurned', (data) => {
    logLine(`Ваша карта ${data.rank}${data.suit} сгорела — совпала с бордом`, 'elim');
});

socket.on('raceHoleCardsDiscarded', (cards) => {
    const list = (cards || []).map(c => `${c.rank}${c.suit}`).join(', ');
    logLine(`Из 4 карманных карт оставлены лучшие 2, сброшены: ${list}`, 'elim');
});

function closeProPickModal() {
    el.proPickOverlay.style.display = 'none';
    el.proPickOpenBtn.style.display = 'none';
    clearInterval(pickTimerInterval);
}

el.proPickOpenBtn.addEventListener('click', () => {
    el.proPickOverlay.style.display = 'flex';
});

el.proPickCloseBtn.addEventListener('click', () => {
    // Просто прячем модалку, чтобы посмотреть на стол — сам выбор карты не
    // отменяется и не сбрасывается, кнопка-триггер с таймером остаётся видна.
    el.proPickOverlay.style.display = 'none';
});

function startPickTimer(timeLimit) {
    clearInterval(pickTimerInterval);
    const deadline = Date.now() + timeLimit;
    const tick = () => {
        const secLeft = Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
        el.proPickTimer.textContent = secLeft;
        el.proPickOpenTimer.textContent = secLeft;
        if (secLeft <= 0) clearInterval(pickTimerInterval);
    };
    tick();
    pickTimerInterval = setInterval(tick, 250);
}

// Причина, по которой номинал недоступен для выбранной масти (или null).
// Дублирует серверную проверку proPickBlockReason() — сервер всё равно
// перепроверяет, но кнопку надо гасить сразу, чтобы игрок не тыкал вслепую.
function proPickRankBlockReason(rank) {
    if (proPickBlockedRanks.includes(rank)) {
        return 'Этот номинал есть на флопе — заблокирован во всех мастях';
    }
    if (proPickBlockedCards.some(c => c.suit === proPickSuit && c.rank === rank)) {
        return `${RANK_DISPLAY[rank] || rank}${proPickSuit} уже лежит на столе — возьмите этот номинал другой мастью`;
    }
    if (myHand.some(c => c.suit === proPickSuit && c.rank === rank)) {
        return 'Эта карта у вас уже выбрана';
    }
    return null;
}

function renderRankButtons(container, ranks) {
    container.innerHTML = ranks.map(rank => {
        const reason = proPickRankBlockReason(rank);
        const onBoard = proPickBlockedCards.some(c => c.suit === proPickSuit && c.rank === rank);
        const cls = 'pro-pick-rank-btn' + (onBoard ? ' pro-pick-rank-onboard' : '');
        return `<button class="${cls}" data-rank="${rank}"${reason ? ` disabled title="${escapeAttr(reason)}"` : ''}>${RANK_DISPLAY[rank] || rank}</button>`;
    }).join('');
}

el.proPickSuits.querySelectorAll('.pro-pick-suit-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        proPickSuit = btn.getAttribute('data-suit');
        const onBoardThisSuit = proPickBlockedCards
            .filter(c => c.suit === proPickSuit && !proPickBlockedRanks.includes(c.rank))
            .map(c => `${RANK_DISPLAY[c.rank] || c.rank}${c.suit}`);
        let hint = `Шаг 2 — выберите номинал (масть: ${proPickSuit})`;
        if (proPickBlockedRanks.length) {
            hint += ` · флоп закрыл номиналы: ${proPickBlockedRanks.map(r => RANK_DISPLAY[r] || r).join(', ')}`;
        }
        if (onBoardThisSuit.length) {
            hint += ` · уже на столе: ${onBoardThisSuit.join(', ')}`;
        }
        el.proPickHint.textContent = hint;
        el.proPickSuits.style.display = 'none';
        el.proPickRanks.style.display = 'flex';
        renderRankButtons(el.proPickGroup1, RANK_GROUP_1);
        renderRankButtons(el.proPickGroup2, RANK_GROUP_2);
    });
});

el.proPickBackBtn.addEventListener('click', () => {
    proPickSuit = null;
    el.proPickHint.textContent = 'Шаг 1 — выберите масть';
    el.proPickSuits.style.display = 'grid';
    el.proPickRanks.style.display = 'none';
});

el.proPickRanks.addEventListener('click', (e) => {
    const btn = e.target.closest('.pro-pick-rank-btn');
    if (!btn || btn.disabled || !proPickSuit) return;
    socket.emit('chooseCard', { suit: proPickSuit, rank: btn.getAttribute('data-rank') });
    btn.disabled = true;
});

socket.on('tournamentOver', (data) => {
    handInProgress = false;
    el.actionBar.style.display = 'none';

    // Кэш-стол принципиально не может "закончиться" — если у кого-то
    // закончились фишки, это просто пауза, пока он (или кто-то ещё) не
    // закупится заново. ТРЕБУЕТСЯ: сервер (server.js) не должен слать
    // 'tournamentOver' для holdem-cash — но на случай, если это всё же
    // приходит (текущий баг), перехватываем это здесь и не показываем
    // полноэкранный "турнир завершён".
    if (roomMode === 'holdem-cash') {
        const me = players.find(p => p.name === myName);
        if (me && (me.chips || 0) <= 0) {
            openRebuyPrompt(null);
        } else {
            el.waitingPanel.style.display = 'flex';
            el.waitingText.textContent = 'Ждём, пока игрок за столом закупится заново...';
        }
        return;
    }

    el.tournamentOverTitle.textContent = data.winner ? 'Турнир завершён!' : 'Турнир окончен';
    el.tournamentOverText.textContent = data.winner
        ? `Победитель: ${data.winner}`
        : 'Недостаточно игроков для продолжения.';
    el.tournamentOverOverlay.style.display = 'flex';
});

// Игрок проиграл весь стек в кэше — со стола он не уходит: сразу открываем
// окно докупки, где он сам выбирает размер нового стека. Место за ним
// сохраняется, сессия (общий закуп и число докупок) продолжается.
function kickToLobbyAfterBust() {
    openRebuyPrompt(null);
}

socket.on('needRebuy', (data) => {
    openRebuyPrompt(data);
});

socket.on('cashPaused', (data) => {
    // Кэш-игра не заканчивается победителем — просто пауза, пока не наберётся
    // хотя бы 2 игрока с фишками для продолжения.
    handInProgress = false;
    el.actionBar.style.display = 'none';

    // Если пауза случилась потому, что именно У МЕНЯ закончились фишки —
    // выкидываем в лобби (см. kickToLobbyAfterBust), а не показываем общую
    // панель ожидания.
    const me = players.find(p => p.name === myName);
    if (me && me.seated !== false && (me.chips || 0) <= 0) {
        openRebuyPrompt(null);
        return;
    }

    el.waitingPanel.style.display = 'flex';
    el.waitingText.textContent = data.reason || 'Не хватает игроков с фишками для продолжения';
    updateStartButton();
});

socket.on('blindLevelUp', (data) => {
    if (typeof data.bb === 'number') roomBigBlind = data.bb;
    el.blindsHudValue.textContent = data.ante
        ? `${data.sb}/${data.bb} (анте ${data.ante})`
        : `${data.sb}/${data.bb}`;
    logLine(`Уровень блайндов ${data.level}: ${data.sb}/${data.bb}${data.ante ? `, анте ${data.ante}` : ''}`, 'deal');
    updateTourneyHud(data);
});

el.backToLobbyBtn.addEventListener('click', () => {
    window.location.href = 'index.html';
});

document.getElementById('closeTournamentOverlay').addEventListener('click', () => {
    el.tournamentOverOverlay.style.display = 'none';
});

el.waitingPanelCloseBtn.addEventListener('click', () => {
    // Просто прячем панель, ничего не меняя в состоянии игры — она сама
    // появится снова, как только придёт следующее релевантное событие
    // (playerJoined/cashPaused/canStart и т.д.).
    el.waitingPanel.style.display = 'none';
});

socket.on('handHistory', (history) => {
    renderHistory(history);
});

socket.on('chatMessage', (data) => {
    const div = document.createElement('div');
    div.className = 'chat-msg';
    div.innerHTML = `<b>${escapeHtml(data.name)}:</b> ${escapeHtml(data.text)}`;
    el.chatLog.appendChild(div);
    el.chatLog.scrollTop = el.chatLog.scrollHeight;
});

function sendChat() {
    const text = el.chatInput.value.trim();
    if (!text) return;
    socket.emit('chatMessage', { text });
    el.chatInput.value = '';
}
el.sendChatBtn.addEventListener('click', sendChat);
el.chatInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') sendChat(); });

// ---------- Карты ----------
function suitSymbol(suit) {
    // U+FE0E — "text presentation selector": заставляет систему рисовать
    // символ масти как обычный текстовый глиф, а не как цветной эмодзи.
    // Без него на iOS/некоторых мобильных шрифтах масти иногда рисуются
    // системными цветными эмодзи-картинками, у которых цвет "зашит" в сам
    // глиф — и CSS-свойство color на них просто не действует, поэтому
    // рамка карты красится, а сам символ масти остаётся дефолтным.
    const map = { spades: '♠\uFE0E', hearts: '♥\uFE0E', diamonds: '♦\uFE0E', clubs: '♣\uFE0E' };
    return map[suit] || suit;
}

function isRedSuit(suit) {
    return suit === '♥' || suit === '♦' || suit === 'hearts' || suit === 'diamonds';
}

function suitClass(suit) {
    const map = {
        '♠': 'suit-spades', spades: 'suit-spades',
        '♥': 'suit-hearts', hearts: 'suit-hearts',
        '♦': 'suit-diamonds', diamonds: 'suit-diamonds',
        '♣': 'suit-clubs', clubs: 'suit-clubs'
    };
    return map[suit] || '';
}

// Текущая лучшая комбинация игрока относительно уже открытых карт борда.
// До флопа (меньше 3 карт борда) собрать 5-карточную руку невозможно — null.
function getLiveBestCombo() {
    if (!handInProgress || boardRevealed.length < 3) return null;
    if (typeof Poker === 'undefined') return null;
    // Pro и оба Hold'em-режима — обычные правила (любые 5 из руки+борда).
    // Раньше сюда попадал только Pro, поэтому в Hold'em Cash/Турнир (2
    // карманные карты — всегда меньше проверявшихся 4) подсказка комбинации
    // не показывалась вообще.
    const isHoldemRules = roomMode === 'pro' || roomMode === 'holdem-cash' || roomMode === 'holdem-tourney';
    if (isHoldemRules) {
        if (myHand.length + boardRevealed.length < 5) return null;
        return Poker.evaluateHoldem(myHand, boardRevealed);
    }
    // Race — Омаха-правило (ровно 2 карманные + 3 бордовые), но карманных
    // карт может быть 2 (флоп) / 3 (тёрн) / 4 (ривер) — раньше подсказка
    // требовала все 4 и поэтому не показывалась до ривера.
    if (myHand.length < 2) return null;
    return Poker.evaluateOmaha(myHand, boardRevealed);
}

function cardHtml(card, opts) {
    opts = opts || {};
    const red = isRedSuit(card.suit);
    const suit = suitSymbol(card.suit);
    const classes = ['card', 'new', suitClass(card.suit)];
    if (red && !suitClass(card.suit)) classes.push('red');
    if (opts.small) classes.push('small');
    if (opts.extraClass) classes.push(opts.extraClass);
    return `
        <div class="${classes.join(' ')}">
            <div class="rank-top">${card.rank}<span class="suit-corner">${suit}</span></div>
            <div class="suit-mid">${suit}</div>
            <div class="rank-bottom">${card.rank}</div>
        </div>`;
}

function cardBackHtml(small) {
    return `<div class="card-back${small ? ' small' : ''}"></div>`;
}

function renderBoard() {
    let html;
    if (handEnded && winningComboCards.length) {
        // Вскрытие: карты борда, вошедшие в выигрышную комбинацию — подсвечены,
        // остальные — полупрозрачные, точно так же, как карманные карты игрока.
        html = boardRevealed.map(c => {
            const used = winningComboCards.some(wc => wc.suit === c.suit && wc.rank === c.rank);
            return cardHtml(c, { extraClass: used ? 'card-win' : 'card-dim' });
        }).join('');
    } else {
        const combo = getLiveBestCombo();
        html = boardRevealed.map(c => {
            const used = combo && combo.cards.some(cc => cc.suit === c.suit && cc.rank === c.rank);
            return cardHtml(c, { extraClass: used ? 'card-strong' : '' });
        }).join('');
    }
    for (let i = 0; i < boardHiddenCount; i++) html += cardBackHtml(false);
    const shown = boardRevealed.length + boardHiddenCount;
    for (let i = shown; i < 5; i++) html += '<div class="card-slot-empty"></div>';
    el.boardCards.innerHTML = html;
}

function updatePot(pot) {
    if (typeof pot === 'number') {
        el.potSize.textContent = pot;
        el.potChip.textContent = `Банк: ${pot}`;
    }
}

// ---------- Круглый стол ----------
function getSeatOrder() {
    const seated = players.filter(p => p.seated !== false);
    const idx = seated.findIndex(p => p.name === myName);
    if (idx <= 0) return seated;
    return [...seated.slice(idx), ...seated.slice(0, idx)];
}

// ---------- Кэш: наблюдатель / выбор пронумерованного места ----------
function updateSeatBanner() {
    if (roomMode !== 'holdem-cash') return;
    const me = players.find(p => p.name === myName);
    if (!me) return;
    const iAmSeated = me.seated !== false;
    el.leaveSeatBtn.style.display = iAmSeated ? '' : 'none';
    // Свободные места теперь подсвечиваются прямо на столе (см. renderCashSeats),
    // а не в отдельном полноэкранном окне — так видно, кто где сидит и рядом
    // с кем можно сесть, даже если раздача уже идёт.
    el.seatPickerOverlay.style.display = 'none';
}

function setBuyinOverlayLabels(isRebuy) {
    el.buyinCancelBtn.textContent = isRebuy ? 'Выйти в лобби' : '← Назад к местам';
    el.buyinConfirmBtn.textContent = isRebuy ? 'Докупиться и играть' : 'Сесть за стол';
    const title = el.buyinOverlay.querySelector('h2');
    if (title) title.textContent = isRebuy ? 'Докупка фишек' : 'Сколько фишек закупить?';
}

function openBuyinPrompt(slot) {
    isRebuyFlow = false;
    pendingSeatSlot = slot;
    setBuyinOverlayLabels(false);
    const minBuyIn = Math.max(Math.round(roomBigBlind * 10), 1);
    const maxBuyIn = roomStartingStack * 4;
    el.buyinHint.textContent = `От ${minBuyIn} до ${maxBuyIn}`;
    el.buyinInput.min = minBuyIn;
    el.buyinInput.max = maxBuyIn;
    el.buyinInput.value = roomStartingStack;
    el.seatPickerOverlay.style.display = 'none';
    el.buyinOverlay.style.display = 'flex';
    el.buyinInput.focus();
}

// Докупка (рёбай): стек кончился, но место остаётся за игроком. Сумму он
// выбирает сам, в тех же рамках, что и при первой посадке. Отказ от докупки —
// это осознанный выход со стола в лобби.
function openRebuyPrompt(data) {
    const me = players.find(p => p.name === myName);
    const slot = (data && data.slot != null) ? data.slot
        : (me && me.seatSlot != null ? me.seatSlot : null);
    if (slot == null) return;
    if (isRebuyFlow && el.buyinOverlay.style.display === 'flex') return; // уже открыто

    isRebuyFlow = true;
    pendingSeatSlot = slot;
    setBuyinOverlayLabels(true);

    const minBuyIn = (data && data.minBuyIn) || Math.max(Math.round(roomBigBlind * 10), 1);
    const maxBuyIn = (data && data.maxBuyIn) || roomStartingStack * 4;
    const already = (data && data.totalBuyIn != null) ? data.totalBuyIn : (me ? me.totalBuyIn || 0 : 0);
    const rebuys = (data && data.rebuys != null) ? data.rebuys : (me ? me.rebuys || 0 : 0);

    el.buyinHint.textContent =
        `Фишки закончились. От ${minBuyIn} до ${maxBuyIn}. ` +
        `Уже закуплено за этот стол: ${already}${rebuys ? ` (докупок: ${rebuys})` : ''}`;
    el.buyinInput.min = minBuyIn;
    el.buyinInput.max = maxBuyIn;
    el.buyinInput.value = (data && data.suggested) || roomStartingStack;
    el.seatPickerOverlay.style.display = 'none';
    el.buyinOverlay.style.display = 'flex';
    el.buyinInput.focus();
    logLine('Ваши фишки закончились — можно докупиться и продолжить.', 'elim');
}

el.buyinCancelBtn.addEventListener('click', () => {
    pendingSeatSlot = null;
    el.buyinOverlay.style.display = 'none';
    if (isRebuyFlow) {
        // Отказался докупаться — уходим со стола в лобби.
        isRebuyFlow = false;
        socket.emit('leaveRoom');
        window.location.href = 'index.html';
        return;
    }
    el.seatPickerOverlay.style.display = 'flex';
});

el.buyinConfirmBtn.addEventListener('click', () => {
    const min = parseInt(el.buyinInput.min, 10) || 1;
    const max = parseInt(el.buyinInput.max, 10) || roomStartingStack * 4;
    let buyIn = parseInt(el.buyinInput.value, 10) || roomStartingStack;
    buyIn = Math.min(Math.max(buyIn, min), max);
    if (pendingSeatSlot == null) return;
    socket.emit('takeSeat', { slot: pendingSeatSlot, buyIn });
    el.buyinOverlay.style.display = 'none';
    el.waitingPanel.style.display = 'none';
    pendingSeatSlot = null;
    isRebuyFlow = false;
});

el.leaveSeatBtn.addEventListener('click', () => socket.emit('leaveSeat'));

socket.on('seatTaken', (name) => {
    logLine(`${name} сел за стол`, 'deal');
    updateSeatBanner();
});
socket.on('seatLeft', (name) => {
    logLine(`${name} встал из-за стола (наблюдатель)`, 'deal');
    updateSeatBanner();
});

// ---------- Турнир: HUD уровня блайндов / времени / регистрации ----------
let tourneyCountdownInterval = null;
function updateTourneyHud(data) {
    if (roomMode !== 'holdem-tourney') return;
    if (data.level != null) el.tourneyLevel.textContent = data.level;
    el.tourneyBlinds.textContent = data.ante
        ? `${data.sb}/${data.bb} (анте ${data.ante})`
        : `${data.sb}/${data.bb}`;
    if (data.lateRegOpen != null) {
        el.tourneyRegStatus.textContent = data.lateRegOpen ? 'Регистрация открыта' : 'Регистрация закрыта';
        el.tourneyRegStatus.className = data.lateRegOpen ? 'tourney-hud-reg open' : 'tourney-hud-reg closed';
    }
    clearInterval(tourneyCountdownInterval);
    if (data.levelDeadline) {
        const tick = () => {
            const msLeft = Math.max(0, data.levelDeadline - Date.now());
            const mm = String(Math.floor(msLeft / 60000)).padStart(2, '0');
            const ss = String(Math.floor((msLeft % 60000) / 1000)).padStart(2, '0');
            el.tourneyTimeLeft.textContent = `${mm}:${ss}`;
        };
        tick();
        tourneyCountdownInterval = setInterval(tick, 1000);
    } else {
        el.tourneyTimeLeft.textContent = '—:—';
    }
}

function seatCardsHtml(p) {
    const showdown = showdownHands.find(h => h.name === p.name);
    if (showdown) {
        const isWinner = winnerNamesSet.has(p.name) && (winningHoleCardsByPlayer[p.name] || []).length;
        return showdown.hand.map(c => {
            let extra = '';
            if (isWinner) {
                const used = winningHoleCardsByPlayer[p.name].some(wc => wc.suit === c.suit && wc.rank === c.rank);
                extra = used ? 'card-win' : 'card-dim';
            }
            return cardHtml(c, { small: true, extraClass: extra });
        }).join('');
    }
    if (p.name === myName && myHand.length && handInProgress) {
        const clickable = !myHandRevealed && handEnded;
        const wrapClass = clickable ? 'my-cards-wrap clickable' : 'my-cards-wrap';
        const wrapTitle = clickable ? 'title="Нажмите, чтобы показать карты сопернику"' : '';

        if (p.folded) {
            // После фолда карты остаются видны только вам самим (место и так
            // притемняется через .seat.folded), а по клику/тапу их можно
            // показать сопернику.
            const inner = myHand.map(c => cardHtml(c, { small: true })).join('');
            return `<div class="${wrapClass}" ${wrapTitle}>${inner}</div>`;
        }

        // Свои карты показываем у своего места, в том же размере, что и у
        // остальных (иначе полноразмерные карты не помещаются над овалом и
        // налезают на плашку с ником/стеком). Если уже открыт флоп —
        // подсвечиваем те 2 карты, которые сейчас дают максимально сильную
        // комбинацию с учётом карт борда.
        const combo = getLiveBestCombo();
        const inner = myHand.map(c => {
            const used = combo && combo.cards.some(cc => cc.suit === c.suit && cc.rank === c.rank);
            return cardHtml(c, { small: true, extraClass: used ? 'card-strong' : '' });
        }).join('');
        return `<div class="${wrapClass}" ${wrapTitle}>${inner}</div>`;
    }
    if (handInProgress && !p.folded && !p.eliminated) {
        return cardBackHtml(true) + cardBackHtml(true);
    }
    return '';
}

// ---------- Подгонка под экран (мобильные) ----------
// Раскладка стола теперь строится на flex (шапка + стол + панель действий
// делят между собой ровно 100% реальной высоты экрана — переменная --vh,
// которую выставляет инлайн-скрипт в game.html), поэтому стол физически не
// может вытолкнуть страницу за пределы экрана. Отдельного JS-масштабирования
// через zoom больше не требуется — функция оставлена как no-op, чтобы не
// трогать остальной код, который её вызывает.
function fitMobileViewport() {
    document.documentElement.style.zoom = '';
}

function confettiHtml() {
    // Небольшой салют вокруг таблички игрока при выигрыше раздачи: смещения
    // (--tx/--ty) считаем в JS, чтобы не зависеть от поддержки cos()/sin() в
    // CSS (в мобильных веб-вью это не всегда работает).
    const symbols = ['🎉', '✨', '🎊', '⭐', '💥', '🥳'];
    const n = 18;
    let html = '<div class="confetti">';
    for (let i = 0; i < n; i++) {
        const angle = (Math.PI * 2 * i) / n;
        const radius = 55 + (i % 4) * 16;
        const tx = Math.round(Math.cos(angle) * radius);
        const ty = Math.round(Math.sin(angle) * radius);
        const symbol = symbols[i % symbols.length];
        const delay = (i * 0.035).toFixed(2);
        html += `<span class="confetti-piece" style="--tx:${tx}px; --ty:${ty}px; animation-delay:${delay}s;">${symbol}</span>`;
    }
    html += '</div>';
    return html;
}

function seatPosition(i, total, isMobile) {
    const angle = Math.PI / 2 + (2 * Math.PI * i / total);
    // Мобильный стол теперь во весь экран (был 84%/88% с отступами — см.
    // правку "стол и фон на весь экран"). rx/ry МЕСТ намеренно не увеличены
    // следом за картинкой: при таком узком экране места и так стоят на
    // самом краю экрана (проверено рендером на 320-390px) — любое
    // увеличение rx приводит к тому, что крайние места начинают вылезать
    // за пределы экрана. Расширение стола решает "весь экран" само по
    // себе — карты/борд теперь занимают весь фон вплоть до краёв, а места
    // остаются там же, где были (это безопаснее, чем гнаться за буквальным
    // касанием борта ценой обрезки мест по бокам).
    const rx = isMobile ? 36 : 44;
    const ry = isMobile ? 46 : 40;
    const left = 50 + rx * Math.cos(angle);
    let top = 50 + ry * Math.sin(angle);
    if (isMobile && top < 15) top = 15; // не даём самому верхнему месту подходить к краю стола ближе 15%
    if (isMobile && top > 81) top = 81; // нижнее (свое) место — приподнято на 15% от края стола

    // Поправка для ПК (isMobile=false): новая картинка стола легла ниже
    // прежней, поэтому места в ВЕРХНЕЙ половине стола висели выше своей
    // реальной посадочной точки на борту. Опускаем их пропорционально тому,
    // насколько высоко место сидит: у самого верхнего (top≈10) сдвиг
    // максимальный, ближе к центру (top→50) он плавно сходит к нулю, а
    // нижняя половина стола не трогается вообще.
    //
    // Раньше здесь были жёстко прописаны только два случая (6-max место 4 и
    // 9-max места 5-6), поэтому в остальных режимах (2,3,4,5,7,8 игроков)
    // верхние места так и оставались задранными. Формула ниже покрывает
    // любое число мест разом и на 6/9 даёт ровно те же значения, что были
    // подобраны и согласованы раньше.
    if (!isMobile) {
        const TOP_SEAT_MAX_SHIFT = 16;   // сдвиг для самого верхнего места
        const CENTER_TOP = 50;           // высота центра стола в тех же %
        if (top < CENTER_TOP) {
            const howHigh = (CENTER_TOP - top) / 40; // 1.0 у самого верха, 0 в центре
            top += TOP_SEAT_MAX_SHIFT * Math.min(1, howHigh);
        }
    }

    return { left, top };
}

// "Кольцо действий" — воображаемый (нигде не отрисованный) овал между
// кольцом игроков и бордом. На нём висят таймер хода и подпись действия,
// поэтому они всегда смотрят на центр стола, а не налезают на соседей.
//
// Точку берём не как отдельный овал с фиксированными радиусами, а как долю
// пути от центра стола к РЕАЛЬНОЙ позиции места — тогда кольцо автоматически
// подстраивается и под 6-max, и под 9-max, и под мобильную раскладку с её
// подрезкой верхнего/нижнего места (см. seatPosition).
function seatMarkerPosition(seatLeft, seatTop, isMobile) {
    const RATIO = 0.66;           // 0 — центр стола, 1 — само место игрока
    // Прямоугольник в центре, куда метке заезжать нельзя — это карты борда и
    // банк. На мобильном борд шире по горизонтали, но ниже по вертикали.
    const HX = isMobile ? 30 : 27;
    const HY = isMobile ? 14 : 21;

    const dx = seatLeft - 50;
    const dy = seatTop - 50;
    let mx = dx * RATIO;
    let my = dy * RATIO;

    // Метка попала на борд — выталкиваем её по тому же лучу наружу, до
    // ближайшей границы запретной зоны, плюс небольшой зазор.
    if (Math.abs(mx) < HX && Math.abs(my) < HY) {
        const kx = Math.abs(mx) > 0.01 ? HX / Math.abs(mx) : Infinity;
        const ky = Math.abs(my) > 0.01 ? HY / Math.abs(my) : Infinity;
        const k = Math.min(kx, ky);
        if (Number.isFinite(k)) {
            mx *= k * 1.06;
            my *= k * 1.06;
        }
    }
    // Но не дальше самого места — иначе метка легла бы прямо на игрока.
    const cap = 0.92;
    if (Math.abs(mx) > Math.abs(dx) * cap) mx = dx * cap;
    if (Math.abs(my) > Math.abs(dy) * cap) my = dy * cap;

    return { left: 50 + mx, top: 50 + my };
}

// Метка игрока на кольце действий: либо тикающий таймер (пока он думает),
// либо подпись его последнего действия. Если ни того, ни другого — метки
// вообще нет в разметке.
function seatMarkerHtml(p, seatLeft, seatTop, isMobile) {
    const flash = seatActionFlashes[p.name];
    // Таймер виден у ЛЮБОГО игрока, который сейчас думает — не только у себя,
    // чтобы за столом было видно, сколько осталось сопернику. Как только он
    // сходил, появляется flash и таймер сменяется подписью действия.
    //
    // ИСКЛЮЧЕНИЕ: у самого себя (p.name === myName) этот круглый таймер НЕ
    // рисуем вообще — у героя уже есть свой таймер в панели действий снизу
    // экрана (#timerValue), и дублирующий кружок поверх собственных карт
    // был лишним. Бейдж действия (flash) у героя при этом остаётся, меняется
    // только "думает" ли он прямо сейчас.
    const isThinking = p.name === activeTurnPlayer && !p.folded && !p.eliminated && !flash && p.name !== myName;
    if (!flash && !isThinking) return '';
    // У героя бейдж действия рисуется отдельно, под собственным местом (см.
    // occupiedSeatHtml) — там он не налезает на собственные карты, которые
    // торчат НАД овалом героя. На кольце действий (эта функция) для героя
    // рисовать уже нечего. На мобильном то же самое верно и для соперников —
    // их флеш-бейдж тоже рисуется под аватаркой (occupiedSeatHtml), а не на
    // кольце, поэтому здесь его тоже пропускаем.
    if (flash && (p.name === myName || isMobile)) return '';

    const { left, top } = seatMarkerPosition(seatLeft, seatTop, isMobile);
    let inner = '';
    if (flash) {
        inner = `<div class="seat-action-badge show action-${escapeAttr(flash.type || 'call')}">${escapeHtml(flash.label)}</div>`;
    } else {
        const secLeft = Math.max(0, Math.ceil((activeTurnDeadline - Date.now()) / 1000));
        inner = `<div class="seat-timer">${secLeft}</div>`;
    }
    return `<div class="seat-marker${isThinking ? ' active' : ''}" style="left:${left}%; top:${top}%;" data-name="${escapeAttr(p.name)}">${inner}</div>`;
}

function seatAvatarHtml(p) {
    if (p.avatar) {
        return `<img class="seat-avatar" src="${escapeAttr(p.avatar)}" alt="">`;
    }
    const color = p.color || '#e74c3c';
    const letter = (p.name || '?').charAt(0).toUpperCase();
    return `<div class="seat-avatar seat-avatar-fallback" style="background:${escapeAttr(color)};">${escapeHtml(letter)}</div>`;
}

function occupiedSeatHtml(p, left, top, isMobile) {
    const classes = ['seat'];
    if (p.name === myName) classes.push('hero');
    if (p.folded) classes.push('folded');
    if (p.eliminated) classes.push('eliminated');
    if (!p.connected && !p.eliminated) classes.push('disconnected');
    if (winnerNamesSet.has(p.name)) classes.push('winner');
    if (p.name === activeTurnPlayer && !p.folded && !p.eliminated) classes.push('active');
    // Карты вскрыты на вскрытии — не должны притемняться как "не мой ход"
    // (см. .seat:not(.active):not(.folded):not(.hero):not(.showdown) в CSS),
    // иначе после вскрытия плохо видно, что было у оппонента.
    if (showdownHands.some(h => h.name === p.name)) classes.push('showdown');

    const organizerTag = p.isOrganizer ? '<span class="organizer-badge" title="Организатор">👑</span>' : '';
    const statusText = p.eliminated
        ? '<span class="eliminated-label">Выбыл</span>'
        : (p.allIn ? '<span class="allin-label">🔥 ALL-IN</span>' : (p.connected === false ? 'Отключён' : ''));
    const dealerBadge = p.name === dealerName ? '<div class="dealer-button" title="Дилер">D</div>' : '';
    const confetti = winnerNamesSet.has(p.name) ? confettiHtml() : '';
    const liveComboTag = (p.name === myName && !p.folded) ? (() => {
        const combo = getLiveBestCombo();
        return combo ? `<div class="live-hand-tag">${RANK_NAMES_RU[combo.rank]}</div>` : '';
    })() : '';
    // Подпись действия (Чек / Колл 200 / Рейз 400 / Фолд / Олл-ин) и круглый
    // таймер хода больше НЕ рисуются внутри овала места — они вынесены на
    // отдельное "кольцо действий" между местом и бордом (см. seatMarkerHtml).
    // Так они не налезают на аватар/стек соседа и одинаково читаются у всех
    // мест, включая верхние.
    const flash = seatActionFlashes[p.name];

    // Отдельный WIN-бейдж — короткий "заголовок" результата раздачи. Стоит
    // ВНЕ .seat-oval (прямо в .seat, после .seat-cards в разметке), чтобы
    // ложиться поверх и овала, и карт игрока, а не только поверх овала.
    const winBadge = winnerNamesSet.has(p.name) ? '<div class="seat-win-badge">WIN</div>' : '';

    // Бейдж действия — центрирован ПОД овалом места, а не на кольце действий
    // (там он налезал на карты/соседей). У героя — потому что кольцевая
    // метка налезала на собственные карты, торчащие над овалом героя. На
    // мобильном то же самое сделано и для соперников — под их аватаркой,
    // а не на кольце действий (см. seatMarkerHtml, там для этих случаев
    // рендер флеша теперь пропускается).
    const showUnderSeatBadge = flash && (p.name === myName || isMobile);
    const underSeatBottom = (p.name === myName && !isMobile) ? -38 : -16;
    const heroFlashBadge = showUnderSeatBadge
        ? `<div class="seat-action-badge show action-${escapeAttr(flash.type || 'call')}" style="position:absolute; left:50%; right:auto; bottom:${underSeatBottom}px; transform:translate(-50%,0);">${escapeHtml(flash.label)}</div>`
        : '';

    const glowColor = p.color || '#e74c3c';
    const glowRgb = hexToRgbTriplet(glowColor);

    return `
        <div class="${classes.join(' ')}" style="left:${left}%; top:${top}%; --seat-glow:${escapeAttr(glowColor)}; --seat-glow-rgb:${glowRgb};" data-name="${escapeAttr(p.name)}">
            <div class="seat-oval">
                ${confetti}
                <div class="seat-left-col">
                    <div class="seat-avatar-ring">
                        ${seatAvatarHtml(p)}
                        ${dealerBadge}
                    </div>
                    <div class="seat-name">${escapeHtml(p.name)}${p.name === myName ? ' (вы)' : ''}${organizerTag}</div>
                </div>
                <div class="seat-right-col" style="position:relative;">
                    <div class="seat-stack"><span class="chip-dot"></span>${p.chips}</div>
                    <div class="status">${statusText}</div>
                </div>
            </div>
            <div class="seat-cards">${seatCardsHtml(p)}</div>
            ${winBadge}
            ${liveComboTag}
            ${heroFlashBadge}
        </div>`;
}

// Пустое место за кэш-столом — подсвечивается прямо на столе (зелёным,
// с пульсацией), если я ещё не сижу и могу сюда сесть. Видно всегда,
// в т.ч. пока раздача уже идёт у остальных, чтобы было понятно, рядом
// с кем можно занять место.
function emptySeatHtml(slot, left, top, clickable) {
    const classes = ['seat', 'empty'];
    if (clickable) classes.push('clickable');
    return `
        <div class="${classes.join(' ')}" style="left:${left}%; top:${top}%;" data-slot="${slot}">
            <div class="seat-oval">
                <div class="seat-plate">
                    <div class="name">Место ${slot + 1}</div>
                    <div class="stack">${clickable ? 'Свободно — нажмите' : 'Свободно'}</div>
                </div>
            </div>
        </div>`;
}

function updateTopHud() {
    const seatedCount = players.filter(p => p.seated !== false).length;
    el.playersCountHud.textContent = `${seatedCount}/${maxPlayersAtTable}`;
    if (dealerName) {
        el.dealerHud.style.display = '';
        el.dealerHudValue.textContent = dealerName;
    } else {
        el.dealerHud.style.display = 'none';
    }
}

function renderSeats() {
    updateTopHud();
    if (roomMode === 'holdem-cash') {
        renderCashSeats();
    } else {
        renderDynamicSeats();
    }
}

function renderDynamicSeats() {
    const order = getSeatOrder();
    const total = order.length;
    const isMobile = window.matchMedia('(max-width:600px)').matches;

    let html = '';
    let markers = '';
    order.forEach((p, i) => {
        const { left, top } = seatPosition(i, total, isMobile);
        html += occupiedSeatHtml(p, left, top, isMobile);
        markers += seatMarkerHtml(p, left, top, isMobile);
    });
    el.seats.innerHTML = html + markers;

    updateCallButtonLabel();
    fitMobileViewport();
}

// Кэш-стол: в отличие от остальных режимов, места здесь фиксированные и
// пронумерованные (seatSlot), поэтому рисуем ВСЕ maxPlayersAtTable мест по
// их реальным номерам, а не только тех, кто сейчас сидит — иначе позиции
// "прыгали" бы при каждой посадке/уходе игрока, и не было бы видно, куда
// садиться относительно других.
function renderCashSeats() {
    const total = maxPlayersAtTable;
    const isMobile = window.matchMedia('(max-width:600px)').matches;
    const me = players.find(p => p.name === myName);
    const myIsSeated = me && me.seated !== false && me.seatSlot != null;
    const iAmSeatedAnywhere = !!myIsSeated;
    // Если я сижу — моё место всегда снизу. Если я наблюдатель — просто
    // фиксированный порядок от места №1, чтобы расположение не менялось.
    const rotation = myIsSeated ? me.seatSlot : 0;

    let html = '';
    let markers = '';
    for (let i = 0; i < total; i++) {
        const slot = (i + rotation) % total;
        const { left, top } = seatPosition(i, total, isMobile);
        const occupant = players.find(pl => pl.seated !== false && pl.seatSlot === slot);
        if (occupant) {
            html += occupiedSeatHtml(occupant, left, top, isMobile);
            markers += seatMarkerHtml(occupant, left, top, isMobile);
        } else {
            html += emptySeatHtml(slot, left, top, !iAmSeatedAnywhere);
        }
    }
    // Метки кольца действий кладём ПОСЛЕ всех мест, чтобы они гарантированно
    // рисовались поверх соседних овалов, а не уезжали под них.
    el.seats.innerHTML = html + markers;

    updateCallButtonLabel();
    fitMobileViewport();
}

function updateCallButtonLabel() {
    const me = players.find(p => p.name === myName);
    if (!me) {
        el.callBtn.textContent = 'Колл';
        el.callBtn.style.display = '';
        el.checkBtn.style.display = '';
        return;
    }
    const maxBet = Math.max(0, ...players.filter(p => !p.folded).map(p => p.bet || 0));
    const toCall = maxBet - (me.bet || 0);
    // Пока никто не поставил (нечего коллировать) — кнопка "Колл" не нужна,
    // остаётся только "Чек". Как только появляется ставка — "Колл" возвращается,
    // а "Чек" наоборот скрывается, т.к. сервер его в этой ситуации отклонит
    // (см. case 'check' в server.js — чек невозможен, если currentBet > bet).
    // Логика одинакова для всех режимов (Race/Pro/Hold'em Cash/Турнир).
    el.callBtn.style.display = toCall > 0 ? '' : 'none';
    el.callBtn.textContent = toCall > 0 ? `Колл ${toCall}` : 'Колл';
    el.checkBtn.style.display = toCall > 0 ? 'none' : '';
}

// Обновляет кружок-таймер хода у активного места (у ЛЮБОГО игрока, не
// только у себя) — используя то же время, что сервер прислал в 'turn'.
// Перерисовка стола (renderSeats) вставляет разметку заново при каждом
// playersUpdate, поэтому просто ищем элемент заново на каждом тике.
function startSeatTimers() {
    clearInterval(seatTimerInterval);
    function tick() {
        const badge = el.seats.querySelector('.seat-marker.active .seat-timer');
        if (!badge) return;
        const remaining = Math.max(0, activeTurnDeadline - Date.now());
        badge.textContent = Math.ceil(remaining / 1000);
        const color = timerColorForFraction(remaining / (activeTurnTotalTime || 1));
        badge.style.borderColor = color;
        badge.style.color = color;
        if (remaining <= 0) clearInterval(seatTimerInterval);
    }
    tick();
    seatTimerInterval = setInterval(tick, 250);
}

// Короткая всплывающая подпись действия у места игрока (Чек / Колл 200 /
// Рейз 400 / Фолд) — как индикатор действия на панели из макета. Храним в
// отдельной карте (а не просто патчим DOM), потому что следом почти всегда
// приходит playersUpdate и полностью перерисовывает стол — так подпись не
// теряется при этой перерисовке, а гаснет сама через 1.8с.
// Подпись действия у места игрока (Чек / Колл 200 / Рейз 400 / Фолд /
// Олл-ин) — теперь висит постоянно вместо пропадающей ставки-фишки, пока
// не начнётся новая улица торгов или раздача (см. flop/turnCard/river/
// newHand — там seatActionFlashes сбрасывается).
function flashSeatAction(name, label, type) {
    seatActionFlashes[name] = { label, type: type || 'call' };
    renderSeats();
}

// ---------- Таймер ----------
// Цвет таймера меняется плавно по остатку времени: зелёный (много времени)
// → синий (половина) → красный (почти вышло). Работает и для большого
// кружка хода игрока, и для маленьких кружков-таймеров у мест за столом.
function timerColorForFraction(frac) {
    frac = Math.max(0, Math.min(1, frac));
    const green = [46, 204, 113];
    const blue = [52, 152, 219];
    const red = [224, 60, 60];
    let from, to, t;
    if (frac > 0.5) {
        from = blue; to = green; t = (frac - 0.5) / 0.5;
    } else {
        from = red; to = blue; t = frac / 0.5;
    }
    const c = from.map((v, i) => Math.round(v + (to[i] - v) * t));
    return `rgb(${c[0]},${c[1]},${c[2]})`;
}

function startTurnTimer(timeLimit) {
    clearInterval(turnTimerInterval);
    const start = Date.now();

    function tick() {
        const remaining = Math.max(0, timeLimit - (Date.now() - start));
        el.timerValue.textContent = `${Math.ceil(remaining / 1000)}`;
        const color = timerColorForFraction(remaining / timeLimit);
        el.timerValue.style.borderColor = color;
        el.timerValue.style.color = color;
        if (remaining <= 0) clearInterval(turnTimerInterval);
    }
    tick();
    turnTimerInterval = setInterval(tick, 250);
}

// ---------- Действия ----------
// HandForge Pro: максимальный размер ставки/повышения на улице — 2/4/8 ББ
// (флоп/тёрн/ривер). Определяем улицу по количеству открытых карт борда.
function getProRoundCap() {
    if (roomMode !== 'pro') return null;
    const capBB = boardRevealed.length >= 5 ? 8 : (boardRevealed.length === 4 ? 4 : 2);
    return capBB * roomAnte;
}

function syncRaiseControls() {
    const me = players.find(p => p.name === myName);
    const maxChips = me ? me.chips : 1000;
    const cap = getProRoundCap();
    const effectiveMax = cap ? Math.min(maxChips, cap) : maxChips;
    el.raiseRange.max = effectiveMax;
    if (parseInt(el.raiseInput.value) > effectiveMax) {
        el.raiseInput.value = effectiveMax;
        el.raiseRange.value = effectiveMax;
    }
}

el.raiseRange.addEventListener('input', () => { el.raiseInput.value = el.raiseRange.value; });
el.raiseInput.addEventListener('input', () => { el.raiseRange.value = el.raiseInput.value; });

function setRaisePreset(multiplier) {
    const me = players.find(p => p.name === myName);
    const maxBet = Math.max(0, ...players.filter(p => !p.folded).map(p => p.bet || 0));
    const myBet = me ? (me.bet || 0) : 0;
    const toCall = maxBet - myBet;
    const isHoldem = roomMode === 'holdem-cash' || roomMode === 'holdem-tourney';
    // Если на этой улице ещё никто не ставил — берём за базу открытия ставки:
    // в Hold'em это большой блайнд (roomAnte там — турнирное анте, в кэше
    // оно вообще 0, поэтому раньше х2/х3/х4 после флопа считали от 0!),
    // в Race/Pro — удвоенное анте (там анте = 1 ББ, это то же значение,
    // которое сервер по умолчанию использует для рейза).
    const openBase = isHoldem ? roomBigBlind : roomAnte * 2;
    const base = toCall > 0 ? toCall : openBase;
    const cap = getProRoundCap();
    let maxChips = me ? me.chips : base * multiplier;
    if (cap) maxChips = Math.min(maxChips, cap);
    const value = Math.max(0, Math.min(Math.round(base * multiplier), maxChips));
    el.raiseInput.value = value;
    el.raiseRange.value = value;
}

el.raiseX2.addEventListener('click', () => setRaisePreset(2));
el.raiseX3.addEventListener('click', () => setRaisePreset(3));
el.raiseX4.addEventListener('click', () => setRaisePreset(4));

// Прячем панель действий сразу по клику, не дожидаясь ответа сервера —
// иначе при задержке сети она ещё секунду-другую висит кликабельной уже
// после того, как игрок сходил (и это даёт впечатление, что можно
// сходить ещё раз). Сервер всё равно источник истины: если действие по
// какой-то причине не применится, панель просто не появится снова, пока
// сервер не пришлёт следующий 'turn' именно этому игроку.
function submitAction(payload) {
    el.actionBar.style.display = 'none';
    socket.emit('action', payload);
}

// Мобильная панель действий в одну строку: слайдер/поле/пресеты рейза не
// помещаются в тот же ряд, что и 5 кнопок действий, если показывать их
// всегда — панель растягивалась на 2-3 строки и перекрывала стол. Поэтому
// на мобильном (см. isMobileLayout) слайдер по умолчанию свёрнут (класс
// "open" на #raiseGroup), а кнопка "Рейз" работает в два шага:
//   1) слайдер ещё свёрнут -> первое нажатие просто РАСКРЫВАЕТ его
//      (показывается компактным всплытием прямо над рядом кнопок),
//      рейз при этом НЕ отправляется;
//   2) слайдер уже раскрыт -> нажатие подтверждает рейз на выбранную
//      сумму, как и раньше, и сворачивает слайдер обратно.
// На ПК ничего не меняется — там слайдер всегда виден и раскрывать нечего.
function isMobileLayout() {
    return window.matchMedia('(max-width:600px)').matches;
}

el.foldBtn.addEventListener('click', () => submitAction({ action: 'fold' }));
el.checkBtn.addEventListener('click', () => submitAction({ action: 'check' }));
el.callBtn.addEventListener('click', () => submitAction({ action: 'call' }));
el.raiseBtn.addEventListener('click', () => {
    if (isMobileLayout() && !el.raiseGroup.classList.contains('open')) {
        el.raiseGroup.classList.add('open');
        el.raiseBtn.textContent = RAISE_BTN_CONFIRM_LABEL;
        return;
    }
    const amount = parseInt(el.raiseInput.value) || 0;
    submitAction({ action: 'raise', amount });
    el.raiseGroup.classList.remove('open');
    el.raiseBtn.textContent = RAISE_BTN_DEFAULT_LABEL;
});
el.allInBtn.addEventListener('click', () => submitAction({ action: 'allin' }));

el.seats.addEventListener('click', (e) => {
    if (e.target.closest('.my-cards-wrap.clickable')) {
        socket.emit('showMyHand');
        return;
    }
    const emptySeat = e.target.closest('.seat.empty.clickable');
    if (emptySeat) {
        const slot = parseInt(emptySeat.getAttribute('data-slot'), 10);
        if (Number.isInteger(slot)) openBuyinPrompt(slot);
    }
});

el.leaveBtn.addEventListener('click', () => {
    // ВАЖНО: раньше эта кнопка просто уводила на /index.html, а сервер видел
    // это как обрыв связи и оставлял игрока за столом с пометкой "Отключён"
    // вместо полного ухода. Явно говорим серверу, что это осознанный выход
    // (не разрыв соединения), чтобы он мог сразу убрать игрока из комнаты /
    // освободить место, а не просто ждать переподключения.
    // ТРЕБУЕТСЯ обработчик 'leaveRoom' на сервере (server.js) — см. чат.
    socket.emit('leaveRoom');
    window.location.href = 'index.html';
});

// ---------- Верхняя панель как всплывающее окно (актуально для мобильных) ----------
const topbarEl = document.querySelector('.topbar');
const topbarContent = document.getElementById('topbarContent');
const topbarCollapseBtn = document.getElementById('topbarCollapseBtn');

function closeTopbarPopup() {
    topbarContent.classList.remove('open');
    topbarCollapseBtn.textContent = '⌄';
}

topbarCollapseBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    const open = topbarContent.classList.toggle('open');
    topbarCollapseBtn.textContent = open ? '⌃' : '⌄';
    fitMobileViewport();
});

// Тап мимо всплывающей шапки — закрывает её
document.addEventListener('click', (e) => {
    if (topbarContent.classList.contains('open') && !topbarEl.contains(e.target)) {
        closeTopbarPopup();
    }
});

fitMobileViewport();

// ---------- Лог / история / чат — выезжающая панель ----------
const logPanel = document.getElementById('logPanel');
const logBackdrop = document.getElementById('logBackdrop');
const toggleLogBtn = document.getElementById('toggleLogBtn');
const closeLogBtn = document.getElementById('closeLogBtn');

function openLogPanel() {
    logPanel.classList.add('open');
    logBackdrop.classList.add('open');
}
function closeLogPanel() {
    logPanel.classList.remove('open');
    logBackdrop.classList.remove('open');
}
toggleLogBtn.addEventListener('click', openLogPanel);
closeLogBtn.addEventListener('click', closeLogPanel);
logBackdrop.addEventListener('click', closeLogPanel);

document.querySelectorAll('.log-tab').forEach(tab => {
    tab.addEventListener('click', () => {
        document.querySelectorAll('.log-tab').forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        const target = tab.getAttribute('data-tab');
        document.getElementById('logView').style.display = target === 'log' ? 'block' : 'none';
        document.getElementById('historyView').style.display = target === 'history' ? 'block' : 'none';
        document.getElementById('chatView').style.display = target === 'chat' ? 'flex' : 'none';
        document.getElementById('playersView').style.display = target === 'players' ? 'block' : 'none';
        if (target === 'players') renderPlayersStatsTab();
    });
});

el.historyList.addEventListener('click', (e) => {
    const item = e.target.closest('.history-item');
    if (item) item.classList.toggle('expanded');
});

function logLine(text, cls) {
    const p = document.createElement('p');
    if (cls === 'win') p.className = 'win-line';
    else if (cls === 'deal') p.className = 'deal-line';
    else if (cls === 'action' && text.startsWith(myName + ':')) p.className = 'hero-line';
    p.textContent = text;
    el.logList.prepend(p);
    while (el.logList.children.length > 60) el.logList.removeChild(el.logList.lastChild);
}

// Вкладка "Игроки" (только кэш): список ВСЕХ, кто хоть раз заходил за этот
// стол за текущую сессию — включая тех, кто отключился/встал из-за стола.
// room.players на сервере не удаляет ушедших (пока стол жив), поэтому эти
// данные приходят прямо в обычном playersUpdate — просто показываем их тут
// отдельным списком с закупом/стеком/профитом.
function playerStatusLabel(p) {
    if (p.eliminated) return 'Выбыл';
    if (!p.connected) return 'Отключён';
    if (p.seated === false) return 'Наблюдатель';
    return 'За столом';
}

function renderPlayersStatsTab() {
    const container = document.getElementById('playersStatsList');
    if (!container) return;
    if (!players.length) {
        container.innerHTML = '<p class="no-rooms">Пока никто не заходил.</p>';
        return;
    }
    const rows = [...players]
        .sort((a, b) => (b.totalBuyIn || 0) - (a.totalBuyIn || 0))
        .map(p => {
            const buyIn = p.totalBuyIn || 0;
            const chips = p.chips || 0;
            const profit = chips - buyIn;
            const profitClass = profit > 0 ? 'profit-pos' : (profit < 0 ? 'profit-neg' : 'profit-zero');
            const profitText = profit > 0 ? `+${profit}` : `${profit}`;
            const stackLabel = (!p.connected || p.eliminated) ? 'Финальный стек' : 'Стек';
            const avatarHtml = p.avatar
                ? `<img class="player-stat-avatar" src="${escapeAttr(p.avatar)}" alt="">`
                : `<div class="player-stat-avatar player-stat-avatar-fallback" style="background:${escapeAttr(p.color || '#e74c3c')};">${escapeHtml((p.name || '?').charAt(0).toUpperCase())}</div>`;
            const statusClass = p.eliminated ? 'stat-status-elim' : (!p.connected ? 'stat-status-off' : (p.seated === false ? 'stat-status-obs' : 'stat-status-on'));
            return `
                <div class="player-stat-row">
                    ${avatarHtml}
                    <div class="player-stat-main">
                        <div class="player-stat-name">${escapeHtml(p.name)}${p.name === myName ? ' (вы)' : ''}</div>
                        <div class="player-stat-status ${statusClass}">${playerStatusLabel(p)}</div>
                    </div>
                    <div class="player-stat-nums">
                        <div class="player-stat-line"><span>Закуп</span><b>${buyIn}</b></div>
                        <div class="player-stat-line"><span>Докупок</span><b>${p.rebuys || 0}</b></div>
                        <div class="player-stat-line"><span>${stackLabel}</span><b>${chips}</b></div>
                        <div class="player-stat-line"><span>Профит</span><b class="${profitClass}">${profitText}</b></div>
                    </div>
                </div>`;
        }).join('');
    container.innerHTML = rows;
}

function renderHistory(history) {
    const winnersOf = (entry) => (entry.winner || '').split(' и ').map(s => s.trim()).filter(Boolean);

    const handCardsHtml = (hand, usedHoleCards) => {
        if (!hand) return '<span class="h-detail">карты не открывались</span>';
        const used = usedHoleCards && usedHoleCards.length;
        return hand.map(c => {
            let extra = '';
            if (used) {
                const isUsed = usedHoleCards.some(wc => wc.suit === c.suit && wc.rank === c.rank);
                extra = isUsed ? 'card-win' : 'card-dim';
            }
            return cardHtml(c, { small: true, extraClass: extra });
        }).join('');
    };

    el.historyList.innerHTML = history.map(entry => {
        const mine = entry.participants ? entry.participants.find(p => p.name === myName) : null;
        const resultClass = mine && mine.net != null ? (mine.net >= 0 ? 'win' : 'loss') : '';
        const netText = mine && mine.net != null ? `У вас: ${mine.net >= 0 ? '+' : ''}${mine.net}` : '';
        const myHandHtml = handCardsHtml(mine && mine.hand, mine && mine.usedHoleCards);

        const boardHtml = (entry.board || []).map(c => cardHtml(c, { small: true })).join('');
        const winners = winnersOf(entry);

        const isCash = roomMode === 'holdem-cash';
        const participantsHtml = (entry.participants || []).map(p => {
            const isWinner = winners.includes(p.name);
            const handHtml = handCardsHtml(p.hand, p.usedHoleCards);
            const netStr = p.net != null ? `${p.net >= 0 ? '+' : ''}${p.net}` : '';
            const buyInStr = (isCash && p.buyIn != null) ? `<span class="history-participant-buyin">Закуп: ${p.buyIn}</span>` : '';
            return `
                <div class="history-participant ${isWinner ? 'winner' : ''}">
                    <div class="history-participant-head">
                        <span class="history-participant-name">${escapeHtml(p.name)}${p.name === myName ? ' (вы)' : ''}</span>
                        ${isWinner ? '<span class="history-winner-tag">Победитель</span>' : ''}
                        ${p.handName ? `<span class="history-participant-hand">${escapeHtml(p.handName)}</span>` : ''}
                        ${netStr ? `<span class="history-participant-net">${netStr}</span>` : ''}
                        ${buyInStr}
                    </div>
                    <div class="history-hand-cards">${handHtml}</div>
                </div>`;
        }).join('');

        return `
            <div class="history-item ${resultClass}">
                <div class="history-item-head">
                    <div class="h-title">Раздача #${entry.handNumber}: ${escapeHtml(entry.winner)} +${entry.amount}${entry.handName ? ' — ' + escapeHtml(entry.handName) : ''}</div>
                    <span class="history-expand-arrow">▸</span>
                </div>
                ${netText ? `<div class="h-detail">${netText}</div>` : ''}
                <div class="history-hand-cards">${myHandHtml}</div>
                <div class="history-expanded">
                    <div class="h-detail">Борд:</div>
                    <div class="history-hand-cards">${boardHtml || '<span class="h-detail">—</span>'}</div>
                    <div class="history-table">${participantsHtml}</div>
                </div>
            </div>`;
    }).join('') || '<p style="color:var(--parchment-dim); font-size:12.5px;">История пуста.</p>';
}

function escapeHtml(str) {
    return String(str).replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
}
function escapeAttr(str) {
    return escapeHtml(str);
}

// Свечение места за столом — в цвете, который игрок сам выбрал в лобби
// (тот же цвет, что раньше использовался только для фона аватарки-заглушки).
// Возвращает "r,g,b", чтобы в CSS собрать полупрозрачное свечение через
// rgba(var(--seat-glow-rgb), .4) — так надёжнее и совместимее со старыми
// браузерами/вебвью, чем color-mix().
function hexToRgbTriplet(hex) {
    const fallback = '224,103,44';
    if (!hex) return fallback;
    const m = String(hex).trim().match(/^#?([0-9a-f]{6})$/i);
    if (!m) return fallback;
    const n = parseInt(m[1], 16);
    return `${(n >> 16) & 255},${(n >> 8) & 255},${n & 255}`;
}