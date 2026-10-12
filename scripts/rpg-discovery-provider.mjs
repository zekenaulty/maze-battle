import { readRpgPrompt } from './rpg-fixture-prompt.mjs';

const same = (a, b) => a.floor === b.floor && a.row === b.row && a.column === b.column;

/** Protocol qualification, not a model-competence test: select by public page order only. */
export function discoveryPlan(body, ordinal) {
  const { prompt, publicContext, identity, reference, frame, objective } = readRpgPrompt(body, true);
  if (objective !== 'Explore from earned observations. Query current frontiers, choose a bounded frontier approach, review newly revealed evidence and choose the next intention. Do not interact or collect. Arrival does not complete exploration.')
    throw new Error('Unexpected discovery objective.');
  let tool = 'maze.frontiers', input = { limit: 12 };
  if (frame.context) {
    const page = frame.context;
    if (page.kind !== 'frontiers' || page.status !== 'ready' || page.floor !== frame.floor
      || page.snapshotId !== frame.sourceHead.id || !Array.isArray(page.frontiers) || page.frontiers.length > 12)
      throw new Error('Expected a bounded current frontier page.');
    const frontier = page.frontiers.find(item => !same(item.anchor, frame.actor));
    if (!frontier || frontier.anchor.floor !== frame.floor || frontier.source.id !== frame.sourceHead.id
      || !['north', 'east', 'south', 'west'].includes(frontier.direction)) throw new Error('No current nonzero frontier approach.');
    tool = 'maze.explore'; input = { row: frontier.anchor.row, column: frontier.anchor.column,
      direction: frontier.direction, sourceId: frontier.source.id };
  } else if (frame.kind !== 'local' || !frame.cells?.length) throw new Error('Discovery requires current local evidence.');
  const action = tool === 'maze.explore';
  const plan = { planId: `discovery-plan-${ordinal}`, description: 'Choose from actor-earned boundary evidence.', steps: [{
    stepId: `discovery-step-${ordinal}`, toolId: tool, kind: action ? 'action' : 'query',
    effect: action ? 'writesLocalState' : 'readOnly', input,
    reason: action ? 'Approach the first returned nonzero boundary; no hidden route or contents are available.'
      : 'Retrieve current observed boundaries before selecting an exploration intention.',
  }] };
  return { cohort: 'discovery', scope: identity.ScopeId, epoch: identity.SessionEpoch, objective,
    actor: frame.actor, publicContext, observationId: reference.ObservationId,
    observationRevision: reference.Revision, observationKind: frame.kind, tool, input,
    text: JSON.stringify(prompt.includes('"refinedPlan"') ? { reason: 'observation', refinedPlan: plan } : plan) };
}

export function validateDiscoverySequence(prior, record) {
  const expected = prior.length % 2 ? 'maze.explore' : 'maze.frontiers';
  if (prior.length >= 4 || record.tool !== expected || prior.some(call => call.cohort !== 'discovery' || call.objective !== record.objective))
    throw new Error('Discovery proof permits exactly two query/choice pairs.');
  const last = prior.at(-1);
  if (!last) return;
  if (expected === 'maze.explore') {
    if (!same(last.actor, record.actor) || last.epoch !== record.epoch || last.observationRevision !== record.observationRevision)
      throw new Error('Frontier query changed the actor checkpoint.');
  } else if (!same(record.actor, { floor: last.actor.floor, row: last.input.row, column: last.input.column })
    || record.observationRevision <= last.observationRevision) throw new Error(`Successor lacks new arrival evidence: ${JSON.stringify({ actor: record.actor,
      priorInput: last.input, revision: record.observationRevision, priorRevision: last.observationRevision })}`);
}
