import { describe, expect, it } from 'vitest';
import { createNewGameState } from '../gameFactory';
import { createPlayTelemetry, MAX_PLAY_EVENTS, recordTransition } from './transitions';

describe('play telemetry', () => {
  it('does not count stack transfers, consolidation, or locking as item gains/losses', () => {
    const game = createNewGameState();
    const herb = game.inventory.items.find(i => i.consumableEffect === 'heal')!;
    game.inventory.items = [{ ...herb, quantity: 10 }];
    const next = { ...game, inventory: { ...game.inventory, items: [{ ...herb, id: 'new-pack-id', quantity: 3, locked: true }] },
      stash: { ...game.stash, items: [{ ...herb, id: 'new-stash-id', quantity: 7 }] } };
    const log = recordTransition(createPlayTelemetry(game.id), game, next, { action: 'stash', source: 'manual' });
    expect(log.counters.itemsAdded).toBe(0);
    expect(log.counters.itemsRemoved).toBe(0);
  });
  it('counts objective completion once and distinguishes manual and automatic actions', () => {
    const game = createNewGameState();
    const chest = game.chests[0];
    const opened = { ...game, chests: game.chests.map(c => c.id === chest.id ? { ...c, opened: true } : c) };
    let log = recordTransition(createPlayTelemetry(game.id), game, opened, { action: 'move', source: 'manual' });
    log = recordTransition(log, opened, opened, { action: 'auto-step', source: 'auto' });
    expect(log.counters.chests).toBe(1);
    expect(log.sources).toEqual({ manual: 1, auto: 1, system: 0 });
    expect(log.counters.noProgress).toBe(1);
  });

  it('retains totals while bounding the detailed history', () => {
    const game = createNewGameState();
    let log = createPlayTelemetry(game.id);
    for (let i = 0; i < MAX_PLAY_EVENTS + 30; i++) log = recordTransition(log, game, game, { action: 'move', source: 'manual' });
    expect(log.events).toHaveLength(MAX_PLAY_EVENTS);
    expect(log.counters.actions).toBe(MAX_PLAY_EVENTS + 30);
    expect(log.events[0].sequence).toBe(31);
  });

  it('flags unfinished descents and records portal consumption without counting it as a win', () => {
    const game = createNewGameState();
    const descended = { ...game, dungeonLevel: 2 };
    let log = recordTransition(createPlayTelemetry(game.id), game, descended, { action: 'auto-step', source: 'auto' });
    expect(log.counters.prematureDescents).toBe(1);
    const town = { ...descended, mode: 'town' as const, inventory: { ...game.inventory, items: game.inventory.items.filter(i => i.consumableEffect !== 'townPortal') } };
    log = recordTransition(log, descended, town, { action: 'portal', source: 'manual' });
    expect(log.counters.portalsUsed).toBe(1);
    expect(log.counters.battlesWon).toBe(0);
  });
});
