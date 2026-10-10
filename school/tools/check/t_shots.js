// Снимки экранов для глазной проверки: SHOTS="адрес1|имя1,адрес2|имя2" (адрес — часть после /school/)
for (const pair of globalThis.__env.SHOTS.split(',')) {
  const [q, name] = pair.split('|');
  await go('http://localhost:8890/school/' + q); await sleep(2200);
  if (globalThis.__env.CLICK_PLAY && await js(`!!document.querySelector('.intro .play-btn') && ${name.includes('game')}`)) { await js(`document.querySelector('.intro .play-btn').click()`); await sleep(1200); }
  await shot(name + '.png');
}
console.log('ok');
