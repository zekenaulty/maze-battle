import { check } from '../validation';
import { loadDecisionIntent } from './decision.records';
import { loadOperationBinding } from './operation.binding';
import type { OperationRead } from './operation.types';
import { readRunGrantCertificate } from './run-grant.certificate';
import type { SuccessorGrant } from './run-grant.types';
import type { ProtocolRef } from './types';
import { equal, restoreRetainedAction, snapshotJson, snapshotReference } from './validation';

export const MAX_DECISION_READS = 128;
export const MAX_DECISION_LOOKUPS = 1024;
export const MAX_DECISION_READ_BYTES = 1024 * 1024;
export class DecisionQueryRefusal extends Error {}

/** One transaction only: share repeated custody reads without persisting or refreshing any evidence. */
export function decisionPages(input: OperationRead) {
  const usage = { lookups: 0, reads: 0, bytes: 0 }, cache = new Map<string, unknown>();
  async function read<T>(key: string, work: () => Promise<T>): Promise<T> {
    if (++usage.lookups > MAX_DECISION_LOOKUPS) throw new DecisionQueryRefusal('Historical decision lookup budget exhausted.');
    if (cache.has(key)) return structuredClone(cache.get(key)) as T;
    if (++usage.reads > MAX_DECISION_READS) throw new DecisionQueryRefusal('Historical decision read budget exhausted.');
    const value = await work();
    usage.bytes += new TextEncoder().encode(JSON.stringify(value) ?? 'null').length;
    if (usage.bytes > MAX_DECISION_READ_BYTES) throw new DecisionQueryRefusal('Historical decision byte budget exhausted.');
    cache.set(key, structuredClone(value));
    return structuredClone(value);
  }
  const pages: OperationRead = {
    get: (area, key) => { check(area === 'execution', 'decision query forbids domain reads'); return read(`record:${key}`, () => input.get(area, key)); },
    sourceReceipt: id => read(`receipt:${id}`, () => input.sourceReceipt(id)),
    savedSnapshot: key => read(`snapshot:${key}`, () => input.savedSnapshot(key)),
    liveOperation: id => read(`operation:${id}`, () => input.liveOperation(id)),
  };
  return { pages, usage };
}

/** The caller authenticates the live grant first. Only its immediate predecessor is followed. */
export async function readPreviousDecision(pages: OperationRead, input: ProtocolRef) {
  const ref = snapshotReference(input), current = await readRunGrantCertificate(pages, ref);
  if (current.record.value.kind === 'agentica-launch-grant') return null;
  const grant = snapshotJson(current.record.value.data) as SuccessorGrant;
  const prior = await readRunGrantCertificate(pages, grant.binding.grant);
  check(prior.launch.binding.launchId === current.launch.binding.launchId, 'decision predecessor launch changed');
  const identity = await restoreRetainedAction(pages, grant.original, grant.binding);
  // Supplying the certificate prevents recursively loading earlier successor grants.
  const bound = await loadOperationBinding(pages, identity, grant.binding, prior);
  check(equal(bound.original.reference, grant.original) && equal(bound.original.resultReference, grant.result),
    'decision predecessor admission changed');
  const intent = await loadDecisionIntent(pages, identity, bound);
  check(intent && equal(intent.reference, grant.intent) && equal(intent.data.publication, grant.publication),
    'decision predecessor intent changed');
  return intent;
}
