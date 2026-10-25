// @vitest-environment node
import { beforeAll, beforeEach, expect, it, vi } from 'vitest';
import { STAIR_LAYOUT_VERSION } from '../../../domain/expedition/vertical';
import { preparationMemory } from '../world/preparationCapacity.test-support';
import { loadFloor } from '../world/records';
import type { WorldFloor, WorldPosition } from '../world/types';
import type { ObservedCell } from '../knowledge/types';
import { validateKnowledge } from '../knowledge/evidence';
import type { CanonicalHead } from '../types';
import type { CanonicalWork } from '../transaction';
import { checkpointJson, type GameCheckpoint } from './checkpoint';
import { commitFloorPreparation } from './preparation';

// Knowledge integrity has its own real-source tests. These tests exercise admission after that
// validator, using real retained spatial floor records and stopping BEFORE allocation/mutation.
vi.mock('../knowledge/evidence', () => ({ validateKnowledge: vi.fn() }));
const validate = vi.mocked(validateKnowledge), ADMITTED = 'test: private preparation admission reached';
let fixture: ReturnType<typeof preparationMemory>, floor: WorldFloor;
beforeAll(async () => {
  fixture = preparationMemory(42); await fixture.floor(1, { spatial: STAIR_LAYOUT_VERSION });
  floor = await fixture.read(p => loadFloor(p, 1));
});
beforeEach(() => { validate.mockReset(); });

function checkpoint(position: WorldPosition): GameCheckpoint {
  return { schema: 1, kind: 'rpg', mode: 'manual', position: structuredClone(position),
    knowledge: { sequence: 5, id: 'current-observation', witness: 'current-witness' }, facing: 'north', wave: 1,
    createdAt: '2026-10-24T00:00:00.000Z', updatedAt: '2026-10-24T00:00:00.000Z', activityLog: [] };
}
const cell = (at: WorldPosition): ObservedCell => ({ at: structuredClone(at), world: { row: 0, column: 0 }, edges: {}, chests: [], stairs: [] });
function sight(actor: WorldPosition, cells: ObservedCell[]) {
  validate.mockResolvedValue({ header: { actor: structuredClone(actor) }, cells } as Awaited<ReturnType<typeof validateKnowledge>>);
}
async function attempt(c: GameCheckpoint, input: unknown, expected: string, allowed = false) {
  const before = structuredClone([...fixture.records.values()]), cursor = structuredClone(c);
  const allocation = vi.fn(async () => { throw Error(ADMITTED); });
  await expect(fixture.read(pages => commitFloorPreparation({
    head: { checkpoint: checkpointJson(c) } as CanonicalHead, pages, privatePreparation: allocation,
    setCheckpoint() { throw Error('Preparation must not move the actor'); },
    restoreSnapshot() { throw Error('Unexpected restore'); }, liveOperation() { throw Error('Unexpected host operation'); },
  } satisfies CanonicalWork, input, 'preparation-test-attempt'))).rejects.toThrow(expected);
  expect(allocation).toHaveBeenCalledTimes(allowed ? 1 : 0);
  expect([...fixture.records.values()]).toEqual(before); expect(c).toEqual(cursor);
}

it('admits preparation from another cell in the current descending stair room', async () => {
  const c = checkpoint({ level: 1, cell: { ...floor.exit!, column: floor.exit!.column + 1 } });
  sight(c.position, [cell(c.position)]);
  await attempt(c, { level: 2, visibleStairs: true }, ADMITTED, true);
  expect(validate.mock.calls[0][1]).toEqual(c.knowledge);
});
it('admits preparation when current committed sight includes the descending stair room', async () => {
  const c = checkpoint({ level: 1, cell: floor.entry });
  sight(c.position, [cell(c.position), cell({ level: 1, cell: floor.exit! })]);
  await attempt(c, { level: 2, visibleStairs: true }, ADMITTED, true);
});
it('preserves preparation from the exact endpoint without opting into room visibility', async () => {
  const c = checkpoint({ level: 1, cell: floor.exit! });
  await attempt(c, { level: 2 }, ADMITTED, true);
  expect(validate).not.toHaveBeenCalled();
});
it('refuses an unseen descending room before allocating or mutating', async () => {
  const c = checkpoint({ level: 1, cell: floor.entry }); sight(c.position, [cell(c.position)]);
  await attempt(c, { level: 2, visibleStairs: true }, 'descending stair room is outside current sight');
});
it('refuses a stale observation actor even when its cells mention the stair room', async () => {
  const c = checkpoint({ level: 1, cell: floor.entry });
  sight({ level: 1, cell: { ...floor.entry, column: floor.entry.column + 1 } }, [cell({ level: 1, cell: floor.exit! })]);
  await attempt(c, { level: 2, visibleStairs: true }, 'descending stair room is outside current sight');
});
it('does not treat a foreign-floor room name as current visibility', async () => {
  const c = checkpoint({ level: 1, cell: floor.entry });
  sight(c.position, [cell(c.position), cell({ level: 2, cell: floor.exit! })]);
  await attempt(c, { level: 2, visibleStairs: true }, 'descending stair room is outside current sight');
});
it('propagates failed knowledge integrity before allocating', async () => {
  const c = checkpoint({ level: 1, cell: floor.entry }); validate.mockRejectedValue(Error('observation integrity evidence changed'));
  await attempt(c, { level: 2, visibleStairs: true }, 'observation integrity evidence changed');
});
it('requires the explicit room-visibility policy away from the endpoint', async () => {
  const c = checkpoint({ level: 1, cell: floor.entry });
  await attempt(c, { level: 2 }, 'prepare the next floor only at descending stairs or their visible room');
  expect(validate).not.toHaveBeenCalled();
});
it('refuses room-visible preparation without a current knowledge anchor', async () => {
  const c = checkpoint({ level: 1, cell: floor.entry }); c.knowledge = null;
  await attempt(c, { level: 2, visibleStairs: true }, 'prepare the next floor only at descending stairs or their visible room');
  expect(validate).not.toHaveBeenCalled();
});
it('refuses remote preparation from town', async () => {
  const c = checkpoint({ level: 1, cell: floor.entry }); c.mode = 'town';
  await attempt(c, { level: 2, visibleStairs: true }, 'prepare the next floor only at descending stairs or their visible room');
});
it('rejects unsupported policy values and preparations beyond the adjacent floor', async () => {
  const c = checkpoint({ level: 1, cell: floor.entry });
  await attempt(c, { level: 2, visibleStairs: false }, 'invalid stair preparation policy');
  await attempt(c, { level: 3, visibleStairs: true }, 'preparation outside the local floor boundary');
});
