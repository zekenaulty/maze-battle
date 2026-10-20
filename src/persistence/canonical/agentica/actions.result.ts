import type { AgenticaResult } from '../../../services/agentica/contracts';
import type { CanonicalWork } from '../transaction';
import type { CanonicalHead, CanonicalRequest } from '../types';
import { check, isObject } from '../validation';
import { assertPublicationCurrent } from './publication';
import { loadOriginalAction } from './actions.original';
import { equal, snapshotJson, snapshotPrepared, snapshotReference } from './validation';
import { readSource, snapshotRequest, source, writeSource } from './validation.source';
import { validateResult } from './validation.result';
import type { ActionResult, PreparedAction, ProtocolRead, ProtocolRef, ProtocolWrite } from './types';
import { MAX_RESULT_BYTES } from './types';
import { questQueryProof, validateQuestResult, type QuestQueryProof } from './quest.proof';
import { gameCheckpoint } from '../game/checkpoint';
import { validateObjectiveResult, type ObjectiveProof } from './objective.proof';
import { snapshotPreparedObjective } from './objective.prepare';

/** Missing result references throw. Only discovery of an as-yet-unwritten result may return null. */
export async function readActionResultSource(pages: ProtocolRead, identity: PreparedAction, ref: ProtocolRef): Promise<ActionResult> {
  identity = snapshotPrepared(identity); ref = snapshotReference(ref);
  const pending = await loadOriginalAction(pages, identity); check(pending, 'missing original action');
  check(ref.key === `${identity.storageKey}/result`, 'result reference belongs to another action');
  const stored = await readSource(pages, ref, 'agentica-result', 'proof original result', 'query objective') as ActionResult;
  const scope = stored.sourceRequest.expected, before = pending.original.sourceRequest.expected;
  check(equal(stored.original, pending.reference) && scope.generation === before.generation
    && scope.gameId === before.gameId && stored.owner === pending.original.owner
    && stored.epoch === pending.original.epoch && scope.revision >= before.revision, 'result original custody changed');
  const result = validateResult(stored.result, identity.action, pending.original.effect);
  check(result.afterRevision <= scope.revision + 1, 'result exceeds its commit revision');
  if (stored.proof === 'navigation' || stored.proof === 'interaction') check(isObject(stored.sourceRequest.input)
    && result.operation?.operationId === stored.sourceRequest.input.operationId && result.disposition === 'applied'
    && result.afterRevision === scope.revision + 1, 'navigation result operation binding changed');
  validateQuestResult(stored.query, identity.action, pending.original.publication, pending.reference, result,
    gameCheckpoint(pending.publication.snapshot.checkpoint).position.level);
  check(stored.query === undefined || stored.proof === 'standalone', 'quest query is not a standalone result');
  await validateObjectiveResult(pages, stored.objective, identity, pending, result);
  check(stored.objective === undefined || stored.proof === 'standalone', 'objective check is not a standalone result');
  return stored;
}
export async function readActionResult(pages: ProtocolRead, identity: PreparedAction, ref: ProtocolRef): Promise<AgenticaResult> {
  return (await readActionResultSource(pages, identity, ref)).result;
}

/** Shared validation for standalone storage and navigation's guarded append-only writer. */
export async function actionResultWrite(pages: ProtocolRead, head: CanonicalHead, request: CanonicalRequest,
  identity: PreparedAction, input: AgenticaResult, proof: ActionResult['proof'] = 'standalone', query?: QuestQueryProof, objective?: ObjectiveProof):
  Promise<{ key: string; value: ActionResult } | { existing: ProtocolRef }> {
  identity = snapshotPrepared(identity); input = snapshotJson(input, MAX_RESULT_BYTES);
  head = snapshotJson(head); request = snapshotRequest(request);
  query = query === undefined ? undefined : questQueryProof(query);
  objective = objective === undefined ? undefined : snapshotPreparedObjective(objective, identity, head);
  check(proof === 'standalone' || proof === 'navigation' || proof === 'interaction', 'invalid action proof format');
  const pending = await loadOriginalAction(pages, identity); check(pending, 'missing original action');
  const result = validateResult(input, identity.action, pending.original.effect), key = `${identity.storageKey}/result`;
  query = validateQuestResult(query, identity.action, pending.original.publication, pending.reference, result,
    gameCheckpoint(pending.publication.snapshot.checkpoint).position.level);
  check(query === undefined || proof === 'standalone', 'quest query is not a standalone result');
  objective = await validateObjectiveResult(pages, objective, identity, pending, result);
  check(objective === undefined || proof === 'standalone', 'objective check is not a standalone result');
  const previous = await pages.get('execution', key);
  if (previous) {
    const ref = { key, id: previous.id };
    const stored = await readActionResultSource(pages, identity, ref);
    check(equal(stored.result, result) && equal(stored.query ?? null, query ?? null)
      && equal(stored.objective ?? null, objective ?? null), 'original result changed');
    return { existing: ref };
  }
  const anchor = source({ head }, request, 'agentica-result');
  check(anchor.owner === pending.original.owner && anchor.epoch === pending.original.epoch, 'result needs original action custody');
  if (result.disposition === 'applied' || result.disposition === 'refused') assertPublicationCurrent(pending.publication, head);
  check(result.afterRevision <= head.revision + 1, 'result exceeds its commit revision');
  return { key, value: { ...anchor, kind: 'agentica-result', proof, original: pending.reference, result,
    ...(query ? { query } : {}), ...(objective ? { objective } : {}) } };
}

/** Grant/deadline/domain proof remain caller-owned; an existing result never grants another effect. */
export async function retainActionResult(tx: CanonicalWork, request: CanonicalRequest, identity: PreparedAction,
  input: AgenticaResult, query?: QuestQueryProof, objective?: ObjectiveProof): Promise<ProtocolWrite> {
  const write = await actionResultWrite(tx.pages, tx.head, request, identity, input, 'standalone', query, objective);
  return 'existing' in write ? { reference: write.existing, receipt: { reference: { ...write.existing } } }
    : writeSource(tx, write.key, write.value);
}
