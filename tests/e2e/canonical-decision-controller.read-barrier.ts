import { CANONICAL_DATABASE } from '../../src/persistence/canonical/database';
import type { ControllerBarriers } from './canonical-decision-controller.barriers';

/** Delay only native completion delivery, after reads finish and the browser releases its transaction. */
export function holdNextCanonicalRead(barriers: ControllerBarriers) {
  barriers.hold('prewake-read:after');
  const prototype = IDBTransaction.prototype, own = Object.getOwnPropertyDescriptor(prototype, 'addEventListener');
  const original = prototype.addEventListener;
  const restore = () => {
    if (own) Object.defineProperty(prototype, 'addEventListener', own);
    else Reflect.deleteProperty(prototype, 'addEventListener');
  };
  prototype.addEventListener = function (type: string, listener: EventListenerOrEventListenerObject | null,
    options?: boolean | AddEventListenerOptions) {
    if (!listener) return;
    if (type !== 'complete' || this.mode !== 'readonly' || this.db.name !== CANONICAL_DATABASE)
      return original.call(this, type, listener, options);
    restore();
    const transaction = this;
    original.call(transaction, type, (event: Event) => {
      void barriers.hit('prewake-read:after').then(() => {
        if (typeof listener === 'function') listener.call(transaction, event);
        else listener.handleEvent(event);
      });
    }, { once: true });
  };
  return restore;
}
