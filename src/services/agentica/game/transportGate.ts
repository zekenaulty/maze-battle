import type { CanonicalHostPort } from '../../game/CanonicalHostCommand';
import { check } from '../../../persistence/canonical/validation';

const attachments = new Map<string, symbol>();
/** Local coordination only. The canonical dispatch fence remains authoritative across tabs/reloads. */
export function claimTransportAttachment(id: string) {
  check(!attachments.has(id), 'launch transport already attached in this runtime');
  const token = Symbol(id); attachments.set(id, token);
  return () => { if (attachments.get(id) === token) attachments.delete(id); };
}

/** A transport can withdraw its own permission without inventing a new GameSession lifetime. */
export function transportGate(port: CanonicalHostPort) {
  const hostSignal = port.hostSignal, controller = new AbortController();
  const signal = AbortSignal.any([hostSignal, controller.signal]);
  const bound: CanonicalHostPort = { hostSignal, submitHostCommand(command) {
    signal.throwIfAborted();
    check(port.hostSignal === hostSignal, 'transport game lifetime changed');
    return port.submitHostCommand({ ...command, signal: hostSignal, execute(request, options) {
      signal.throwIfAborted();
      return command.execute(request, { signal: AbortSignal.any([signal, options.signal]) });
    } });
  } };
  return { port: bound, signal, close() { controller.abort(new Error('Agentica transport disconnected; retained work requires reconciliation.')); } };
}

export function deferred<T>() {
  let resolve!: (value: T) => void, reject!: (reason: unknown) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  void promise.catch(() => {});
  return { promise, resolve, reject };
}
