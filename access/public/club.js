// Страница клуба -- только скачивание (решение оператора 20.10.2026: «они
// зашли, кнопку скачали, скачали программу, и всё, и в самой программе
// вводят логин и пароль»).
//
// Входа на сайте нет: клубы путались бы, куда вводить логин -- сюда или в
// программу. Логин вводится ТОЛЬКО в программе, в окне, которое
// появляется при «Создать турнир». Здесь лишь узнаём, какая сборка
// выложена, и отдаём её.
const $ = (id) => document.getElementById(id);

fetch("/api/release").then((r) => r.json()).then((release) => {
  const button = $("downloadBtn");
  const hint = $("releaseHint");
  if (release.available) {
    hint.textContent = `Версия ${release.version || "—"}`
      + (release.size ? `, ${release.size}` : "") + ". Windows 10/11, 64 бита.";
    button.addEventListener("click", () => { window.location.href = "/api/download"; });
  } else {
    button.disabled = true;
    hint.textContent = "Сборка ещё выкладывается — зайдите чуть позже.";
  }
}).catch(() => {
  $("releaseHint").textContent = "Не удалось проверить сборку, обновите страницу.";
});
