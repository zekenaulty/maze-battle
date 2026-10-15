import { AgenticaHost, type AgenticaHostOptions, type AgenticaMessage, type HostOperationEvent, type HostDecisionAdoption,
  type AgenticaStarted } from '../../src/services/agentica/sdk/agentica-host.mjs';
import type { AgenticaAction, AgenticaResult } from '../../src/services/agentica/contracts';

/** Actual SDK callbacks and correlated replies only. This never supplies service evidence. */
export function decisionSdkCapture() {
  const actions: { window: string; action: AgenticaAction }[] = [], results: { window: string; result: AgenticaResult }[] = [];
  const messages: { window: string; message: AgenticaMessage }[] = [], statuses: { window: string; state: string; detail?: unknown }[] = [];
  const wakes: HostOperationEvent[] = [], replies: AgenticaStarted[] = [];
  const adoptions: { event: HostOperationEvent; adoption: HostDecisionAdoption }[] = [];
  const clients: AgenticaHost[] = [];
  let loseReplies = 0, awaitOutcome = false;
  const listeners = new Set<(message: AgenticaMessage) => void>();
  function outcome(runId: string) {
    const matches = (message: AgenticaMessage) => message.type === 'outcome' && message.runId === runId;
    if (messages.some(item => matches(item.message))) return Promise.resolve();
    return new Promise<void>((resolve, reject) => {
      const listener = (message: AgenticaMessage) => {
        if (matches(message)) { clearTimeout(timer); listeners.delete(listener); resolve(); }
      };
      const timer = setTimeout(() => { listeners.delete(listener); reject(Error('Real successor outcome was not observed')); }, 10_000);
      listeners.add(listener);
    });
  }
  function factory(window: 'initial' | 'successor') {
    return (config: AgenticaHostOptions) => {
      const sdk = new AgenticaHost({ ...config,
        async onAction(action) {
          if (actions.length >= 8) throw Error('Decision fixture action bound exceeded');
          actions.push({ window, action: structuredClone(action) });
          const result = await config.onAction(action); results.push({ window, result: structuredClone(result) }); return result;
        },
        onMessage(message) {
          if (messages.length >= 512) throw Error('Decision fixture message bound exceeded');
          messages.push({ window, message: structuredClone(message) }); config.onMessage?.(message);
          for (const listener of listeners) listener(message);
        },
        onStatus(status) { statuses.push({ window, ...structuredClone(status) }); config.onStatus?.(status); },
      });
      async function received(reply: AgenticaStarted) {
        replies.push(structuredClone(reply));
        if (awaitOutcome) { awaitOutcome = false; await outcome(reply.runId); }
        if (loseReplies > 0) {
          loseReplies--; sdk.close();
          throw Error('Fixture discarded the real correlated decision-wake reply.');
        }
        return reply;
      }
      const wake = sdk.wakeOperation.bind(sdk), adopt = sdk.adoptDecision.bind(sdk);
      sdk.wakeOperation = async event => {
        wakes.push(structuredClone(event)); return received(await wake(event));
      };
      sdk.adoptDecision = async (event, adoption) => {
        adoptions.push(structuredClone({ event, adoption })); return received(await adopt(event, adoption));
      };
      clients.push(sdk); return sdk;
    };
  }
  return { factory, loseNextReply: () => { loseReplies = 1; }, afterOutcome: () => { awaitOutcome = true; },
    latest: () => clients.at(-1)!,
    read: () => structuredClone({ actions, results, messages, statuses, wakes, adoptions, replies }),
    close: () => { for (const client of clients) client.close(); },
  };
}
