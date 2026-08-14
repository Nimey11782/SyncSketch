import { wsConnect } from './network.js';
import { setupUI, initInitialState } from './ui.js';

(function init() {
  setupUI();
  initInitialState();
  wsConnect();
})();
