import type { AgenticaActionRecord, AgenticaResult } from '../../../services/agentica/contracts';
import type { CanonicalWork } from '../transaction';
import type { CanonicalRequest } from '../types';
import { check } from '../validation';
import { assertPublicationCurrent, readPublication } from './publication';
import { equal, readSource, reference, source, validateAction, validatePrepared, writeSource } from './validation';
import { validateResult } from './validation.result';
import type { ActionResult, PendingAction, PreparedAction, ProtocolRead, ProtocolRef, ProtocolWrite, RetainedAction } from './types';

export { prepareAction } from './validation';

async function original(pages: ProtocolRead, identity: PreparedAction) {
  validatePrepared(identity);
  const row = await pages.get('execution', identity.storageKey);
  if (!row) return null;
  const ref = { key: identity.storageKey, id: row.id };
  const pending = await readSource(pages, ref, 'agentica-action', 'key fingerprint action publication effect') as PendingAction;
  check(pending.key === identity.key && pending.fingerprint === identity.fingerprint, 'action key collision or original input changed');
  check(equal(validateAction(pending.action), identity.action), 'original action input changed'); reference(pending.publication);
  check(pending.effect === 'readOnly' || pending.effect === 'writesLocalState', 'invalid action effect');
  const publication = await readPublication(pages, pending.publication);
  check(identity.action.expectedRevision === publication.wireRevision && identity.action.sessionEpoch === String(publication.epoch)
    && pending.owner === publication.owner && pending.epoch === publication.epoch
    && pending.snapshot.generation === publication.snapshot.generation && pending.snapshot.gameId === publication.snapshot.gameId
    && pending.snapshot.revision >= publication.snapshot.revision
    && equal(pending.snapshot.roots, publication.snapshot.roots) && equal(pending.snapshot.checkpoint, publication.snapshot.checkpoint), 'action publication binding changed');
  return { reference: ref, original: pending, publication };
}

/** Duplicate originals precede present custody checks. Caller binds its exact request before opening the transaction. */
export async function retainPendingAction(tx: CanonicalWork, request: CanonicalRequest, identity: PreparedAction,
  publicationRef: ProtocolRef, effect: PendingAction['effect']): Promise<ProtocolWrite> {
  const previous = await original(tx.pages, identity);
  if (previous) {
    check(equal(previous.original.publication, publicationRef) && previous.original.effect === effect, 'original action binding changed');
    return { reference: previous.reference, receipt: { reference: { ...previous.reference } } };
  }
  const anchor = source(tx, request, 'agentica-action'), publication = await readPublication(tx.pages, publicationRef);
  assertPublicationCurrent(publication, tx.head);
  check(identity.action.expectedRevision === publication.wireRevision && identity.action.sessionEpoch === String(publication.epoch), 'action publication identity changed');
  check(effect === 'readOnly' || effect === 'writesLocalState', 'invalid action effect');
  const pending: PendingAction = { ...anchor, kind: 'agentica-action', key: identity.key, fingerprint: identity.fingerprint, action: structuredClone(identity.action),
    publication: structuredClone(publicationRef), effect };
  return writeSource(tx, identity.storageKey, pending);
}

/** Missing result references throw. Only discovery of an as-yet-unwritten result may return null. */
export async function readActionResult(pages: ProtocolRead, identity: PreparedAction, ref: ProtocolRef): Promise<AgenticaResult> {
  const pending = await original(pages, identity); check(pending, 'missing original action');
  check(ref.key === `${identity.storageKey}/result`, 'result reference belongs to another action');
  const stored = await readSource(pages, ref, 'agentica-result', 'original result') as ActionResult;
  check(equal(stored.original, pending.reference) && stored.snapshot.generation === pending.original.snapshot.generation
    && stored.snapshot.gameId === pending.original.snapshot.gameId && stored.owner === pending.original.owner
    && stored.epoch === pending.original.epoch && stored.snapshot.revision >= pending.original.snapshot.revision, 'result original custody changed');
  const result = validateResult(stored.result, identity.action, pending.original.effect);
  check(result.afterRevision <= stored.snapshot.revision + 1, 'result exceeds its commit revision');
  return result;
}

/**
 * Store alongside navigation admission/effects; return receipt fields verbatim in that transaction.
 * Grant/deadline/domain proof remain caller-owned. Reconcile first; an existing result never grants another effect.
 */
export async function retainActionResult(tx: CanonicalWork, request: CanonicalRequest, identity: PreparedAction,
  input: AgenticaResult): Promise<ProtocolWrite> {
  const pending = await original(tx.pages, identity); check(pending, 'missing original action');
  const result = validateResult(input, identity.action, pending.original.effect), key = `${identity.storageKey}/result`;
  const previous = await tx.pages.get('execution', key);
  if (previous) {
    const ref = { key, id: previous.id };
    check(equal(await readActionResult(tx.pages, identity, ref), result), 'original result changed');
    return { reference: ref, receipt: { reference: { ...ref } } };
  }
  const anchor = source(tx, request, 'agentica-result');
  check(anchor.owner === pending.original.owner && anchor.epoch === pending.original.epoch, 'result needs original action custody');
  if (result.disposition === 'applied' || result.disposition === 'refused') assertPublicationCurrent(pending.publication, tx.head);
  check(result.afterRevision <= tx.head.revision + 1, 'result exceeds its commit revision');
  const stored: ActionResult = { ...anchor, kind: 'agentica-result', original: pending.reference, result };
  return writeSource(tx, key, stored);
}

export async function readAction(pages: ProtocolRead, identity: PreparedAction): Promise<RetainedAction | null> {
  const pending = await original(pages, identity); if (!pending) return null;
  const key = `${identity.storageKey}/result`, stored = await pages.get('execution', key);
  const resultReference = stored ? { key, id: stored.id } : null;
  const result = resultReference ? await readActionResult(pages, identity, resultReference) : null;
  return { ...pending, result, resultReference };
}
export async function reconcileAction(pages: ProtocolRead, identity: PreparedAction): Promise<AgenticaActionRecord | null> {
  const retained = await readAction(pages, identity);
  return retained ? { fingerprint: retained.original.fingerprint, status: retained.result ? 'completed' : 'pending',
    ...(retained.result ? { result: retained.result } : {}) } : null;
}
