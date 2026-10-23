import type { GameSession } from '../../src/services/game/GameSession';
import { createGameActionHooks } from '../../src/services/agentica/game/actionHooks';
import { readCanonicalHead } from '../../src/persistence/canonical/read';
import { openCanonicalDatabase } from '../../src/persistence/canonical/database';
import { dump } from './canonical-decision-ack.storage';
import type { Frame } from './canonical-corpus.navigation.host';
import { launchAcknowledgement } from '../../src/persistence/canonical/agentica/launch.ack';
import { readLaunch } from '../../src/persistence/canonical/agentica/launch';
import { operateCanonical } from '../../src/persistence/canonical/transaction';
import { launchEntryFixture, launchTerminalFixture } from '../../src/persistence/canonical/agentica/launch.test-support';

export async function replay(session: GameSession, frame: Frame) {
  return createGameActionHooks(session, frame.binding).onAction!(frame.action);
}

/** Deliberate corruption is outside the measured action. Restore exact bytes, never reseal a source. */
export async function corruptHistory(session: GameSession, frame: Frame, terminalAttemptId: string, kind: 'missing' | 'inconsistent') {
  const { head } = await readCanonicalHead(), db = await openCanonicalDatabase();
  const key: [string, string] = [head.gameId, terminalAttemptId], receipt = await db.get('receipts', key);
  if (!receipt) throw Error('Probe must target the actual retained terminal source receipt');
  const clean = await dump();
  try {
    if (kind === 'missing') await db.delete('receipts', key);
    else await db.put('receipts', { ...receipt, fingerprint: JSON.stringify({
      ...JSON.parse(receipt.fingerprint), operation: 'settings.command',
    }) }, key);
    const before = await dump();
    let error: string | null = null;
    try { await createGameActionHooks(session, frame.binding).onAction!(frame.action); }
    catch (cause) { error = String(cause); }
    return { kind, key, originalReceipt: receipt, error, unchanged: before === await dump() };
  } finally {
    await db.put('receipts', receipt, key); db.close();
    if (clean !== await dump()) throw Error('Fault probe did not restore the exact original database');
  }
}

export async function cleanup(session: GameSession) {
  const launch = (await readLaunch()).value!;
  await session.submitHostCommand({ kind: 'fresh', operation: 'operation.cancel',
    input: { operationId: launch.guard.id }, execute: (request, options) => operateCanonical(request, 'cancel', undefined, options) });
  const entry = launchEntryFixture(launch.binding.start, launch.dispatch!.source.attemptId,
    launch.run!.value.data.started.runId, launch.run!.value.data.started.manifestHash);
  const checked = launchAcknowledgement(launch.binding.launchId, launchTerminalFixture(entry));
  await session.cleanupHostOperation({ kind: 'verified-ack', ...await checked.prepare(), verify: checked.verify });
  return (await readCanonicalHead()).head;
}
