import { AgenticaHost, type AgenticaHostOptions } from '../sdk/agentica-host.mjs';
import type { CanonicalHostPort } from '../../game/CanonicalHostCommand';
import { equal, validateAction } from '../../../persistence/canonical/agentica/validation';
import { check } from '../../../persistence/canonical/validation';
import { createGameActionHooks } from './actionHooks';
import { loadGameAction, reconcileGameAction } from './actionRead';
import { captureBinding, sdkRecord, type ActionBinding } from './actionContract';
import { deferred, transportGate } from './transportGate';
import type { DecisionSdk } from './decisionRemote';

export type DecisionSdkFactory = (options: AgenticaHostOptions) => DecisionSdk;
export type DecisionWithdrawal = 'outcome' | 'cancel.requested' | 'cancelled' | 'run.terminated'
  | 'disconnected' | 'connection.error' | 'protocol.error' | 'inventory-overflow';
/** The socket may lose execution authority without destroying retained claim/cleanup evidence. */
export function decisionChannel(port: CanonicalHostPort, url: string, factory: DecisionSdkFactory = options => new AgenticaHost(options),
  onWithdraw?: (reason: DecisionWithdrawal) => void) {
  const actions = transportGate(port), ready = deferred<ReturnType<typeof createGameActionHooks>>();
  const terminals = new Map<string, DecisionWithdrawal>(); let runId: string | undefined, binding: ActionBinding | undefined, closed = false;
  const withdraw = (reason?: DecisionWithdrawal) => {
    actions.close(); ready.reject(actions.signal.reason);
    if (reason && !closed) { try { onWithdraw?.(reason); } catch { /* Observers cannot restore channel authority. */ } }
  };
  actions.signal.addEventListener('abort', () => ready.reject(actions.signal.reason), { once: true });
  let sdk: DecisionSdk;
  try { actions.signal.throwIfAborted(); sdk = factory({ url, requestTimeoutMs: 15_000, maxMessages: 64, maxActions: 256, maxQueuedActions: 8, maxMessageBytes: 64 * 1024,
    loadAction: loadGameAction, reconcileAction: reconcileGameAction,
    async saveAction(key, value) {
      const { record } = sdkRecord(key, value);
      if (record.status === 'completed') {
        check(equal(await loadGameAction(key), record), 'successor cannot manufacture a committed result'); return;
      }
      const hooks = await ready.promise; actions.signal.throwIfAborted(); await hooks.saveAction!(key, record);
    },
    async onAction(input) { const action = validateAction(input), hooks = await ready.promise;
      actions.signal.throwIfAborted(); return hooks.onAction!(action); },
    onMessage(message) {
      if (closed || !message.runId || !['outcome', 'cancel.requested', 'cancelled', 'run.terminated'].includes(message.type)) return;
      if (!terminals.has(message.runId) && terminals.size >= 64) { withdraw('inventory-overflow'); return; }
      const reason = message.type as DecisionWithdrawal;
      if (!terminals.has(message.runId) || terminals.get(message.runId) === 'outcome') terminals.set(message.runId, reason);
      if (message.runId === runId) withdraw(reason);
    },
    onStatus(status) { if (!closed && ['disconnected', 'connection.error', 'protocol.error'].includes(status.state)) withdraw(status.state as DecisionWithdrawal); },
  }); } catch (error) { withdraw(); throw error; }
  return { sdk, withdraw,
    accept(id: string) { check(!runId || runId === id, 'successor socket run changed'); runId = id; if (terminals.has(id)) withdraw(terminals.get(id)); },
    attach(input: ActionBinding) {
      actions.signal.throwIfAborted(); check(runId && !binding, 'successor channel already attached or unclaimed');
      binding = captureBinding(input); ready.resolve(createGameActionHooks(actions.port, binding));
    },
    get fenced() { return actions.signal.aborted; }, get binding() { return binding && captureBinding(binding); },
    close() { if (!closed) { closed = true; withdraw(); sdk.close(); } },
  };
}
