import { createRoot } from 'react-dom/client';
import { flushSync } from 'react-dom';
import { useGameCommands } from '../../src/hooks/useGameCommands';
import { GameSession } from '../../src/services/game/GameSession';
import { CanonicalAutoController } from '../../src/services/game/CanonicalAutoController';
import type { CanonicalReceipt, CanonicalRequest } from '../../src/persistence/canonical/types';
import { executeContentCommand } from '../../src/persistence/canonical/game/contentCommand';
import { executeAutoCommand } from '../../src/persistence/canonical/auto/command';
import { executeExplorationCommand } from '../../src/persistence/canonical/game/explorationCommand';

/** Mount the actual Manual command hook; the fixture supplies explicit owner intents. */
export function manualCommands(session: GameSession) {
  let commands!: ReturnType<typeof useGameCommands>;
  const node = document.createElement('div'); document.body.append(node);
  const root = createRoot(node), pause = () => {};
  function Commands() { commands = useGameCommands(session, pause); return null; }
  flushSync(() => root.render(<Commands />));
  return { commands, close() { root.unmount(); node.remove(); } };
}

/** The production scheduler selects one tick; pausing between ticks bounds the fixture. */
export function autoTick(session: GameSession): Promise<CanonicalReceipt> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { controller.dispose(); reject(Error('Auto tick exceeded 10 seconds')); }, 10_000);
    const controller = new CanonicalAutoController({ owner: session.owner, get view() { return session.view; },
      async execute(kind, input) {
        try { const receipt = await session.execute(kind, input); controller.dispose(); clearTimeout(timer); resolve(receipt); return receipt; }
        catch (error) { controller.dispose(); clearTimeout(timer); reject(error); throw error; }
      } });
    controller.update(false);
  });
}

/** Receipt fingerprint retains the entire original canonical request, including deadline/fence. */
export function replayCommand(session: GameSession, receipt: CanonicalReceipt) {
  const request = JSON.parse(receipt.fingerprint) as CanonicalRequest;
  if (request.attemptId !== receipt.attemptId) throw Error('Receipt does not identify its original request');
  const execute = request.operation === 'auto.command' ? executeAutoCommand
    : request.operation === 'content.command' ? executeContentCommand
      : request.operation === 'exploration.command' ? executeExplorationCommand : null;
  if (!execute) throw Error('Unsupported parity replay');
  return session.submitHostCommand({ kind: 'retry', request, execute });
}
