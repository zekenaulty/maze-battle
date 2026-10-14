import * as navigation from '../../src/persistence/canonical/navigation/commands';
import type { NavigationCommit } from '../../src/persistence/canonical/navigation/host';
import type { AgenticaAction, AgenticaResult } from '../../src/services/agentica/contracts';
import type { WorldPosition } from '../../src/persistence/canonical/world/types';
import { json } from '../../src/persistence/canonical/world/records';
import { loadWorldRoom } from '../../src/persistence/canonical/world/residency';
import * as roster from './canonical-roster-fixture';
import * as content from './canonical-content-fixture';
import * as knowledge from './canonical-knowledge-fixture';

export { navigation, json };
export async function seed() {
  const c = window.agenticaRecords;
  await roster.seed(); await content.prepare();
  const room = (await c.readCanonical(p => loadWorldRoom(p, 1, 'entry'))).value, link = room.connections[0], forward = link.from.spaceId === 'entry';
  const start = { level: 1, cell: forward ? link.from : link.to }, target = { level: 1, cell: forward ? link.to : link.from };
  await content.place(start); await knowledge.act({ kind: 'look' });
  const head = (await c.readCanonicalHead()).head, publication = await c.publish();
  const action: AgenticaAction = { ...c.protocolAction(head.revision), capabilityId: 'maze.navigate', arguments: { target } };
  const pending = await c.pending(action, publication.reference, 'writesLocalState');
  return { head, start, target, publication, action, pending };
}
export function result(action: AgenticaAction, view: NavigationCommit): AgenticaResult {
  const revision = view.head.revision + 1;
  return { actionId: action.actionId, sessionId: action.sessionId, sessionEpoch: action.sessionEpoch, disposition: 'applied',
    beforeRevision: action.expectedRevision, afterRevision: revision, evidenceId: view.request.attemptId, summary: 'Destination retained.',
    observation: { observationId: view.request.attemptId, revision, observedAt: view.checkpoint.updatedAt,
      data: { position: view.checkpoint.position, knowledge: view.checkpoint.knowledge } },
    operation: { operationId: view.operation.id, summary: 'Destination retained; arrival is separate.' } };
}
export async function host(action: AgenticaAction) {
  return window.agenticaRecords.navigationActionHooks(await window.agenticaRecords.prepareAction(action), view => result(action, view));
}
export async function admission(target: WorldPosition, id = 'trip') {
  const c = window.agenticaRecords;
  return c.command((await c.readCanonicalHead()).head, 'operation.admit', { operationId: id,
    binding: json(navigation.createDestinationBinding(target)), terminalBytes: c.MIN_TERMINAL_BYTES, ackPolicy: 'verified-host' });
}
export async function advance(id = 'trip') {
  const c = window.agenticaRecords, state = await navigation.readDestination(id);
  return c.command(state.head, 'navigation.advance', { operationId: id, sequence: state.value.progress.sequence });
}
