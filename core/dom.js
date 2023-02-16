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
    
    if(from.contains(e)) {
      from.removeChild(e);
    }
  }
}
