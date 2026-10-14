import type { CanonicalQuery } from './read';
import type { CanonicalWork } from './transaction';
import type { CanonicalRequest } from './types';
import { check, request } from './validation';

export type AcknowledgementRead = Pick<CanonicalQuery, 'get' | 'sourceReceipt' | 'savedSnapshot' | 'liveOperation'>;
export type AcknowledgementVerifier = (pages: AcknowledgementRead, original: CanonicalRequest) => Promise<void>;

/** Runtime read-only facade. No world access, writes, restoration, network or detached reads. */
export async function verifyAcknowledgement(tx: CanonicalWork, original: CanonicalRequest, verify: AcknowledgementVerifier) {
  let closed = false, pending = 0, failed = false;
  async function read<T>(work: () => Promise<T>) {
    pending++;
    try { check(!closed, 'acknowledgement view is closed'); return await work(); }
    catch (error) { failed = true; throw error; }
    finally { pending--; }
  }
  try {
    await verify({ get: (area, key) => read(() => { check(area === 'execution', 'acknowledgement cannot read hidden world'); return tx.pages.get(area, key); }),
      sourceReceipt: id => read(() => tx.pages.sourceReceipt(id)), savedSnapshot: key => read(() => tx.pages.savedSnapshot(key)),
      liveOperation: id => read(() => tx.liveOperation(id)) }, request(original));
    check(!failed && pending === 0, 'acknowledgement read is not usable');
  } finally { closed = true; }
}
