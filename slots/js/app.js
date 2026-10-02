// Вход: переключение экранов «лобби» ↔ «автомат». Деньги ненастоящие, всё хранится в браузере.
import { byId } from './machines.js';
import { state } from './state.js';
import { layer } from './ui.js';
import { lobbyScreen, medalsModal, isLocked, unlockModal } from './lobby.js';
import { machineScreen } from './machine.js';
import { luxScreen } from './luxshop.js';
import { estateScreen } from './estatescreen.js';

const app = document.getElementById('app');
window.slots = { state, force: null };

let current = null;
let askUnlock = null; // зашли по ссылке в закрытый автомат — в лобби сразу предложим его открыть
function route() {
  current?.destroy?.();
  layer.innerHTML = '';
  const mm = location.hash.match(/^#\/m\/(\w+)/);
  const m = mm && byId(mm[1]);
  if (m && isLocked(m)) { askUnlock = m; location.replace('#/'); return; }
  if (location.hash.startsWith('#/estate')) { current = estateScreen(app, { onLevel: medalsModal }); scrollTo(0, 0); return; }
  if (location.hash.startsWith('#/lux')) { current = luxScreen(app, { onLevel: medalsModal }); scrollTo(0, 0); return; }
  current = m ? machineScreen(app, m, { onLevel: medalsModal }) : lobbyScreen(app, { rerender: route });
  if (!m && askUnlock) { const u = askUnlock; askUnlock = null; unlockModal(u, () => { location.hash = '#/m/' + u.id; }); }
  scrollTo(0, 0);
}
addEventListener('hashchange', route);
route();
