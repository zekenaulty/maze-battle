import { vi } from 'vitest';
import type { QuestStatus } from '../../../domain/types';
import { mazeCapabilities } from '../../../services/agentica/game/capabilities';
import { canonicalFence, type CanonicalWork } from '../transaction';
import type { CanonicalRequest, JsonObject } from '../types';
import { evidenceFixture } from './objective.evidence.test-support';
import { launchStartFixture } from './launch.test-support';
import { createLaunchBinding, launchGuardId, launchSessionId } from './launch.validation';
import { protocolAction, protocolHead } from './types.test-support';
import { prepareAction } from './validation';
import type { Publication } from './types';
import type { assertLaunchGrant } from './launch.grant';
import type { loadOriginalAction } from './actions.original';

/** Unit boundaries supply certified grant/publication reads; native cases exercise their real receipts. */
export async function objectiveFixture(owner: 'pack' | 'stash' | null = 'pack', status: QuestStatus = 'complete', away = false) {
  const f = await evidenceFixture(owner, status, away), head = { ...protocolHead(), ...f.snapshot() };
  const root = { key: 'agentica/publications/root', id: 'root-record' }, grant = { key: 'agentica/launch/grant', id: 'grant-record' };
  const binding = { publication: root, grant }, action = { ...protocolAction(head.revision),
    sessionId: launchSessionId(head.gameId, f.objective.launchId), arguments: { scope: 'objective' }, deadlineAt: '2099-01-01T00:00:00.000Z' };
  const identity = await prepareAction(action);
  const request = (operation: string, input: JsonObject, revision = head.revision): CanonicalRequest => ({
    operation, input, expected: { ...canonicalFence(head), revision }, attemptId: crypto.randomUUID(), deadlineAt: null,
  });
  const publication: Publication = { schema: 1, kind: 'agentica-publication', sourceAttemptId: 'root',
    sourceRequest: request('agentica.publish', { returnQuest: { launchId: f.objective.launchId,
      objectiveId: f.objective.objectiveId, questId: f.objective.quest.questId } }), owner: head.owner, epoch: head.epoch,
    observation: f.knowledge.checkpoint().knowledge, wireRevision: head.revision,
    snapshot: { generation: head.generation, gameId: head.gameId, revision: head.revision,
      roots: { world: head.roots.world, knowledge: head.roots.knowledge }, checkpoint: head.checkpoint }, objective: f.objective };
  publication.sourceRequest.attemptId = 'root';
  const start = { ...launchStartFixture(head.revision), sessionId: action.sessionId, scopeId: 'launch',
    objectiveId: f.objective.objectiveId, capabilities: mazeCapabilities() };
  const launch = createLaunchBinding({ launchId: f.objective.launchId, endpoint: 'ws://127.0.0.1:5266/offline-only', publication: root, start });
  const admission = request('operation.admit', { operationId: launchGuardId(f.objective.launchId),
    binding: launch, terminalBytes: 131072, ackPolicy: 'verified-host' }, head.revision + 1);
  admission.attemptId = 'admission';
  const sourceReceipt = vi.fn(async (id: string) => {
    if (id !== 'root' && id !== 'admission') throw Error('Missing source receipt');
    return { source: structuredClone(id === 'root' ? publication.sourceRequest : admission),
      receipt: { committedAt: '2026-10-20T00:00:00.000Z' } };
  });
  const tx = { head, pages: { ...f.pages, sourceReceipt }, liveOperation: vi.fn() } as unknown as CanonicalWork;
  const authorized = { publication, capability: mazeCapabilities().find(c => c.id === 'maze.inspect')!,
    objective: { publication: root, admissionAttemptId: 'admission', value: f.objective } } as Awaited<ReturnType<typeof assertLaunchGrant>>;
  const pending = { original: { sourceRequest: request('agentica.action.reserve', { action: identity.storageKey,
    publication: root, grant }, head.revision + 2), publication: root }, publication } as NonNullable<Awaited<ReturnType<typeof loadOriginalAction>>>;
  return { ...f, head, binding, identity, publication, admission, sourceReceipt, tx, authorized, pending };
}
