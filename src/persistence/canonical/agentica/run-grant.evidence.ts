import type { AgenticaOperationEntry } from '../../../services/agentica/sdk/agentica-host.mjs';
import { fields } from '../roster/codec';
import { check } from '../validation';
import { validateDecisionClaim, type DecisionClaim } from './decision.claim';
import { loadDecisionIntent } from './decision.records';
import { loadOperationBinding } from './operation.binding';
import { loadOperationRecord } from './operation.records';
import type { OperationRead } from './operation.types';
import { readPublicationSelectionRecord } from './publication-selection';
import { equal, restoreRetainedAction } from './validation';
import { readRunGrantCertificate } from './run-grant.certificate';
import type { RunGrant, SuccessorGrant } from './run-grant.types';
import { validateGrantGuardAdoption } from './run-grant.guard';

/** Validate the full immediate handoff. The predecessor certificate cuts recursive grant ancestry only. */
export async function validateSuccessorGrantEvidence(pages: OperationRead, current: RunGrant) {
  const g = current.record.value.data as SuccessorGrant;
  const prior = await readRunGrantCertificate(pages, g.binding.grant);
  check(prior.launch.binding.launchId === current.launch.binding.launchId && prior.record.row.revision < current.record.row.revision,
    'successor predecessor changed');
  const identity = await restoreRetainedAction(pages, g.original, g.binding);
  const bound = await loadOperationBinding(pages, identity, g.binding, prior);
  check(equal(bound.original.reference, g.original) && equal(bound.original.resultReference, g.result),
    'successor original admission changed');
  // Reuse the ordinary publication, custody, progress, transfer and terminal validators with that exact context.
  const intent = await loadDecisionIntent(pages, identity, bound);
  check(intent && equal(intent.reference, g.intent) && equal(intent.data.publication, g.publication), 'successor decision changed');
  const claim = await loadOperationRecord<DecisionClaim>(pages, g.run.key, 'agentica-decision-claim', g.run);
  check(claim, 'missing successor claim');
  const claimInput = fields(claim.source.input, 'action intent started entry');
  check(claim.source.operation === 'agentica.operation.decision-claim' && claimInput.action === g.action
    && equal(claimInput.intent, g.intent) && equal(claimInput.started, g.started)
    && intent.row.revision < claim.row.revision && claim.row.revision < current.record.row.revision,
    'successor claim source changed');
  const proof = validateDecisionClaim(intent, g.started, claimInput.entry as unknown as AgenticaOperationEntry);
  check(equal(claim.data, proof) && proof.state === 'waking' && !proof.stopped && proof.settledUsage === null
    && equal(g.start.observation, intent.data.adoption?.observation ?? intent.data.event.observation),
    'successor claim cannot grant execution');
  const selected = await readPublicationSelectionRecord(pages, g.previousSelection);
  check(selected.value.launchId === current.launch.binding.launchId && equal(selected.value.data.grant, g.binding.grant)
    && selected.row.revision <= current.record.source.expected.revision, 'successor prior selection changed');
  await validateGrantGuardAdoption(pages, current, prior, intent.data, claim.row.revision);
}
