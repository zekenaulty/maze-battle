import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Direction } from '../../../domain/types';
import { opposite } from '../../../domain/maze/movement';
import { loadWorldRoleCompilation, loadWorldRoomRole } from '../world/roles';
import { loadWorldRoom } from '../world/residency';
import { executeSettingsCommand, loadGameSettings } from '../game/settings';
import { executeExplorationCommand } from '../game/explorationCommand';
import { gameCheckpoint } from '../game/checkpoint';
import { mechanicsFixture } from './mechanics.test-support';

afterEach(() => vi.restoreAllMocks());
async function located(kind: string = 'boss', enabled = true) {
  const f = await mechanicsFixture(); f.storage.install();
  const spaceId = await f.read(async p => {
    const state = await loadWorldRoleCompilation(p, 1);
    for (let i = 0; i < state.binding.roomCount; i++) {
      const id = i === 0 ? 'entry' : `socket-${i - 1}:room`;
      if ((await loadWorldRoomRole(p, 1, id)).kind === kind) return id;
    }
    throw Error(`No fixture room with role ${kind}`);
  });
  await f.atRoom(spaceId);
  if (enabled) await executeSettingsCommand(f.request({ kind: 'encounters', enabled: true }, 'settings.command'));
  const direction = await f.read(async p => {
    const c = gameCheckpoint(f.head().checkpoint), room = await loadWorldRoom(p, 1, spaceId);
    return room.geometry.cells.find(cell => cell.row === c.position.cell.row && cell.column === c.position.cell.column)!.links[0] as Direction;
  });
  const move = () => executeExplorationCommand(f.request({ kind: 'move', direction, triggerStairs: false }, 'exploration.command'));
  return { ...f, move, direction };
}

describe('opt-in mandatory movement encounters', () => {
  it('keeps old/fresh settings noncombat by default, with no encounter RNG on movement', async () => {
    const f = await located('boss', false), rng = vi.spyOn(Math, 'random').mockReturnValue(0);
    await f.move(); expect(await f.current()).toBeNull(); expect(rng).not.toHaveBeenCalled();
    expect(await f.read(loadGameSettings)).toEqual({ autoThrottleMs: 500, randomBattles: false });
  });

  it.each([[0.34, true], [0.35, false]] as const)('uses the existing 35-percent roll at %s', async (roll, expected) => {
    const f = await located(); vi.spyOn(Math, 'random').mockReturnValue(roll);
    const before = gameCheckpoint(f.head().checkpoint).position;
    await f.move(); const next = gameCheckpoint(f.head().checkpoint), b = await f.current();
    expect(next.position).not.toEqual(before); expect(Boolean(b)).toBe(expected);
    if (b) { expect(b.origin).toEqual(next.position); expect(next.mode).toBe('battle');
      expect(b.battle.enemies.every(e => e.tags.some(t => ['vermin', 'beast'].includes(t)))).toBe(true); }
  });

  it.each(['start', 'hub', 'safe'])('does not encounter in a %s room', async kind => {
    const f = await located(kind), rng = vi.spyOn(Math, 'random').mockReturnValue(0);
    await f.move(); expect(await f.current()).toBeNull(); expect(rng).not.toHaveBeenCalled();
  });

  it('does not spawn on look or stair travel and preserves the encounter setting across throttle changes', async () => {
    const f = await located('start'), rng = vi.spyOn(Math, 'random').mockReturnValue(0);
    await executeExplorationCommand(f.request({ kind: 'look' }, 'exploration.command'));
    await executeSettingsCommand(f.request({ kind: 'throttle', ms: 700 }, 'settings.command'));
    expect(await f.read(loadGameSettings)).toEqual({ autoThrottleMs: 700, randomBattles: true });
    await executeExplorationCommand(f.request({ kind: 'stairs', direction: 'up' }, 'exploration.command'));
    expect(await f.current()).toBeNull(); expect(rng).not.toHaveBeenCalled(); expect(gameCheckpoint(f.head().checkpoint).mode).toBe('town');
    await executeSettingsCommand(f.request({ kind: 'encounters', enabled: false }, 'settings.command'));
    expect(await f.read(loadGameSettings)).toEqual({ autoThrottleMs: 700, randomBattles: false });
  });

  it('does not roll an encounter when a non-interacting move lands on the actual descent stair', async () => {
    const f = await located('exit', false); await f.move();
    await executeSettingsCommand(f.request({ kind: 'encounters', enabled: true }, 'settings.command'));
    const rng = vi.spyOn(Math, 'random').mockReturnValue(0);
    await executeExplorationCommand(f.request({ kind: 'move', direction: opposite(f.direction), triggerStairs: false }, 'exploration.command'));
    expect(gameCheckpoint(f.head().checkpoint).position.cell).toEqual((await f.floor()).exit);
    expect(await f.current()).toBeNull(); expect(rng).not.toHaveBeenCalled();
  });
});
