import type { DecisionView } from './decisionState';
import type { RecoveryCandidate } from '../../../persistence/canonical/agentica/recovery.types';
import type { OwnerFence } from '../../../persistence/canonical/types';
import { launchStartFixture } from '../../../persistence/canonical/agentica/launch.test-support';
import { protocolAction, protocolResult } from '../../../persistence/canonical/agentica/types.test-support';

export function adoptionFixture() {
  const ref = (id: string) => ({ key: `agentica/${id}`, id });
  const action = { ...protocolAction(), capabilityId: 'maze.navigate' };
  const binding = { grant: ref('original-grant'), publication: ref('original-publication') };
  const fence: OwnerFence = { generation: 'generation', gameId: 'game', owner: 'new-owner', epoch: 2, revision: 30 };
  const candidate: RecoveryCandidate = { operationId: 'navigation', original: ref('original'), binding };
  const result = protocolResult(action), start = launchStartFixture();
  start.provider.model = 'resolved-fixture'; start.limits.maxPlanContinuations = 4;
  const entry = { request: start, action, admission: result, activeEpoch: '1', state: 'parked',
    usage: { steps: 1, refinements: 0, continuations: 1, providerCalls: 2 } };
  const launch = { guard: { id: 'root', owner: 'owner', epoch: 1, state: 'admitted', admissionAttemptId: 'root-admission' },
    binding: { launchId: 'launch', endpoint: 'ws://127.0.0.1:1/api/host', start }, acceptedStart: structuredClone(start) };
  const terminal = { identity: { action }, binding, event: { kind: 'decision', sessionEpoch: '1', usage: { steps: 99, replans: 9 } },
    confirmed: { data: { entry } }, bound: { result, start, launch, operation: { state: 'settled' },
      grant: { value: { data: { owner: 'owner', epoch: 1 } } }, active: { id: 'launch', sourceAttemptId: 'root-admission' } } };
  const view = { head: { ...fence, status: 'ready' }, value: { terminal, decision: null, claim: null, grant: null,
    selected: { value: { data: binding } } } } as unknown as DecisionView;
  const inspected = { fence, candidate, action, launchId: 'launch', operation: { state: 'settled' },
    acknowledgement: null, terminal: { event: terminal.event }, decision: null, claim: null };
  return { fence, candidate, original: { action, binding }, view, inspected, entry, launch };
}
