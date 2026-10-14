import { BrowserSaveLock } from '../../src/services/game/BrowserSaveLock';
import { GameSession } from '../../src/services/game/GameSession';
import { controlCanonical } from '../../src/persistence/canonical/transaction';
import { readCanonical } from '../../src/persistence/canonical/read';
import { admit, command, current, dump, failure, fullNormalQuota } from './custody-recovery.support';

const view = (s: GameSession) => ({ controlled: s.view.controlled, recoveryRequired: s.view.recoveryRequired, busy: s.view.busy });

/** Verify both the kernel opt-in and the actual explicit TakeControl path at normal quota exhaustion. */
export async function hostCleanup(explicitControl = false) {
  const original = new GameSession(() => {}), replacement = new GameSession(() => {});
  const lock = new BrowserSaveLock(() => {});
  try {
    await original.start(); const ids = await admit(16); await fullNormalQuota();
    const ready = await current();
    await controlCanonical(command(ready, 'control.stop', { owner: ready.owner }), 'stop'); original.stop();
    const stopped = await current(), before = await dump();
    const automatic = await failure(() => replacement.start()); await replacement.flush();
    const automaticUnchanged = before.content === (await dump()).content, failedView = view(replacement);
    const request = command(stopped, 'control.claim', { owner: replacement.owner, recovery: true });
    const deadLifetime = await failure(() => controlCanonical(request, 'claim', { signal: original.hostSignal }));
    const abortedUnchanged = before.content === (await dump()).content;
    let resumeFailure: string | null = null;
    if (explicitControl) resumeFailure = await failure(() => replacement.takeControl());
    else {
      if (!await lock.acquire(false)) throw Error('Fixture recovery presence lock unavailable');
      try { await controlCanonical(request, 'claim', { signal: replacement.hostSignal }); } finally { lock.release(); }
    }
    const claimed = await current(); let replays = true;
    for (const operationId of ids) {
      const target = { generation: claimed.generation, gameId: claimed.gameId, operationId };
      const cancel = await replacement.cleanupHostOperation({ kind: 'cancel', target });
      const replay = await replacement.cleanupHostOperation({ kind: 'retry', request: cancel.request });
      replays &&= JSON.stringify(cancel.receipt) === JSON.stringify(replay.receipt);
      await replacement.cleanupHostOperation({ kind: 'acknowledge', target, terminalAttemptId: cancel.receipt.attemptId });
    }
    const final = await current(), finalView = view(replacement), operations = (await readCanonical(async pages => {
      const values = []; for (const id of ids) values.push((await pages.liveOperation(id))?.state); return values;
    })).value;
    const gameplay = await failure(() => replacement.execute('settings', { kind: 'throttle', ms: 100 }));
    replacement.stop();
    const deadCleanup = await failure(() => replacement.cleanupHostOperation({ kind: 'cancel', target: {
      generation: claimed.generation, gameId: claimed.gameId, operationId: ids[0],
    } }));
    return { automatic, automaticUnchanged, failedView, deadLifetime, abortedUnchanged, resumeFailure, sameOwner: claimed.owner === replacement.owner,
      claimed, replays, final, finalView, operations, gameplay, deadCleanup, accounted: (await dump()).bytes === final.quota.usedBytes };
  } finally { original.stop(); replacement.stop(); lock.release(); }
}
