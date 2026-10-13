import { afterEach, describe, expect, it, vi } from 'vitest';
import { rosterFixture } from '../../../domain/party/rosterTestFixtures';
import { encodeActor } from './actorValidation';
import { applyRosterCommand, rosterCommand } from './commands';

afterEach(() => vi.useRealTimers());
describe('canonical party command validation', () => {
  it.each([
    { kind: 'spend-attribute', actorId: 'actor', attribute: 'strength' },
    { kind: 'spend-attribute', actorId: 'actor', attribute: 'vitality' },
    { kind: 'spend-attribute', actorId: 'actor', attribute: 'intellect' },
    { kind: 'auto-spend', actorId: 'actor', enabled: false },
    { kind: 'actor-auto', actorId: 'actor', enabled: true },
    ...['heal', 'groupHeal', 'resurrect'].map(skillId => ({ kind: 'camp', actorId: 'actor', skillId })),
  ])('owns valid input %j', input => {
    const command = rosterCommand(input);
    expect(command).toEqual(input);
    expect(command).not.toBe(input);
    input.actorId = 'changed';
    expect(command).toHaveProperty('actorId', 'actor');
  });

  it.each([
    { kind: 'spend-attribute', actorId: 'a', attribute: 'available' },
    { kind: 'spend-attribute', actorId: 'a', attribute: 'strength', amount: 2 },
    { kind: 'spend-attribute', actorId: 'a' },
    { kind: 'spend-attribute', attribute: 'strength' },
    { kind: 'auto-spend', actorId: '', enabled: true },
    { kind: 'auto-spend', actorId: 'a', enabled: 1 },
    { kind: 'auto-spend', actorId: 'a', enabled: undefined },
    { kind: 'actor-auto', actorId: 'a', enabled: 'true' },
    { kind: 'actor-auto', actorId: null, enabled: false },
    { kind: 'actor-auto', actorId: 'a', enabled: true, mode: 'auto-play' },
    { kind: 'camp', actorId: 'a' },
    { kind: 'camp', actorId: 'a', skillId: 'teleport' },
    { kind: 'camp', actorId: 'a', skillId: 'slash' },
    { kind: 'camp', actorId: 'a', skillId: 'heal', targetId: 'other' },
    { kind: 'camp', actorId: 'a', skillId: 'heal', now: 0 },
    { kind: 'camp', actorId: undefined, skillId: 'heal' },
  ])('rejects malformed or unsupported input %j', input => {
    expect(() => rosterCommand(input)).toThrow();
  });
});

describe('canonical party command application', () => {
  it('dispatches attribute and actor policies without hidden state or immediate auto allocation', () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date('2026-10-13T13:00:00.000Z'));
    const state = rosterFixture(), actorId = state.party[0].id;
    state.party[0].attributes.available = 3;
    const before = structuredClone(state);
    const spent = applyRosterCommand(state, rosterCommand({ kind: 'spend-attribute', actorId, attribute: 'intellect' }));
    expect(spent.party[0].attributes.available).toBe(2);
    expect(spent.party[0].maxMp).toBe(state.party[0].maxMp + 2);
    const manual = applyRosterCommand(spent, rosterCommand({ kind: 'auto-spend', actorId, enabled: false }));
    const automatic = applyRosterCommand(manual, rosterCommand({ kind: 'auto-spend', actorId, enabled: true }));
    expect(automatic.party[0].autoSpendPoints).toBe(true);
    expect(automatic.party[0].attributes.available).toBe(2);
    const next = applyRosterCommand(automatic, rosterCommand({ kind: 'actor-auto', actorId, enabled: false }));
    expect(next.party[0].autoBattle).toBe(false);
    expect(next.updatedAt).toBe('2026-10-13T13:00:00.000Z');
    expect(next.party[1]).toBe(state.party[1]);
    expect(next.inventory).toBe(state.inventory);
    expect(next.stash).toBe(state.stash);
    expect(next.mode).toBe(state.mode);
    expect(Object.keys(next).sort()).toEqual(Object.keys(state).sort());
    expect(encodeActor(next.party[0])).toMatchObject({ autoBattle: false, autoSpendPoints: true, attributes: { available: 2 } });
    expect(state).toEqual(before);
  });

  it.each(['heal', 'groupHeal', 'resurrect'] as const)('dispatches %s with persistent real costs and a host-owned clock', skillId => {
    const state = rosterFixture({ activityLog: Array.from({ length: 12 }, (_, i) => `Entry ${i}`) });
    state.party[0].hp = skillId === 'resurrect' ? 0 : 1;
    const command = rosterCommand({ kind: 'camp', actorId: state.party[2].id, skillId });
    const next = applyRosterCommand(state, command, 10000);
    expect(next.party[0].hp).toBeGreaterThan(state.party[0].hp);
    expect(next.party[2].mp).toBe(state.party[2].mp - (skillId === 'heal' ? 4 : skillId === 'groupHeal' ? 8 : 20));
    expect(next.updatedAt).toBe('1970-01-01T00:00:10.000Z');
    expect(next.activityLog).toHaveLength(12);
    const stored = next.party.map(encodeActor);
    expect(stored[2].gcdUntil).toBe(10250);
    expect(stored[2].skills.find(skill => skill.id === skillId)?.cooldownUntil).toBeGreaterThan(10000);
    expect(applyRosterCommand({ ...next, party: stored }, command, 10100).party).toBe(stored);
    expect(state.party[2].gcdUntil).toBeUndefined();
    expect(next.inventory).toBe(state.inventory);
    expect(next.stash).toBe(state.stash);
  });

  it.each([
    { kind: 'spend-attribute', actorId: 'absent', attribute: 'strength' },
    { kind: 'auto-spend', actorId: 'absent', enabled: false },
    { kind: 'actor-auto', actorId: 'absent', enabled: false },
    { kind: 'camp', actorId: 'absent', skillId: 'heal' },
  ])('keeps missing actors unchanged for %j', input => {
    const state = rosterFixture();
    expect(applyRosterCommand(state, rosterCommand(input))).toBe(state);
  });
});
