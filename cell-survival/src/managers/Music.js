// Музыка, сочинённая кодом (Web Audio): без файлов, поэтому ничего не весит и не требует лицензий.
// Три трека в одном стиле — тёмный кинематографичный:
//   menu  — медленные хоровые аккорды, арпеджио «колокольчиком», редкие удары барабана;
//   game  — напряжённый пульс 96 уд/мин: бочка, хэт, остинато баса, арпеджио, струнная подложка;
//   final — торжественные аккорды и фанфара (итоги игры).
// Ноты ставятся в расписание звукового движка чуть наперёд, поэтому ритм не «плывёт» при нагрузке.

const A = 440;
const hz = (n) => A * Math.pow(2, (n - 69) / 12); // MIDI-нота → частота

// Минорные гармонии (MIDI): Am – F – C – G / Dm – Am – E – Am
const PROG = {
  menu: [[57, 60, 64], [53, 57, 60], [48, 52, 55], [55, 59, 62]],
  game: [[57, 60, 64], [57, 60, 64], [53, 57, 60], [52, 56, 59]],
  final: [[48, 52, 55], [53, 57, 60], [55, 59, 62], [48, 52, 55, 60]],
};
const BPM = { menu: 70, game: 96, final: 84 };

// Свой трек у каждого испытания (оператор 26.09: «чтоб менялась под каждый режим»).
// В «Останови время» и «Бомбе» нет ровной доли — по ней можно было бы считать секунды.
// Энергичные треки (оператор 27.09: «музыку надо энергичной»): у каждого испытания свой темп, гармония и ведущий голос.
// lead: saw — яркий синтезатор, pluck — щипок, bell — колокольчик, brass — медь.
// «Останови время» и «Бомба» — без ровной доли (по ней можно было бы считать секунды), но плотные и нервные.
// Свой жанр и своя мелодия у меню и у каждого испытания (оператор 28.09: «в меню одна, в каждом испытании своя»).
// mel — мелодия на 2 такта: ступени аккорда по восьмым (0,1,2 — ноты аккорда, 3 — октава, null — пауза, +7 — выше на квинту).
// «Останови время» и «Бомба» — без ровной доли (по ней можно было бы считать секунды).
const TRACKS = {
  menu: { bpm: 100, style: 'anthem', prog: [[57, 60, 64], [53, 57, 60], [48, 52, 55], [55, 59, 62]], mel: [0, null, 2, 3, 2, null, 1, 0, 1, null, 2, null, 0, null, null, null] },
  lastcell: { bpm: 118, style: 'synthwave', prog: [[57, 60, 64], [53, 57, 60], [50, 53, 57], [52, 56, 59]], mel: [3, 2, 0, 2, 3, null, 2, 1, 0, 1, 2, null, 1, 0, null, null] },
  doors: { bpm: 128, style: 'horror', prog: [[45, 48, 52], [46, 49, 53], [45, 48, 52], [44, 47, 51]], mel: [0, null, null, 1, null, null, 0, null, 2, null, null, 1, null, null, null, null] },
  mines: { bpm: 172, style: 'dnb', prog: [[50, 53, 57], [50, 53, 57], [46, 50, 53], [48, 52, 55]], mel: [0, 0, 2, null, 1, null, 0, null, 3, null, 2, null, 1, null, null, null] },
  memory: { bpm: 138, style: 'trance', prog: [[57, 60, 64], [55, 59, 62], [53, 57, 60], [52, 56, 59]], mel: [0, 1, 2, 3, 2, 1, 2, 3, 0, 1, 2, 3, 3, 2, 1, 0] },
  center: { bpm: 96, style: 'chill', prog: [[52, 55, 59, 62], [48, 52, 55, 59], [50, 53, 57, 60], [47, 50, 54, 57]], mel: [3, null, 2, null, 1, null, 2, 3, null, null, 1, null, 0, null, null, null] },
  unique: { bpm: 132, style: 'odd', steps: 14, prog: [[55, 58, 62], [56, 60, 63], [53, 56, 60], [55, 58, 62]], mel: [0, 2, 1, 3, 2, null, 1, 0, 2, 1, 3, null, null, null] },
  shoot: { bpm: 112, style: 'western', prog: [[52, 55, 59], [52, 55, 59], [48, 52, 55], [47, 51, 54]], mel: [0, null, 3, null, 2, 1, 0, null, 1, null, 2, null, 0, null, null, null] },
  cards: { bpm: 124, style: 'swing', swing: 0.33, prog: [[50, 53, 57, 60], [55, 59, 62, 65], [48, 52, 55, 59], [45, 49, 52, 55]], mel: [3, 2, 1, 0, 1, null, 2, 3, 2, null, 0, null, 1, 2, null, null] },
  roulette: { bpm: 140, style: 'dubstep', prog: [[45, 48, 52], [45, 48, 51], [44, 48, 51], [45, 48, 52]], mel: [0, null, null, null, 2, null, 1, null, 0, null, null, null, 3, null, 2, null] },
  final: { bpm: 120, style: 'anthem', fanfare: true, prog: [[48, 52, 55], [53, 57, 60], [55, 59, 62], [48, 52, 55, 60]], mel: [0, 0, 1, 2, 3, null, 2, null, 1, 1, 2, 3, 3, null, null, null] },
  game: { bpm: 118, style: 'synthwave', prog: PROG.game, mel: [0, 2, 3, 2, 1, null, 0, null, 2, null, 1, null, 0, null, null, null] },
  time: { bpm: 0, style: 'free', prog: [[50, 53, 57, 60], [48, 52, 55, 59], [46, 50, 53, 57], [45, 48, 52, 55]] },
  bomb: { bpm: 0, style: 'fuse', prog: [[49, 52, 56], [50, 53, 57], [49, 52, 56], [48, 51, 55]] },
};
const trackOf = (name) => TRACKS[name] || { bpm: BPM[name], prog: PROG[name], style: name };

export class Music {
  constructor(ctx, out) {
    this.ctx = ctx;
    this.out = out;
    this.track = null;
    // общий «зал»: простая ревербация из затухающего шума
    this.rev = ctx.createConvolver();
    this.rev.buffer = this.impulse(2.8);
    this.revGain = ctx.createGain(); this.revGain.gain.value = 0.35;
    this.rev.connect(this.revGain).connect(out);
    this.bus = ctx.createGain(); this.bus.gain.value = 0;
    // компрессор-ограничитель: энергичные треки плотные, но без перегруза и хрипа
    this.comp = ctx.createDynamicsCompressor();
    this.comp.threshold.value = -14; this.comp.knee.value = 8; this.comp.ratio.value = 6; this.comp.attack.value = 0.004; this.comp.release.value = 0.18;
    this.bus.connect(this.comp).connect(out); this.bus.connect(this.rev);
    this.noiseBuf = this.noise(1);
  }

  impulse(sec) {
    const len = this.ctx.sampleRate * sec, b = this.ctx.createBuffer(2, len, this.ctx.sampleRate);
    for (let c = 0; c < 2; c++) { const d = b.getChannelData(c); for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.6); }
    return b;
  }
  noise(sec) {
    const len = this.ctx.sampleRate * sec, b = this.ctx.createBuffer(1, len, this.ctx.sampleRate), d = b.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    return b;
  }

  play(name) {
    if (this.track === name) return;
    this.stop();
    this.track = name;
    const t = this.ctx.currentTime;
    this.bus.gain.cancelScheduledValues(t);
    this.bus.gain.setValueAtTime(0.0001, t);
    this.bus.gain.exponentialRampToValueAtTime(1, t + 2.5);
    this.step = 0;
    this.next = t + 0.1;
    this.timer = setInterval(() => this.schedule(), 50);
  }

  stop() {
    if (!this.track) return;
    clearInterval(this.timer);
    const t = this.ctx.currentTime;
    this.bus.gain.cancelScheduledValues(t);
    this.bus.gain.setTargetAtTime(0.0001, t, 0.5);
    this.track = null;
  }

  // Расписание на 0,25 с вперёд, шаг — шестнадцатая доля
  schedule() {
    const name = this.track;
    if (!name) return;
    const tr = trackOf(name);
    // без ровной доли: длина шага каждый раз чуть другая (0,6…1,4 от средней)
    const free = tr.bpm === 0 || tr.style === 'free';
    const spbBase = 60 / (tr.bpm || 128) / 4;
    // после фейда трек снова набирает громкость
    if (this.bus.gain.value < 0.01 && this.ctx.currentTime > this.next) this.bus.gain.setTargetAtTime(1, this.ctx.currentTime, 0.6);
    while (this.next < this.ctx.currentTime + 0.25) {
      const spb = free ? spbBase * (0.6 + Math.random() * 0.8) : spbBase;
      const swing = tr.swing && this.step % 2 === 1 ? spbBase * tr.swing : 0;
      this.note(name, this.step, this.next + swing, spbBase, tr);
      this.step += 1;
      this.next += spb;
    }
  }

  note(name, s, t, spb, tr = trackOf(name)) {
    const steps = tr.steps || 16;
    const bar = Math.floor(s / steps), beat = s % steps;
    const prog = tr.prog;
    const chord = prog[bar % prog.length];
    const barLen = spb * steps;
    const R = Math.random;
    switch (tr.style === 'free' || tr.style === 'fuse' ? tr.style : '') {
      // мелодия трека: восьмые, ступени аккорда
      default: break;
    }
    const melNote = (oct = 12) => {
      const m = tr.mel; if (!m || beat % 2) return null;
      const d = m[((bar % 2) * 8 + beat / 2) % m.length];
      return d === null || d === undefined ? null : chord[d % chord.length] + oct + (d >= chord.length ? 12 : 0);
    };
    const phrase = bar % 8, build = phrase === 7, intro = bar < 1;
    switch (tr.style) {
      case 'anthem': { // меню и финал: торжественно — медленные мощные удары, хор, медь, мелодия колоколом
        if (beat === 0) { this.pad(chord, t, barLen * 1.05, 0.06); this.bass(chord[0] - 12, t, barLen, 0.18); if (phrase === 0) this.crash(t, 0.1); }
        if (beat === 0 || beat === 10) this.drum(t, 0.7, 42);
        if (beat === 8) this.clap(t, 0.16);
        if (beat % 4 === 2) this.hat(t, 0.03);
        const n = melNote(12); if (n !== null && !intro) { this.brass(n, t, spb * 3.5, 0.045); this.bell(n + 12, t, 1.2, 0.02); }
        if (tr.fanfare && beat === 0 && bar % 2 === 0) this.brass(chord[2] + 24, t, spb * 6, 0.03);
        return;
      }
      case 'synthwave': { // «Последняя клетка»: ретро-синтвейв — ровная бочка, хлопок, пульс баса восьмыми, яркий лид
        if (beat === 0) this.pad(chord, t, barLen, 0.035);
        if (beat % 4 === 0) this.drum(t, 0.6, 50);
        if (beat === 4 || beat === 12) this.clap(t, 0.18);
        if (beat % 2 === 1) this.hat(t, 0.035);
        if (beat % 2 === 0) this.bass(chord[0] - 24 + (beat % 4 === 2 ? 12 : 0), t, spb * 1.6, 0.17);
        const n = melNote(12); if (n !== null && !intro) this.lead(n, t, spb * 1.8, 0.04);
        return;
      }
      case 'horror': { // «Двери»: мрачное техно — глухая бочка, тревожные колокола, низкий гул
        if (beat === 0) { this.pad(chord.map((n) => n - 12), t, barLen * 1.1, 0.05); this.bass(chord[0] - 24, t, barLen, 0.14); }
        if (beat % 4 === 0) this.drum(t, 0.65, 40);
        if (beat % 4 === 2) this.hat(t, 0.05);
        if (beat === 12) this.clap(t, 0.12);
        const n = melNote(24); if (n !== null) this.bell(n + (R() < 0.3 ? 1 : 0), t, 1.8, 0.04);
        return;
      }
      case 'dnb': { // «Взрывное поле»: драм-н-бейс — ломаный быстрый ритм, раскаты малого, медь
        const K = [0, 10], SN = [4, 12];
        if (K.includes(beat)) this.drum(t, 0.7, 50);
        if (SN.includes(beat)) this.clap(t, 0.22);
        if (beat % 2 === 1) this.hat(t, 0.035);
        if (beat === 0) { this.pad(chord, t, barLen, 0.03); this.bass(chord[0] - 24, t, barLen * 0.9, 0.2); }
        if (beat === 8) this.bass(chord[1] - 24, t, barLen * 0.4, 0.16);
        const n = melNote(12); if (n !== null && bar % 4 >= 2) this.brass(n, t, spb * 2, 0.04);
        return;
      }
      case 'trance': { // «Запомни число»: транс — каскад арпеджио шестнадцатыми, колокольная мелодия
        if (beat === 0) this.pad(chord, t, barLen, 0.04);
        if (beat % 4 === 0) this.drum(t, 0.6, 48);
        if (beat % 4 === 2) { this.hat(t, 0.07); this.bass(chord[0] - 24, t, spb * 1.5, 0.18); }
        if (beat === 4 || beat === 12) this.clap(t, 0.12);
        const arp = [0, 1, 2, 3, 2, 1, 2, 3]; const a = arp[beat % 8];
        if (!intro) this.pluck(chord[a % chord.length] + 12 + (a >= chord.length ? 12 : 0), t, spb * 0.9, 0.028);
        const n = melNote(24); if (n !== null && bar % 4 >= 2) this.bell(n, t, 0.9, 0.045);
        return;
      }
      case 'chill': { // «Центр»: будущий бас — медленно, половинный ритм, мягкие щипки, широкие аккорды
        if (beat === 0) { this.pad(chord, t, barLen * 1.1, 0.055); this.bass(chord[0] - 24, t, barLen * 0.7, 0.2); }
        if (beat === 0) this.drum(t, 0.6, 46);
        if (beat === 8) this.clap(t, 0.2);
        if (beat % 4 === 2) this.hat(t, 0.03);
        if (beat === 6 || beat === 14) this.pad(chord.map((n) => n + 12), t, spb * 1.5, 0.03);
        const n = melNote(12); if (n !== null) this.pluck(n, t, spb * 3, 0.045);
        return;
      }
      case 'odd': { // «Уникальное число»: размер 7/8 — ритм сбивается, резкий синтезатор
        if (beat === 0) this.pad(chord, t, barLen, 0.035);
        if (beat === 0 || beat === 6 || beat === 10) this.drum(t, beat ? 0.4 : 0.65, 55);
        if (beat === 4 || beat === 12) this.clap(t, 0.15);
        if (beat % 2 === 1) this.hat(t, 0.04);
        if (beat % 2 === 0) this.bass(chord[(beat / 2) % 3] - 24, t, spb * 1.4, 0.15);
        const n = melNote(12); if (n !== null && !intro) this.lead(n, t, spb * 1.4, 0.038);
        return;
      }
      case 'western': { // «Стрельба»: вестерн — скачущий ритм, звонкая гитара с эхом, свист
        if (beat === 0) { this.pad(chord, t, barLen, 0.04); this.bass(chord[0] - 12, t, spb * 3, 0.22); }
        if (beat === 8) this.bass(chord[2] - 24, t, spb * 3, 0.2);
        if (beat === 4 || beat === 12) this.clap(t, 0.14);
        if ([0, 3, 4, 7, 8, 11, 12, 15].includes(beat)) this.hat(t, beat % 4 === 0 ? 0.06 : 0.035); // галоп
        if (beat === 0 || beat === 8) this.drum(t, 0.65, 52);
        const n = melNote(12);
        if (n !== null) { if (bar % 4 < 2) { this.pluck(n, t, spb * 2, 0.07); this.pluck(n, t + spb * 3, spb * 2, 0.02); } else this.whistle(n + 12, t, spb * 2, 0.04); }
        return;
      }
      case 'swing': { // «Очко»: электросвинг — шагающий бас, медные акценты, хлопки на 2 и 4
        if (beat === 0) this.pad(chord, t, barLen, 0.03);
        if (beat % 4 === 0) { this.drum(t, 0.5, 50); this.bass(chord[(beat / 4) % chord.length] - 12, t, spb * 3.5, 0.17); }
        if (beat === 4 || beat === 12) this.clap(t, 0.18);
        if (beat % 2 === 0) this.hat(t, beat % 4 === 2 ? 0.06 : 0.03);
        if (beat === 6 || beat === 14) this.brass(chord[3 % chord.length] + 12, t, spb * 1.2, 0.04);
        const n = melNote(24); if (n !== null && !intro) this.pluck(n, t, spb * 1.5, 0.04);
        return;
      }
      case 'dubstep': { // «Рулетка»: дабстеп — тяжёлый половинный ритм, «рычащий» бас, редкие колокола
        if (beat === 0) this.pad(chord.map((n) => n - 12), t, barLen, 0.04);
        if (beat === 0 || beat === 3) this.drum(t, 0.7, 42);
        if (beat === 8) this.clap(t, 0.25);
        if (beat % 2 === 0) this.hat(t, 0.035);
        if (bar % 2 === 1 && beat % 4 === 0) this.wobble(chord[0] - 24, t, spb * 4, 0.16, beat % 8 === 0 ? 4 : 8);
        const n = melNote(24); if (n !== null && bar % 2 === 0) this.bell(n, t, 1.4, 0.04);
        return;
      }
      case 'horror': // «Двери»: низкий гул, стук сердца, расстроенные колокольчики
        if (beat === 0) { this.pad(chord.map((n) => n - 12), t, barLen * 1.1, 0.05); this.bass(chord[0] - 24, t, barLen, 0.14); }
        if (beat === 0 || beat === 3) this.drum(t, beat ? 0.35 : 0.55, 42);
        if (beat % 4 === 2 && R() < 0.35) this.bell(chord[Math.floor(R() * 3)] + 24 + (R() < 0.5 ? 1 : 0), t, 2.2, 0.035);
        return;
      case 'free': // «Время»: ни одной ровной доли — подложка и редкие колокольчики в случайные моменты
        if (beat === 0) this.pad(chord, t, barLen * 1.6, 0.045);
        if (R() < 0.45) this.bell(chord[Math.floor(R() * chord.length)] + 12 + (R() < 0.4 ? 12 : 0), t, 1.2, 0.06);
        if (R() < 0.12) this.bass(chord[0] - 12, t, spb * 3, 0.14);
        if (R() < 0.3) this.pluck(chord[Math.floor(R() * chord.length)] + 24, t, spb * 0.8, 0.03);
        if (R() < 0.25) this.hat(t, 0.04);
        if (beat === 8 && R() < 0.5) this.bass(chord[0] - 12, t, barLen * 0.8, 0.1);
        return;
      case 'march': // «Взрывное поле»: военный марш — дробь, тяжёлые удары, остинато
        if (beat === 0) this.pad(chord, t, barLen, 0.03);
        if (beat % 4 === 0) this.drum(t, 0.6, 48);
        if (beat % 2 === 1 || (bar % 2 === 1 && beat >= 12)) this.hat(t, 0.06);
        if (beat % 4 === 2) this.bass(chord[0] - 24, t, spb * 1.5, 0.2);
        if (beat % 8 === 0) this.brass(chord[beat === 0 ? 0 : 2] + 12, t, spb * 3, 0.035);
        return;
      case 'mystery': // «Запомни число»: каскад колокольчиков, мягкий бас
        if (beat === 0) { this.pad(chord, t, barLen, 0.035); this.bass(chord[0] - 12, t, barLen, 0.12); }
        if (beat % 2 === 0) this.bell(chord[(beat / 2) % chord.length] + 12 + (beat >= 8 ? 12 : 0), t, 1.1, 0.04);
        if (beat === 12) this.drum(t, 0.3, 60);
        return;
      case 'focus': // «Центр»: спокойно, сосредоточенно
        if (beat === 0) this.pad(chord, t, barLen * 1.05, 0.04);
        if (beat % 4 === 0) this.pluck(chord[(beat / 4) % chord.length] + 12, t, spb * 3, 0.035);
        if (beat === 0 && bar % 2 === 0) this.bass(chord[0] - 12, t, barLen, 0.1);
        return;
      case 'odd': // «Уникальное число»: размер 7/8 — ритм всё время сбивается
        if (beat === 0) this.pad(chord, t, barLen, 0.035);
        if (beat === 0 || beat === 6 || beat === 10) this.drum(t, beat ? 0.35 : 0.55, 55);
        if (beat % 2 === 0) this.pluck(chord[(beat / 2) % 3] + 12, t, spb * 1.2, 0.045);
        if (beat % 2 === 1) this.hat(t, 0.03);
        return;
      case 'western': // «Стрельба»: гитарный звон с эхом, редкий удар
        if (beat === 0) { this.pad(chord, t, barLen, 0.025); this.bass(chord[0] - 12, t, barLen * 0.5, 0.14); }
        if (beat === 0 || beat === 10) this.drum(t, 0.4, 52);
        if ([0, 3, 6, 8, 11].includes(beat)) { const n = chord[[0, 1, 2, 1, 0][[0, 3, 6, 8, 11].indexOf(beat)]] + 12; this.pluck(n, t, spb * 2, 0.05); this.pluck(n, t + spb * 3, spb * 2, 0.02); }
        return;
      case 'fuse': // «Бомба»: нервный гул и случайные удары — ровного тиканья нет
        if (beat === 0) { this.pad(chord, t, barLen * 1.2, 0.04); this.bass(chord[0] - 24, t, barLen, 0.16); }
        if (R() < 0.45) this.hat(t, 0.05 + R() * 0.05);
        if (R() < 0.12) this.drum(t, 0.55, 50);
        if (R() < 0.25) this.lead(chord[Math.floor(R() * chord.length)] + 12, t, spb * 0.6, 0.028);
        return;
      case 'noir': // «Очко»: джаз казино — шагающий бас, щётки, септаккорды
        if (beat === 0) this.pad(chord, t, barLen, 0.03);
        if (beat % 4 === 0) this.bass(chord[(beat / 4) % chord.length] - 12, t, spb * 3.5, 0.16);
        if (beat % 2 === 0) this.hat(t, beat % 4 === 2 ? 0.05 : 0.03);
        if (beat === 6 || beat === 14) this.pluck(chord[3 % chord.length] + 12, t, spb * 2, 0.035);
        return;
      case 'heartbeat': // «Рулетка»: удары сердца парами, тянущийся гул
        if (beat === 0) { this.pad(chord.map((n) => n - 12), t, barLen * 1.1, 0.045); }
        if (beat === 0 || beat === 2 || beat === 8 || beat === 10) this.drum(t, beat % 8 === 0 ? 0.6 : 0.35, 40);
        if (bar % 4 === 3 && beat === 12) this.bell(chord[2] + 24, t, 3, 0.03);
        return;
      default: break;
    }
    if (name === 'menu') {
      if (beat === 0) { this.pad(chord, t, barLen * 1.05, 0.05); this.bass(chord[0] - 12, t, barLen, 0.16); }
      if (beat === 0 && bar % 2 === 0) this.drum(t, 0.5, 55);
      if (beat % 2 === 0) { const arp = [0, 1, 2, 1, 2, 3, 2, 1]; const n = chord[arp[(beat / 2) % 8] % chord.length] + 12 + (arp[(beat / 2) % 8] === 3 ? 12 : 0); this.bell(n, t, 0.9, 0.05); }
      if (bar % 4 === 3 && beat === 8) this.bell(chord[2] + 24, t, 2.5, 0.04);
    } else if (name === 'game') {
      if (beat === 0) { this.pad(chord, t, barLen, 0.035); }
      if (beat % 4 === 0) this.drum(t, beat === 0 ? 0.7 : 0.45, 50);
      if (beat === 10) this.drum(t, 0.3, 50);
      if (beat % 2 === 1) this.hat(t, beat % 4 === 3 ? 0.07 : 0.04);
      if (beat % 2 === 0) this.bass((beat % 8 === 6 ? chord[1] : chord[0]) - 24, t, spb * 1.8, 0.22);
      const arp = [0, 2, 1, 2];
      if (bar >= 2) this.pluck(chord[arp[beat % 4]] + 12, t, spb * 1.5, beat % 4 === 0 ? 0.06 : 0.035);
      if (bar % 8 === 7 && beat >= 12) this.hat(t, 0.08); // нарастание перед сменой фразы
    } else {
      if (beat === 0) { this.pad(chord, t, barLen, 0.06); this.bass(chord[0] - 12, t, barLen, 0.2); this.drum(t, 0.6, 45); }
      if (beat === 8) this.drum(t, 0.4, 45);
      const fan = [0, 2, 3, 4];
      if (beat % 4 === 0) this.brass(chord[fan[(beat / 4) % 4] % chord.length] + 12, t, spb * 3.5, 0.05);
    }
  }

  // ---- инструменты ----
  // свист: чистый тон с вибрато (вестерн)
  whistle(n, t, dur, vol) {
    const o = this.osc('sine', hz(n), t, dur), lfo = this.osc('sine', 6, t, dur), lg = this.ctx.createGain();
    lg.gain.value = hz(n) * 0.012; lfo.connect(lg).connect(o.frequency);
    const g = this.ctx.createGain(); this.env(g, t, 0.05, dur * 0.5, dur * 0.5, vol); o.connect(g).connect(this.bus);
  }
  // «рычащий» бас: фильтр качается с частотой rate
  wobble(n, t, dur, vol, rate) {
    const f = this.ctx.createBiquadFilter(); f.type = 'lowpass'; f.Q.value = 9; f.frequency.value = 400;
    const lfo = this.osc('sine', rate, t, dur), lg = this.ctx.createGain(); lg.gain.value = 900; lfo.connect(lg).connect(f.frequency);
    const g = this.ctx.createGain(); this.env(g, t, 0.01, dur * 0.8, dur * 0.2, vol);
    f.connect(g).connect(this.bus);
    for (const d of [-7, 7]) this.osc('sawtooth', hz(n), t, dur, d).connect(f);
  }
  // яркий синтезатор: три расстроенные пилы через фильтр с «щелчком»
  lead(n, t, dur, vol) {
    const f = this.ctx.createBiquadFilter(); f.type = 'lowpass'; f.Q.value = 6; f.frequency.setValueAtTime(3800, t); f.frequency.exponentialRampToValueAtTime(900, t + dur);
    const g = this.ctx.createGain(); this.env(g, t, 0.004, dur * 0.3, dur * 0.7, vol);
    f.connect(g).connect(this.bus);
    for (const d of [-12, 0, 12]) this.osc('sawtooth', hz(n), t, dur, d).connect(f);
  }
  clap(t, vol) {
    for (const k of [0, 0.011, 0.022]) {
      const n = this.ctx.createBufferSource(); n.buffer = this.noiseBuf;
      const f = this.ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 1400; f.Q.value = 0.9;
      const g = this.ctx.createGain(); this.env(g, t + k, 0.001, 0, k === 0.022 ? 0.16 : 0.03, vol);
      n.connect(f).connect(g).connect(this.bus); n.start(t + k, Math.random() * 0.5); n.stop(t + k + 0.2);
    }
  }
  crash(t, vol) {
    const n = this.ctx.createBufferSource(); n.buffer = this.noiseBuf;
    const f = this.ctx.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = 5000;
    const g = this.ctx.createGain(); this.env(g, t, 0.002, 0, 1.4, vol);
    n.connect(f).connect(g).connect(this.bus); n.start(t); n.stop(t + 1.5);
  }
  // нарастающий шум перед новой фразой
  riser(t, dur, k) {
    const n = this.ctx.createBufferSource(); n.buffer = this.noiseBuf;
    const f = this.ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 800 + k * 6000; f.Q.value = 2;
    const g = this.ctx.createGain(); this.env(g, t, 0.002, dur * 0.5, dur * 0.5, 0.02 + k * 0.05);
    n.connect(f).connect(g).connect(this.bus); n.start(t, Math.random() * 0.5); n.stop(t + dur + 0.05);
  }
  env(g, t, a, hold, r, peak) {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + a);
    g.gain.setValueAtTime(peak, t + a + hold);
    g.gain.exponentialRampToValueAtTime(0.0001, t + a + hold + r);
  }
  osc(type, f, t, dur, detune = 0) {
    const o = this.ctx.createOscillator();
    o.type = type; o.frequency.setValueAtTime(f, t); o.detune.value = detune;
    o.start(t); o.stop(t + dur + 0.1);
    return o;
  }
  // хоровая подложка: расстроенные пилы через мягкий фильтр
  pad(chord, t, dur, vol) {
    // ровная подложка (оператор 28.09: нарастающий звук в каждом такте раздражал) — без разгорания и без качания фильтра
    const f = this.ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 800;
    const g = this.ctx.createGain(); this.env(g, t, 0.04, dur * 0.8, dur * 0.2, vol);
    f.connect(g).connect(this.bus);
    for (const n of chord) for (const d of [-8, 8]) this.osc('sawtooth', hz(n), t, dur, d).connect(f);
  }
  bass(n, t, dur, vol) {
    const f = this.ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 220;
    const g = this.ctx.createGain(); this.env(g, t, 0.01, dur * 0.4, dur * 0.6, vol);
    this.osc('sawtooth', hz(n), t, dur).connect(f).connect(g).connect(this.bus);
    this.osc('sine', hz(n - 12), t, dur).connect(g);
  }
  bell(n, t, dur, vol) {
    const g = this.ctx.createGain(); this.env(g, t, 0.005, 0, dur, vol);
    g.connect(this.bus);
    this.osc('sine', hz(n), t, dur).connect(g);
    const g2 = this.ctx.createGain(); this.env(g2, t, 0.005, 0, dur * 0.4, vol * 0.4); g2.connect(this.bus);
    this.osc('sine', hz(n) * 2.76, t, dur).connect(g2); // неровный обертон — звук колокольчика
  }
  pluck(n, t, dur, vol) {
    const f = this.ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.setValueAtTime(2800, t); f.frequency.exponentialRampToValueAtTime(400, t + dur);
    const g = this.ctx.createGain(); this.env(g, t, 0.003, 0, dur, vol);
    this.osc('square', hz(n), t, dur).connect(f).connect(g).connect(this.bus);
  }
  brass(n, t, dur, vol) {
    const f = this.ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.setValueAtTime(600, t); f.frequency.linearRampToValueAtTime(1800, t + 0.15);
    const g = this.ctx.createGain(); this.env(g, t, 0.06, dur * 0.5, dur * 0.5, vol);
    f.connect(g).connect(this.bus);
    for (const d of [-6, 6]) this.osc('sawtooth', hz(n), t, dur, d).connect(f);
  }
  drum(t, vol, f0) {
    const o = this.osc('sine', f0 * 2.2, t, 0.6);
    o.frequency.exponentialRampToValueAtTime(f0, t + 0.12);
    const g = this.ctx.createGain(); this.env(g, t, 0.003, 0, 0.55, vol);
    o.connect(g).connect(this.bus);
    const n = this.ctx.createBufferSource(); n.buffer = this.noiseBuf;
    const nf = this.ctx.createBiquadFilter(); nf.type = 'lowpass'; nf.frequency.value = 900;
    const ng = this.ctx.createGain(); this.env(ng, t, 0.002, 0, 0.12, vol * 0.25);
    n.connect(nf).connect(ng).connect(this.bus); n.start(t); n.stop(t + 0.2);
  }
  hat(t, vol) {
    const n = this.ctx.createBufferSource(); n.buffer = this.noiseBuf;
    const f = this.ctx.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = 7000;
    const g = this.ctx.createGain(); this.env(g, t, 0.001, 0, 0.05, vol);
    n.connect(f).connect(g).connect(this.bus); n.start(t, Math.random() * 0.5); n.stop(t + 0.08);
  }
}
