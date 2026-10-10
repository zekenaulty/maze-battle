import { topologyTransaction } from './topology/database';
import { validId, validPublicScopeId } from './topology/validation';
import { streamRecord } from './streamRecords';

/** No allocation or write. Never expose the internal seed-bearing scope/header. */
export async function getStreamPublicScope(slot: string): Promise<string | undefined> {
  validId(slot);
  return topologyTransaction(async tx => (await streamRecord(tx, slot)).root.publicScopeId);
}

/** One durable UUID per existing gameplay slot; quota failures publish nothing. */
export async function ensureStreamPublicScope(slot: string): Promise<string> {
  validId(slot);
  return topologyTransaction(async tx => {
    const { root } = await streamRecord(tx, slot);
    if (Object.hasOwn(root, 'publicScopeId')) return root.publicScopeId!;
    const publicScopeId = crypto.randomUUID();
    validPublicScopeId(publicScopeId);
    await tx.stageRoot(slot, { ...root, publicScopeId });
    return publicScopeId;
  });
}
