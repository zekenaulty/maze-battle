import * as repository from '../../src/persistence/directed';
import type { DirectedCommand, DirectedRequest } from '../../src/domain/directed/operationTypes';
import { transaction } from '../../src/persistence/directed/database';
import { setRecoveryGate, setupRecovery } from './directed-crossing-fixture';
import { fillDirectedReceiptCapacity } from './directed-history-fixture';
import { executeBehindDirectedLock, rawDirectedDatabase } from './directed-deadline-fixture';

const harness = {
  ...repository,
  // Existing static-time corpus shorthand stays test-only; production accepts clocks, never timestamps.
  executeDirectedRequest: (slot: string, request: DirectedRequest, clock?: number | (() => number)) =>
    repository.executeDirectedRequest(slot, request, typeof clock === 'number' ? () => clock : clock),
  // The pre-checkpoint corruption corpus deliberately qualifies legacy all-history reads.
  createDirectedSave: (slot: string, options: Parameters<typeof repository.createDirectedSave>[1] = {}) =>
    repository.createDirectedSave(slot, { historyMode: 'legacy-full-audit', ...options }),
  setRecoveryGate, setupRecovery,
  fillDirectedReceiptCapacity,
  executeBehindDirectedLock, rawDirectedDatabase,
  async setup(slot = 'fixture', owner = 'owner-a') {
    await repository.createDirectedSave(slot, { historyMode: 'legacy-full-audit' });
    return repository.claimDirectedSave(slot, owner);
  },
  async request(slot: string, attemptId: string, command: DirectedCommand): Promise<DirectedRequest> {
    const current = await repository.readDirectedSave(slot);
    if (!current?.owner) throw new Error('Unclaimed fixture');
    return { attemptId, owner: current.owner, epoch: current.epoch, expectedRevision: current.revision, command };
  },
  // Test-only access, using the same isolated DB. No resets or legacy access.
  transaction,
};
declare global { interface Window { directedStorage: typeof harness; directedOpens: string[] } }
window.directedStorage = harness;
