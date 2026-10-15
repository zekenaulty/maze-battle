import type { AgenticaOperationEntry } from '../sdk/agentica-host.mjs';
import type { CanonicalHostPort } from '../../game/CanonicalHostCommand';
import { canonicalFence, executeCanonical, operateCanonical } from '../../../persistence/canonical/transaction';
import { retainDecisionIntent } from '../../../persistence/canonical/agentica/decision';
import { retainDecisionClaim } from '../../../persistence/canonical/agentica/decision.claim';
import { grantDecisionSuccessor } from '../../../persistence/canonical/agentica/run-grant';
import type { LaunchStarted } from '../../../persistence/canonical/agentica/launch.types';
import type { PreparedAction, ProtocolRef } from '../../../persistence/canonical/agentica/types';
import { check } from '../../../persistence/canonical/validation';
import { json } from '../../../persistence/canonical/world/records';
import type { ActionBinding } from './actionContract';
import type { DecisionView } from './decisionState';

export function decisionCommits(port: CanonicalHostPort, identity: PreparedAction, binding: ActionBinding) {
  return {
    prepare(publication: ProtocolRef) {
      return port.submitHostCommand({ kind: 'fresh', operation: 'agentica.operation.decision', input: json({ action: identity.storageKey, binding, publication }),
        execute: (request, options) => executeCanonical(request,
          async tx => (await retainDecisionIntent(tx, request, identity, binding, publication)).receipt, options) });
    },
    claim(intent: ProtocolRef, started: LaunchStarted, entry: AgenticaOperationEntry) {
      return port.submitHostCommand({ kind: 'fresh', operation: 'agentica.operation.decision-claim', input: json({ action: identity.storageKey, intent, started, entry }),
        execute: (request, options) => executeCanonical(request,
          async tx => (await retainDecisionClaim(tx, request, identity, intent, started, entry)).receipt, options) });
    },
    adopt(view: DecisionView) {
      const { decision, claim, terminal } = view.value; check(decision?.data.adoption && claim, 'explicit claimed adoption required');
      return port.submitHostCommand({ kind: 'retry', request: { attemptId: `${decision.reference.id}:guard`, operation: 'operation.adopt',
        expected: canonicalFence(view.head), deadlineAt: null, input: { operationId: terminal.bound.launch.guard.id } },
        execute: (request, options) => operateCanonical(request, 'adopt', undefined, options) });
    },
    grant(view: DecisionView) {
      const { decision, claim, selected } = view.value; check(decision && claim && selected, 'exact decision selection required');
      return port.submitHostCommand({ kind: 'fresh', operation: 'agentica.decision.grant',
        input: json({ action: identity.storageKey, binding, claim: claim.reference, publication: decision.data.publication, previousSelection: selected.ref }),
        execute: (request, options) => grantDecisionSuccessor(request, identity, options) });
    },
  };
}
