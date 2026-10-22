import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { ComponentProps } from 'react';
import type { MazeCanvas } from './MazeCanvas';
import type { KnownNode, KnownPage } from '../persistence/canonical/knowledge/graph';
import { ExploreScreen } from './ExploreScreen';
import { exploreView } from './ExploreScreen.test-support';
import { ignoresGameKey } from '../hooks/gameKeys';

const storage = vi.hoisted(() => ({ page: vi.fn(), anchor: vi.fn(), canvas: vi.fn(), region: vi.fn() }));
vi.mock('../persistence/canonical/knowledge/roomMap', () => ({ readCanonicalRooms: storage.page, readCanonicalRoomAnchor: storage.anchor }));
vi.mock('../hooks/useMazePerception', () => ({ useMazePerception: storage.region }));
vi.mock('./MazeCanvas', () => ({ MazeCanvas: (props: ComponentProps<typeof MazeCanvas>) => {
  storage.canvas(props);
  return <button aria-label="Canvas tile" onClick={() => props.onTileClick?.({ row: 0, column: 0 })}>Tile</button>;
} }));
const node: KnownNode = { level: 1, spaceId: 'earned-room', kind: 'room', anchor: {
  at: { level: 1, cell: { spaceId: 'earned-room', row: 1, column: 2 } }, world: { row: -80, column: 400 },
  source: { sequence: 1, id: 'sight', index: 0 },
} };
const page: KnownPage<KnownNode> = { anchor: { sequence: 1, id: 'sight', witness: 'witness' }, items: [node], next: 'next' };
const props = () => ({ game: exploreView(), status: 'Ready', autoActive: false, wavesActive: false, autoThrottleMs: 500,
  onMove: vi.fn(), onAutoToggle: vi.fn(), onWavesToggle: vi.fn(), onAutoThrottleChange: vi.fn(), onTown: vi.fn(),
  onCharacters: vi.fn(), onSaves: vi.fn(), onNewGame: vi.fn(), onRandomBattlesChange: vi.fn(), onTileClick: vi.fn(),
  onStopWalking: vi.fn(), onOpenChest: vi.fn(), portalScrollCount: 1 });
beforeEach(() => {
  vi.resetAllMocks(); storage.page.mockResolvedValue({ value: page }); storage.anchor.mockResolvedValue({ value: node.anchor });
  storage.region.mockReturnValue({ pending: false });
});
afterEach(cleanup);

it('opens Rooms only on Map/M, shows only room markers by default, and preserves Nearby overview and camera controls', async () => {
  const p = props(); render(<ExploreScreen {...p} />);
  expect(storage.page).not.toHaveBeenCalled(); expect(screen.getByRole('button', { name: 'Zoom in' })).toBeEnabled();
  fireEvent.keyDown(window, { key: 'm' });
  expect(screen.getByRole('tab', { name: 'Rooms' })).toHaveAttribute('aria-selected', 'true');
  expect(screen.queryByRole('button', { name: 'Canvas tile' })).not.toBeInTheDocument();
  expect(await screen.findByRole('button', { name: 'Recall room at -80, 400' })).toBeEnabled();
  expect(within(screen.getByRole('group', { name: 'Earned room map' })).getAllByRole('button')).toHaveLength(1);
  fireEvent.click(screen.getByRole('tab', { name: 'Nearby' }));
  expect(storage.canvas.mock.calls.at(-1)?.[0].mode).toBe('overview');
  fireEvent.click(screen.getByRole('button', { name: 'Map' }));
  expect(storage.canvas.mock.calls.at(-1)?.[0].mode).toBe('camera');
  fireEvent.click(screen.getByRole('button', { name: 'Zoom in' }));
  expect(storage.canvas.mock.calls.at(-1)?.[0].camera.zoom).toBe(1.15);
  fireEvent.click(screen.getByRole('button', { name: 'Recenter camera' }));
  expect(storage.canvas.mock.calls.at(-1)?.[0].camera.mode).toBe('follow');
});

it('recalls an exact anchor into a read-only local viewport, without any game action', async () => {
  const p = props(); render(<ExploreScreen {...p} />);
  fireEvent.click(screen.getByRole('button', { name: 'Map' }));
  fireEvent.click(await screen.findByRole('button', { name: 'Recall room at -80, 400' }));
  await waitFor(() => expect(screen.getByRole('tab', { name: 'Nearby' })).toHaveAttribute('aria-selected', 'true'));
  expect(storage.anchor.mock.calls[0].slice(0, 2)).toEqual([p.game.snapshot, node]);
  const canvas = storage.canvas.mock.calls.at(-1)![0] as ComponentProps<typeof MazeCanvas>;
  expect(canvas.mode).toBe('camera'); expect(canvas.camera.mode).toBe('manual');
  const scope = storage.region.mock.calls.at(-1)![1];
  expect(scope.row + Math.floor(scope.rows / 2)).toBe(-80); expect(scope.column + Math.floor(scope.columns / 2)).toBe(400);
  expect(storage.region.mock.calls.at(-1)![0]).toEqual(p.game.snapshot);
  expect(canvas.onTileClick).toBeUndefined(); expect(screen.getByRole('button', { name: 'Move north' })).toBeDisabled();
  fireEvent.click(screen.getByRole('button', { name: 'Canvas tile' })); fireEvent.keyDown(window, { key: 'e' }); fireEvent.keyDown(window, { key: 't' });
  for (const effect of [p.onMove, p.onTileClick, p.onTown, p.onOpenChest, p.onAutoToggle, p.onWavesToggle, p.onNewGame]) expect(effect).not.toHaveBeenCalled();
  expect(screen.getByText('Room anchor -80, 400')).toBeInTheDocument();
});

it('consumes movement keys before the parent handler but leaves tab navigation and M available', async () => {
  const moved = vi.fn(), keyboard = (event: KeyboardEvent) => { if (!ignoresGameKey(event) && event.key === 'w') moved(); };
  window.addEventListener('keydown', keyboard);
  try {
    render(<ExploreScreen {...props()} />); fireEvent.keyDown(window, { key: 'm' });
    await screen.findByRole('button', { name: 'Recall room at -80, 400' });
    fireEvent.keyDown(window, { key: 'w' }); expect(moved).not.toHaveBeenCalled();
    fireEvent.keyDown(screen.getByRole('tab', { name: 'Rooms' }), { key: 'ArrowRight' });
    expect(screen.getByRole('tab', { name: 'Nearby' })).toHaveFocus();
    fireEvent.keyDown(window, { key: 'm' }); fireEvent.keyDown(window, { key: 'w' }); expect(moved).toHaveBeenCalledTimes(1);
  } finally { window.removeEventListener('keydown', keyboard); }
});

it('replaces pages, exposes empty/error states, and retries without displaying failed page content', async () => {
  render(<ExploreScreen {...props()} />); fireEvent.click(screen.getByRole('button', { name: 'Map' }));
  await screen.findByRole('button', { name: 'Recall room at -80, 400' });
  storage.page.mockRejectedValueOnce(Error('bad cursor')); fireEvent.click(screen.getByRole('button', { name: 'Next room page' }));
  expect(screen.queryByRole('group', { name: 'Earned room map' })).not.toBeInTheDocument();
  expect(await screen.findByRole('alert')).toHaveTextContent('Room evidence unavailable');
  storage.page.mockResolvedValueOnce({ value: { ...page, items: [], next: undefined } });
  fireEvent.click(screen.getByRole('button', { name: 'Retry' })); expect(await screen.findByText('No earned rooms')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Next room page' })).toBeDisabled(); expect(screen.getByText('Page 1')).toBeInTheDocument();
});

it('clears a recalled location and its label on a new snapshot, and resets pagination', async () => {
  const p = props(), { rerender } = render(<ExploreScreen {...p} />);
  fireEvent.click(screen.getByRole('button', { name: 'Map' }));
  fireEvent.click(await screen.findByRole('button', { name: 'Recall room at -80, 400' }));
  await screen.findByText('Room anchor -80, 400');
  rerender(<ExploreScreen {...p} game={{ ...p.game, snapshot: { ...p.game.snapshot, revision: 2 } }} />);
  expect(screen.queryByText('Room anchor -80, 400')).not.toBeInTheDocument();
  expect(storage.canvas.mock.calls.at(-1)?.[0].camera.mode).toBe('follow');
  fireEvent.click(screen.getByRole('tab', { name: 'Rooms' }));
  await screen.findByRole('button', { name: 'Recall room at -80, 400' });
  expect(storage.page.mock.calls.at(-1)?.[0].revision).toBe(2); expect(storage.page.mock.calls.at(-1)?.[1]).toBeUndefined();
});

it.each(['controlsDisabled', 'agenticActive', 'autoActive'] as const)('cancels pending selection and disables Map on %s', async flag => {
  const p = props(), { rerender } = render(<ExploreScreen {...p} />);
  fireEvent.click(screen.getByRole('button', { name: 'Map' }));
  let resolve!: (value: { value: typeof node.anchor }) => void;
  storage.anchor.mockReturnValueOnce(new Promise(done => { resolve = done; }));
  fireEvent.click(await screen.findByRole('button', { name: 'Recall room at -80, 400' }));
  expect(screen.getByRole('button', { name: 'Next room page' })).toBeDisabled();
  const signal = storage.anchor.mock.calls[0][2] as AbortSignal;
  rerender(<ExploreScreen {...p} {...{ [flag]: true }} />);
  expect(screen.getByRole('button', { name: 'Map' })).toBeDisabled(); expect(signal.aborted).toBe(true);
  await act(async () => resolve({ value: node.anchor }));
  expect(screen.queryByText('Room anchor -80, 400')).not.toBeInTheDocument();
  expect(storage.canvas.mock.calls.at(-1)?.[0].camera.mode).toBe('follow');
});
