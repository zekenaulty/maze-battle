import { afterEach, expect, it, vi } from 'vitest';
import { gameCheckpoint } from '../game/checkpoint';
import { autoCombatFixture } from './combat.test-support';

afterEach(() => vi.restoreAllMocks());

it('reaches a guild-named kill target only through actual earned Auto movement, then starts shared combat', async () => {
  const f = await autoCombatFixture(false); vi.spyOn(Math, 'random').mockReturnValue(0);
  expect(gameCheckpoint(f.head().checkpoint).position.cell.spaceId).not.toBe(f.contract.targetRoomId);
  let moves = 0, started = false;
  for (let n = 0; n < 256; n++) {
    const before = gameCheckpoint(f.head().checkpoint), result = (await f.tick()).receipt.result;
    expect(result).not.toMatchObject({ outcome: 'blocked' });
    const after = gameCheckpoint(f.head().checkpoint), state = (await f.state())!;
    expect(state.objective?.id).toBe(f.contract.id);
    expect(state.route?.steps.length ?? 0).toBeLessThanOrEqual(64);
    if (after.mode === 'battle') {
      expect(before.position.cell.spaceId).toBe(f.contract.targetRoomId);
      expect(result).toMatchObject({ action: { kind: 'start', channel: 'battle' } });
      expect((await f.current())!.origin).toEqual(before.position); started = true; break;
    }
    if (JSON.stringify(before.position) !== JSON.stringify(after.position)) {
      moves++; expect(result).toMatchObject({ action: { kind: 'move', moved: true, channel: 'exploration' } });
    }
  }
  expect(started).toBe(true); expect(moves).toBeGreaterThan(0);
}, 90_000);
