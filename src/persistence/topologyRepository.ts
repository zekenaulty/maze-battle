import { createTopology, expandTopology } from '../domain/expedition/topology/generation';
import type { TopologyRecipe } from '../domain/expedition/topology/types';
import { stageDelta } from './topology/commit';
import { topologyTransaction, type TopologyTransaction } from './topology/database';
import { loadFrontier } from './topology/reader';
import { DEFAULT_TOPOLOGY_QUOTA, type ExpansionReceipt, type ExpansionRequest, type ExpansionResult, type TopologyRoot } from './topology/types';
import { recipeCopy, recipeScope, validId, validQuota, validRequest, validRoot, validSocket, validSpace } from './topology/validation';

export type { ExpansionReceipt, ExpansionRequest, ExpansionResult, TopologyRoot, TopologySpacePage } from './topology/types';
export { DEFAULT_TOPOLOGY_QUOTA, MAX_TOPOLOGY_QUOTA, TOPOLOGY_DATABASE } from './topology/types';
export { topologyTransaction, type TopologyTransaction } from './topology/database';

async function rootAt(tx: TopologyTransaction, slot: string) {
  const root = await tx.get('roots', slot);
  if (root !== undefined) validRoot(root);
  return root;
}
function checkReceipt(receipt: ExpansionReceipt, requestId: string, root: TopologyRoot) {
  validRequest(receipt.request);
  validRoot({ ...root, header: receipt.header });
  if (receipt.request.requestId !== requestId || receipt.request.scopeId !== root.header.scopeId
    || receipt.header.scopeId !== root.header.scopeId || receipt.header.revision > root.header.revision
    || (receipt.status === 'committed' ? receipt.header.revision !== receipt.request.expectedRevision + 1
      || !receipt.delta || receipt.delta.requestId !== requestId || receipt.delta.scopeId !== receipt.request.scopeId
      || receipt.delta.expectedRevision !== receipt.request.expectedRevision || JSON.stringify(receipt.delta.header) !== JSON.stringify(receipt.header)
      : receipt.status !== 'sealed' || !receipt.header.seal || receipt.delta !== undefined || receipt.header.revision !== receipt.request.expectedRevision)) {
    throw new Error('Invalid expansion receipt');
  }
}

/** Creates only. Exact recipe/quota retries return the current header; never resets a slot. */
export async function createTopologySlot(slot: string, recipe: TopologyRecipe, quotaBytes = DEFAULT_TOPOLOGY_QUOTA): Promise<TopologyRoot> {
  validId(slot); validQuota(quotaBytes);
  const snapshot = recipeCopy(recipe);
  return topologyTransaction(async tx => {
    const existing = await rootAt(tx, slot);
    if (existing !== undefined) {
      if (existing.header.scopeId !== recipeScope(snapshot) || existing.quotaBytes !== quotaBytes) throw new Error('Topology slot identity or quota conflict');
      return existing;
    }
    const delta = createTopology(snapshot);
    await stageDelta(tx, slot, delta);
    return tx.stageRoot(slot, { header: delta.header, quotaBytes, serializedBytes: 0 });
  });
}

/** Returned snapshots are caller-owned. No geometry is materialized or cached. */
export async function loadTopologyHeader(slot: string) {
  validId(slot);
  return topologyTransaction(tx => rootAt(tx, slot));
}
export async function loadTopologySpace(slot: string, spaceId: string) {
  validId(slot); validId(spaceId);
  return topologyTransaction(async tx => {
    if (await rootAt(tx, slot) === undefined) return undefined;
    const page = await tx.get('spaces', [slot, spaceId]);
    if (page !== undefined) validSpace(page, spaceId);
    return page;
  });
}
export async function loadTopologySocket(slot: string, sequence: number) {
  validId(slot);
  if (!Number.isSafeInteger(sequence) || sequence < 0) throw new Error('Invalid socket sequence');
  return topologyTransaction(async tx => {
    const root = await rootAt(tx, slot);
    if (root === undefined || sequence >= root.header.socketCount) return undefined;
    const socket = await tx.get('sockets', [slot, sequence]);
    if (socket === undefined) throw new Error('Missing topology socket');
    validSocket(socket, sequence);
    if (socket.status !== (sequence < root.header.nextSocket ? 'linked' : 'pending')) throw new Error('Inconsistent socket resolution');
    return socket;
  });
}
export async function loadTopologyExpansionReceipt(slot: string, requestId: string) {
  validId(slot); validId(requestId);
  return topologyTransaction(async tx => {
    const root = await rootAt(tx, slot);
    if (root === undefined) return undefined;
    const receipt = await tx.get('receipts', [slot, requestId]);
    if (receipt !== undefined) checkReceipt(receipt, requestId, root);
    return receipt;
  });
}

/**
 * Host generates and commits canonical next only; arbitrary deltas are not accepted.
 * An exact committed/sealed retry returns the ORIGINAL snapshot even after later
 * revisions. CAS conflicts/quota failures reserve no request ID and are retryable.
 * Receipts and unresolved sockets are never evicted. Quota is fixed at creation.
 */
export async function expandTopologyNext(slot: string, request: ExpansionRequest): Promise<ExpansionResult> {
  validId(slot); validRequest(request);
  const snapshot = { scopeId: request.scopeId, requestId: request.requestId, expectedRevision: request.expectedRevision };
  return topologyTransaction(async tx => {
    if ((await rootAt(tx, slot))?.streamVersion !== undefined) throw new Error('Gameplay-managed topology requires a stream command');
    return expandTopologyInTransaction(tx, slot, snapshot);
  });
}

/**
 * Composition point for a later bounded prepare command. No gameplay is performed
 * here. Its receipt is provisional until the caller's topologyTransaction resolves;
 * future checkpoint/knowledge/command writes must use that SAME transaction.
 */
export async function expandTopologyInTransaction(tx: TopologyTransaction, slot: string, request: ExpansionRequest): Promise<ExpansionResult> {
  validId(slot); validRequest(request);
  const snapshot = { scopeId: request.scopeId, requestId: request.requestId, expectedRevision: request.expectedRevision };
  const root = await rootAt(tx, slot);
  if (root === undefined) throw new Error('Missing topology slot');
  if (root.header.scopeId !== snapshot.scopeId) throw new Error('Topology scope conflict');
  const original = await tx.get('receipts', [slot, snapshot.requestId]);
  if (original !== undefined) {
    checkReceipt(original, snapshot.requestId, root);
    if (original.request.expectedRevision !== snapshot.expectedRevision) throw new Error('Conflicting expansion request ID reuse');
    return original;
  }
  if (root.header.revision !== snapshot.expectedRevision) return { status: 'conflict', revision: root.header.revision };
  let receipt: ExpansionReceipt;
  if (root.header.seal) {
    receipt = { request: snapshot, status: 'sealed', header: root.header };
  } else {
    const frontier = await loadFrontier(tx, slot, root.header);
    const proposal = expandTopology(frontier.reader, snapshot.expectedRevision, snapshot.requestId);
    if (proposal.status !== 'ready') throw new Error('Unexpected canonical expansion result');
    await stageDelta(tx, slot, proposal.delta, frontier);
    receipt = { request: snapshot, status: 'committed', header: proposal.delta.header, delta: proposal.delta };
  }
  await tx.put('receipts', [slot, snapshot.requestId], receipt);
  await tx.stageRoot(slot, { ...root, header: receipt.header });
  return receipt;
}
