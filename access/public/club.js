// Кабинет клуба: вход, срок, скачивание. Токен держим в sessionStorage --
// закрыл вкладку, вход кончился; на чужом компьютере не останется.
const $ = (id) => document.getElementById(id);
const api = async (url, options = {}) => {
  const token = sessionStorage.getItem("clubToken");
  const response = await fetch(url, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers || {}),
    },
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "Не получилось");
  return data;
};

function showScreen(name) {
  $("loginScreen").classList.toggle("hidden", name !== "login");
  $("clubScreen").classList.toggle("hidden", name !== "club");
}

// Дату показываем по часам того, кто смотрит -- ровно как её покажет сама
// программа на компьютере клуба (сервер живёт по Гринвичу, и без этого
// числа расходились на сутки).
function localDate(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  return `${String(d.getDate()).padStart(2, "0")}.${String(d.getMonth() + 1).padStart(2, "0")}.${d.getFullYear()}`;
}

function daysWord(days) {
  const n = Math.abs(days) % 100;
  const last = n % 10;
  if (n > 10 && n < 20) return "дней";
  if (last === 1) return "день";
  if (last >= 2 && last <= 4) return "дня";
  return "дней";
}

function render(data) {
  const { club, access, release } = data;
  $("clubName").textContent = `Клуб «${club.name}» · логин ${club.login}`;

  if (access.reason === "active") {
    const pill = club.daysLeft <= 5 ? "warn" : "ok";
    $("clubAccess").innerHTML =
      `Доступ до ${localDate(club.expiresAt)} <span class="pill ${pill}">осталось ${club.daysLeft} ${daysWord(club.daysLeft)}</span>`;
    $("clubMeta").innerHTML = `Срок: <b style="color:var(--ink)">${club.planTitle}</b>`;
    $("downloadBox").classList.remove("hidden");
    $("deniedBox").classList.add("hidden");
    $("downloadBtn").disabled = !release;
    $("releaseHint").textContent = release
      ? `Версия ${release.version || "—"}${release.size ? `, ${release.size}` : ""}. Windows 10/11, 64 бита.`
      : "Сборка ещё выкладывается — зайдите чуть позже.";
  } else {
    $("clubAccess").innerHTML = `<span class="pill bad">${access.reason === "blocked" ? "доступ закрыт" : "срок закончился"}</span>`;
    $("clubMeta").textContent = "";
    $("downloadBox").classList.add("hidden");
    $("deniedBox").classList.remove("hidden");
    $("deniedText").textContent = access.text;
  }
  showScreen("club");
}

$("loginForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  $("loginError").textContent = "";
  $("loginBtn").disabled = true;
  try {
    const data = await api("/api/login", {
      method: "POST",
      body: JSON.stringify({ login: $("login").value.trim(), password: $("password").value }),
    });
    sessionStorage.setItem("clubToken", data.token);
    render({ club: data.club, access: data.access, release: null });
    render(await api("/api/me"));
  } catch (error) {
    $("loginError").textContent = error.message;
  } finally {
    $("loginBtn").disabled = false;
  }
});

$("downloadBtn").addEventListener("click", () => {
  const token = sessionStorage.getItem("clubToken");
  if (!token) return;
  // Скачивание идёт с токеном в заголовке, поэтому не простой ссылкой:
  // запрашиваем адрес и отдаём его браузеру.
  fetch("/api/download", { headers: { Authorization: `Bearer ${token}` }, redirect: "follow" })
    .then((response) => {
      if (!response.ok) return response.json().then((data) => { throw new Error(data.error); });
      window.location.href = response.url;
    })
    .catch((error) => { $("releaseHint").textContent = error.message; });
});

$("logoutBtn").addEventListener("click", () => {
  sessionStorage.removeItem("clubToken");
  showScreen("login");
});

// Кнопка «Скачать» на первой странице работает БЕЗ входа: клуб обязан
// иметь возможность проверить свои камеры до покупки (решение оператора
// 20.10.2026). Логин нужен в самой программе -- для турниров.
fetch("/api/release").then((r) => r.json()).then((release) => {
  const button = $("publicDownloadBtn");
  const hint = $("publicReleaseHint");
  if (release.available) {
    hint.textContent = `Версия ${release.version || "—"}`
      + (release.size ? `, ${release.size}` : "") + ". Windows 10/11, 64 бита.";
    button.addEventListener("click", () => { window.location.href = "/api/download"; });
  } else {
    button.disabled = true;
    hint.textContent = "Сборка ещё выкладывается — зайдите чуть позже.";
  }
}).catch(() => {
  $("publicReleaseHint").textContent = "Не удалось проверить сборку, обновите страницу.";
});

// Вернулись на страницу с живым входом -- показываем кабинет сразу.
if (sessionStorage.getItem("clubToken")) {
  api("/api/me").then(render).catch(() => {
    sessionStorage.removeItem("clubToken");
    showScreen("login");
  });
}
