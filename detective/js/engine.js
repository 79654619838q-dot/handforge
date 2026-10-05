// Логика одного дела без интерфейса: что найдено, что известно, что открыто, сколько очков.
// Работает и в браузере, и в node (проверка решаемости — tools/validate.mjs).
//
// Всё, что игрок узнал, — «атомы» в одном множестве:
//   ev:<id>        улика найдена              f:<id>   факт установлен
//   q:<чел>.<тема> вопрос задан               c:<id>   показание разобрано верно
//   l:<id>         экспертиза сделана         x:<id>   эксперимент пройден
//   b:<id>         вопрос доски решён         s:<место>.<точка>  точка на месте осмотрена
//   v:<место>      место посещено             end      дело закрыто
//   g:<id>         решение, которое помнят следующие дела (сохраняется в профиле, см. carry)
// Условия в данных: строка-атом, массив (всё сразу), {any:[…]} (хоть одно), {not: …}.

import { LINES, asPartner } from './data/common.js';

export const PTS = {
  ev: 20, evHidden: 30,
  claim: { true: 20, hides: 40, lie: 50 },
  exp: 40, board: 40,
  wrongJudge: 15, wrongShow: 20, wrongExp: 10, wrongBoard: 20,
  end: { true: 300, partial: 120, wrong: 0 },
  hint: [30, 60, 100],
};

// Если у персонажа нет своих слов на промах — общие (по полу).
export const REBUFF = {
  m: { trueDoubted: 'Я говорю правду. Мне скрывать нечего.', lieDoubted: 'Я всё сказал. Есть доказательства — показывайте.', wrongShow: 'И что это доказывает?', fooled: 'Вот и договорились.' },
  f: { trueDoubted: 'Я говорю правду. Мне скрывать нечего.', lieDoubted: 'Я всё сказала. Есть доказательства — показывайте.', wrongShow: 'И что это доказывает?', fooled: 'Вот и договорились.' },
};

// carry — сценарии того, что дело может унаследовать от прошлых дел: [[], ['g:hairind'], …].
// Дело читает только перечисленные там атомы; проверка решаемости идёт по каждому сценарию.
export function carryAtoms(def) { return new Set((def.carry || []).flat()); }

export class CaseRun {
  // memo — атомы g:… из профиля игрока (решения в прошлых делах)
  constructor(def, people, saved, memo = []) {
    this.d = def;
    this.people = people;
    const ca = carryAtoms(def);
    this.carried = new Set(memo.filter((a) => ca.has(a)));
    this.atoms = new Set(saved?.atoms || []);
    this.evOrder = saved?.evOrder || [];
    this.gain = saved?.gain || 0;       // заработано
    this.loss = saved?.loss || 0;       // штрафы за промахи
    this.hintCost = saved?.hintCost || 0;
    this.hintsBought = saved?.hintsBought || {}; // номер шага → сколько уровней куплено
    this.mistakes = saved?.mistakes || 0;
    this.ending = saved?.ending || null;
    this.endTitle = saved?.endTitle || null;
    this.claims = {};
    for (const [pid, p] of Object.entries(def.people || {})) {
      for (const t of p.topics || []) if (t.claim) this.claims[t.claim.id] = { ...t.claim, pid, topic: t.id };
    }
  }

  save() {
    return { atoms: [...this.atoms], evOrder: this.evOrder, gain: this.gain, loss: this.loss, hintCost: this.hintCost,
      hintsBought: this.hintsBought, mistakes: this.mistakes, ending: this.ending, endTitle: this.endTitle };
  }

  has(a) { return a === 'start' || this.atoms.has(a) || this.carried.has(a); }

  test(c) {
    if (c == null || c === true) return true;
    if (typeof c === 'string') return this.has(c);
    if (Array.isArray(c)) return c.every((x) => this.test(x));
    if (c.any) return c.any.some((x) => this.test(x));
    if (c.not) return !this.test(c.not);
    throw new Error('непонятное условие ' + JSON.stringify(c));
  }

  // добавить атомы; вернуть реплики-реакции (on) и список нового
  add(list, out) {
    for (const a of list || []) {
      if (this.atoms.has(a)) continue;
      this.atoms.add(a);
      out.gained.push(a);
      if (a.startsWith('ev:')) {
        const id = a.slice(3);
        if (!this.d.ev[id]) throw new Error('нет улики ' + id);
        this.evOrder.push(id);
        const pts = this.d.ev[id].hidden ? PTS.evHidden : PTS.ev;
        this.gain += pts; out.score += pts;
      }
      const on = this.d.on?.[a];
      if (on) out.lines.push(...on);
    }
    return out;
  }

  outcome() { return { lines: [], gained: [], score: 0, ok: true }; }

  // ——— что открыто ———
  placeOpen(id) { const p = this.d.places[id]; return !!p && this.test(p.need); }
  places() { return Object.keys(this.d.places).filter((id) => this.placeOpen(id)); }
  spots(placeId) { return (this.d.places[placeId].spots || []).filter((s) => this.test(s.need)); }
  spotsLeft(placeId) { return this.spots(placeId).filter((s) => (s.ev || s.gives) && !this.has(`s:${placeId}.${s.id}`)).length; }
  spotsTotal(placeId) { return this.spots(placeId).filter((s) => s.ev || s.gives).length; }
  personAvail(pid) { const p = this.d.people[pid]; return !!p && this.test(p.need); }
  persons() { return Object.keys(this.d.people || {}).filter((id) => this.personAvail(id)); }
  topics(pid) { return (this.d.people[pid].topics || []).filter((t) => this.test(t.need)); }
  pendingClaims(pid) { return Object.values(this.claims).filter((c) => (!pid || c.pid === pid) && this.has(`q:${c.pid}.${c.topic}`) && !this.has('c:' + c.id)); }
  labs() { return (this.d.lab || []).filter((l) => this.has('ev:' + l.ev) && this.test(l.need)); }
  exps() { return (this.d.exp || []).filter((x) => this.test(x.need)); }
  boardQs() { return (this.d.board || []).filter((q) => this.test(q.need)); }
  canAccuse() { return !this.ending && this.test(this.d.accuse.need); }
  evidence() { return this.evOrder.map((id) => ({ id, ...this.d.ev[id] })); }

  goal() {
    for (const g of this.d.goals || []) if (!this.test(g.until)) return g.text;
    return this.canAccuse() ? 'Обвинить виновного' : '';
  }

  // ——— действия ———
  visit(placeId) {
    const out = this.outcome();
    if (!this.placeOpen(placeId)) return { ...out, ok: false };
    const first = !this.has('v:' + placeId);
    this.add(['v:' + placeId], out);
    if (first && this.d.places[placeId].enter) out.lines.unshift(...this.d.places[placeId].enter);
    return out;
  }

  // x, y — доли картинки (0…1). Допуск — tol по каждой стороне.
  search(placeId, x, y, tol = 0.012) {
    const out = this.outcome();
    let best = null;
    for (const s of this.spots(placeId)) {
      const [sx, sy, sw, sh] = s.r;
      if (x >= sx - tol && x <= sx + sw + tol && y >= sy - tol && y <= sy + sh + tol) {
        const area = sw * sh;
        if (!best || area < best.area) best = { s, area };
      }
    }
    if (!best) return { ...out, ok: false, miss: true };
    const s = best.s;
    const key = `s:${placeId}.${s.id}`;
    out.spot = s;
    if (this.has(key)) return { ...out, already: true, lines: s.again || [] };
    this.add([key], out);
    out.lines.push(...(s.say || []));
    const gives = [...(s.ev ? ['ev:' + s.ev] : []), ...(s.gives || [])];
    this.add(gives, out);
    out.found = s.ev || null;
    return out;
  }

  ask(pid, tid) {
    const out = this.outcome();
    const t = this.topics(pid).find((x) => x.id === tid);
    if (!t) return { ...out, ok: false };
    const key = `q:${pid}.${tid}`;
    out.again = this.has(key);
    out.lines.push(...t.a);
    if (t.claim && !this.has('c:' + t.claim.id)) out.claim = this.claims[t.claim.id];
    this.add([key, ...(t.gives || [])], out);
    return out;
  }

  rebuff(pid, kind) {
    const p = this.people[pid] || {};
    const own = this.d.people[pid]?.rebuff?.[kind];
    return [pid, own || REBUFF[p.sex || 'm'][kind], 'tense'];
  }

  // verdict: 'true' (верю) | 'doubt' (сомневаюсь) | 'lie' (ложь — с уликой evId)
  judge(claimId, verdict, evId) {
    const out = this.outcome();
    const c = this.claims[claimId];
    if (!c || this.has('c:' + claimId)) return { ...out, ok: false };
    const right = (verdict === 'true' && c.truth === 'true') || (verdict === 'doubt' && c.truth === 'hides')
      || (verdict === 'lie' && c.truth === 'lie' && (c.proof || []).includes(evId));
    if (right) {
      const pts = PTS.claim[c.truth];
      this.gain += pts; out.score += pts;
      out.lines.push(...(c.ok || []));
      this.add(['c:' + claimId, ...(c.gives || [])], out);
      out.right = true;
      return out;
    }
    out.right = false;
    this.mistakes++;
    if (verdict === 'lie') {
      this.loss += PTS.wrongShow; out.score -= PTS.wrongShow;
      out.lines.push(c.wrongShow ? [c.pid, c.wrongShow, 'tense'] : this.rebuff(c.pid, 'wrongShow'));
    } else {
      this.loss += PTS.wrongJudge; out.score -= PTS.wrongJudge;
      if (c.truth === 'true') out.lines.push(this.rebuff(c.pid, 'trueDoubted'));
      else if (verdict === 'true') out.lines.push(this.rebuff(c.pid, 'fooled'));
      else out.lines.push(this.rebuff(c.pid, 'lieDoubted'));
    }
    return out;
  }

  lab(evId) {
    const out = this.outcome();
    const l = this.labs().find((x) => x.ev === evId);
    if (!l) { out.ok = false; out.lines.push(this.d.labBy === 'shtern' ? LINES.labNothingShtern : LINES.labNothing); return out; }
    out.lines.push(...l.say);
    out.again = this.has('l:' + l.id);
    this.add(['l:' + l.id, ...(l.gives || [])], out);
    return out;
  }

  // variant — для выбора (type 'choice'): какой вариант выбран, у каждого свои последствия
  expDone(expId, success, variant) {
    const out = this.outcome();
    const x = (this.d.exp || []).find((e) => e.id === expId);
    if (!x || !this.test(x.need)) return { ...out, ok: false };
    if (this.has('x:' + expId)) return { ...out, again: true, lines: x.say || [] };
    if (x.type === 'choice') {
      const o = x.data.opts[variant];
      if (!o) return { ...out, ok: false };
      this.gain += PTS.exp; out.score += PTS.exp;
      out.lines.push(...(o.say || []));
      this.add(['x:' + expId, ...(o.gives || [])], out);
      return out;
    }
    if (!success) { this.loss += PTS.wrongExp; out.score -= PTS.wrongExp; this.mistakes++; out.ok = false; out.lines.push(...(x.fail || [])); return out; }
    this.gain += PTS.exp; out.score += PTS.exp;
    out.lines.push(...(x.say || []));
    this.add(['x:' + expId, ...(x.gives || [])], out);
    return out;
  }

  answer(qid, opt, proofEv) {
    const out = this.outcome();
    const q = this.boardQs().find((x) => x.id === qid);
    if (!q || this.has('b:' + qid)) return { ...out, ok: false };
    const right = opt === q.ok && (!q.proof || q.proof.includes(proofEv));
    if (!right) {
      this.loss += PTS.wrongBoard; out.score -= PTS.wrongBoard; this.mistakes++; out.ok = false;
      out.lines.push(...(opt === q.ok ? (q.badProof || [asPartner(LINES.boardBadProof, this.d.partner)]) : (q.fail || [asPartner(LINES.boardFail, this.d.partner)])));
      return out;
    }
    this.gain += PTS.board; out.score += PTS.board;
    out.lines.push(...(q.say || []));
    this.add(['b:' + qid, ...(q.gives || [])], out);
    return out;
  }

  // who — id подозреваемого, what — номер версии, proofs — список улик
  accuse(who, what, proofs) {
    const out = this.outcome();
    const A = this.d.accuse;
    if (!this.canAccuse()) return { ...out, ok: false };
    const valid = new Set(A.proofs.valid);
    const good = [...new Set(proofs)].filter((p) => valid.has(p) && this.has('ev:' + p)).length;
    let kind;
    if (who === A.endings.true.who && what === A.endings.true.what && good >= A.proofs.n) kind = 'true';
    else if (who === A.endings.true.who) kind = 'partial';
    else kind = 'wrong';
    const end = A.endings[kind];
    const lines = kind === 'wrong' ? (A.endings.wrong.by?.[who] || A.endings.wrong.lines) : end.lines;
    out.lines.push(...lines);
    out.kind = kind;
    out.img = end.img;
    // дополнения концовки, зависящие от прошлых решений (extra: [{ need, lines, title, img }])
    for (const x of end.extra || []) if (this.test(x.need)) { out.lines.push(...x.lines); if (x.title) out.title = x.title; if (x.img) out.img = x.img; }
    this.gain += PTS.end[kind]; out.score += PTS.end[kind];
    this.ending = kind;
    this.endTitle = out.title || null;
    this.add(['end', ...(end.gives || [])], out);
    return out;
  }

  // ——— отдел помощи ———
  hintStep() {
    const hs = this.d.hints || [];
    for (let i = 0; i < hs.length; i++) if (!this.test(hs[i].until)) return { i, step: hs[i], bought: this.hintsBought[i] || 0 };
    return null;
  }
  buyHint() {
    const st = this.hintStep();
    if (!st || st.bought >= 3) return null;
    const cost = PTS.hint[st.bought];
    this.hintsBought[st.i] = st.bought + 1;
    this.hintCost += cost;
    return { text: st.step.h[st.bought], cost, tier: st.bought + 1 };
  }

  // ——— итог ———
  // неверное обвинение — половина очков, частичное — три четверти: в рейтинге ценится раскрытое дело
  score() {
    const k = this.ending === 'wrong' ? 0.5 : this.ending === 'partial' ? 0.75 : 1;
    return Math.max(0, Math.round((this.gain - this.loss - this.hintCost) * k));
  }
  maxScore() { return maxScore(this.d); }
  stars() {
    if (this.ending !== 'true') return this.ending === 'partial' ? 1 : 0;
    const r = Math.min(1, this.score() / this.maxScore());
    return r >= 0.8 ? 3 : r >= 0.55 ? 2 : 1;
  }
}

export function maxScore(d) {
  // bonusEv — сколько улик-«веток» (optional) можно собрать в лучшей ветке выбора
  let m = PTS.end.true + (d.bonusEv || 0) * PTS.ev;
  for (const e of Object.values(d.ev)) {
    // улики одной из веток (optional) в максимум не входят: во всех ветках сразу их не собрать
    if (e.optional) continue;
    m += e.hidden ? PTS.evHidden : PTS.ev;
  }
  for (const p of Object.values(d.people || {})) for (const t of p.topics || []) if (t.claim) m += PTS.claim[t.claim.truth];
  m += (d.exp || []).length * PTS.exp;
  m += (d.board || []).length * PTS.board;
  return m;
}
