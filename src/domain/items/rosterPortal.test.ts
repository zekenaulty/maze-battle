import { afterEach, describe, expect, it, vi } from 'vitest';
import type { RosterState } from '../party/roster';
import { canUseTownPortal, portalScrollCount, useTownPortal } from '../town/portal';
import { useConsumable } from './inventory';
import { roster, rosterItem } from './roster.testSupport';

afterEach(() => vi.useRealTimers());

describe('roster-only shared portal charges', () => {
  it.each(['manual', 'auto-play', 'waves'] as const)('consumes the same charge through either entry path in %s', mode => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-02-01T00:00:00.000Z'));
    const scroll = rosterItem('town-portal', { quantity: 2 });
    const game = roster([scroll], { mode });
    const town = useTownPortal(game);
    expect(useConsumable(game, scroll.id)).toEqual(town);
    expect(town.mode).toBe('town');
    expect(town.townReturnMode).toBe(mode);
    expect(town.updatedAt).toBe('2026-02-01T00:00:00.000Z');
    expect(town.activityLog).toEqual(['Town portal opened.']);
    expect(portalScrollCount(town)).toBe(1);
    expect(town.dungeonLevel).toBe(7);
    expect(town.party).toBe(game.party);
    expect(town).not.toHaveProperty('maze');
    expect(town).not.toHaveProperty('floors');
    expect(useTownPortal(town)).toBe(town);
    expect(useConsumable(town, scroll.id)).toBe(town);
    expect(game.inventory.items[0].quantity).toBe(2);
  });

  it('rejects locked, empty, stash-only, ambiguous, combat, town and defeated states', () => {
    const scroll = rosterItem('town-portal');
    const game = roster([scroll], { mode: 'manual' });
    const cases: RosterState[] = [
      roster([{ ...scroll, locked: true }], { mode: 'manual' }),
      roster([{ ...scroll, quantity: 0 }], { mode: 'manual' }),
      roster([], { mode: 'manual', stash: { capacity: 96, items: [scroll] } }),
      { ...game, stash: { capacity: 96, items: [{ ...scroll }] } },
      { ...game, battle: { id: 'battle', status: 'active', wave: 1, round: 1, enemies: [], log: [] } },
      { ...game, mode: 'battle' },
      { ...game, mode: 'town' },
      { ...game, party: game.party.map(actor => ({ ...actor, hp: 0 })) },
    ];
    for (const state of cases) {
      expect(canUseTownPortal(state)).toBe(false);
      expect(useTownPortal(state)).toBe(state);
      expect(useConsumable(state, scroll.id)).toBe(state);
    }
  });

  it('consumes only the selected stack and clears completed battles', () => {
    const first = rosterItem('town-portal', { quantity: 2 });
    const selected = { ...first, id: 'selected', quantity: 1 };
    const game = roster([first, selected], {
      mode: 'waves', battle: { id: 'won', status: 'won', wave: 1, round: 1, enemies: [], log: [] },
    });
    expect(useTownPortal(game, 'stale')).toBe(game);
    const town = useConsumable(game, selected.id);
    expect(town.inventory.items).toEqual([first]);
    expect(town.battle).toBeUndefined();
    expect(town.townReturnMode).toBe('waves');
  });
});
