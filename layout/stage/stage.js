import { EventHandler } from '../../core/eventHandler.js'

export class Stage extends EventHandler {

  #styles;
  #stage;
  #pre;
  #canvas;
  #toggle;
  #gfx;

  constructor(ready) {

    super();

    this.defineEvent('ready');
    if (ready) {
      this.listenToEvent('ready', ready);
    }

    this.#styles = document.createElement('link');

    this.#styles.rel = 'stylesheet';
    this.#styles.href = './layout/stage/stage.css';

    document.querySelector('head').appendChild(this.#styles);

    this.#stage = document.createElement('div');
    this.#stage.classList.add('stage');

    document.querySelector('body').appendChild(this.#stage);

    this.#canvas = document.createElement('canvas');
    this.#canvas.classList.add('viewport');
    this.#stage.appendChild(this.#canvas);

    this.#gfx = this.#canvas.getContext("2d");

    this.#scale();

  }

  get gfx() {
    return this.#gfx;
  }

  get width() {
    return this.#canvas.width;
  }

  get height() {
    return this.#canvas.height;
  }

  #scale() {
    this.#canvas.width = this.#stage.offsetWidth;
    this.#canvas.height = this.#stage.offsetHeight;
    if (this.#canvas.height > 400) {
      this.raiseEvent('ready', this.#gfx);
    } else {
      setTimeout(() => { this.#scale(); }, 10);
    }
  }

  setTextView(text) {
    this.#pre.innerHTML = text;
  }

}