// @vitest-environment node
import { afterEach, expect, it, vi } from 'vitest';
import { observePositionEvidence } from './observe';
import { loadWorldRoom } from '../world/residency';
import { loadFloor } from '../world/records';
import { loadRoomContent } from '../content/records';
import type { WorldRead } from '../world/types';

vi.mock('../content/preparation', () => ({ requireWorldContent: vi.fn() }));
vi.mock('../world/residency', () => ({ loadWorldRoom: vi.fn() }));
vi.mock('../content/records', () => ({ loadRoomContent: vi.fn(async () => null), loadChest: vi.fn() }));
vi.mock('../world/records', async original => ({ ...await original<typeof import('../world/records')>(), loadFloor: vi.fn() }));
afterEach(() => vi.clearAllMocks());

it('normal radius-seven sight classifies only represented spaces using actual spec kind, never IDs or hidden specs', async () => {
  const a = 'misleading-passage-name', b = 'misleading-room-name', hidden = 'undisclosed';
  const first = { spaceId: a, row: 0, column: 0 }, portal = { id: 'join', from: { ...first, column: 4 }, to: { spaceId: b, row: 0, column: 0 }, direction: 'east' };
  const far = { id: 'far', from: { spaceId: b, row: 0, column: 2 }, to: { spaceId: hidden, row: 0, column: 0 }, direction: 'east' };
  vi.mocked(loadFloor).mockResolvedValue({ entry: first, exit: far.to } as never);
  vi.mocked(loadWorldRoom).mockImplementation(async (_pages, _level, spaceId) => {
    expect(spaceId).not.toBe(hidden);
    const room = spaceId === a, length = room ? 5 : 3;
    return { space: { spec: { id: spaceId, kind: room ? 'room' : 'passage', origin: { row: 0, column: room ? 0 : 5 }, hiddenRole: 'never-disclose' } },
      geometry: { cells: Array.from({ length }, (_, column) => ({ row: 0, column,
        links: [...(column ? ['west'] : []), ...(column < length - 1 ? ['east'] : [])] })) }, connections: room ? [portal] : [portal, far] } as never;
  });
  const result = await observePositionEvidence({} as WorldRead, { level: 1, cell: first });
  expect(result.cells).toHaveLength(8);
  expect(result.spaces).toEqual([{ spaceId: a, kind: 'room', index: 0 }, { spaceId: b, kind: 'passage', index: 5 }]);
  expect(result.cells[7].edges).not.toHaveProperty('east');
  expect(JSON.stringify(result)).not.toContain(hidden); expect(JSON.stringify(result)).not.toContain('never-disclose');
  expect(vi.mocked(loadRoomContent).mock.calls.map(call => call[2])).toEqual([a]);
});
