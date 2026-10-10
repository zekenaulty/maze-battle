# Directory Snapshot

```
- core/
  - dom.js
  - eventHandler.js
  - isReady.js
  - list.js
```
## dom.js

**Path:** `core\dom.js`

```
export class DOM {

  static stylesheet(path, id) {
    let e;
    if (!document.getElementById(id)) {
      e = document.createElement('link');
      e.id = id;
      e.rel = 'stylesheet';
      e.href = path;
      DOM.head.appendChild(e);
    } else {
      e = document.querySelector(id);
    }
    return e;
  }

  static get head() {
    return document.querySelector('head');
  }

  static get body() {
    return document.querySelector('body');
  }

  static element(tag, parent, classes, text, clicker) {
    let e = document.createElement(tag);

    if (text) {
      DOM.text(text, e);
    }

    DOM.classes(e, classes);

    if (parent) {
      DOM.append(e, parent);
    }

    if (clicker) {
      e.addEventListener('click', () => {
        clicker(e);
      });
    }

    return e;
  }

  static input(type, parent, classes, name, value, events) {
    let e = DOM.element('input', parent, classes);
    e.type = type;
    
    if (name) {
      e.name = name;
      e.id = name;
    }
    
    if (value) {
      e.value = value;
    }
    
    if (events && Array.isArray(events)) {
      events.forEach((n) => {
        a.addEventListener(n.event, n.action);
      });
    } else if (events) {
      a.addEventListener(n.event, n.action);
    }
    
    return e;
  }
  
  static label(text, parent, classes, $for) {
    let e = DOM.element('label', parent, classes, text);
    e.htmlFor = $for;
    return e;
  }

  static nav(parent, classes) {
    return DOM.element('nav', parent, classes);
  }

  static button(text, parent, classes, action) {
    return DOM.element('button', parent, classes, text, action);
  }

  static span(text, parent, classes) {
    return DOM.element('span', parent, classes, text);
  }

  static a(text, parent, classes) {
    return DOM.element('a', parent, classes, text);
  }

  static p(text, parent, classes) {
    return DOM.element('p', parent, classes, text);
  }

  static ul(parent, classes) {
    return DOM.element('ul', parent, classes);
  }

  static li(text, parent, classes) {
    return DOM.element('li', parent, classes, text);
  }

  static div(parent, classes) {
    return DOM.element('div', parent, classes);
  }

  static canvas(parent, classes) {
    return DOM.element('canvas', parent, classes);
  }

  static text(text, parent) {
    let e = document.createTextNode(text);

    if (parent) {
      DOM.append(e, parent);
    }

    return e;
  }

  static classes(e, classes) {

    if (classes) {
      if (Array.isArray(classes)) {
        classes.forEach((c) => {
          e.classList.add(c);
        })
      } else {
        e.classList.add(classes);
      }
    }

  }

  static append(e, to) {
    if (!to) {
      to = DOM.body;
    }

    if (!to.contains(e)) {
      to.appendChild(e);
    }
  }

  static remove(e, from) {
    if (!from) {
      from = DOM.body;
    }

    if (from.contains(e)) {
      from.removeChild(e);
    }
  }
}

```
## eventHandler.js

**Path:** `core\eventHandler.js`

```
import { List } from './list.js';

export class EventHandler {

  #events = {};

  constructor() {
    
  }

  raiseEvent(event) {
    let vm = this;
    if (!event || !arguments || arguments.length === 0) {
      return;
    }

    let e = vm.#events[event];
    if (!e || !e.dispatch) {
      return;
    }

    e.dispatch.apply(e, Array.prototype.slice.call(arguments).slice(1));
  }

  defineEvent() {
    let vm = this;
    for (let i = 0; i < arguments.length; i++) {
      vm.#events[arguments[i]] = new EventDispatcher(vm);
    }
  }

  listenToEvent(event, action) {
    let vm = this;
    if (!event || !action) {
      return;
    }

    let e = vm.#events[event];
    if (!e) {
      return;
    }

    e.add(action);
  }

  ignoreEvent(event, action) {
    let vm = this;
    if (!event || !action) {
      return;
    }

    let e = vm.#events[event];
    if (!e) {
      return;
    }

    e.remove(action);
  }

  clearEvents() {
    let vm = this;
    let e = vm.#events;
    vm.#events = {};
    for(let p in e) {
      e[p].length = 0;
      delete e[p];
      vm.defineEvent(p);
    }
    e = undefined;
  }
}

class EventDispatcher {
  #listeners = new List();
  #parent;
  
  constructor(parent) {
    let vm = this;
    vm.#parent = parent;
  }

  add(action) {
    let vm = this;
    if (vm.#listeners.includes(action)) {
      return;
    }

    vm.#listeners.push(action);
  }

  remove(action) {
    let vm = this;
    
    vm.#listeners.delete(action);
  }

  dispatch() {
    let vm = this;
    let a = vm.#listeners.slice(0,vm.#listeners.length);
    for (let i = 0; i < a.length; i++) {
      let action = a[i];
      if (action) {
        action.apply(vm.#parent, arguments);
      }
    }
  }
}

```
## isReady.js

**Path:** `core\isReady.js`

```

const readyState = () => 
  document.readyState;

const doScroll = () => 
  document.documentElement.doScroll;

const isLoaded = () => 
  readyState() === 'complete';

const isLoading = () => 
  readyState() === 'loading';

const isReady = () => 
  isLoaded() || (!isLoading() && !doScroll());

export const go = (toRun) => {
  if (isReady()) {
    toRun();
  } else {
    document.addEventListener(
      "DOMContentLoaded", 
      toRun);
  }
};

```
## list.js

**Path:** `core\list.js`

```
export class List extends Array {

  constructor() {
    super();
  }

  sample() {
    let vm = this;
    if (vm.length === 1) return vm[0];
    if (vm.length === 0) return undefined;

    return vm[Math.floor(Math.random() * vm.length)];
  }

  delete(item) {
    let vm = this;
    if (vm.length === 0) return;
    let idx = vm.indexOf(item);
    if (idx < 0) return;
    vm.splice(idx, 1);
  }
  
  empty() {
    let vm = this;
    return vm.length === 0;
  }
  
  any() {
    let vm = this;
    return vm.length > 0;
  }
}

```
