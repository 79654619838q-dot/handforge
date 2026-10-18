// Запуск для местной проверки: база -- файл рядом с приложением, пароль
// управления и ссылка на сборку подставные. На рабочем сайте всё это
// приходит из настроек сервиса, и этот файл не участвует.
process.env.ADMIN_PASSWORD ||= "test-admin";
process.env.RELEASE_VERSION ||= "18.10.2026";
process.env.RELEASE_SIZE ||= "1,4 ГБ";
process.env.RELEASE_URL ||= "https://example.com/handforge-manager.zip";
process.env.SITE_URL ||= "http://localhost:8890";

await import("./index.js");
