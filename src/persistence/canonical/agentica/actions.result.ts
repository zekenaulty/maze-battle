import type { AgenticaResult } from '../../../services/agentica/contracts';
import type { CanonicalWork } from '../transaction';
import type { CanonicalHead, CanonicalRequest } from '../types';
import { check, isObject } from '../validation';
import { assertPublicationCurrent } from './publication';
import { loadOriginalAction } from './actions.original';
import { equal } from './validation';
import { readSource, source, writeSource } from './validation.source';
import { validateResult } from './validation.result';
import type { ActionResult, PreparedAction, ProtocolRead, ProtocolRef, ProtocolWrite } from './types';

/** Missing result references throw. Only discovery of an as-yet-unwritten result may return null. */
export async function readActionResult(pages: ProtocolRead, identity: PreparedAction, ref: ProtocolRef): Promise<AgenticaResult> {
  const pending = await loadOriginalAction(pages, identity); check(pending, 'missing original action');
  check(ref.key === `${identity.storageKey}/result`, 'result reference belongs to another action');
  const stored = await readSource(pages, ref, 'agentica-result', 'proof original result') as ActionResult;
  const scope = stored.sourceRequest.expected, before = pending.original.sourceRequest.expected;
  check(equal(stored.original, pending.reference) && scope.generation === before.generation
    && scope.gameId === before.gameId && stored.owner === pending.original.owner
    && stored.epoch === pending.original.epoch && scope.revision >= before.revision, 'result original custody changed');
  const result = validateResult(stored.result, identity.action, pending.original.effect);
  check(result.afterRevision <= scope.revision + 1, 'result exceeds its commit revision');
  if (stored.proof === 'navigation') check(isObject(stored.sourceRequest.input)
    && result.operation?.operationId === stored.sourceRequest.input.operationId && result.disposition === 'applied'
    && result.afterRevision === scope.revision + 1, 'navigation result operation binding changed');
  return result;
}

/** Shared validation for standalone storage and navigation's guarded append-only writer. */
export async function actionResultWrite(pages: ProtocolRead, head: CanonicalHead, request: CanonicalRequest,
  identity: PreparedAction, input: AgenticaResult, proof: ActionResult['proof'] = 'standalone'):
  Promise<{ key: string; value: ActionResult } | { existing: ProtocolRef }> {
  const pending = await loadOriginalAction(pages, identity); check(pending, 'missing original action');
  const result = validateResult(input, identity.action, pending.original.effect), key = `${identity.storageKey}/result`;
  const previous = await pages.get('execution', key);
  if (previous) {
    const ref = { key, id: previous.id };
    check(equal(await readActionResult(pages, identity, ref), result), 'original result changed');
    return { existing: ref };
  }
  const anchor = source({ head }, request, 'agentica-result');
  check(anchor.owner === pending.original.owner && anchor.epoch === pending.original.epoch, 'result needs original action custody');
  if (result.disposition === 'applied' || result.disposition === 'refused') assertPublicationCurrent(pending.publication, head);
  check(result.afterRevision <= head.revision + 1, 'result exceeds its commit revision');
  return { key, value: { ...anchor, kind: 'agentica-result', proof, original: pending.reference, result } };
}

/** Grant/deadline/domain proof remain caller-owned; an existing result never grants another effect. */
export async function retainActionResult(tx: CanonicalWork, request: CanonicalRequest, identity: PreparedAction,
  input: AgenticaResult): Promise<ProtocolWrite> {
  const write = await actionResultWrite(tx.pages, tx.head, request, identity, input);
  return 'existing' in write ? { reference: write.existing, receipt: { reference: { ...write.existing } } }
    : writeSource(tx, write.key, write.value);
}
