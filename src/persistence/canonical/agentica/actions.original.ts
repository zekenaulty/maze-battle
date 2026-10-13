import { check } from '../validation';
import { readPublication } from './publication';
import { equal, reference, validateAction, validatePrepared } from './validation';
import { readSource } from './validation.source';
import type { PendingAction, PreparedAction, ProtocolRead } from './types';

export async function loadOriginalAction(pages: ProtocolRead, identity: PreparedAction) {
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
    && pending.sourceRequest.expected.generation === publication.snapshot.generation && pending.sourceRequest.expected.gameId === publication.snapshot.gameId
    && pending.sourceRequest.expected.revision >= publication.snapshot.revision, 'action publication binding changed');
  return { reference: ref, original: pending, publication };
}
