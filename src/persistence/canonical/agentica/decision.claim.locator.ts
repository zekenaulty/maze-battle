import { canonicalJson } from '../../../services/agentica/sdk/agentica-host.mjs';
import type { CanonicalRecord } from '../types';
import { check, validId } from '../validation';
import type { OperationBinding } from './operation.types';
import { captureOperationBinding } from './operation.binding';
import type { ProtocolRef } from './types';
import { snapshotReference } from './validation';

export const claimedParentWitness = (row: CanonicalRecord) => ({ key: row.key, id: row.id, recordWitness: canonicalJson(row) });

export const claimedParentKey = (launchId: string) => {
  check(validId(launchId), 'invalid claimed parent root');
  return `agentica/claimed-parents/${launchId}`;
};
export function claimedParentValue(launchId: string, sourceAttemptId: string, original: ProtocolRef, binding: OperationBinding) {
  claimedParentKey(launchId); check(validId(sourceAttemptId), 'invalid claimed parent source');
  return { schema: 1, kind: 'agentica-claimed-parent', launchId, sourceAttemptId,
    original: snapshotReference(original), binding: captureOperationBinding(binding) };
}
