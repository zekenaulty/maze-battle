import { destinationExpired, limitReached } from '../../../domain/directed/destinationLimits';
import { gameCheckpoint } from '../game/checkpoint';
import { commitExplorationCommand } from '../game/explorationCommand';
import { readKnownCells } from '../knowledge/queries';
import { compareExplorationObservation, type ExplorationMaterialChange } from '../knowledge/explorationPolicy';
import type { CanonicalWork } from '../transaction';
import { check, integer, isObject } from '../validation';
import { same } from '../world/records';
import { resolveWorldStep } from '../world/residency';
import { knownStep } from './planner';
import { planLocalExploration, planScopedApproach } from './explorationPlan';
import type { DestinationProgress, DestinationReason } from './types';

const stop = (p: DestinationProgress, reason: DestinationReason, decision = false): DestinationProgress => ({ ...p,
  route: [], reason, status: decision ? 'decision' : 'blocked' });

/** One ordinary move per transaction, with a retained coverage intention and no hidden geometry in planning. */
export async function advanceExploration(tx: CanonicalWork, input: DestinationProgress) {
  let p = structuredClone(input), checkpoint = gameCheckpoint(tx.head.checkpoint);
  check(p.binding.kind === 'frontier-exploration' && p.exploration, 'missing exploration authority');
  const binding = p.binding, scope = binding.target.cell.spaceId, limits = binding.limits;
  const invalidated = p.owner !== tx.head.owner || p.epoch !== tx.head.epoch || !same(p.position, checkpoint.position);
  check(integer(p.sequence + 1), 'exploration sequence exhausted'); p.sequence++; p.position = checkpoint.position;
  const done = () => ({ progress: p, checkpoint });
  if (destinationExpired(p, Date.now())) { p = stop(p, 'time-limit'); return done(); }
  if (checkpoint.mode === 'town') { p = stop(p, 'unavailable'); return done(); }
  if (checkpoint.position.level !== binding.target.level || checkpoint.position.cell.spaceId !== scope) {
    p = stop(p, 'scope-boundary', true); return done();
  }
  if (limitReached(p.steps, limits.steps)) { p = stop(p, 'step-limit'); return done(); }
  let cursor = p.exploration!;
  if (same(checkpoint.position, cursor.target)) {
    p.route = [];
    if (cursor.phase === 'approach') {
      const [actor] = await readKnownCells(tx.pages, checkpoint, [checkpoint.position]);
      check(actor.state === 'visible', 'exploration actor must be currently observed');
      const edge = actor.cell.edges[binding.frontier.direction];
      if (!edge || !edge.target) { p = stop(p, 'obstructed'); return done(); }
      if (edge.target.cell.spaceId !== scope) { p = stop(p, 'scope-boundary', true); return done(); }
      cursor = p.exploration = { phase: 'cross-frontier', target: edge.target, window: cursor.window };
      p.route = [{ direction: binding.frontier.direction, to: edge.target }];
    } else {
      const plan = await planLocalExploration(tx.pages, checkpoint, scope);
      if (!plan) { p = stop(p, 'scope-exhausted', true); return done(); }
      cursor = p.exploration = { phase: 'survey', target: plan.target, window: plan.window }; p.route = plan.route;
    }
  }
  const staleRoute = p.route.length > 0 && !await knownStep(tx.pages, checkpoint, p.route[0]);
  if (invalidated || staleRoute || !p.route.length) {
    // Selecting a new local boundary is routine coverage. Repairing a stale path consumes the original replan allowance.
    if (invalidated || staleRoute) {
      if (limitReached(p.replans, limits.replans)) { p = stop(p, 'replan-limit'); return done(); }
      check(integer(p.replans + 1), 'exploration replan counter exhausted'); p.replans++;
    }
    const route = await planScopedApproach(tx.pages, checkpoint, cursor.target, cursor.window);
    if (!route?.length) { p = stop(p, 'route-unavailable'); return done(); }
    p.route = route;
  }
  if (limits.steps !== null) p.route = p.route.slice(0, limits.steps - p.steps);
  const step = p.route[0];
  check(step && step.to.cell.spaceId === scope && await knownStep(tx.pages, checkpoint, step), 'exploration next edge is not earned in scope');
  const legal = await resolveWorldStep(tx.pages, checkpoint.position, step.direction);
  if (!legal.moved || !same(legal.position, step.to)) { p = stop(p, 'obstructed'); return done(); }
  const before = checkpoint;
  let material: ExplorationMaterialChange | null = null;
  const moved = await commitExplorationCommand({ ...tx, setCheckpoint: value => {
    checkpoint = gameCheckpoint(value); tx.setCheckpoint(value);
  } }, { kind: 'move', direction: step.direction, triggerStairs: false }, async (pages, cells) => {
    material = await compareExplorationObservation(pages, before, cells, scope);
  });
  check(isObject(moved), 'invalid exploration movement result');
  if (moved.outcome === 'unavailable') { p = stop(p, 'unavailable'); return done(); }
  check(moved.moved === true && same(moved.position, step.to) && integer(p.steps + 1), 'exploration movement diverged');
  p.steps++; p.position = step.to; p.route.shift();
  const change = material as ExplorationMaterialChange | null;
  if (change) {
    check(checkpoint.knowledge && checkpoint.knowledge.sequence > change.baseline.sequence, 'material decision lacks committed sight');
    const reason = ['unopened-chest', 'stairs-discovered'].includes(change.reason) ? 'new-object'
      : ['chest-changed', 'traversability-changed'].includes(change.reason) ? 'changed-evidence' : 'scope-boundary';
    p = stop(p, reason, true);
    p.notice = { kind: change.reason, at: change.at, previousSource: change.previousSource,
      source: { sequence: checkpoint.knowledge.sequence, id: checkpoint.knowledge.id, index: change.index } };
  }
  return done();
}
