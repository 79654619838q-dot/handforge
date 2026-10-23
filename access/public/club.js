// Страница клуба -- только скачивание (решение оператора 20.10.2026: «они
// зашли, кнопку скачали, скачали программу, и всё, и в самой программе
// вводят логин и пароль»).
//
// Входа на сайте нет: клубы путались бы, куда вводить логин -- сюда или в
// программу. Логин вводится ТОЛЬКО в программе, в окне, которое
// появляется при «Создать турнир». Здесь лишь узнаём, какая сборка
// выложена, и отдаём её.
const $ = (id) => document.getElementById(id);

// Номер этого браузера -- чтобы оператор видел не только заходы, но и
// сколько разных людей зашло и скачало (оператор 23.10.2026). Случайный,
// ничего о человеке не говорит. Браузер, в котором оператор входил в учёт
// клубов, помечен (см. admin.js) -- его заходы в счёт не идут.
function visitorId() {
  try {
    let id = localStorage.getItem("hfVisitor");
    if (!id) {
      id = crypto.randomUUID();
      localStorage.setItem("hfVisitor", id);
    }
    return id;
  } catch {
    return "";
  }
}

function isOperator() {
  try { return localStorage.getItem("hfOperator") === "1"; } catch { return false; }
}

const visitor = isOperator() ? "" : visitorId();
if (visitor) {
  fetch("/api/visit", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ visitor }),
  }).catch(() => {});
}

fetch("/api/release").then((r) => r.json()).then((release) => {
  const button = $("downloadBtn");
  const hint = $("releaseHint");
  if (release.available) {
    hint.textContent = `Версия ${release.version || "—"}`
      + (release.size ? `, ${release.size}` : "") + ". Windows 10/11, 64 бита.";
    button.addEventListener("click", () => {
      window.location.href = isOperator() ? "/api/download?op=1"
        : `/api/download?v=${encodeURIComponent(visitor)}`;
    });
  } else {
    button.disabled = true;
    hint.textContent = "Сборка ещё выкладывается — зайдите чуть позже.";
  }
}).catch(() => {
  $("releaseHint").textContent = "Не удалось проверить сборку, обновите страницу.";
});
