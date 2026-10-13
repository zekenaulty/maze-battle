import { describe, expect, it } from 'vitest';
import { addressKey } from '../expedition/address';
import { directedViewModel } from '../../viewModels/directedViewModel';
import { presentDirected } from './context';
import { createDirectedWorld } from './fixture';
import { emptyDirectedKnowledge } from './knowledge';
import type { PerceptionProfileId } from './perceptionTypes';
import { applyDirectedCommand } from './transition';
import type { DirectedSession } from './operationTypes';
import { moveDirectedWorld } from './world';

function setup(profile: PerceptionProfileId): DirectedSession {
  return { version: 'directed-v1', epoch: 1, revision: 0, owner: 'test', world: createDirectedWorld(),
    actor: { id: 'P1', position: { spaceId: 'W', row: 0, column: 0 }, perceptionProfile: profile },
    knowledge: emptyDirectedKnowledge('W1', 'P1') };
}
function inspect(session: DirectedSession, attemptId = 'inspection-1') {
  return applyDirectedCommand(session, { type: 'inspect', direction: 'east' }, 0, attemptId);
}

describe('versioned fixture perception and inspection', () => {
  it.each(['untrained', 'alert', 'keen', 'expert'] as const)('discloses only the %s profile grade to both views', profile => {
    const result = inspect(setup(profile));
    const observation = result.observations[0];
    const human = presentDirected(result.session, 'human', 'human-view');
    const agent = presentDirected(result.session, 'agent', 'decision-fixture');
    expect(human.json).toBe(agent.json);
    const view = directedViewModel(human);
    expect(view.features.map(entry => entry.value.id)).toEqual(profile === 'keen' || profile === 'expert' ? ['T'] : []);
    expect(observation.scene.cues).toHaveLength(profile === 'alert' ? 1 : 0);
    expect(observation.scene.examinations).toHaveLength(profile === 'expert' ? 1 : 0);
    expect(observation.scene.inspection).toMatchObject({ attemptId: 'inspection-1', direction: 'east',
      viewpoint: result.session.actor.position, coveredCells: [{ spaceId: 'W', row: 0, column: 1 }] });
    expect(human.json).not.toMatch(/hidden|sourceWorldRevision|threshold|wiring|damage/);
    if (profile === 'untrained' || profile === 'alert') expect(human.json).not.toContain('"T"');
    if (profile !== 'expert') expect(human.json).not.toContain('pressure-sensitive');
  });

  it('does not grant examination passively, even to expert perception', () => {
    const result = applyDirectedCommand(setup('expert'), { type: 'look' }, 0);
    expect(result.session.knowledge.features.T).toBeDefined();
    expect(result.session.knowledge.examinations?.T).toBeUndefined();
    expect(result.observations[0].scene.inspection).toBeUndefined();
  });

  it('makes undetected truth and suspicious object count/identity opaque', () => {
    for (const profile of ['untrained', 'alert'] as const) {
      const first = setup(profile);
      const second = structuredClone(first);
      const original = second.world.features.T;
      delete second.world.features.T;
      if (profile === 'alert') {
        second.world.features.X = { ...original, id: 'X', name: 'Do not disclose' };
        second.world.features.Y = { ...original, id: 'Y', kind: 'door' };
      }
      expect(inspect(first).observations[0].scene).toEqual(inspect(second).observations[0].scene);
    }
  });

  it('does not inspect through a missing crossing or a visible closed door', () => {
    const session = setup('expert');
    session.world.cells[addressKey(session.actor.position)].exits = {};
    let result = inspect(session);
    expect(result.observations[0].scene.features).toEqual([]);
    expect(result.observations[0].scene.inspection).toMatchObject({ coveredCells: [], limitation: 'no-visible-crossing' });
    const blocked = setup('expert');
    blocked.world.features.D.position = { spaceId: 'W', row: 0, column: 1 };
    result = inspect(blocked);
    expect(result.observations[0].scene.features.map(feature => feature.id)).toEqual(['D']);
    expect(result.observations[0].scene.inspection?.coveredCells).toEqual([]);
  });

  it('retains discovery and examined detail after a perception bonus expires without refreshing unseen state', () => {
    const initial = inspect(setup('expert'));
    const historical = structuredClone(initial.observations[0]);
    const previous = initial.session;
    previous.actor.perceptionProfile = 'untrained';
    previous.world.features.T.state = 'active';
    const current = applyDirectedCommand(previous, { type: 'look' }, 1);
    expect(current.session.knowledge.features.T).toEqual(initial.session.knowledge.features.T);
    expect(current.session.knowledge.examinations?.T).toEqual(initial.session.knowledge.examinations?.T);
    expect(current.observations[0].scene.features).toEqual([]);
    expect(initial.observations[0]).toEqual(historical);
  });

  it('does not improve detection by repeatedly inspecting unchanged conditions', () => {
    let session = setup('alert');
    const scenes = [];
    for (let attempt = 0; attempt < 12; attempt++) {
      const result = inspect(session, `try-${attempt}`);
      scenes.push(result.observations[0].scene);
      session = result.session;
    }
    expect(session.knowledge.features.T).toBeUndefined();
    expect(session.knowledge.examinations).toBeUndefined();
    expect(scenes.every(scene => scene.cues?.length === 1 && !scene.examinations?.length)).toBe(true);
    expect(new Set(scenes.map(scene => scene.inspection?.attemptId)).size).toBe(12);
  });

  it('keeps the perception profile through movement', () => {
    const current = setup('expert');
    const moved = moveDirectedWorld(current.world, current.actor, { spaceId: 'W', row: 0, column: 1 });
    expect(moved.actor.perceptionProfile).toBe('expert');
  });

  it('requires stopped travel and a receiptable attempt for inspection', () => {
    expect(applyDirectedCommand(setup('expert'), { type: 'inspect', direction: 'east' }, 0).outcome.status).toBe('refused');
    const travelling = applyDirectedCommand(setup('expert'), { type: 'navigate', operationId: 'travel',
      target: { kind: 'cell', address: { spaceId: 'W', row: 0, column: 2 }, arrival: 'occupy' } }, 0).session;
    expect(inspect(travelling).outcome.reason).toContain('Cancel travel');
  });
});
