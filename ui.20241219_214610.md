# Directory Snapshot

```
- ui/
  - alert/
    - alert.css
    - alert.js
  - header/
    - header.css
    - header.js
  - joystick/
    - joystick.css
    - joystick.js
  - loader/
    - loader.css
    - loader.js
  - modal/
    - modal.css
    - modal.js
  - stage/
    - stage.css
    - stage.js
```
## alert\alert.css

**Path:** `ui\alert\alert.css`

```
.alert-box {
  position: fixed;
  top: 4vh;
  left: 4vw;
  right: 4vw;
  min-height: 8vh;
  border: 1px solid white;
  border-radius: 13px 13px 13px 13px;
  color: white;
  background-color: black;
  padding: 4px 1px 4px 1px;
  display: flex;
  flex-flow: row;
  flex-wrap: wrap;
  justify-content: center;
  align-content: center;
  z-index: 22000;
}

```
## alert\alert.js

**Path:** `ui\alert\alert.js`

```
import { DOM } from '../../core/dom.js';
import { EventHandler } from '../../core/eventHandler.js';


export class Alert extends EventHandler {
  
  static popup(msg, delay = 2000) {
    DOM.stylesheet('./ui/alert/alert.css', 'alert_styles');
    
    let box = DOM.div(undefined, ['alert-box']);
    DOM.text(msg, box);
    DOM.append(box);
    setTimeout(()=>{
      DOM.remove(box);
    }, delay);
  }
  
}

```
## header\header.css

**Path:** `ui\header\header.css`

```
.head {
  position: fixed;
  top: 0vh;
  left: 0vw;
  height: 9vh;
  width: 100vw;
  color: orange;
  font-size: 1.1em;
  line-height: 1em;
  font-family: monospace;
  display: flex;
  justify-content: stretch;
  border-bottom: 0px solid orange;
}

.header-info {
  display: flex;
  flex-grow: 1;
  min-width: 200px;
  max-width: 700px;
  flex-direction: column;
  flex-wrap: nowrap;
  padding-left: 14px;
  padding-top: 4px;
  justify-content: start;
  align-content: start;
  font-size: 1.2em;
  line-height: 1.3em;
}

.header-spacer {
  flex-grow: 2;
}

.header-controls {
  display: flex;
  flex-grow: 1;
  max-width: 350px;
  flex-direction: row;
  flex-wrap: wrap;
  justify-content: end;
  align-content: start;
  margin-top: 8px;
  margin-right: 12px;
}

.header-button {
  line-height: 1em;
  font-family: monospace;
  color: orange;
  background-color: black;
  height: 26px;
  margin-bottom: 4px;
  margin-right: 2px;
  font-size: 1.1em;
  border: 1px solid orange;
  text-align: center;
  width: 100px;
  border-radius: 13px 13px 13px 13px;
}

.header-button-active {
  border: 0.5px solid white;
  color: white;

}

.header-menu-btn {
  position: fixed;
  top: 2px;
  right: 3vw;
  border: 0.5px solid black;
}

.header-menu {
  position: fixed;
  top: 4px;
  right: 3vw;
  color: orange;
  font-family: monospace;
  z-index: 5000;
  display: flex;
  flex-direction: row;
  flex-wrap: wrap;
  justify-content: start;
  align-content: start;
  border: 0.5px solid black;
  padding-top: 0.5px;
  max-width: 204px;
}

.header-hide {
  display: none !important;
}

.bold {
  font-weight: bold;
}

.bolder {
  font-weight: bolder;
}

.pl-1 {
  padding-left: 1em;
}

```
## header\header.js

**Path:** `ui\header\header.js`

```
import { DOM } from '../../core/dom.js';
import { EventHandler } from '../../core/eventHandler.js';

export class Header extends EventHandler {

  #header;
  #left
  #menu;

  constructor() {

    super();
    let vm = this;

    DOM.stylesheet('./ui/header/header.css', 'header_styles');

    vm.#header = DOM.nav(DOM.body, 'head');
    vm.#left = DOM.div(vm.#header, 'header-info');
    vm.#menu = DOM.nav(DOM.body, 'header-menu');

  }

  info(html) {
    let vm = this;
    vm.#left.innerHTML = html;
  }

  addButton(text, action) {
    let vm = this;
    return DOM.button(
      text,
      vm.#menu,
      'header-button',
      action
    );
  }

  activate(btn) {
    btn.classList.remove('header-button-active');
  }

  deactivate(btn) {
    btn.classList.remove('header-button-active');
  }
}

```
## joystick\joystick.css

**Path:** `ui\joystick\joystick.css`

```
.foot {
  position: fixed;
  top: 77vh;
  left: 0vw;
  height: 20vh;
  width: 100vw;
  display: flex;
  justify-content: end;
  align-content: start;
  border-top: 0px solid orange;
}

.up {
  position: absolute;
  top: 0%;
  left: 25%;
  width: 50%;
  height: 50%;
  border-radius: 0 0 0 0;
  border: 0px solid black;
  border-top: 1px solid orange;
  color: orange;
  background-color: black;
  font-size: 0.8em;

}

.down {
  position: absolute;
  top: 50%;
  left: 25%;
  width: 50%;
  height: 50%;
  border-radius: 0 0 0 0;
  border: 0px solid black;
  border-bottom: 1px solid orange;
  color: orange;
  background-color: black;
  font-size: 0.8em;

}

.left {
  position: absolute;
  top: 0%;
  left: 0%;
  width: 25%;
  height: 100%;
  border-radius: 100% 0 0 100%;
  border: 0px solid black;
  border-left: 1px solid orange;
  border-top: 1px solid orange;
  border-bottom: 1px solid orange;
  color: orange;
  background-color: black;
  font-size: 0.8em;

}

.right {
  position: absolute;
  top: 0%;
  left: 75%;
  width: 25%;
  height: 100%;
  border-radius: 0 100% 100% 0;
  border: 0px solid black;
  border-right: 1px solid orange;
  border-top: 1px solid orange;
  border-bottom: 1px solid orange;
  color: orange;
  background-color: black;
  font-size: 0.8em;

}

.move {
  width: 100%;
  height: 100%;
  max-width: 180px;
  min-width: 150px;
  max-height: 86px;
  position: relative;
  margin-right: 25px;
  margin-left: 25px;
  margin-top: 1px;
}

.hand {
  font-family: monospace;
  color: orange;
  background-color: black;
  margin-right: -25px;
  margin-left: -25px;
  border: 0px solid black;
  font-size: 1.9em;
  max-height: 100px;
  margin-top: 10px;
}

.joystick-hide {
  display: none !important;
}

.random-group {
  position: fixed;
  top: 85vh;
  height: 25px;
  left: 10px;
  z-index: 200;
  max-width: 200px;
  color: orange;
  display: flex;
  flex-flow: row;
  flex-wrap: nowrap;
}

.random-check {

  
}

.random-label {
  display: flex;
  flex-flow: column;
  flex-wrap: nowrap;
  justify-content: center;
}

```
## joystick\joystick.js

**Path:** `ui\joystick\joystick.js`

```
import { DOM } from '../../core/dom.js';
import { EventHandler } from '../../core/eventHandler.js';

export class JoyStick extends EventHandler {

  #footer;
  #mover;
  #check;

  constructor() {
    super();
    let vm = this;

    vm.defineEvent('up', 'down', 'left', 'right');

    DOM.stylesheet('./ui/joystick/joystick.css', 'joystick_styles');

    vm.#footer = DOM.nav(DOM.body, 'foot');
    vm.#mover = DOM.div(vm.#footer, 'move');
    
    DOM.button(
      'UP',
      vm.#mover,
      'up',
      () => {
        vm.raiseEvent('up');
      });

    DOM.button(
      'DOWN',
      vm.#mover,
      'down',
      () => {
        vm.raiseEvent('down');
      });

    DOM.button(
      'LEFT',
      vm.#mover,
      'left',
      () => {
        vm.raiseEvent('left');
      });

    DOM.button(
      'RIGHT',
      vm.#mover,
      'right',
      () => {
        vm.raiseEvent('right');
      });
      
    let group = DOM.div(vm.#footer, 'random-group');
    vm.#check = DOM.input('checkbox', group, 'random-check', 'random_battles');
    DOM.label('random encounters?', group, 'random-label', 'random_battles');
    
  }
  
  onEncountersChanged(action){
    let vm = this;
    vm.#check.addEventListener('change', action);
  }

  setChecked(checked) {
    let vm = this;
    vm.#check.checked = checked;
  }
}

```
## loader\loader.css

**Path:** `ui\loader\loader.css`

```
  
.inner-loader {
  border: 8px solid orange;
  border-top: 8px solid indigo;
  border-radius: 50%;
  width: 100px;
  height: 100px;
  animation: spin 2s linear infinite;
}

.loader {
  background-color: black !important;
  position: fixed;
  top: 0;
  left: 0;
  width: 100vw;
  height: 100vh;
  z-index: 30000;
  display: flex;
  align-items: center;
  justify-content: center;
}

.loader-over {
  position: fixed;
  top: 0;
  left: 0;
  width: 100vw;
  height: 100vh;
  z-index: 30010;
  display: flex;
  align-items: center;
  justify-content: center;
}

.loader-msg {
  color: white;
  text-align: center;
  line-height: 72px;
  font-weight: bolder;
}

@keyframes spin {
  0% {
    transform: rotate(0deg);
  }

  100% {
    transform: rotate(360deg);
  }
}

.loader-hide {
  display: none !important;
}

```
## loader\loader.js

**Path:** `ui\loader\loader.js`

```
import { DOM } from '../../core/dom.js';

export class Loader {

  static #loaderBg;
  static #loaderText;
  static #text;
  static #open = false;

  static get isOpen() {
    return Loader.#open;
  }

  static #build() {
    let vm = Loader;
    let bg = vm.#loaderBg;
    let text = vm.#loaderText;

    DOM.stylesheet('./ui/loader/loader.css', 'loader_styles');

    if (!bg) {
      bg = DOM.div(DOM.body, ['loader', 'loader-hide']);
      DOM.div(bg, 'inner-loader');
      vm.#loaderBg = bg;
    }

    if (!text) {
      text = DOM.div(DOM.body, ['loader-over', 'loader-hide']);
      vm.#text = DOM.div(text, 'inner-msg');
      vm.#loaderText = text;
    }
  }

  static open(msg = 'LOADING') {
    let vm = Loader;

    if (vm.#open) {
      vm.#text.innerText = msg;
      return;
    }

    vm.#build();
    vm.#open = true;

    vm.#text.innerText = msg;

    vm.#loaderText.classList.remove('loader-hide');
    vm.#loaderBg.classList.remove('loader-hide');
  }

  static close(delay = 0) {
    let vm = Loader;

    if (!vm.#open) {
      return;
    }

    setTimeout(() => {
      vm.#loaderBg.classList.add('loader-hide');
      vm.#loaderText.classList.add('loader-hide');
      vm.#open = false;
    }, delay);

  }

}
```
## modal\modal.css

**Path:** `ui\modal\modal.css`

```
.modal-bg {
  position: fixed;
  top: 0px;
  left: 0px;
  width: 100vw;
  height: 100vh;
  z-index: 10000;
  background-color: black;
  color: gray;
}

.modal-body-lock {
  overflow: hidden !important;
  overflow-x: hidden !important;
  overflow-y: hidden !important;
}

.modal-hide {
  display: none !important;
}

.modal-content-container {
  position: fixed;
  top: 0px;
  left: 0px;
  width: 100vw;
  height: 100vh;
  z-index: 11000;
  display: flex;
  justify-content: center;
}

.modal-close {
  position: fixed;
  top: 10px;
  left: 10px;
  width: 24px;
  height: 24px;
  z-index: 11100;
  background-color: red;
  color: white;
  border: 1px solid white;
  border-radius: 30% 30% 30% 30%;
  padding: 0 0 0 0;
  margin: 0 0 0 0;
}

```
## modal\modal.js

**Path:** `ui\modal\modal.js`

```
import { DOM } from '../../core/dom.js';
import { EventHandler } from '../../core/eventHandler.js';

export class Modal extends EventHandler {

  #backdrop;
  #content;
  #closeButton;

  #isOpen = false;


  #id = 0;
  #previous = -1;
  #intervalId = -1;

  static #openCount = 0;

  static get openCount() {
    return Modal.#openCount;
  }

  get content() {
    let vm = this;
    return vm.#content;
  }

  constructor() {
    super();
    let vm = this;

    vm.defineEvent(
      'opened',
      'closed',
      'opening',
      'closing'
    );

    DOM.stylesheet('./ui/modal/modal.css', 'modal_styles');

    vm.#backdrop = DOM.div(undefined, 'modal-bg');
    vm.#content = DOM.div(undefined, 'modal-content-container');
    vm.#closeButton = DOM.button(
      '×',
      undefined,
      'modal-close',
      () => {
        vm.close();
      });
  }

  get isOpen() {
    let vm = this;
    return vm.#isOpen;
  }

  close() {
    let vm = this;
    if (vm.isOpen) {

      let e = { cancel: false, modal: vm };
      vm.raiseEvent('closing', e);
      if (e.cancel) {
        return;
      }

      vm.#isOpen = false;

      if (Modal.#openCount > 0) {
        Modal.#openCount -= 1;
      } else {
        Modal.#openCount = 0;
      }

      DOM.remove(vm.#closeButton);
      DOM.remove(vm.#backdrop);
      DOM.remove(vm.#content);

      if (Modal.#openCount < 1) {
        DOM.body.classList.remove('modal-body-lock');
      }

      if (vm.#intervalId > -1) {
        clearInterval(vm.#intervalId);
        vm.#intervalId = -1;
      }

      if (vm.#id > 0 && vm.#previous > -1) {
        if (history.state == vm.#id) {
          history.back();
        }
      }

      vm.raiseEvent('closed', vm);
    }
  }

  open(showClose) {
    let vm = this;
    if (!vm.isOpen) {

      let e = { cancel: false, modal: vm };
      vm.raiseEvent('opening', e);
      if (e.cancel) {
        return;
      }

      Modal.#openCount++;

      vm.#isOpen = true;
      if (Modal.#openCount === 1) {
        DOM.body.classList.add('modal-body-lock');
      }

      DOM.append(vm.#backdrop);
      DOM.append(vm.#content);
      if (showClose) {
        DOM.append(vm.#closeButton);
      }

      if (showClose) {
        vm.#previous = history.state;
        vm.#id = vm.#previous + 1
        history.pushState(vm.#id, `modal ${vm.#id}`);
        vm.#intervalId = setInterval(() => {
          if (history.state == vm.#previous) {
            clearInterval(vm.#intervalId);
            vm.#intervalId = -1;
            vm.close();
          }
        }, 150);
      }

      vm.raiseEvent('opened', vm);
    }
  }

  appendChild(e) {
    let vm = this;
    if (e) {
      vm.#content.appendChild(e);
    }
  }

  removeChild(e) {
    let vm = this;
    if (e) {
      vm.#content.removeChild(e);
    }
  }

  setHtml(html) {
    let vm = this;
    vm.#content.innerHTML = html;
  }

}

```
## stage\stage.css

**Path:** `ui\stage\stage.css`

```

.stage {
  position: fixed;
  display: flex;
  align-content: space-around;
  justify-items: start;
  top: 10vh;
  left: 4vw;
  width: 92vw;
  height: 66vh;
}

.stage-toggle {
  position: fixed;
  top: 15vh;
  left: 0vw;
  width: 14px;
  height: 14px;
  background-color: black;
  color: orange;
  font-size: 0.8em;
  line-height: 1em;
  border: 0px solid orange;
  padding: 0 0 0 0;
}

.viewport {
  width: 100%;
  height: 100%;
}

.viewport-text {
  font-size: 0.8em;
  font-weight: bolder;
  color: orange;
  margin: auto;
}

.stage-hide {
  display: none !important;
}

```
## stage\stage.js

**Path:** `ui\stage\stage.js`

```
import { DOM } from '../../core/dom.js';
import { EventHandler } from '../../core/eventHandler.js';

export class Stage extends EventHandler {

  #styles;
  #stage;
  #canvas;
  #gfx;

  constructor(ready) {

    super();
    let vm = this;

    vm.defineEvent('ready');
    if (ready) {
      vm.listenToEvent('ready', ready);
    }

    DOM.stylesheet('./ui/stage/stage.css', 'stage_styles')

    vm.#stage = DOM.div(DOM.body, 'stage');
    vm.#canvas = DOM.canvas(vm.#stage, 'viewport');
    vm.#gfx = vm.#canvas.getContext("2d");
    vm.#scale();

  }

  get gfx() {
    let vm = this;
    return vm.#gfx;
  }

  get width() {
    let vm = this;
    return vm.#canvas.width;
  }

  get height() {
    let vm = this;
    return vm.#canvas.height;
  }

  #scale() {
    let vm = this;
    vm.#canvas.width = vm.#stage.offsetWidth;
    vm.#canvas.height = vm.#stage.offsetHeight;
    if (vm.#canvas.height > 400) {
      vm.raiseEvent('ready', vm, vm.#gfx);
    } else {
      setTimeout(() => { vm.#scale(); }, 10);
    }
  }

}

```
