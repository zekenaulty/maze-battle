import { describe, expect, it } from 'vitest';
import { addressKey } from '../expedition/address';
import { createDirectedFixture } from './fixture';
import { emptyDirectedKnowledge, rememberDirected } from './knowledge';
import { observeDirected } from './perception';

describe('directed evidence projection', () => {
  it('creates independent empty projections and preserves input and receipt history', () => {
    const { observations } = createDirectedFixture();
    const empty = emptyDirectedKnowledge('W1', 'P1');
    const receipt = observations[0];
    const before = structuredClone({ empty, receipt });
    const first = rememberDirected(empty, receipt);
    expect({ empty, receipt }).toEqual(before);
    const second = rememberDirected(first, observations[1]);
    second.features.D.value.state = 'open';
    second.cells[addressKey(receipt.scene.position)].value.address.row = 4;
    second.spaces.H.value.name = 'Changed';
    expect(first.features.D.value.state).toBe('locked');
    expect(first.cells[addressKey(receipt.scene.position)].value.address.row).toBe(2);
    expect(first.spaces.H.value.name).toBe('Hall');
    first.features.D.value.position.column = 0;
    expect({ empty, receipt }).toEqual(before);
    expect(emptyDirectedKnowledge('W1', 'P1')).toEqual(empty);
  });

  it('rejects cross-world and cross-observer evidence', () => {
    const { observations } = createDirectedFixture();
    expect(() => rememberDirected(emptyDirectedKnowledge('W2', 'P1'), observations[0])).toThrow('mismatch');
    expect(() => rememberDirected(emptyDirectedKnowledge('W1', 'P2'), observations[0])).toThrow('mismatch');
  });

  it.each([0, 2, -1, 1.5, NaN, Infinity])('rejects an out-of-sequence first observation (%s)', sequence => {
    const { observations } = createDirectedFixture();
    const knowledge = emptyDirectedKnowledge('W1', 'P1');
    expect(() => rememberDirected(knowledge, { ...observations[0], sequence })).toThrow('sequence');
    expect(knowledge.revision).toBe(0);
  });

  it('rejects duplicate receipts, but allows an observation of unchanged world truth', () => {
    const { session: { world, actor } } = createDirectedFixture();
    const first = observeDirected(world, actor, emptyDirectedKnowledge('W1', 'P1'), 'look');
    const knowledge = rememberDirected(emptyDirectedKnowledge('W1', 'P1'), first);
    expect(() => rememberDirected(knowledge, first)).toThrow('sequence');
    const second = observeDirected(world, actor, knowledge, 'look');
    expect(second.sourceWorldRevision).toBe(first.sourceWorldRevision);
    expect(rememberDirected(knowledge, second).revision).toBe(2);
  });

  it('retains a stale remembered door and blocked links until a legitimate local observation', () => {
    const { session } = createDirectedFixture();
    const knowledge = session.knowledge;
    const boundary = addressKey({ spaceId: 'H', row: 2, column: 3 });
    const before = structuredClone(knowledge);
    session.world.features.D.state = 'open';
    session.world.revision++;
    const remoteActor = { ...session.actor, position: { spaceId: 'L', row: 2, column: 2 } };
    const remote = rememberDirected(knowledge, observeDirected(session.world, remoteActor, knowledge, 'look'));
    expect(remote.features.D).toEqual(knowledge.features.D);
    expect(remote.cells[boundary]).toEqual(knowledge.cells[boundary]);
    expect(remote.features.D.value.state).toBe('locked');
    expect(remote.cells[boundary].value.exits.east).toBeUndefined();
    const local = observeDirected(session.world, session.actor, remote, 'look');
    const refreshed = rememberDirected(remote, local);
    expect(refreshed.features.D.value.state).toBe('open');
    expect(refreshed.features.D.observationId).toBe(local.id);
    expect(refreshed.cells[boundary].value.exits.east).toEqual(session.world.features.D.position);
    expect(knowledge).toEqual(before);
    expect(remote.features.D.value.state).toBe('locked');
  });

  it('records an observed removal tombstone, retains its provenance, and clears it on rediscovery', () => {
    const { session } = createDirectedFixture();
    const lever = structuredClone(session.world.features.V);
    delete session.world.features.V;
    const distant = observeDirected(session.world, session.actor, session.knowledge, 'look');
    expect(distant.scene.absentFeatureIds).toEqual([]);
    const stale = rememberDirected(session.knowledge, distant);
    expect(stale.features.V).toEqual(session.knowledge.features.V);
    const actor = { ...session.actor, position: lever.position };
    const removal = observeDirected(session.world, actor, stale, 'look');
    expect(removal.scene.absentFeatureIds).toEqual(['V']);
    const removed = rememberDirected(stale, removal);
    expect(removed.features.V).toBeUndefined();
    expect(removed.absent.V).toEqual({ observationId: removal.id, observedAt: removal.sequence });
    expect(stale.features.V.value).toEqual(lever);
    const later = rememberDirected(removed, observeDirected(session.world, actor, removed, 'look'));
    expect(later.absent.V).toEqual(removed.absent.V);
    session.world.features.V = lever;
    const restored = rememberDirected(later, observeDirected(session.world, actor, later, 'look'));
    expect(restored.features.V.value).toEqual(lever);
    expect(restored.absent.V).toBeUndefined();
    expect(removed.absent.V).toBeDefined();
  });

  it('rejects tombstones for unobserved, unknown, or simultaneously visible features', () => {
    const { session } = createDirectedFixture();
    const observation = observeDirected(session.world, session.actor, session.knowledge, 'look');
    for (const id of ['V', 'T', 'D']) {
      expect(() => rememberDirected(session.knowledge, {
        ...observation, scene: { ...observation.scene, absentFeatureIds: [id] },
      })).toThrow('observed coverage');
    }
  });
});
