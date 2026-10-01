// Вход: переключение экранов «лобби» ↔ «автомат». Деньги ненастоящие, всё хранится в браузере.
import { byId } from './machines.js';
import { state } from './state.js';
import { layer } from './ui.js';
import { lobbyScreen, medalsModal } from './lobby.js';
import { machineScreen } from './machine.js';

const app = document.getElementById('app');
window.slots = { state, force: null };

let current = null;
function route() {
  current?.destroy?.();
  layer.innerHTML = '';
  const mm = location.hash.match(/^#\/m\/(\w+)/);
  const m = mm && byId(mm[1]);
  current = m ? machineScreen(app, m, { onLevel: medalsModal }) : lobbyScreen(app, { rerender: route });
  scrollTo(0, 0);
}
addEventListener('hashchange', route);
route();
