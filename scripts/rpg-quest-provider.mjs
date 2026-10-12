import { readRpgPrompt } from './rpg-fixture-prompt.mjs';

const same = (a, b) => a.floor === b.floor && a.row === b.row && a.column === b.column;

/** Deterministic protocol fixture: uses only delivered public facts, never a dungeon variant/recipe. */
export function questPlan(body, ordinal) {
  const { prompt, publicContext, identity, reference, frame, objective } = readRpgPrompt(body, true, true);
  const quest = frame.quest;
  if (!objective.startsWith('Retrieve the accepted quest collectible and return to the known entrance.')
    || quest?.kind !== 'retrieval' || quest.status === 'unavailable' || quest.required !== 1 || quest.complete
    || !Number.isInteger(quest.carried) || quest.carried < 0 || quest.carried > quest.required
    || quest.returnTarget?.floor !== frame.floor) throw new Error('Invalid public retrieval objective.');
  let tool = 'maze.frontiers', input = { limit: 12 };
  const chest = frame.cells?.flatMap(cell => cell.chests).find(chest => !chest.opened);
  if (quest.carried === quest.required) {
    tool = 'maze.navigate'; input = { row: quest.returnTarget.row, column: quest.returnTarget.column };
  } else if (chest) {
    if (same(chest.position, frame.actor)) { tool = 'maze.open-chest'; input = { chestId: chest.id }; }
    else { tool = 'maze.navigate'; input = { row: chest.position.row, column: chest.position.column }; }
  } else if (frame.context) {
    const page = frame.context;
    if (page.kind !== 'frontiers' || page.status !== 'ready' || page.floor !== frame.floor || page.snapshotId !== frame.sourceHead.id
      || !Array.isArray(page.frontiers) || page.frontiers.length > 12) throw new Error('Invalid frontier page.');
    const frontier = page.frontiers.find(value => !same(value.anchor, frame.actor));
    if (!frontier || frontier.source.id !== frame.sourceHead.id || frontier.anchor.floor !== frame.floor
      || !['north', 'east', 'south', 'west'].includes(frontier.direction)) throw new Error('Missing earned nonzero frontier.');
    tool = 'maze.explore'; input = { row: frontier.anchor.row, column: frontier.anchor.column,
      direction: frontier.direction, sourceId: frontier.source.id, continuation: 'corridor-v1' };
  } else if (!frame.cells?.length) { tool = 'maze.observe'; input = {}; }
  const action = ['maze.navigate', 'maze.explore', 'maze.open-chest'].includes(tool);
  const steps = [{ stepId: `quest-step-${ordinal}`, toolId: tool, input,
    kind: action ? 'action' : 'query', effect: action ? 'writesLocalState' : 'readOnly',
    reason: 'Select an intention from the delivered observation; the host owns pathfinding, effects and completion.' }];
  const plan = { planId: `quest-plan-${ordinal}`, description: 'Retrieve through ordinary game rules and return.', steps };
  return { cohort: 'quest', scope: identity.ScopeId, epoch: identity.SessionEpoch, objective, actor: frame.actor,
    publicContext, observationId: reference.ObservationId, observationRevision: reference.Revision,
    observationKind: frame.kind, tool, input,
    text: JSON.stringify(prompt.includes('"refinedPlan"') ? { reason: 'observation', refinedPlan: plan } : plan) };
}

export function validateQuestSequence(prior, record) {
  if (prior.length >= 12 || prior.some(call => call.cohort !== 'quest' || call.objective !== record.objective))
    throw new Error('Retrieval cohort exceeded its explicit twelve-response bound.');
  const last = prior.at(-1);
  if (last && record.observationRevision < last.observationRevision) throw new Error('Retrieval checkpoint regressed.');
  if (last && last.tool === record.tool && JSON.stringify(last.input) === JSON.stringify(record.input))
    throw new Error('Repeated fixture intention without new judgment.');
}
