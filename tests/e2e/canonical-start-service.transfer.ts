import type { GameSession } from '../../src/services/game/GameSession';
import type { AgenticaAction } from '../../src/services/agentica/contracts';
import type { ActionBinding } from '../../src/services/agentica/game/actionContract';
import { AgenticaHost } from '../../src/services/agentica/sdk/agentica-host.mjs';
import { createGameOperationDriver } from '../../src/services/agentica/game/operationDriver';
import { createGameOperationTransfer } from '../../src/services/agentica/game/operationTransfer';
import { prepareAction, readAction } from '../../src/persistence/canonical/agentica/actions';
import { readLaunch } from '../../src/persistence/canonical/agentica/launch';
import { launchAcknowledgement } from '../../src/persistence/canonical/agentica/launch.ack';
import { readAgenticaOperation } from '../../src/persistence/canonical/agentica/operation';
import { loadOperationConfirmation } from '../../src/persistence/canonical/agentica/operation.confirmation';
import { retainPublication } from '../../src/persistence/canonical/agentica/publication';
import { loadTransfer, loadTransferAck, loadTransferAuthority, transferStageKey } from '../../src/persistence/canonical/agentica/transfer.records';
import { loadTransferAdoptions } from '../../src/persistence/canonical/agentica/transfer.adoption';
import type { ProtocolRef } from '../../src/persistence/canonical/agentica/types';
import { readCanonical } from '../../src/persistence/canonical/read';
import { executeCanonical } from '../../src/persistence/canonical/transaction';

/** After reload: HTTP-only attachment to the original action, never a new SDK start/connect. */
export async function attachServiceTransfer(session: GameSession, action: AgenticaAction, binding: ActionBinding) {
  const identity = await prepareAction(action);
  const forbidden = async () => { throw Error('Transfer cannot invoke actions or cognition.'); };
  const sdk = new AgenticaHost({ url: 'ws://127.0.0.1:5259/api/host', onAction: forbidden, loadAction: forbidden, saveAction: forbidden });
  const driver = await createGameOperationDriver(session, sdk, action, binding);
  const transfer = await createGameOperationTransfer(session, sdk, action, binding);
  async function read() {
    const operation = await readAgenticaOperation(identity), launch = (await readLaunch()).value!;
    const records = await readCanonical(async pages => {
      const original = await readAction(pages, identity), confirmed = await loadOperationConfirmation(pages, identity);
      if (!confirmed) throw Error('Original service confirmation required before takeover.');
      const intent = await loadTransfer(pages, identity, confirmed);
      const ack = intent && await loadTransferAck(pages, identity, confirmed, intent);
      const key = intent && transferStageKey(intent.reference, 'authority'), row = key ? await pages.get('execution', key) : null;
      const authority = row ? await loadTransferAuthority(pages, identity, confirmed, { key: row.key, id: row.id }) : null;
      const adoptions = authority ? await loadTransferAdoptions(pages, confirmed, intent!, ack!.row.revision) : null;
      return { original, intent, ack, authority, adoptions };
    });
    return { ...operation, launch, records: records.value };
  }
  return {
    read,
    async prepare() {
      const receipt = await session.submitHostCommand({ kind: 'fresh', operation: 'agentica.publish', input: {},
        execute: (request, options) => executeCanonical(request, async tx => (await retainPublication(tx, request)).receipt, options) });
      const publication = (receipt.result as unknown as { reference: ProtocolRef }).reference;
      return { publication, intent: await transfer.prepare(publication) };
    },
    pulse: () => transfer.pulse(), advance: () => driver.pulse(), cancel: () => driver.cancel(),
    async remote() {
      const entries = await sdk.listOperations({ hostId: 'maze-battle', sessionId: action.sessionId });
      const matches = entries.filter(entry => entry.action.actionId === action.actionId && entry.action.runId === action.runId);
      if (matches.length !== 1) throw Error('Expected exact original service operation.');
      return matches[0];
    },
    async stopStart() {
      const launch = (await readLaunch()).value!;
      if (launch.guard.terminal?.disposition !== 'cancelled') throw Error('Stop local authority first.');
      const key = { hostId: launch.binding.start.hostId, sessionId: action.sessionId, attemptId: launch.dispatch!.source.attemptId };
      const original = await sdk.getStart(key);
      const remote = await sdk.stopStart({ ...key, runId: original.runId, acceptedRequestHash: original.acceptedRequestHash });
      if (!remote.terminal) return { settled: false, remote };
      const proof = launchAcknowledgement(launch.binding.launchId, remote);
      await session.cleanupHostOperation({ kind: 'verified-ack', ...await proof.prepare(), verify: proof.verify }, session.hostSignal);
      return { settled: true, remote };
    },
    close() { transfer.close(); driver.close(); sdk.close(); },
  };
}
