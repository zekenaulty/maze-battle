import { describe, expect, it } from 'vitest';
import { createDirectedFixture } from './fixture';
import { rememberDirected } from './knowledge';
import { planKnownDestination } from './navigation';
import type { DirectedSession, NavigationTarget } from './operationTypes';
import { observeDirected } from './perception';
import { applyDirectedCommand } from './transition';

const to = { spaceId: 'W', row: 0, column: 1 };
const target: NavigationTarget = { kind: 'feature', featureId: 'V', arrival: 'adjacent' };
function travel(session: DirectedSession, operationId = 'trip') {
  let result = applyDirectedCommand(session, { type: 'navigate', operationId, target }, 100);
  for (let i = 0; i < 64 && result.session.operation?.status === 'running'; i++) {
    result = applyDirectedCommand(result.session, { type: 'step', operationId, sequence: i }, 101 + i);
  }
  return result.session;
}
function blocked() {
  const { session } = createDirectedFixture();
  session.world.features.gate = { id: 'gate', name: 'Private gate', kind: 'door', state: 'closed', hidden: true, position: to };
  const result = travel(session);
  expect(result.operation?.status).toBe('interrupted');
  expect(Object.keys(result.knowledge.blockedEdges!)).toHaveLength(1);
  return result;
}
const look = (session: DirectedSession) => applyDirectedCommand(session, { type: 'look' }, 200);

describe('collision recovery', () => {
  it('reconsiders a newly observed opening, preserves old evidence, and finishes without interacting', () => {
    const session = blocked();
    const previous = structuredClone(session.knowledge);
    Object.assign(session.world.features.gate, { hidden: false, state: 'open' });
    const recovered = look(session);
    expect(recovered.observations[0].scene.crossingRecovery).toMatchObject({ policyVersion: 'observed-door-change-v1',
      edges: [{ featureId: 'gate', change: 'opened', to }] });
    expect(recovered.session.knowledge.blockedEdges).toEqual({});
    expect(session.knowledge).toEqual(previous);
    expect(planKnownDestination(recovered.session.knowledge, session.actor.position, target).status).toBe('ready');
    const arrived = travel(recovered.session, 'resumed');
    expect(arrived.operation?.status).toBe('arrived');
    expect(arrived.world.features.V.state).toBe('idle');
  });

  it('reconsiders a locally observed removal, not an unseen disappearance', () => {
    let session = blocked();
    session.world.features.gate.hidden = false;
    session = look(session).session;
    delete session.world.features.gate;
    const recovered = look(session);
    expect(recovered.observations[0].scene.crossingRecovery?.edges[0].change).toBe('removed');
    expect(recovered.session.knowledge.absent.gate).toBeDefined();
    expect(recovered.session.knowledge.blockedEdges).toEqual({});
  });

  it.each(['closed', 'hidden-open', 'hidden-removed', 'remote-open'] as const)('%s does not erase collision evidence', variant => {
    const session = blocked();
    const before = structuredClone(session.knowledge.blockedEdges);
    if (variant === 'hidden-open' || variant === 'remote-open') session.world.features.gate.state = 'open';
    if (variant === 'hidden-removed') delete session.world.features.gate;
    if (variant === 'remote-open') {
      session.world.features.gate.hidden = false;
      session.actor.position = { spaceId: 'H', row: 2, column: 2 };
    }
    const observed = look(session);
    expect(observed.observations[0].scene.crossingRecovery).toBeUndefined();
    expect(observed.session.knowledge.blockedEdges).toEqual(before);
    expect(planKnownDestination(observed.session.knowledge, observed.session.actor.position, target).status).toBe('unavailable');
  });

  it('does not keep retrying a second concealed obstruction behind an unchanged open door', () => {
    let session = blocked();
    session.world.features.other = { ...session.world.features.gate, id: 'other' };
    Object.assign(session.world.features.gate, { hidden: false, state: 'open' });
    session = travel(look(session).session, 'second-trip');
    expect(session.operation?.status).toBe('interrupted');
    const before = structuredClone(session.knowledge.blockedEdges);
    for (let i = 0; i < 4; i++) {
      const result = look(session);
      expect(result.observations[0].scene.crossingRecovery).toBeUndefined();
      session = result.session;
      expect(session.knowledge.blockedEdges).toEqual(before);
    }
  });

  it('preserves legacy observation interpretation and permits one explicit physical retry', () => {
    const session = blocked();
    Object.assign(session.world.features.gate, { hidden: false, state: 'open' });
    const original = observeDirected(session.world, session.actor, session.knowledge, 'look');
    delete original.scene.crossingRecovery;
    const legacy = structuredClone(original);
    session.knowledge = rememberDirected(session.knowledge, original);
    expect(Object.keys(session.knowledge.blockedEdges!)).toHaveLength(1);
    const retried = applyDirectedCommand(session, { type: 'retry-crossing', to }, 300);
    expect(retried.session.actor.position).toEqual(to);
    expect(retried.events).toHaveLength(1);
    expect(retried.session.knowledge.blockedEdges).toEqual({});
    expect(retried.session.operation).toEqual(session.operation);
    expect(original).toEqual(legacy);
  });

  it.each([false, true])('physically retries a concealed crossing only once (open=%s)', open => {
    const session = blocked();
    const before = structuredClone(session);
    if (open) session.world.features.gate.state = 'open';
    const retried = applyDirectedCommand(session, { type: 'retry-crossing', to }, 300);
    expect(retried.events).toHaveLength(open ? 1 : 0);
    expect(retried.observations).toHaveLength(1);
    expect(retried.observations[0].scene.traversal?.passable).toBe(open);
    expect(JSON.stringify(retried.observations[0].scene)).not.toMatch(/Private gate|"gate"/);
    expect(retried.session.actor.position).toEqual(open ? to : before.actor.position);
    expect(retried.session.operation?.status).toBe('interrupted');
    expect(session.knowledge).toEqual(before.knowledge);
  });

  it('refuses remote, unknown, malformed or active-travel retries without observation or effects', () => {
    const session = blocked();
    const active = applyDirectedCommand(createDirectedFixture().session, { type: 'navigate', operationId: 'active', target }, 0).session;
    for (const [current, destination] of [[session, { ...to, column: 0 }], [session, { ...to, spaceId: 'unknown' }],
      [session, null], [active, to]] as const) {
      const result = applyDirectedCommand(current, { type: 'retry-crossing', to: destination as typeof to }, 300);
      expect(result.outcome.status).toBe('refused');
      expect(result.observations).toEqual([]); expect(result.events).toEqual([]);
      expect(result.session).toEqual(current);
    }
  });

  it('rejects recovery evidence not justified by the original local scene and knowledge', () => {
    const session = blocked();
    const source = observeDirected(session.world, session.actor, session.knowledge, 'look');
    source.scene.crossingRecovery = { policyVersion: 'observed-door-change-v1', edges: [
      { from: session.actor.position, to, featureId: 'gate', change: 'opened' },
    ] };
    expect(() => rememberDirected(session.knowledge, source)).toThrow('new local door evidence');
  });
});
