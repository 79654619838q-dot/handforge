import { GameManager } from './managers/GameManager.js';

const boot = document.createElement('div');
boot.id = 'boot';
boot.innerHTML = '<div style="text-align:center"><h1 class="title" style="font-size:64px;letter-spacing:.2em">ЭРА</h1><div class="bar"><i></i></div></div>';
document.body.appendChild(boot);

try {
  new GameManager().start();
} catch (e) {
  // Нет WebGL (старая видеокарта, отключено ускорение или браузер заблокировал после сбоя)
  boot.innerHTML = `<div style="text-align:center;max-width:520px;padding:24px">
    <h1 class="title" style="font-size:48px;letter-spacing:.2em">ЭРА</h1>
    <p class="label" style="margin-top:20px;line-height:1.8">Не удалось запустить 3D-графику (WebGL).<br>
    Перезапустите браузер и проверьте, что включено аппаратное ускорение.</p></div>`;
  console.error(e);
}
