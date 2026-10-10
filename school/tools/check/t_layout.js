// Ничего не вылезает за край экрана: все уровни (и экран знакомства), меню, вход, карты, альбом.
// Запуск на ширине телефона: node cdp.mjs t_layout.js 375 740 1
const B = 'http://localhost:8890/school/?mute=1';
await go(B); await sleep(2500);
const ids = JSON.parse(await js(`import('./js/levels.js').then(({LEVELS}) => JSON.stringify(Object.entries(LEVELS).filter(([s]) => s !== 'alpha').flatMap(([s,l]) => l.map((_,i) => s+'.'+i))))`))
  .filter((x) => !globalThis.__env.ONLY || new RegExp(globalThis.__env.ONLY).test(x));
const bad = [];
const check = `JSON.stringify([...document.querySelectorAll('.screen *')].filter(e => { const r = e.getBoundingClientRect(); return r.width && (r.right > innerWidth + 2 || r.left < -2); }).map(e => e.className || e.tagName).slice(0, 5))`;
for (const id of ids) {
  await go(`${B}&level=${id}`);
  let b = JSON.parse(await js(check)); if (b.length) bad.push(id + ': ' + b.join(', '));
  if (await js(`!!document.querySelector('.intro .play-btn')`)) { await js(`document.querySelector('.intro .play-btn').click()`); await sleep(600); b = JSON.parse(await js(check)); if (b.length) bad.push(id + ' (игра): ' + b.join(', ')); }
}
for (let i = 0; i < 33; i += 8) { await go(`${B}&level=alpha.${i}`); await sleep(500); const b = JSON.parse(await js(check)); if (b.length) bad.push('карта буквы ' + i + ': ' + b.join(', ')); }
await go(B + '&open=all'); await js(`document.querySelector('.play-btn').click()`); await sleep(700);
await js(`[...document.querySelectorAll('.link-btn')].find(b => /без входа/.test(b.innerText))?.click()`); await sleep(700);
let b = JSON.parse(await js(check)); if (b.length) bad.push('меню: ' + b.join(', '));
const n = +(await js(`document.querySelectorAll('.section-card').length`));
for (let i = 0; i < n; i++) { await js(`document.querySelectorAll('.section-card')[${i}].click()`); await sleep(800); b = JSON.parse(await js(check.replace(".screen *", ".map-wrap > .node, .topbar *"))); if (b.length) bad.push('карта ' + i + ': ' + b.join(', ')); await js(`document.querySelector('.topbar .round-btn').click()`); await sleep(600); }
await js(`document.querySelector('.album-btn').click()`); await sleep(1200);
const fits = await js(`(() => { const sc = document.querySelector('.screen'); const g = sc.querySelector('.sticker-grid'); return g.lastElementChild.getBoundingClientRect().bottom <= innerHeight && sc.scrollHeight <= sc.clientHeight + 1; })()`);
if (!fits) bad.push('альбом не помещается');
console.log('ширина', await js('innerWidth'), 'уровней', ids.length, 'проблем', bad.length); console.log(bad.slice(0, 40).join('\n'));
