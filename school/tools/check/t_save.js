// Сохранение прохождения: A — без входа и перезагрузка; B — вход, уровень, перезагрузка; C — другое
// устройство; D — игра на втором, возврат на первое; E — выход и вход; F — подуровень буквы алфавита.
// С BREAK_LS=1 — браузер без хранилища; с BLOCK_API=1 — сервер первые 10 с «спит».
const B = 'http://localhost:8890/school/?mute=1';
const U = 'http://localhost:8890/school/api';
const lvl = `(async () => { const sl=(ms)=>new Promise(r=>setTimeout(r,ms)); for (let k=0;k<9 && document.querySelector('.screen.game');k++){ await sl(600); const n=document.querySelectorAll('.stage .pile-cell').length; const b=[...document.querySelectorAll('.answer')].find(b=>b.innerText.trim()===String(n)); if(b) b.click(); await sl(2600);} await sl(2500); return document.querySelector('.screen').className; })()`;
const st = `JSON.stringify({ screen: document.querySelector('.screen')?.className, cards: [...document.querySelectorAll('.section-card .lvl')].map(e=>e.innerText).slice(0,1).join(), who: document.querySelector('.who-btn')?.innerText, stars: document.querySelector('.stars-total')?.innerText.trim(), warn: document.querySelector('.warn')?.innerText.slice(0, 40), errs: window.__errs })`;
const open = async () => { await go(B); await sleep(2500); };
const log = async (name) => console.log(name + ':', await js(st));
const login = (nick) => js(`(() => { const [n, p] = document.querySelectorAll('.login-card input'); n.value = '${nick}'; p.value = '1234'; document.querySelector('.login-card .play-btn').click(); })()`);
const nick = 'Тест' + Math.floor(Math.random() * 1e6);
const E = globalThis.__env;
if (E.BLOCK_API) {
  // «сон» сервера: вход сохранён, прохождения в браузере нет, сервер 10 с молчит
  const reg = await (await fetch(U + '/register', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ nick, pass: '1234' }) })).json();
  await fetch(U + '/progress', { method: 'PUT', headers: { 'content-type': 'application/json', authorization: 'Bearer ' + reg.token }, body: JSON.stringify({ progress: { stars: 8, 'prog.math': [3] } }) });
  await open(); await js(`localStorage.clear(); localStorage.setItem('school.account', JSON.stringify(${JSON.stringify({ nick: reg.nick, token: reg.token })}))`);
  await open(); await js(`document.querySelector('.play-btn').click()`); await sleep(1000);
  console.log('сон: кнопка', await js(`document.querySelector('.play-btn')?.innerText`));
  await sleep(8000); await globalThis.__unblock();
  for (let i = 0; i < 30; i++) { await sleep(1000); if (await js(`!!document.querySelector('.screen.menu')`)) break; }
  await log('сон: сервер проснулся');
  return;
}
await open(); await js(`try { localStorage.clear(); } catch {}`); await open();
await log('0 заставка');
await js(`document.querySelector('.play-btn').click()`); await sleep(600);
await js(`[...document.querySelectorAll('.link-btn')].find(b=>/без входа/.test(b.innerText)).click()`); await sleep(700);
await js(`document.querySelector('.section-card').click()`); await sleep(700); await js(`document.querySelector('.node').click()`); await sleep(900);
console.log('A уровень:', await js(lvl));
await open(); await js(`document.querySelector('.play-btn').click()`); await sleep(800); await log('A без входа после перезагрузки');
// B
await js(`try { localStorage.clear(); } catch {}`); await open();
await js(`document.querySelector('.play-btn').click()`); await sleep(600);
await js(`[...document.querySelectorAll('.link-btn')].find(b=>/впервые/.test(b.innerText)).click()`); await sleep(600);
await login(nick); await sleep(1500);
await js(`document.querySelector('.section-card').click()`); await sleep(700); await js(`document.querySelector('.node').click()`); await sleep(900); await js(lvl); await sleep(2500);
// F: подуровень буквы (знакомство) через карту алфавита
await go(B + '&level=al00.1'); await sleep(1500); await js(`(async () => { const sl=(ms)=>new Promise(r=>setTimeout(r,ms)); for (let k=0;k<8 && document.querySelector('.screen.game');k++){ await sl(500); for (const a of document.querySelectorAll('.answer')) { if (document.querySelector('.answer.right')) break; a.click(); await sl(80); } await sl(2600);} })()`); await sleep(2500);
await open(); await js(`document.querySelector('.play-btn').click()`); await sleep(1500); await log('B вошёл, уровень + подуровень буквы, перезагрузка');
// C
await js(`try { localStorage.clear(); } catch {}`); await open(); await js(`document.querySelector('.play-btn').click()`); await sleep(600);
await login(nick); await sleep(1800); await log('C другое устройство, вход');
console.log('C подуровень буквы на сервере:', await js(`localStorage.getItem('school.prog.al00')`));
// E
await js(`window.confirm = () => true; document.querySelector('.who-btn').click()`); await sleep(800); await log('E после выхода');
await js(`document.querySelector('.play-btn').click()`); await sleep(600); await login(nick); await sleep(1800); await log('E снова вошёл');
