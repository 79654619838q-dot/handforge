// Сайт целиком: оператор заводит клуб, клуб входит, программа
// спрашивает срок, оператор закрывает и продлевает. База -- временный
// файл, сеть -- настоящая (поднимаем сервер на свободном порту).
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test, { after, before } from "node:test";

const dir = mkdtempSync(path.join(tmpdir(), "access-test-"));
process.env.DATABASE_URL = path.join(dir, "test.db");
process.env.ADMIN_PASSWORD = "operator-test";
process.env.JWT_SECRET = "test-secret";
process.env.RELEASE_URL = "https://example.com/handforge.zip";
process.env.RELEASE_VERSION = "18.10.2026";
process.env.NODE_ENV = "test";
process.env.LOGIN_LIMIT = "500";   // прогон делает десятки входов подряд

const { app, } = await import("../src/index.js");
const store = await import("../src/store.js");

let server;
let base;

before(async () => {
  await store.init();
  server = app.listen(0);
  await new Promise((resolve) => server.once("listening", resolve));
  base = `http://127.0.0.1:${server.address().port}`;
});

after(() => {
  server?.close();
  try { rmSync(dir, { recursive: true, force: true }); } catch { /* файл мог остаться занят */ }
});

const call = async (path, { body, token, method } = {}) => {
  const response = await fetch(base + path, {
    method: method || (body ? "POST" : "GET"),
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
    redirect: "manual",
  });
  const text = await response.text();
  let data = {};
  try { data = JSON.parse(text); } catch { /* перенаправление без тела */ }
  return { status: response.status, data, location: response.headers.get("location") };
};

const adminToken = async () => (await call("/api/admin/login", { body: { password: "operator-test" } })).data.token;

const newClub = async (fields = {}) => {
  const token = await adminToken();
  const { data } = await call("/api/admin/clubs", {
    token,
    body: { name: "Клуб «Империал», Москва", contact: "Сергей", plan: "test3", ...fields },
  });
  return { token, club: data.club, password: data.password, message: data.message };
};

// --- оператор -------------------------------------------------------------------

test("без пароля управления в учёт клубов не попасть", async () => {
  assert.equal((await call("/api/admin/clubs")).status, 401);
  assert.equal((await call("/api/admin/login", { body: { password: "не тот" } })).status, 401);
});

test("создание клуба выдаёт логин, пароль и готовое сообщение", async () => {
  const { club, password, message } = await newClub();

  assert.equal(club.login, "klub-imperial-moskva");
  assert.equal(club.daysLeft, 3);
  assert.equal(club.planTitle, "тест, 3 дня");
  assert.equal(password.length, 10);
  assert.match(message, new RegExp(password));
});

test("клуб без названия или без срока не создаётся", async () => {
  const token = await adminToken();
  assert.equal((await call("/api/admin/clubs", { token, body: { name: "", plan: "month" } })).status, 400);
  assert.equal((await call("/api/admin/clubs", { token, body: { name: "Клуб", plan: "вечно" } })).status, 400);
});

test("пароль в ответе один раз, в списке клубов его нет", async () => {
  const { token } = await newClub({ name: "Клуб «Фортуна», Пермь" });
  const { data } = await call("/api/admin/clubs", { token });
  const found = data.clubs.find((c) => c.login === "klub-fortuna-perm");

  assert.ok(found, "клуб в списке есть");
  assert.equal(found.passwordHash, undefined, "отпечаток пароля наружу не отдаём");
  assert.equal(found.password, undefined);
});

// --- клуб ---------------------------------------------------------------------

test("клуб входит своим паролем и видит срок", async () => {
  const { club, password } = await newClub({ name: "Клуб «Роял», Сочи" });
  const { status, data } = await call("/api/login", { body: { login: club.login, password } });

  assert.equal(status, 200);
  assert.equal(data.access.reason, "active");
  assert.equal(data.club.daysLeft, 3);

  const me = await call("/api/me", { token: data.token });
  assert.equal(me.data.club.login, club.login);
  assert.equal(me.data.release.version, "18.10.2026");
});

test("чужой пароль не пускает и запоминается в событиях", async () => {
  const { token, club } = await newClub({ name: "Клуб «Эльдорадо», Казань" });
  assert.equal((await call("/api/login", { body: { login: club.login, password: "НЕВЕРНЫЙ" } })).status, 401);

  const { data } = await call(`/api/admin/clubs/${club.id}/events`, { token });
  assert.ok(data.events.some((e) => e.kind === "denied"), "отказ записан");
});

test("скачивание -- только вошедшему клубу и считается", async () => {
  const { token: admin, club, password } = await newClub({ name: "Клуб «Волна», Тверь" });
  assert.equal((await call("/api/download")).status, 401, "без входа скачать нельзя");

  const { data } = await call("/api/login", { body: { login: club.login, password } });
  const download = await call("/api/download", { token: data.token });
  assert.equal(download.status, 302);
  assert.equal(download.location, "https://example.com/handforge.zip");

  const list = await call("/api/admin/clubs", { token: admin });
  assert.equal(list.data.clubs.find((c) => c.id === club.id).downloadCount, 1);
});

// --- программа ------------------------------------------------------------------

test("программа спрашивает срок и получает дату и запас без связи", async () => {
  const { club, password } = await newClub({ name: "Клуб «Старт», Уфа" });
  const { status, data } = await call("/api/program/check", { body: { login: club.login, password } });

  assert.equal(status, 200);
  assert.equal(data.ok, true);
  assert.equal(data.club, "Клуб «Старт», Уфа");
  assert.equal(data.daysLeft, 3);
  assert.ok(data.offlineGraceDays >= 1, "программа должна пережить падение интернета");
});

test("закрытый доступ программа получает отказом с понятной причиной", async () => {
  const { token, club, password } = await newClub({ name: "Клуб «Пик», Омск" });
  await call(`/api/admin/clubs/${club.id}/block`, { token, body: { blocked: true } });

  const { status, data } = await call("/api/program/check", { body: { login: club.login, password } });
  assert.equal(status, 403);
  assert.equal(data.reason, "blocked");
  assert.match(data.text, /Свяжитесь с нами/);
});

test("истёкший срок закрывает и сайт, и программу", async () => {
  const { token, club, password } = await newClub({ name: "Клуб «Тест», Орёл" });
  await store.updateClub(club.id, { expiresAt: new Date(Date.now() - 1000).toISOString() });

  const site = await call("/api/login", { body: { login: club.login, password } });
  const program = await call("/api/program/check", { body: { login: club.login, password } });

  assert.equal(site.data.access.reason, "expired");
  assert.equal(program.status, 403);
  assert.equal(program.data.reason, "expired");

  // и продление возвращает доступ, логин прежний
  const extended = await call(`/api/admin/clubs/${club.id}/extend`, { token, body: { plan: "month" } });
  assert.equal(extended.data.club.daysLeft, 30);
  assert.equal(extended.data.club.login, club.login);
  assert.equal((await call("/api/program/check", { body: { login: club.login, password } })).status, 200);
});

test("продление действующему клубу прибавляется к остатку", async () => {
  const { token, club } = await newClub({ name: "Клуб «Космос», Самара" });   // 3 дня
  const { data } = await call(`/api/admin/clubs/${club.id}/extend`, { token, body: { plan: "month" } });

  assert.equal(data.club.daysLeft, 33, "30 дней к трём оставшимся");
});

test("новый пароль отменяет старый", async () => {
  const { token, club, password } = await newClub({ name: "Клуб «Азарт», Тула" });
  const fresh = await call(`/api/admin/clubs/${club.id}/password`, { token, method: "POST" });

  assert.equal((await call("/api/login", { body: { login: club.login, password } })).status, 401);
  assert.equal((await call("/api/login",
    { body: { login: club.login, password: fresh.data.password } })).status, 200);
});

// --- тихая перепроверка по токену устройства -------------------------------------
//
// Пароль программа не хранит: при удачном входе сайт выдаёт токен, и
// дальше срок проверяется им -- молча, при каждом запуске.

test("успешная проверка выдаёт программе токен устройства", async () => {
  const { club, password } = await newClub({ name: "Клуб «Токен», Курск" });
  const { data } = await call("/api/program/check", { body: { login: club.login, password } });

  assert.ok(data.token, "токен выдан");

  const refreshed = await call("/api/program/refresh", { body: { token: data.token } });
  assert.equal(refreshed.status, 200);
  assert.equal(refreshed.data.ok, true);
  assert.equal(refreshed.data.club, "Клуб «Токен», Курск");
  assert.equal(refreshed.data.daysLeft, 3);
});

test("по токену видно, что доступ закрыли или срок вышел", async () => {
  const { token, club, password } = await newClub({ name: "Клуб «Срок», Брянск" });
  const { data } = await call("/api/program/check", { body: { login: club.login, password } });
  const device = data.token;

  await call(`/api/admin/clubs/${club.id}/block`, { token, body: { blocked: true } });
  const blocked = await call("/api/program/refresh", { body: { token: device } });
  assert.equal(blocked.status, 403);
  assert.equal(blocked.data.reason, "blocked");

  await call(`/api/admin/clubs/${club.id}/block`, { token, body: { blocked: false } });
  await store.updateClub(club.id, { expiresAt: new Date(Date.now() - 1000).toISOString() });
  const expired = await call("/api/program/refresh", { body: { token: device } });
  assert.equal(expired.status, 403);
  assert.equal(expired.data.reason, "expired");
});

test("чужой или поддельный токен не пускает", async () => {
  assert.equal((await call("/api/program/refresh", { body: { token: "подделка" } })).status, 401);
  assert.equal((await call("/api/program/refresh", { body: {} })).status, 401);
});
