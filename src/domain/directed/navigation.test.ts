import { describe, expect, it } from 'vitest';
import { addressKey } from '../expedition/address';
import { createDirectedFixture } from './fixture';
import { actorNavigationGraph, planKnownDestination, searchDirectedRoutes, systemNavigationGraph } from './navigation';
import { applyDirectedCommand } from './transition';
import type { DirectedSession, NavigationTarget } from './operationTypes';

const target: NavigationTarget = { kind: 'feature', featureId: 'V', arrival: 'adjacent' };
function travel(session: DirectedSession) {
  let current = applyDirectedCommand(session, { type: 'navigate', operationId: 'trip', target }, 0);
  const checkpoints = [current];
  for (let i = 0; i < 64 && current.session.operation?.status === 'running'; i++) {
    current = applyDirectedCommand(current.session, { type: 'step', operationId: 'trip', sequence: i }, i + 1);
    checkpoints.push(current);
  }
  return { session: current.session, checkpoints };
}

describe('actor-directed known destination', () => {
  it('executes many steps per intention and stops in interaction range without interacting', () => {
    const { session } = travel(createDirectedFixture().session);
    expect(session.operation?.status).toBe('arrived');
    expect(session.operation?.steps).toBeGreaterThan(4);
    expect(session.actor.position.spaceId).toBe('L');
    expect(session.world.features.V.state).toBe('idle');
    const interacted = applyDirectedCommand(session, { type: 'interact', featureId: 'V' }, 50);
    expect(interacted.outcome.status).toBe('applied');
    expect(interacted.session.world.features.V.state).toBe('active');
  });
  it('cannot change route, cost, output, or interruptions based on an undetected trap', () => {
    const clear = createDirectedFixture({ hiddenTrap: false }).session;
    const trapped = createDirectedFixture({ hiddenTrap: true }).session;
    expect(planKnownDestination(clear.knowledge, clear.actor.position, target))
      .toEqual(planKnownDestination(trapped.knowledge, trapped.actor.position, target));
    expect(travel(clear).checkpoints.map(c => c.outcome)).toEqual(travel(trapped).checkpoints.map(c => c.outcome));
  });
  it('keeps an unseen changed door out of the actor route until approaching it', () => {
    const session = createDirectedFixture().session;
    session.world.features.blocker = { id: 'blocker', kind: 'door', name: 'Gate', position: { spaceId: 'W', row: 0, column: 1 }, state: 'closed' };
    const remembered = actorNavigationGraph(session.knowledge);
    const privileged = systemNavigationGraph(session.world);
    expect(searchDirectedRoutes(remembered, session.actor.position).has(addressKey({ spaceId: 'L', row: 2, column: 2 }))).toBe(true);
    expect(searchDirectedRoutes(privileged, session.actor.position).has(addressKey({ spaceId: 'L', row: 2, column: 2 }))).toBe(false);
    expect(remembered.get(addressKey({ spaceId: 'W', row: 0, column: 2 }))?.exits)
      .not.toEqual(privileged.get(addressKey({ spaceId: 'W', row: 0, column: 2 }))?.exits);
    const initial = applyDirectedCommand(session, { type: 'navigate', operationId: 'trip', target }, 0);
    expect(initial.session.operation?.status).toBe('running');
    expect(initial.session.knowledge.features.blocker).toBeUndefined();
    const finished = travel(session);
    expect(finished.session.operation?.status).toBe('interrupted');
    expect(finished.session.operation?.reason).toBe('No known route.');
    expect(finished.session.knowledge.features.blocker).toBeDefined();
  });
  it('does not manufacture a route to reported/unmaterialized or invented destinations', () => {
    const { session } = createDirectedFixture();
    for (const featureId of ['A', 'does-not-exist']) {
      expect(planKnownDestination(session.knowledge, session.actor.position, { ...target, featureId })).toEqual({ status: 'unavailable', reason: 'Destination is not known.' });
    }
  });
  it('learns a concealed collision without object identity and stops retrying the blocked edge', () => {
    const { session } = createDirectedFixture();
    session.world.features.concealed = { id: 'concealed', kind: 'door', name: 'Private Gate',
      position: { spaceId: 'W', row: 0, column: 1 }, state: 'closed', hidden: true };
    const result = travel(session);
    const collisions = result.checkpoints.flatMap(c => c.observations).filter(o => o.reason === 'obstruction');
    expect(collisions).toHaveLength(1);
    expect(JSON.stringify(collisions)).not.toContain('Private Gate');
    expect(JSON.stringify(collisions)).not.toContain('concealed');
    expect(result.session.operation?.reason).toBe('No known route.');
    expect(result.session.operation?.replans).toBe(1);
    expect(Object.keys(result.session.knowledge.blockedEdges ?? {})).toHaveLength(1);
  });
  it('records the disappearance of a remembered destination only when its cell is observed', () => {
    const { session } = createDirectedFixture();
    delete session.world.features.V;
    const result = travel(session);
    expect(result.checkpoints[0].session.knowledge.features.V).toBeDefined();
    expect(result.session.operation?.status).toBe('interrupted');
    expect(result.session.knowledge.absent.V).toBeDefined();
  });
  it('distinguishes occupy arrival, rejects duplicate sequences, and honors cancel/deadline', () => {
    const { session } = createDirectedFixture();
    const arrived = applyDirectedCommand(session, { type: 'navigate', operationId: 'here', target: { kind: 'cell', address: session.actor.position, arrival: 'occupy' } }, 0);
    expect(arrived.session.operation?.status).toBe('arrived');
    const start = applyDirectedCommand(session, { type: 'navigate', operationId: 'trip', target }, 0);
    const step = applyDirectedCommand(start.session, { type: 'step', operationId: 'trip', sequence: 0 }, 1);
    expect(applyDirectedCommand(step.session, { type: 'step', operationId: 'trip', sequence: 0 }, 2).outcome.status).toBe('refused');
    expect(applyDirectedCommand(start.session, { type: 'step', operationId: 'trip', sequence: 0 }, 120000).session.operation?.reason).toContain('time budget');
    const cancelled = applyDirectedCommand(step.session, { type: 'cancel', operationId: 'trip' }, 2);
    expect(cancelled.session.operation?.status).toBe('cancelled');
    expect(applyDirectedCommand(cancelled.session, { type: 'step', operationId: 'trip', sequence: 1 }, 3).outcome.status).toBe('refused');
  });
  it('enforces step and replan bounds without extra movement', () => {
    const { session } = createDirectedFixture();
    const start = applyDirectedCommand(session, { type: 'navigate', operationId: 'trip', target }, 0).session;
    start.operation!.steps = 64;
    const limited = applyDirectedCommand(start, { type: 'step', operationId: 'trip', sequence: 0 }, 1);
    expect(limited.outcome.position).toEqual(start.actor.position);
    expect(limited.session.operation?.reason).toContain('step budget');
    start.operation!.steps = 0; start.operation!.route = []; start.operation!.replans = 4;
    expect(applyDirectedCommand(start, { type: 'step', operationId: 'trip', sequence: 0 }, 1).session.operation?.reason).toContain('replan budget');
  });
});
