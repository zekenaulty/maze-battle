import { describe, expect, it } from 'vitest';
import { createNewGameState, normalizeGameState } from './gameFactory';
import { lineMaze, seededRng } from './automation/autopilotTestFixtures';
import { gear, supply } from './items/__tests__/fixtures';
import { normalizeInventoryPolicy } from './items/inventory';
import { generateMaze } from './maze/generate';
import { generateStructuredMaze } from './maze/structuredGenerate';
import { leaveTown } from './town/town';
import type { GameState } from './types';

describe('factory preservation boundaries', () => {
  it.each([true, false])('preserves automationPaused=%s without changing individual autoBattle choices', (automationPaused) => {
    const base = createNewGameState({ maze: lineMaze(3) });
    const flags = [false, true, false];
    let game = createNewGameState({
      ...base, automationPaused,
      inventoryPolicy: { autoEquip: false, autoRestock: false },
      party: base.party.map((actor, index) => ({ ...actor, autoBattle: flags[index] })),
    });
    expect(game).toHaveProperty('automationPaused', automationPaused);
    for (let cycle = 0; cycle < 3; cycle++) {
      game = normalizeGameState(JSON.parse(JSON.stringify(normalizeGameState(game))));
      expect(game).toHaveProperty('automationPaused', automationPaused);
      expect(game.party.map((actor) => actor.autoBattle)).toEqual(flags);
      expect(game.inventoryPolicy).toMatchObject({ autoEquip: false, autoRestock: false });
    }
  });

  it.each([undefined, null, 'true', 'false', 0, 1, [], {}])('omits absent or invalid automationPaused=%j', (automationPaused) => {
    const base = createNewGameState({ maze: lineMaze(3) });
    expect(base).not.toHaveProperty('automationPaused');
    const restored = normalizeGameState({ ...base, automationPaused });
    expect(restored).not.toHaveProperty('automationPaused');
    expect(restored.party.map((actor) => actor.autoBattle)).toEqual(base.party.map((actor) => actor.autoBattle));
    expect(createNewGameState(JSON.parse(JSON.stringify({ ...base, automationPaused })))).not.toHaveProperty('automationPaused');
  });

  it('normalizes partial policies without enabling explicitly disabled automation', () => {
    const game = createNewGameState({
      maze: lineMaze(3),
      inventoryPolicy: { autoEquip: false, autoRestock: false, healthReserve: Infinity, manaReserve: -8, portalReserve: 0 },
    });
    expect(game.inventoryPolicy).toEqual({
      autoEquip: false, autoSellJunk: true, autoStash: true, autoRestock: false,
      healthReserve: 3, manaReserve: 0, portalReserve: 1,
    });
    expect(normalizeGameState(JSON.parse(JSON.stringify(game))).inventoryPolicy).toEqual(game.inventoryPolicy);
    const saved = normalizeGameState({ ...game, inventoryPolicy: { autoStash: false, healthReserve: 99, manaReserve: 1.9, portalReserve: 99 } });
    expect(saved.inventoryPolicy).toEqual({ ...normalizeInventoryPolicy(), autoStash: false, healthReserve: 20, manaReserve: 1, portalReserve: 5 });
  });

  it('validates malformed policy values from serialized input and retains legacy absence', () => {
    const base = createNewGameState({ maze: lineMaze(3) });
    const malformed = JSON.parse('{"autoEquip":"false","autoSellJunk":0,"autoStash":false,"healthReserve":"20","manaReserve":null,"portalReserve":-5}');
    expect(normalizeGameState({ ...base, inventoryPolicy: malformed }).inventoryPolicy).toEqual({ ...normalizeInventoryPolicy(), autoStash: false });
    expect(createNewGameState({ ...base, inventoryPolicy: malformed }).inventoryPolicy).toEqual({ ...normalizeInventoryPolicy(), autoStash: false });
    expect(normalizeGameState(base).inventoryPolicy).toBeUndefined();
    expect(normalizeInventoryPolicy(normalizeGameState(base).inventoryPolicy)).toEqual(normalizeInventoryPolicy());
  });

  it.each([undefined, null, 'town', 'battle', 'unknown', 1, true, [], {}])('rejects invalid town return mode %j', (townReturnMode) => {
    const base = createNewGameState({ maze: lineMaze(3), mode: 'town' });
    const restored = normalizeGameState({ ...base, townReturnMode });
    expect(restored.townReturnMode).toBeUndefined();
    expect(leaveTown(restored).mode).toBe('manual');
    expect(createNewGameState(JSON.parse(JSON.stringify({ ...base, townReturnMode }))).townReturnMode).toBeUndefined();
  });

  it('does not perform maintenance, spend gold, discard overflow or alter vitals on reload', () => {
    const items = [gear('equipped', { vitality: 5, intellect: 5 }, { locked: true }), gear('junk', {}), supply('town-portal', 2), supply('health-herb', 7)];
    const base = createNewGameState({
      mode: 'town', townReturnMode: 'auto-play', maze: lineMaze(3), inventoryPolicy: normalizeInventoryPolicy(),
      inventory: { capacity: 1, gold: 103, items },
      stash: { capacity: 0, items: [gear('valuable', { baseDamage: 5 }, { rarity: 'rare' })] },
    });
    let game: GameState = { ...base, party: base.party.map((actor, i) => i === 0
      ? { ...actor, equipment: { weapon: 'equipped' }, hp: actor.maxHp + 8, mp: actor.maxMp + 9 } : actor) };
    for (let cycle = 0; cycle < 3; cycle++) {
      game = normalizeGameState(JSON.parse(JSON.stringify(normalizeGameState(game))));
      expect(game.inventory).toEqual(base.inventory);
      expect(game.stash).toEqual(base.stash);
      expect(game.party[0].equipment.weapon).toBe('equipped');
      expect(game.party[0].hp).toBe(base.party[0].maxHp + 8);
      expect(game.party[0].mp).toBe(base.party[0].maxMp + 9);
    }
  });

  it.each([7, 42])('retains complete v2 graphs on active and inactive floors alongside legacy geometry (seed %i)', (seed) => {
    const rng = seededRng(seed);
    const maze = generateStructuredMaze(15, 19, rng);
    const inactive = generateStructuredMaze(9, 13, rng);
    const legacy = { ...generateMaze(9, 13, rng), layout: { version: 'structured-v1' as const, rooms: [], mainPath: [], zones: [] } };
    const original = createNewGameState({
      dungeonLevel: 2, maze, mode: 'town', townReturnMode: 'waves',
      floors: [
        { level: 1, maze: legacy, mazeMaxRooms: 32 },
        { level: 2, maze, mazeMaxRooms: 42 },
        { level: 3, maze: inactive, mazeMaxRooms: 56 },
      ],
    });
    expect(original.maze.layout?.connections?.length).toBeGreaterThan(0);
    let restored = original;
    for (let cycle = 0; cycle < 3; cycle++) {
      restored = normalizeGameState(JSON.parse(JSON.stringify(restored)));
      expect(restored.maze).toEqual(original.maze);
      expect(restored.floors).toEqual(original.floors);
      expect(restored.maze.layout?.version).toBe('structured-v2');
      expect(restored.floors[0].maze.layout?.version).toBe('structured-v1');
    }
    const fromStoredFloor = normalizeGameState({ ...restored, maze: undefined });
    expect(fromStoredFloor.maze).toEqual(original.maze);
    expect(fromStoredFloor.floors).toEqual(original.floors);
    expect(leaveTown(fromStoredFloor).mode).toBe('waves');
  });
});
