import { canonicalJson } from '../../../services/agentica/sdk/agentica-host.mjs';
import { fields } from '../roster/codec';
import { canonicalFence, type CanonicalWork } from '../transaction';
import type { CanonicalRequest, JsonObject } from '../types';
import { check, jsonBytes, request as validateRequest, sameFence } from '../validation';
import { equal, snapshotJson, snapshotReference } from './validation';
import type { ProtocolRef } from './types';
import type { LaunchGrantContext, LaunchRead, LaunchRecord, LoadedLaunchRecord } from './launch.types';

export function launchPages(tx: Pick<LaunchGrantContext, 'pages' | 'liveOperation'>): LaunchRead {
  return { get: tx.pages.get.bind(tx.pages), savedSnapshot: tx.pages.savedSnapshot.bind(tx.pages),
    sourceReceipt: tx.pages.sourceReceipt.bind(tx.pages), liveOperation: tx.liveOperation };
}

export async function loadLaunchRecord<T>(pages: LaunchRead, key: string, kind: string, ref?: ProtocolRef): Promise<LoadedLaunchRecord<T> | null> {
  ref = ref && snapshotReference(ref);
  const row = await pages.get('execution', key);
  if (!row) { check(!ref, 'missing referenced launch record'); return null; }
  const value = fields(row.value, 'schema kind launchId sourceAttemptId data');
  check(row.indexes.length === 0 && value.schema === 1 && value.kind === kind && (!ref || ref.key === key && ref.id === row.id), 'launch record reference changed');
  const { receipt, source } = await pages.sourceReceipt(value.sourceAttemptId as string);
  jsonBytes(receipt.result, 12 * 1024);
  const proof = fields(receipt.result, 'launchRecords');
  check(Array.isArray(proof.launchRecords) && proof.launchRecords.length > 0 && proof.launchRecords.length <= 3, 'invalid launch record proof');
  const matches = proof.launchRecords.filter(p => p && typeof p === 'object' && !Array.isArray(p) && p.key === key);
  check(matches.length === 1 && equal(matches[0], { key, id: row.id, witness: canonicalJson(row) })
    && receipt.afterRevision === row.revision, 'launch record source changed');
  return { ref: { key, id: row.id }, row, value: structuredClone(value) as unknown as LaunchRecord<T>, source };
}

export function launchWriter(tx: CanonicalWork, input: CanonicalRequest) {
  const request = validateRequest(input), head = snapshotJson(tx.head), proofs: JsonObject[] = [];
  check(sameFence(request.expected, canonicalFence(head)) && head.status === 'ready', 'launch writer custody changed');
  return {
    async put<T>(key: string, kind: string, launchId: string, data: T, replace = false): Promise<ProtocolRef> {
      const value = snapshotJson({ schema: 1, kind, launchId, sourceAttemptId: request.attemptId, data });
      check(proofs.length < 3, 'launch record write bound');
      if (!replace) check(!await tx.pages.get('execution', key), 'launch record is immutable');
      const row = await tx.pages.set('execution', key, value as unknown as JsonObject), ref = { key, id: row.id };
      proofs.push({ ...ref, witness: canonicalJson(row) }); return ref;
    },
    receipt(): JsonObject { const value = { launchRecords: proofs }; jsonBytes(value, 12 * 1024); return structuredClone(value); },
  };
}
