import { describe, expect, it } from 'vitest';
import { addressKey } from '../expedition/address';
import { presentDirected } from './context';
import { createDirectedWorld } from './fixture';
import { emptyDirectedKnowledge } from './knowledge';
import { actorNavigationGraph } from './navigation';
import type { DirectedSession } from './operationTypes';
import type { PerceptionProfileId } from './perceptionTypes';
import { applyDirectedCommand } from './transition';

function setup(profile: PerceptionProfileId | undefined = 'expert'): DirectedSession {
  return {
    version: 'directed-v1', epoch: 1, revision: 0, owner: 'review', world: createDirectedWorld(),
    actor: { id: 'P1', position: { spaceId: 'W', row: 0, column: 0 },
      ...(profile === undefined ? {} : { perceptionProfile: profile }) },
    knowledge: emptyDirectedKnowledge('W1', 'P1'),
  };
}

function inspect(session: DirectedSession, direction: 'east' | 'here' | 'north' = 'east') {
  return applyDirectedCommand(session, { type: 'inspect', direction }, 0, 'original-inspection');
}

describe('independent disclosure and navigation controls', () => {
  it.each(['untrained', 'alert'] as const)('keeps %s public facts and route graph independent of concealed identity/count/state', profile => {
    const first = setup(profile);
    const second = structuredClone(first);
    const hidden = second.world.features.T;
    delete second.world.features.T;
    second.world.features.X = { ...hidden, id: 'X', name: 'Private gate', kind: 'door', state: 'locked' };
    second.world.features.Y = { ...hidden, id: 'Y', name: 'Private mechanism', state: 'active' };
    const left = inspect(first), right = inspect(second);
    expect(left.observations[0].scene).toEqual(right.observations[0].scene);
    expect(presentDirected(left.session, 'left', 'human-view').json)
      .toBe(presentDirected(right.session, 'right', 'decision-fixture').json);
    expect(actorNavigationGraph(left.session.knowledge)).toEqual(actorNavigationGraph(right.session.knowledge));
  });

  it.each(['untrained', 'alert', undefined] as const)('retains historical detection and detail when the current profile becomes %s', profile => {
    const initial = inspect(setup());
    const source = structuredClone(initial.observations[0]);
    const previous = structuredClone(initial.session);
    if (profile === undefined) delete previous.actor.perceptionProfile;
    else previous.actor.perceptionProfile = profile;
    previous.world.features.T.state = 'active';
    const current = applyDirectedCommand(previous, { type: 'look' }, 1);
    expect(current.session.knowledge.features.T).toEqual(initial.session.knowledge.features.T);
    expect(current.session.knowledge.examinations?.T).toEqual(initial.session.knowledge.examinations?.T);
    expect(current.observations[0].scene.absentFeatureIds).not.toContain('T');
    expect(initial.observations[0]).toEqual(source);
  });

  it.each(['missing-crossing', 'closed-door'] as const)('does not give concealed detail across a %s', obstacle => {
    const previous = setup();
    if (obstacle === 'missing-crossing') delete previous.world.cells[addressKey(previous.actor.position)].exits.east;
    else previous.world.features.D.position = { ...previous.world.features.T.position };
    const result = inspect(previous);
    expect(result.observations[0].scene.inspection).toMatchObject({ coveredCells: [], limitation: 'no-visible-crossing' });
    expect(result.session.knowledge.features.T).toBeUndefined();
    expect(result.observations[0].scene.examinations).toEqual([]);
  });

  it('requires deliberate coverage, not passive vision or inspection in another direction', () => {
    const previous = setup();
    const passive = applyDirectedCommand(previous, { type: 'look' }, 0);
    const elsewhere = inspect(previous, 'north');
    for (const result of [passive, elsewhere]) {
      expect(result.session.knowledge.features.T).toBeDefined();
      expect(result.observations[0].scene.examinations).toEqual([]);
    }
    expect(inspect(previous).observations[0].scene.examinations).toHaveLength(1);
  });
});
