import type { AgenticaActionRecord } from '../../../services/agentica/contracts';
import type { CanonicalWork } from '../transaction';
import type { CanonicalRequest } from '../types';
import { check } from '../validation';
import { assertPublicationCurrent, readPublication } from './publication';
import { equal, snapshotJson, snapshotPrepared, snapshotReference } from './validation';
import { snapshotRequest, source, writeSource } from './validation.source';
import { loadOriginalAction as original } from './actions.original';
import { readActionResult } from './actions.result';
import type { PendingAction, PreparedAction, ProtocolRead, ProtocolRef, ProtocolWrite, RetainedAction } from './types';

export { prepareAction } from './validation';
export { readActionResult, retainActionResult } from './actions.result';
export { navigationActionHooks } from './actions.navigation';

/** Duplicate originals precede present custody checks. Caller binds its exact request before opening the transaction. */
export async function retainPendingAction(tx: CanonicalWork, request: CanonicalRequest, identity: PreparedAction,
  publicationRef: ProtocolRef, effect: PendingAction['effect']): Promise<ProtocolWrite> {
  identity = snapshotPrepared(identity); publicationRef = snapshotReference(publicationRef); request = snapshotRequest(request);
  const head = snapshotJson(tx.head), previous = await readAction(tx.pages, identity);
  if (previous) {
    check(equal(previous.original.publication, publicationRef) && previous.original.effect === effect, 'original action binding changed');
    return { reference: previous.reference, receipt: { reference: { ...previous.reference } } };
  }
  const anchor = source({ head }, request, 'agentica-action'), publication = await readPublication(tx.pages, publicationRef);
  assertPublicationCurrent(publication, head);
  check(identity.action.expectedRevision === publication.wireRevision && identity.action.sessionEpoch === String(publication.epoch), 'action publication identity changed');
  check(effect === 'readOnly' || effect === 'writesLocalState', 'invalid action effect');
  const pending: PendingAction = { ...anchor, kind: 'agentica-action', key: identity.key, fingerprint: identity.fingerprint, action: structuredClone(identity.action),
    publication: structuredClone(publicationRef), effect };
  return writeSource(tx, identity.storageKey, pending);
}

export async function readAction(pages: ProtocolRead, identity: PreparedAction): Promise<RetainedAction | null> {
  identity = snapshotPrepared(identity);
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
