import { prepareAction } from '../../src/persistence/canonical/agentica/actions';
import { loadDecisionIntent } from '../../src/persistence/canonical/agentica/decision.records';
import { loadDecisionClaim } from '../../src/persistence/canonical/agentica/decision.claim';
import { readAgenticaOperation } from '../../src/persistence/canonical/agentica/operation';
import { readAgenticaTerminal } from '../../src/persistence/canonical/agentica/terminal';
import { readCanonical } from '../../src/persistence/canonical/read';
import { DEFAULT_WORK_LIMITS, type CanonicalWorkStats } from '../../src/persistence/canonical/types';
import type { TransferSeed } from './canonical-operation-transfer.setup';

/** Separate default-budget transactions; counts are charged work, not wall time or deduplicated DB bytes. */
export async function decisionReadCosts(seed: TransferSeed) {
  const identity = await prepareAction(seed.action), reads: Record<string, CanonicalWorkStats> = {};
  reads.operation = (await readAgenticaOperation(identity)).stats;
  reads.terminal = (await readAgenticaTerminal(identity, seed.binding)).stats;
  reads.intent = (await readCanonical(p => loadDecisionIntent(p, identity))).stats;
  // Logical evidence lookups exclude index-page shape and immutable-record cache effects.
  const claimCalls = { records: 0, receipts: 0 };
  reads.claim = (await readCanonical(p => loadDecisionClaim({ ...p,
    get: (...args) => { claimCalls.records++; return p.get(...args); },
    sourceReceipt: id => { claimCalls.receipts++; return p.sourceReceipt(id); },
  }, identity))).stats;
  return { limits: { ...DEFAULT_WORK_LIMITS }, reads, claimCalls };
}
