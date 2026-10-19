// Правила доступа: сроки, логины, пароли. Проверяется то, от чего
// зависят деньги и доверие клуба -- дата окончания, остаток дней,
// состояние доступа и неповторимость логина.
import assert from "node:assert/strict";
import test from "node:test";

import {
  PLANS, accessState, clubMessage, daysLeft, expiryFrom, formatDate,
  makeLogin, makePassword, planDays, planTitle, slugify,
} from "../src/access.js";

const club = (fields = {}) => ({
  name: "Клуб «Империал»",
  login: "klub-imperial",
  blocked: false,
  startsAt: "2026-10-18T10:00:00.000Z",
  expiresAt: "2026-11-17T10:00:00.000Z",
  ...fields,
});

test("сроки -- ровно те, что называл оператор", () => {
  assert.equal(planDays("test3"), 3);
  assert.equal(planDays("month"), 30);
  assert.equal(planDays("months3"), 90);
  assert.equal(planDays("year"), 365);
  assert.deepEqual(Object.keys(PLANS),
    ["test3", "month", "months3", "year", "custom"]);
});

test("свой срок -- любое число дней, но не мусор", () => {
  assert.equal(planDays("custom", 45), 45);
  assert.equal(planDays("custom", 0), null);
  assert.equal(planDays("custom", -5), null);
  assert.equal(planDays("custom", 99999), null);
  assert.equal(planDays("custom", "сорок"), null);
  assert.equal(planDays("неизвестный"), null);
  assert.equal(planTitle("custom", 45), "свой срок, 45 дн.");
});

test("дата окончания считается от выдачи, а не от начала суток", () => {
  const expires = expiryFrom("2026-10-18T22:30:00.000Z", 3);
  assert.equal(expires, "2026-10-21T22:30:00.000Z",
    "клуб получает полные трое суток, а не двое с хвостом");
  // Показываем дату по часам того, кто смотрит (в Москве 22:30 UTC -- это
  // уже следующий день), поэтому ожидание считаем так же, а не словом.
  const local = new Date(expires);
  assert.equal(formatDate(expires),
    `${String(local.getDate()).padStart(2, "0")}.${String(local.getMonth() + 1).padStart(2, "0")}.2026`);
});

test("остаток дней округляется вверх -- последний день ещё рабочий", () => {
  const now = new Date("2026-10-18T10:00:00.000Z");
  assert.equal(daysLeft("2026-10-21T10:00:00.000Z", now), 3);
  assert.equal(daysLeft("2026-10-18T23:00:00.000Z", now), 1,
    "сегодня вечером срок ещё идёт -- это 1 день, а не 0");
  assert.equal(daysLeft("2026-10-17T10:00:00.000Z", now), -1);
});

test("состояние доступа: открыт, закрыт, истёк, неизвестный", () => {
  const now = new Date("2026-10-18T10:00:00.000Z");
  assert.equal(accessState(club(), now).reason, "active");
  assert.equal(accessState(club({ blocked: true }), now).reason, "blocked");
  assert.equal(accessState(club({ expiresAt: "2026-10-17T10:00:00.000Z" }), now).reason, "expired");
  assert.equal(accessState(null, now).reason, "unknown");
});

test("в день окончания доступ уже закрыт ровно в час выдачи", () => {
  const expiresAt = "2026-10-21T10:00:00.000Z";
  assert.equal(accessState(club({ expiresAt }), new Date("2026-10-21T09:59:00.000Z")).reason, "active");
  assert.equal(accessState(club({ expiresAt }), new Date("2026-10-21T10:00:00.000Z")).reason, "expired");
});

test("истёкшему клубу говорим дату, а не просто «нельзя»", () => {
  const state = accessState(club({ expiresAt: "2026-10-02T10:00:00.000Z" }),
    new Date("2026-10-18T10:00:00.000Z"));
  assert.match(state.text, /02\.10\.2026/);
  assert.match(state.text, /продлить/);
});

// --- логин и пароль ------------------------------------------------------------

test("логин читается глазами и не повторяет слово «клуб» дважды", () => {
  assert.equal(makeLogin("Клуб «Империал», Москва"), "klub-imperial-moskva");
  assert.equal(makeLogin("Империал"), "klub-imperial");
  assert.equal(slugify("Клуб «Фортуна» — Пермь"), "klub-fortuna-permь".replace("ь", ""));
});

test("занятый логин получает хвост, а не отнимает чужой", () => {
  const taken = new Set(["klub-imperial"]);
  const second = makeLogin("Империал", taken);
  assert.notEqual(second, "klub-imperial");
  assert.match(second, /^klub-imperial-[a-z0-9]{2}$/);
});

test("название без латиницы и кириллицы логин не ломает", () => {
  assert.equal(makeLogin("!!! ???"), "klub-nameless");
});

test("в пароле нет похожих друг на друга знаков", () => {
  for (let i = 0; i < 200; i += 1) {
    const password = makePassword();
    assert.equal(password.length, 10);
    assert.doesNotMatch(password, /[OIl01]/, `в пароле ${password} есть спорный знак`);
  }
});

test("два пароля подряд не совпадают", () => {
  const seen = new Set();
  for (let i = 0; i < 100; i += 1) seen.add(makePassword());
  assert.equal(seen.size, 100);
});

test("сообщение клубу содержит всё, что нужно для начала работы", () => {
  const message = clubMessage({
    name: "Империал", login: "klub-imperial", password: "ABCDEFGHJK",
    expiresAt: "2026-11-17T10:00:00.000Z", siteUrl: "https://access.example",
  });
  assert.match(message, /klub-imperial/);
  assert.match(message, /ABCDEFGHJK/);
  assert.match(message, /17\.11\.2026/);
  assert.match(message, /https:\/\/access\.example/);
  assert.match(message, /создать турнир/, "клуб должен понять, зачем ему логин");
  assert.match(message, /без них/, "и что остальное работает без логина");
});
