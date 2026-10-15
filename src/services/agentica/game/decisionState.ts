import { readCanonical } from '../../../persistence/canonical/read';
import { loadDecisionClaim } from '../../../persistence/canonical/agentica/decision.claim';
import { loadDecisionIntent } from '../../../persistence/canonical/agentica/decision.records';
import { loadAgenticaTerminal } from '../../../persistence/canonical/agentica/terminal';
import { successorGrantKey } from '../../../persistence/canonical/agentica/run-grant.certificate';
import { loadRunGrant } from '../../../persistence/canonical/agentica/run-grant.read';
import { assertPublicationCurrent } from '../../../persistence/canonical/agentica/publication';
import { readPublicationSelection } from '../../../persistence/canonical/agentica/publication-selection';
import { equal } from '../../../persistence/canonical/agentica/validation';
import type { PreparedAction } from '../../../persistence/canonical/agentica/types';
import { check } from '../../../persistence/canonical/validation';
import type { ActionBinding } from './actionContract';

export function decisionState(identity: PreparedAction, binding: ActionBinding) {
  return readCanonical(async pages => {
    const claim = await loadDecisionClaim(pages, identity);
    const decision = claim?.decision ?? await loadDecisionIntent(pages, identity);
    const terminal = decision?.terminal ?? await loadAgenticaTerminal(pages, identity, binding);
    check(terminal && terminal.event.kind === 'decision' && equal(terminal.binding, binding), 'decision needs original completed navigation');
    const key = successorGrantKey(identity.storageKey), row = await pages.get('execution', key);
    const grant = row ? await loadRunGrant(pages, { key, id: row.id }) : null;
    const selected = await readPublicationSelection(pages, terminal.bound.launch.binding.launchId);
    return { terminal, decision, claim, grant, selected };
  });
}
export type DecisionView = Awaited<ReturnType<typeof decisionState>>;

/** Attached execution keeps its custody fence while legitimate actions advance the checkpoint. */
export function assertDecisionCustody(view: DecisionView) {
  const { decision, terminal, grant, selected } = view.value, { launch, active } = terminal.bound;
  check(decision && decision.source.expected.owner === view.head.owner && decision.source.expected.epoch === view.head.epoch,
    'decision requires explicit current-owner intention');
  check(launch.guard.state === 'admitted' && active?.id === launch.binding.launchId
    && active.sourceAttemptId === launch.guard.admissionAttemptId, 'decision launch is no longer active');
  check(selected && equal(selected.value.data.grant, grant?.record.ref ?? terminal.binding.grant), 'decision execution window was superseded');
}

/** A fresh intention additionally requires the original earned world, without refreshing unseen facts. */
export function assertDecisionCurrent(view: DecisionView) {
  assertDecisionCustody(view);
  assertPublicationCurrent(view.value.decision!.publication, view.head);
}
