// Автопроверка через настоящий интерфейс (?test=1): решатель даёт шаги, а здесь они выполняются
// нажатиями на кнопки, как это сделал бы игрок. window.__autoplay('c01') → отчёт.
import { solve } from './solver.js';
import { PEOPLE, person } from './data/people.js';
import { CASES } from './data/cases.js';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const $ = (s, root = document) => root.querySelector(s);
const $$ = (s, root = document) => [...root.querySelectorAll(s)];
const errors = [];
window.addEventListener('error', (e) => errors.push(e.message + ' @' + (e.filename || '').split('/').pop() + ':' + e.lineno));
window.addEventListener('unhandledrejection', (e) => errors.push('promise: ' + (e.reason?.stack || e.reason)));

async function until(fn, what, ms = 10000) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) { const v = fn(); if (v) return v; await sleep(40); }
  throw new Error('не дождался: ' + what);
}
const byText = (sel, text, root) => $$(sel, root).find((e) => e.textContent.trim() === text);
const byIncl = (sel, text, root) => $$(sel, root).find((e) => e.textContent.includes(text));

// дождаться тишины: нет субтитров и нет окна улики (окна улики закрываем)
async function settle() {
  let quiet = 0;
  for (let i = 0; i < 400 && quiet < 4; i++) {
    const ev = $('.ev-modal .btn.primary');
    if (ev) { ev.click(); quiet = 0; await sleep(120); continue; }
    const talking = $('#subs.show');
    quiet = talking ? 0 : quiet + 1;
    await sleep(60);
  }
}

async function toHub() {
  for (let i = 0; i < 6 && !$('.hub'); i++) {
    if ($('.modal')) { $('.modal-x')?.click(); await sleep(300); continue; }
    const b = $('.topbar .back'); if (!b) break;
    b.click(); await sleep(250);
  }
  await until(() => $('.hub'), 'штаб');
}

async function act(label) {
  await toHub();
  const b = byIncl('.hub-actions .act', label);
  if (!b) throw new Error('нет кнопки ' + label);
  b.click(); await sleep(250);
}

async function pickEv(C, ids) {
  const box = await until(() => $('.modal .ev-grid'), 'выбор улики');
  for (const id of ids) {
    const card = byIncl('.ev-card', C.ev[id].name, box);
    if (!card) throw new Error('нет улики в списке: ' + id);
    card.click(); await sleep(120);
  }
  if (ids.length > 1) { (await until(() => byIncl('.modal .btn.primary', 'Готово'), 'Готово')).click(); }
  await sleep(200);
}

let curPlace = null;
async function doStep(C, s) {
  switch (s.t) {
    case 'visit': {
      await toHub();
      const card = byIncl('.place-card', C.places[s.place].name);
      if (!card) throw new Error('нет места ' + s.place);
      card.click(); await until(() => $('.scene'), 'сцена'); curPlace = s.place; await settle(); return;
    }
    case 'search': {
      if (!$('.scene') || curPlace !== s.place) await doStep(C, { t: 'visit', place: s.place });
      const r = await window.__sceneTap(s.x, s.y);
      if (!r || r.miss) throw new Error(`промах по точке ${s.place} ${s.x.toFixed(3)},${s.y.toFixed(3)}`);
      await settle(); return;
    }
    case 'ask': {
      if (!$('.talk') || !$('.talk .top-title')?.textContent.includes(person(s.pid).name)) {
        await toHub();
        const card = byIncl('.person-card', person(s.pid).name);
        if (!card) throw new Error('нет человека ' + s.pid);
        card.click(); await until(() => $('.talk'), 'допрос');
      }
      if ($('.claim-panel')) { byIncl('.claim-panel .btn', 'потом').click(); await sleep(100); }
      const t = C.people[s.pid].topics.find((x) => x.id === s.topic);
      const b = await until(() => byIncl('.topic', t.q), 'вопрос ' + t.q);
      b.click(); await sleep(100); await settle(); return;
    }
    case 'judge': {
      const panel = await until(() => $('.claim-panel'), 'показание');
      if (MODE.mistakes) {
        // сначала неверный ответ — должен быть штраф, а показание остаться неразобранным
        const wrong = s.v === 'true' ? 'Сомневаюсь' : 'Верю';
        byText('.claim-panel .btn', wrong).click();
        await sleep(100); await settle();
        await until(() => $('.claim-panel'), 'показание после промаха');
      }
      const label = { true: 'Верю', doubt: 'Сомневаюсь', lie: 'Ложь!' }[s.v];
      byText('.claim-panel .btn', label).click();
      if (s.v === 'lie') await pickEv(C, [s.ev]);
      await sleep(100); await settle(); return;
    }
    case 'lab': {
      await act('Лаборатория');
      await until(() => $('.lab .ev-grid'), 'лаборатория');
      byIncl('.lab .ev-card', C.ev[s.ev].name).click();
      await sleep(100); await settle(); return;
    }
    case 'exp': {
      await act('Эксперименты');
      const x = C.exp.find((e) => e.id === s.exp);
      (await until(() => byIncl('.exp-card', x.name), 'эксперимент')).click();
      await until(() => $('.exp-area'), 'поле эксперимента');
      if (MODE.mistakes && x.type !== 'choice') {
        const w = $$('.exp-area [data-right="0"]').find((e) => e.offsetParent !== null && !e.classList.contains('hidden'));
        if (w) { w.click(); await sleep(200); await settle(); }
      }
      for (let i = 0; i < 20 && !$('.exp-done'); i++) {
        const right = $$('[data-right="1"]').find((e) => !e.closest('.right'));
        if (!right) break;
        right.click(); await sleep(250);
      }
      for (let i = 0; i < 100 && !$('.exp-done'); i++) { await settle(); await sleep(50); }
      if (!$('.exp-done')) throw new Error('не дождался: эксперимент пройден');
      await settle(); return;
    }
    case 'board': {
      await act('Доска');
      const q = C.board.find((x) => x.id === s.q);
      const card = await until(() => $$('.pin-card.open').find((c) => $('.pin-q', c).textContent === q.q), 'вопрос доски');
      let card2 = null;
      if (MODE.mistakes) {
        $('button', card).click();
        const wrong = q.opts.findIndex((o, i) => i !== s.opt);
        (await until(() => $$('.modal .opt')[wrong], 'варианты')).click();
        await sleep(200);
        if (q.proof) await pickEv(C, [run().evidence()[0].id]);
        await sleep(100); await settle();
        await act('Доска');
        card2 = await until(() => $$('.pin-card.open').find((c) => $('.pin-q', c).textContent === q.q), 'вопрос доски снова');
      }
      $('button', card2 || card).click();
      (await until(() => $$('.modal .opt')[s.opt], 'варианты')).click();
      await sleep(200);
      if (q.proof) await pickEv(C, [s.proof]);
      await sleep(100); await settle(); return;
    }
    case 'accuse': {
      await toHub();
      $('.act.accuse').click();
      const A = C.accuse;
      const who = MODE.wrongAccuse ? A.suspects.map((x) => (typeof x === 'string' ? x : x.id)).find((x) => x !== s.who) : s.who;
      const sus = A.suspects.map((x) => (typeof x === 'string' ? { id: x, name: person(x).name } : x)).find((x) => x.id === who);
      (await until(() => byIncl('.suspect', sus.name), 'подозреваемый')).click();
      await sleep(250);
      (await until(() => $$('.modal .opt')[s.what], 'версия')).click();
      await sleep(250);
      await pickEv(C, s.proofs);
      (await until(() => $('.modal .btn.danger.big'), 'обвинить')).click();
      await until(() => $('.ending'), 'концовка');
      await settle();
      (await until(() => $('.ending .btn.primary:not(.hidden)'), 'итоги')).click();
      await until(() => $('.results-box'), 'итоги');
      return;
    }
  }
}

let MODE = {};
const run = () => window.__game.run();
window.__autoplay = async (caseId, mode = {}) => {
  MODE = mode;
  const C = CASES.find((c) => c.id === caseId);
  // memo — подставить решения прошлых дел; choice — какой вариант выбрать в выборах
  // без mode.memo — настоящий профиль (проверка, что решения прошлых дел действительно доходят)
  const st = window.__game.load();
  if (mode.memo) {
    st.memo = { __test: mode.memo.filter((a) => !a.startsWith('g:vk')) };
    st.secrets = mode.memo.filter((a) => a.startsWith('g:vk')).map((a) => 'f:' + a.slice(2));
  }
  const memo = Object.values(st.memo).flat().concat(st.secrets.map((a) => 'g:' + a.slice(2)));
  window.__choiceOverride = mode.choice || {};
  const plan = solve(C, PEOPLE, mode.choice || {}, memo);
  const log = [];
  try {
    window.__game.openCase(C);
    await sleep(300);
    if ($('.modal')) { byIncl('.modal .btn', 'заново').click(); await sleep(300); }
    (await until(() => $('.brief .skip'), 'вводная')).click();
    await until(() => $('.hub'), 'штаб');
    if (MODE.hints) {
      await act('Отдел помощи');
      for (let i = 0; i < 3; i++) { (await until(() => $('.help-body .btn.primary'), 'кнопка подсказки')).click(); await sleep(150); await settle(); }
      if ($$('.help-hint').length !== 3) throw new Error('подсказки: куплено ' + $$('.help-hint').length + ' из 3');
    }
    for (const s of plan.steps) {
      const { apply, ...st } = s;
      log.push(JSON.stringify(st));
      await doStep(C, st);
    }
    const res = $('.results-box')?.innerText || '';
    return { ok: true, steps: plan.steps.length, expect: plan.score, results: res, errors, voiceMissing: window.__voiceMissing,
      carried: [...(window.__game.run()?.carried || [])], memo: window.__game.load().memo, secrets: window.__game.load().secrets };
  } catch (e) {
    return { ok: false, error: e.message, at: log.slice(-3), errors, screen: document.querySelector('#app').innerText.slice(0, 400) };
  }
};
