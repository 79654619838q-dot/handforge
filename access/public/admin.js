// Мини-программа учёта: завести клуб, выдать логин и пароль, продлить,
// закрыть доступ. Работает и с телефона -- таблица прокручивается вбок.
const $ = (id) => document.getElementById(id);
let plan = "month";
let clubs = [];

const api = async (url, options = {}) => {
  const token = sessionStorage.getItem("adminToken");
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

function daysWord(days) {
  const n = Math.abs(days) % 100;
  const last = n % 10;
  if (n > 10 && n < 20) return "дней";
  if (last === 1) return "день";
  if (last >= 2 && last <= 4) return "дня";
  return "дней";
}

function statePill(club) {
  if (club.blocked) return '<span class="pill bad">закрыт</span>';
  if (club.state === "expired") return '<span class="pill bad">истёк</span>';
  const pill = club.daysLeft <= 5 ? "warn" : "ok";
  return `<span class="pill ${pill}">${club.daysLeft} ${daysWord(club.daysLeft)}</span>`;
}

function whenText(iso) {
  if (!iso) return "не заходил";
  const d = new Date(iso);
  return `${String(d.getDate()).padStart(2, "0")}.${String(d.getMonth() + 1).padStart(2, "0")} в `
    + `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

function renderClubs() {
  const needle = $("search").value.trim().toLowerCase();
  const shown = clubs.filter((club) => !needle
    || club.name.toLowerCase().includes(needle) || club.login.includes(needle));
  $("clubsCount").textContent = `— ${clubs.length}`;
  $("clubsBody").innerHTML = shown.map((club) => `
    <tr class="${club.state === "active" ? "" : "dim"}">
      <td><b>${club.name}</b>${club.contact ? `<div class="hint" style="margin:2px 0 0">${club.contact}</div>` : ""}</td>
      <td><code>${club.login}</code></td>
      <td>${club.planTitle}</td>
      <td>${club.expiresAtText} ${statePill(club)}</td>
      <td>${whenText(club.lastLoginAt)}<div class="hint" style="margin:2px 0 0">скачано ${club.downloadCount}</div></td>
      <td style="white-space:nowrap">
        <button class="btn ghost small" data-act="extend" data-id="${club.id}">Продлить</button>
        <button class="btn ghost small" data-act="password" data-id="${club.id}">Пароль</button>
        <button class="btn ghost small" data-act="block" data-id="${club.id}">${club.blocked ? "Открыть" : "Закрыть"}</button>
      </td>
    </tr>`).join("") || `<tr><td colspan="6" class="hint">Пока ни одного клуба</td></tr>`;
}

async function loadClubs() {
  const data = await api("/api/admin/clubs");
  clubs = data.clubs;
  renderClubs();
}

function showMessage(message) {
  $("resultEmpty").classList.add("hidden");
  $("resultBox").classList.remove("hidden");
  $("copiedText").classList.add("hidden");
  $("resultMessage").textContent = message;
}

// --- вход оператора ---------------------------------------------------------
$("authForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  $("authError").textContent = "";
  try {
    const data = await api("/api/admin/login", {
      method: "POST",
      body: JSON.stringify({ password: $("adminPassword").value }),
    });
    sessionStorage.setItem("adminToken", data.token);
    $("authScreen").classList.add("hidden");
    $("workScreen").classList.remove("hidden");
    await loadClubs();
  } catch (error) {
    $("authError").textContent = error.message;
  }
});

// --- выбор срока --------------------------------------------------------------
$("terms").addEventListener("click", (event) => {
  const term = event.target.closest(".term");
  if (!term) return;
  plan = term.dataset.plan;
  for (const node of $("terms").children) node.classList.toggle("sel", node === term);
  $("customBox").classList.toggle("hidden", plan !== "custom");
});

// --- создание клуба -------------------------------------------------------------
$("createForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  $("createError").textContent = "";
  $("createBtn").disabled = true;
  try {
    const data = await api("/api/admin/clubs", {
      method: "POST",
      body: JSON.stringify({
        name: $("clubNameInput").value.trim(),
        contact: $("contactInput").value.trim(),
        plan,
        customDays: $("customDays").value,
      }),
    });
    showMessage(data.message);
    $("clubNameInput").value = "";
    $("contactInput").value = "";
    await loadClubs();
  } catch (error) {
    $("createError").textContent = error.message;
  } finally {
    $("createBtn").disabled = false;
  }
});

$("copyBtn").addEventListener("click", async () => {
  try {
    await navigator.clipboard.writeText($("resultMessage").textContent);
    $("copiedText").classList.remove("hidden");
  } catch {
    // Буфер закрыт настройками браузера -- выделяем текст, чтобы
    // оператор скопировал руками.
    const range = document.createRange();
    range.selectNodeContents($("resultMessage"));
    window.getSelection().removeAllRanges();
    window.getSelection().addRange(range);
  }
});

$("closeResultBtn").addEventListener("click", () => {
  $("resultBox").classList.add("hidden");
  $("resultEmpty").classList.remove("hidden");
});

// --- кнопки в строке клуба --------------------------------------------------------
$("clubsBody").addEventListener("click", async (event) => {
  const button = event.target.closest("button[data-act]");
  if (!button) return;
  const { act, id } = button.dataset;
  const club = clubs.find((c) => c.id === id);
  if (!club) return;
  button.disabled = true;
  try {
    if (act === "extend") {
      const answer = prompt(
        `На сколько продлить «${club.name}»?\n3 — три дня, 30 — месяц, 90 — три месяца, 365 — год\nили своё число дней:`,
        "30");
      if (answer === null) return;
      const days = Number(answer);
      if (!Number.isInteger(days) || days < 1) throw new Error("Нужно число дней");
      const byDays = { 3: "test3", 30: "month", 90: "months3", 365: "year" };
      await api(`/api/admin/clubs/${id}/extend`, {
        method: "POST",
        body: JSON.stringify({ plan: byDays[days] || "custom", customDays: days }),
      });
      await loadClubs();
      $("listHint").textContent = `«${club.name}» продлён`;
    } else if (act === "password") {
      if (!confirm(`Выдать новый пароль клубу «${club.name}»? Старый перестанет работать.`)) return;
      const data = await api(`/api/admin/clubs/${id}/password`, { method: "POST" });
      showMessage(data.message);
      window.scrollTo({ top: 0, behavior: "smooth" });
    } else if (act === "block") {
      await api(`/api/admin/clubs/${id}/block`, {
        method: "POST",
        body: JSON.stringify({ blocked: !club.blocked }),
      });
      await loadClubs();
    }
  } catch (error) {
    $("listHint").textContent = error.message;
  } finally {
    button.disabled = false;
  }
});

$("search").addEventListener("input", renderClubs);
$("refreshBtn").addEventListener("click", () => loadClubs().catch((e) => {
  $("listHint").textContent = e.message;
}));

if (sessionStorage.getItem("adminToken")) {
  loadClubs().then(() => {
    $("authScreen").classList.add("hidden");
    $("workScreen").classList.remove("hidden");
  }).catch(() => sessionStorage.removeItem("adminToken"));
}
