const socket = io({ auth: { token: localStorage.getItem('pq_access') } });
socket.on('connect_error', (err) => {
    if (err && err.message === 'unauthorized') {
        localStorage.removeItem('pq_access');
        location.replace('/quest/login?next=' + encodeURIComponent(location.pathname + location.search));
    }
});

const AVATAR_COLORS = ['#e74c3c', '#3498db', '#2ecc71', '#f39c12', '#9b59b6', '#1abc9c', '#e91e63', '#ff5722'];
const MODE_LABELS = {
    race: 'HandForge Race',
    pro: 'HandForge Pro',
    'holdem-cash': 'HandForge Cash',
    'holdem-tourney': "HandForge Hold'em Tournament"
};

let selectedColor = null;
let selectedAvatarDataUrl = null;
let latestRooms = [];
let selectedMode = null;

function escapeHtml(str) {
    return String(str == null ? '' : str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

// Готовые встроенные аватарки убраны — в пикере остаются только реальные
// картинки, которые лежат в папке public/images/avatars/ (см. scanAvatarLibrary
// на сервере). Просто положите туда PNG/JPG/JPEG/WEBP — они появятся сами.

// Сервер принимает аватар только как data:image/... (см. sanitizeAvatar в
// server.js), обычный путь /images/... он отбросит. Поэтому готовый аватар
// конвертируется в data URL через тот же canvas-пайплайн, что и загрузка
// своего фото (fileToAvatarDataUrl ниже) — просто источник не File, а
// уже загруженная картинка по URL. Результат кэшируется, чтобы повторный
// клик по той же иконке не гонял конвертацию заново.
const presetAvatarCache = new Map();
function presetAvatarToDataUrl(url) {
    if (presetAvatarCache.has(url)) return Promise.resolve(presetAvatarCache.get(url));
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.onerror = () => reject(new Error('Не удалось загрузить аватар'));
        img.onload = () => {
            const size = 96;
            const canvas = document.createElement('canvas');
            canvas.width = size; canvas.height = size;
            const ctx = canvas.getContext('2d');
            // У SVG без атрибутов width/height браузер сообщает naturalWidth=0.
            // Тогда drawImage с нулевым размером источника не рисует ничего —
            // и аватар получался пустым (за столом было видно "нет картинки").
            // Подстраховываемся дефолтным размером, а сам источник рисуем
            // целиком, растягивая его в квадрат канваса.
            const iw = img.naturalWidth || img.width || 0;
            const ih = img.naturalHeight || img.height || 0;
            if (!iw || !ih) {
                ctx.drawImage(img, 0, 0, size, size);
            } else {
                const srcSize = Math.min(iw, ih);
                const sx = (iw - srcSize) / 2;
                const sy = (ih - srcSize) / 2;
                ctx.drawImage(img, sx, sy, srcSize, srcSize, 0, 0, size, size);
            }
            const dataUrl = canvas.toDataURL('image/png');
            presetAvatarCache.set(url, dataUrl);
            resolve(dataUrl);
        };
        img.src = url;
    });
}

function fileToAvatarDataUrl(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onerror = () => reject(new Error('Не удалось прочитать файл'));
        reader.onload = () => {
            const img = new Image();
            img.onerror = () => reject(new Error('Не удалось загрузить изображение'));
            img.onload = () => {
                const size = 96;
                const canvas = document.createElement('canvas');
                canvas.width = size;
                canvas.height = size;
                const ctx = canvas.getContext('2d');
                // Кроп по центру в квадрат, чтобы не искажать пропорции фото
                const srcSize = Math.min(img.width, img.height);
                const sx = (img.width - srcSize) / 2;
                const sy = (img.height - srcSize) / 2;
                ctx.drawImage(img, sx, sy, srcSize, srcSize, 0, 0, size, size);
                resolve(canvas.toDataURL('image/jpeg', 0.82));
            };
            img.src = reader.result;
        };
        reader.readAsDataURL(file);
    });
}

document.addEventListener('DOMContentLoaded', () => {
    const loginSection = document.getElementById('loginSection');
    const modeSection = document.getElementById('modeSection');
    const roomsSection = document.getElementById('roomsSection');
    const playerNameInput = document.getElementById('playerName');
    const enterBtn = document.getElementById('enterBtn');
    const logoutBtn = document.getElementById('logoutBtn');
    const changeModeBtn = document.getElementById('changeModeBtn');
    const createRoomBtn = document.getElementById('createRoomBtn');
    const roomsList = document.getElementById('roomsList');
    const playerDisplayName = document.getElementById('playerDisplayName');
    const myAvatar = document.getElementById('myAvatar');
    const avatarPicker = document.getElementById('avatarPicker');
    const avatarFileInput = document.getElementById('avatarFileInput');
    const avatarClearBtn = document.getElementById('avatarClearBtn');
    const modeRows = document.querySelectorAll('.mode-row');
    const closedRoomsSection = document.getElementById('closedRoomsSection');

    // Ник больше не вводится руками — это имя аккаунта из единого логина
    // с PhotoQuest (см. js/auth-gate.js). Поле держим до ответа сервера
    // заблокированным, чтобы не отправить пустое/дефолтное имя раньше времени.
    playerNameInput.readOnly = true;
    playerNameInput.style.opacity = '0.7';
    enterBtn.disabled = true;
    if (window.__pqAuthReady) {
        window.__pqAuthReady.then((user) => {
            if (!user) return;
            playerNameInput.value = user.username;
            enterBtn.disabled = false;
        });
    }
    const currentModeTag = document.getElementById('currentModeTag');
    const roomsHeading = roomsSection.querySelector('h2');
    const anteFieldLabel = document.getElementById('anteFieldLabel');
    const levelMinutesGroup = document.getElementById('levelMinutesGroup');
    const smallBlindGroup = document.getElementById('smallBlindGroup');

    let customPhotoSwatch = null;

    function selectColorSwatch(sw, color) {
        selectedColor = color;
        selectedAvatarDataUrl = null;
        avatarClearBtn.style.display = 'none';
        document.querySelectorAll('.avatar-swatch').forEach(s => s.classList.remove('selected'));
        sw.classList.add('selected');
    }

    // Кнопка "Аватарка", за которой спрятана вся секция выбора, показывает
    // миниатюру выбранного аватара — чтобы в свёрнутом виде было видно, что
    // именно выбрано, и не приходилось раскрывать секцию ради проверки.
    const avatarToggleBtn = document.getElementById('avatarToggleBtn');
    const avatarSection = document.getElementById('avatarSection');
    const avatarTogglePreview = document.getElementById('avatarTogglePreview');

    function updateAvatarTogglePreview() {
        if (!avatarTogglePreview) return;
        if (selectedAvatarDataUrl) {
            avatarTogglePreview.style.backgroundImage = `url(${selectedAvatarDataUrl})`;
            avatarTogglePreview.classList.add('has-avatar');
            avatarTogglePreview.textContent = '';
        } else {
            avatarTogglePreview.style.backgroundImage = '';
            avatarTogglePreview.classList.remove('has-avatar');
            avatarTogglePreview.textContent = '+';
        }
    }

    function setAvatarSectionOpen(open) {
        if (!avatarSection || !avatarToggleBtn) return;
        avatarSection.style.display = open ? 'block' : 'none';
        avatarToggleBtn.classList.toggle('open', open);
        avatarToggleBtn.setAttribute('aria-expanded', open ? 'true' : 'false');
    }

    if (avatarToggleBtn) {
        avatarToggleBtn.addEventListener('click', () => {
            setAvatarSectionOpen(avatarSection.style.display === 'none');
        });
    }
    updateAvatarTogglePreview();

    function applyCustomAvatar(dataUrl) {
        selectedAvatarDataUrl = dataUrl;
        if (!customPhotoSwatch) {
            customPhotoSwatch = document.createElement('div');
            customPhotoSwatch.className = 'avatar-swatch custom-photo';
            customPhotoSwatch.title = 'Ваше фото';
            customPhotoSwatch.addEventListener('click', () => {
                selectedAvatarDataUrl = dataUrl;
                document.querySelectorAll('.avatar-swatch').forEach(s => s.classList.remove('selected'));
                customPhotoSwatch.classList.add('selected');
                avatarClearBtn.style.display = 'inline-block';
                updateAvatarTogglePreview();
            });
            avatarPicker.prepend(customPhotoSwatch);
        }
        customPhotoSwatch.style.backgroundImage = `url(${dataUrl})`;
        document.querySelectorAll('.avatar-swatch').forEach(s => s.classList.remove('selected'));
        customPhotoSwatch.classList.add('selected');
        avatarClearBtn.style.display = 'inline-block';
        updateAvatarTogglePreview();
    }

    avatarFileInput.addEventListener('change', async () => {
        const file = avatarFileInput.files && avatarFileInput.files[0];
        if (!file) return;
        try {
            const dataUrl = await fileToAvatarDataUrl(file);
            applyCustomAvatar(dataUrl);
        } catch (e) {
            alert('Не удалось загрузить фото, попробуйте другое.');
        }
        avatarFileInput.value = '';
    });

    avatarClearBtn.addEventListener('click', () => {
        selectedAvatarDataUrl = null;
        avatarClearBtn.style.display = 'none';
        if (customPhotoSwatch) customPhotoSwatch.classList.remove('selected');
        updateAvatarTogglePreview();
    });

    // Готовые аватары — крупная сетка над цветными кружками. Выбор одного
    // из них ведёт себя как загруженное фото (applyCustomAvatar), поэтому
    // переиспользует всю уже существующую логику подсветки/очистки выбора.
    const avatarPresetGrid = document.getElementById('avatarPresetGrid');
    let selectedPresetEl = null;

    // Общий рендер одной клетки пикера — используется и для встроенных
    // (PRESET_AVATARS, .svg) значков, и для картинок из папки
    // public/images/avatars/, которые сервер сканирует "вживую"
    // (см. getAvatarLibrary/avatarLibrary ниже). Логика выбора одинаковая:
    // конвертируем в квадратный data URL (масштаб + кроп по центру —
    // presetAvatarToDataUrl) и обрабатываем как загруженное фото.
    function makeAvatarPresetCell(url, label) {
        const cell = document.createElement('div');
        cell.className = 'avatar-preset';
        cell.title = label;
        cell.innerHTML = `<img src="${url}" alt="${escapeHtml(label)}" loading="lazy">`;
        cell.addEventListener('click', async () => {
            try {
                const dataUrl = await presetAvatarToDataUrl(url);
                applyCustomAvatar(dataUrl);
                if (selectedPresetEl) selectedPresetEl.classList.remove('selected');
                cell.classList.add('selected');
                selectedPresetEl = cell;
            } catch (e) {
                alert('Не удалось выбрать этот аватар, попробуйте другой.');
            }
        });
        return cell;
    }

    // Встроенных значков больше нет — сетка наполняется только из
    // avatarLibrary (см. ниже).

    // Пользовательские аватарки: любые PNG/JPG/JPEG/WEBP, лежащие в папке
    // public/images/avatars/, — сервер сканирует эту папку по каждому такому
    // запросу (не только один раз при старте), поэтому просто добавьте туда
    // новый файл и переоткройте лобби — он появится здесь сам, без правок кода.
    socket.emit('getAvatarLibrary');
    socket.on('avatarLibrary', (list) => {
        if (!avatarPresetGrid) return; // контейнера нет в разметке — молча пропускаем
        (list || []).forEach(item => {
            avatarPresetGrid.appendChild(makeAvatarPresetCell(item.url, item.name));
        });
    });
    // Загрузка своего фото или выбор цвета должны снимать подсветку с
    // готового аватара — иначе на экране будет как будто выбраны сразу два.
    avatarFileInput.addEventListener('change', () => {
        if (selectedPresetEl) { selectedPresetEl.classList.remove('selected'); selectedPresetEl = null; }
    });
    avatarPicker.addEventListener('click', (e) => {
        if (e.target.closest('.avatar-preset')) return;
        if (selectedPresetEl) { selectedPresetEl.classList.remove('selected'); selectedPresetEl = null; }
    });

    // П.2: выбор аватара — по умолчанию случайный цвет, если не выбран явно
    AVATAR_COLORS.forEach(color => {
        const sw = document.createElement('div');
        sw.className = 'avatar-swatch';
        sw.style.background = color;
        sw.addEventListener('click', () => selectColorSwatch(sw, color));
        avatarPicker.appendChild(sw);
    });

    enterBtn.addEventListener('click', () => {
        const name = playerNameInput.value.trim();
        if (!name) {
            alert('Введите ник!');
            return;
        }
        const color = selectedColor || AVATAR_COLORS[Math.floor(Math.random() * AVATAR_COLORS.length)];
        const avatar = selectedAvatarDataUrl || null;
        sessionStorage.setItem('playerName', name);
        sessionStorage.setItem('playerColor', color);
        // Аватар — в localStorage (не sessionStorage): требование "выбранная
        // аватарка должна сохраняться и подхватываться при следующем ЗАПУСКЕ
        // приложения", а не только пока открыта текущая вкладка/сессия.
        if (avatar) {
            localStorage.setItem('playerAvatar', avatar);
        } else {
            localStorage.removeItem('playerAvatar');
        }
        socket.emit('joinLobby', { name, color, avatar });
    });

    playerNameInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') enterBtn.click();
    });

    // Если ник уже сохранён с прошлого раза — не заставляем вводить его снова,
    // сразу переходим в раздел выбора режима (или сразу в список столов
    // последнего выбранного режима — см. обработчик lobbyJoined ниже).
    const savedName = sessionStorage.getItem('playerName');
    if (savedName) {
        playerNameInput.value = savedName;
        const savedColor = sessionStorage.getItem('playerColor') || AVATAR_COLORS[0];
        const savedAvatar = localStorage.getItem('playerAvatar') || null;
        selectedColor = savedColor;
        selectedAvatarDataUrl = savedAvatar;
        if (savedAvatar) applyCustomAvatar(savedAvatar);
        socket.emit('joinLobby', { name: savedName, color: savedColor, avatar: savedAvatar });
    }

    logoutBtn.addEventListener('click', () => {
        // Настоящий выход — забываем ник/режим, чтобы начать заново
        sessionStorage.removeItem('playerName');
        sessionStorage.removeItem('playerColor');
        localStorage.removeItem('playerAvatar');
        sessionStorage.removeItem('gameMode');
        location.reload();
    });

    // Сначала ник -> потом выбор режима -> потом уже список столов этого режима.
    // Строка режима компактная: нажатие на саму строку выбирает режим, нажатие
    // на стрелку ▶ только раскрывает/сворачивает краткое описание (по
    // умолчанию все описания свёрнуты).
    function enterMode(mode) {
        selectedMode = mode;
        sessionStorage.setItem('gameMode', selectedMode);
        modeSection.style.display = 'none';
        roomsSection.style.display = 'block';
        currentModeTag.textContent = MODE_LABELS[selectedMode] || selectedMode;
        roomsHeading.textContent = `Доступные столы — ${MODE_LABELS[selectedMode] || selectedMode}`;
        updateCreateFormForMode();
        renderRoomsList();
    }

    modeRows.forEach(row => {
        const head = row.querySelector('.mode-row-head');
        const arrow = row.querySelector('.mode-row-arrow');
        head.addEventListener('click', (e) => {
            if (e.target.closest('.mode-row-arrow')) return; // стрелку обрабатываем отдельно
            enterMode(row.getAttribute('data-mode'));
        });
        arrow.addEventListener('click', (e) => {
            e.stopPropagation();
            e.preventDefault();
            row.classList.toggle('open');
        });
        arrow.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ' ') {
                e.stopPropagation();
                e.preventDefault();
                row.classList.toggle('open');
            }
        });
    });

    changeModeBtn.addEventListener('click', () => {
        roomsSection.style.display = 'none';
        modeSection.style.display = 'block';
    });

    function updateCreateFormForMode() {
        const isHoldem = selectedMode === 'holdem-cash' || selectedMode === 'holdem-tourney';
        // Учёт закупов/профита существует только в кэше — в Race, Pro и
        // турнире блок "Итоги кэш-столов" не показываем вообще.
        const isCash = selectedMode === 'holdem-cash';
        if (closedRoomsSection) closedRoomsSection.style.display = isCash ? 'block' : 'none';
        if (isCash && typeof requestClosedRoomsList === 'function') requestClosedRoomsList();
        anteFieldLabel.textContent = isHoldem ? 'Большой блайнд (ББ):' : 'Анте (1 ББ):';
        levelMinutesGroup.style.display = selectedMode === 'holdem-tourney' ? 'block' : 'none';
        // В кэш-игре малый и большой блайнд задаются отдельно (турнир считает
        // малый блайнд сам, по расписанию роста — там это не нужно).
        smallBlindGroup.style.display = selectedMode === 'holdem-cash' ? 'block' : 'none';
    }

    createRoomBtn.addEventListener('click', () => {
        const roomNameInput = document.getElementById('roomName');
        const name = roomNameInput ? roomNameInput.value : '';
        const maxPlayers = parseInt(document.getElementById('maxPlayers').value);
        const ante = parseInt(document.getElementById('ante').value);
        const startingStack = parseInt(document.getElementById('startingStack').value);
        const levelMinutes = parseInt(document.getElementById('levelMinutes').value);
        const smallBlind = parseInt(document.getElementById('smallBlind').value);
        socket.emit('createRoom', { name, maxPlayers, ante, startingStack, mode: selectedMode || 'race', levelMinutes, smallBlind });
    });

    socket.on('lobbyJoined', (data) => {
        playerDisplayName.textContent = data.name;
        const color = sessionStorage.getItem('playerColor') || '#e74c3c';
        const avatar = localStorage.getItem('playerAvatar');
        if (avatar) {
            myAvatar.style.background = 'transparent';
            myAvatar.style.backgroundImage = `url(${avatar})`;
            myAvatar.style.backgroundSize = 'cover';
            myAvatar.style.backgroundPosition = 'center';
            myAvatar.textContent = '';
        } else {
            myAvatar.style.backgroundImage = 'none';
            myAvatar.style.background = color;
            myAvatar.textContent = data.name.charAt(0).toUpperCase();
        }
        loginSection.style.display = 'none';

        const savedMode = sessionStorage.getItem('gameMode');
        if (savedMode && MODE_LABELS[savedMode]) {
            selectedMode = savedMode;
            modeSection.style.display = 'none';
            roomsSection.style.display = 'block';
            currentModeTag.textContent = MODE_LABELS[selectedMode];
            roomsHeading.textContent = `Доступные столы — ${MODE_LABELS[selectedMode]}`;
            updateCreateFormForMode();
            renderRoomsList();
        } else {
            modeSection.style.display = 'block';
        }
    });

    socket.on('roomCreated', (roomId) => {
        window.location.href = `game.html?room=${roomId}`;
    });

    socket.on('roomList', (rooms) => {
        latestRooms = rooms;
        renderRoomsList();
        // Раздел итогов держим в актуальном состоянии сам, не заставляя
        // игрока каждый раз жать "Обновить список": как только на сервере
        // что-то поменялось со столами, перезапрашиваем и итоги.
        if (selectedMode === 'holdem-cash' && typeof requestClosedRoomsList === 'function') requestClosedRoomsList();
    });

    socket.on('error', (message) => {
        alert(message);
    });

    // ---------- История столов (итоги закрытых кэш-столов) ----------
    const closedRoomsList = document.getElementById('closedRoomsList');
    const refreshHistoryBtn = document.getElementById('refreshHistoryBtn');
    const ledgerModalOverlay = document.getElementById('ledgerModalOverlay');
    const ledgerModalClose = document.getElementById('ledgerModalClose');
    const ledgerModalTitle = document.getElementById('ledgerModalTitle');
    const ledgerModalSub = document.getElementById('ledgerModalSub');
    const ledgerModalList = document.getElementById('ledgerModalList');

    function requestClosedRoomsList() {
        socket.emit('getClosedRoomsList');
    }

    function formatClosedAt(ts) {
        if (!ts) return '';
        const d = new Date(ts);
        return d.toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
    }

    refreshHistoryBtn.addEventListener('click', requestClosedRoomsList);

    socket.on('closedRoomsList', (list) => {
        if (!list || !list.length) {
            closedRoomsList.innerHTML = '<p class="no-rooms">Кэш-столов с закупами пока не было.</p>';
            return;
        }
        closedRoomsList.innerHTML = list.map(r => {
            const state = r.closed
                ? `закрыт ${formatClosedAt(r.closedAt)}`
                : '<span class="ledger-live-tag">стол идёт</span>';
            const bank = r.totalBuyIn ? ` · всего закуплено ${r.totalBuyIn}` : '';
            return `
            <div class="closed-room-item">
                <div>
                    <div>${escapeHtml(r.name || `Стол ${r.id}`)}</div>
                    <div class="closed-room-meta">${MODE_LABELS[r.mode] || r.mode} · ${r.playersCount} игрок(ов)${bank} · ${state}</div>
                </div>
                <button class="btn-small view-ledger-btn" data-room="${escapeHtml(r.id)}">Итоги</button>
            </div>`;
        }).join('');
        closedRoomsList.querySelectorAll('.view-ledger-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                socket.emit('getRoomLedger', { roomId: btn.getAttribute('data-room') });
            });
        });
    });

    socket.on('roomLedger', (data) => {
        if (!data) {
            alert('Данные по этому столу не найдены.');
            return;
        }
        ledgerModalTitle.textContent = `Итоги стола «${data.name || `Стол ${data.id}`}»`;
        ledgerModalSub.textContent = data.closed
            ? `${MODE_LABELS[data.mode] || data.mode} · закрыт ${formatClosedAt(data.closedAt)}`
            : `${MODE_LABELS[data.mode] || data.mode} · стол ещё идёт`;

        const rows = [...data.players]
            .sort((a, b) => (b.totalBuyIn || 0) - (a.totalBuyIn || 0))
            .map(p => {
                const buyIn = p.totalBuyIn || 0;
                const chips = p.chips || 0;
                const profit = chips - buyIn;
                const profitClass = profit > 0 ? 'profit-pos' : (profit < 0 ? 'profit-neg' : 'profit-zero');
                const profitText = profit > 0 ? `+${profit}` : `${profit}`;
                const status = p.eliminated ? 'Выбыл' : (!p.connected ? 'Отключён' : (p.seated === false ? 'Наблюдатель' : 'За столом'));
                const avatarHtml = p.avatar
                    ? `<img class="player-stat-avatar" src="${p.avatar}" alt="">`
                    : `<div class="player-stat-avatar player-stat-avatar-fallback" style="background:${p.color || '#e74c3c'};">${(p.name || '?').charAt(0).toUpperCase()}</div>`;
                const stackLabel = data.closed ? 'Финал. стек' : 'Стек';
                return `
                    <div class="player-stat-row">
                        ${avatarHtml}
                        <div class="player-stat-main">
                            <div class="player-stat-name">${escapeHtml(p.name)}</div>
                            <div class="player-stat-status">${status}</div>
                        </div>
                        <div class="player-stat-nums">
                            <div class="player-stat-line"><span>Закуп</span><b>${buyIn}</b></div>
                            <div class="player-stat-line"><span>Докупок</span><b>${p.rebuys || 0}</b></div>
                            <div class="player-stat-line"><span>${stackLabel}</span><b>${chips}</b></div>
                            <div class="player-stat-line"><span>Профит</span><b class="${profitClass}">${profitText}</b></div>
                        </div>
                    </div>`;
            }).join('');
        ledgerModalList.innerHTML = rows;
        ledgerModalOverlay.style.display = 'flex';
    });

    ledgerModalClose.addEventListener('click', () => { ledgerModalOverlay.style.display = 'none'; });
    ledgerModalOverlay.addEventListener('click', (e) => {
        if (e.target === ledgerModalOverlay) ledgerModalOverlay.style.display = 'none';
    });

    if (selectedMode === 'holdem-cash') requestClosedRoomsList();

    function renderRoomsList() {
        const rooms = selectedMode ? latestRooms.filter(r => (r.mode || 'race') === selectedMode) : latestRooms;

        if (!rooms.length) {
            roomsList.innerHTML = '<p class="no-rooms">Нет доступных столов. Создайте первый!</p>';
            return;
        }

        const isHoldem = selectedMode === 'holdem-cash' || selectedMode === 'holdem-tourney';
        roomsList.innerHTML = '';
        rooms.forEach(room => {
            const item = document.createElement('div');
            item.className = 'room-item';
            const stakeLabel = isHoldem ? `ББ ${room.ante}` : `анте ${room.ante}`;
            const progressLabel = room.inProgress ? ' · игра идёт, можно подсесть' : '';
            const ledgerBtn = room.mode === 'holdem-cash'
                ? `<button class="btn-small view-ledger-btn" data-room="${escapeHtml(room.id)}">Итоги</button>`
                : '';
            item.innerHTML = `
                <span>${escapeHtml(room.name || `Стол ${room.id}`)} — ${room.players}/${room.maxPlayers} игроков, ${stakeLabel}, стек ${room.startingStack}${progressLabel}</span>
                <div class="room-item-actions">
                    ${ledgerBtn}
                    <button class="btn-gold join-room-btn" data-room="${room.id}">Войти</button>
                </div>
            `;
            roomsList.appendChild(item);
        });

        roomsList.querySelectorAll('.join-room-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const roomId = btn.getAttribute('data-room');
                window.location.href = `game.html?room=${roomId}`;
            });
        });
        roomsList.querySelectorAll('.view-ledger-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                socket.emit('getRoomLedger', { roomId: btn.getAttribute('data-room') });
            });
        });
    }
});