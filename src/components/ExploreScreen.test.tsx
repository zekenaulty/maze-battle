import { afterEach, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { ComponentProps } from 'react';
import { ExploreScreen } from './ExploreScreen';
import type { MazeCanvas } from './MazeCanvas';
import { exploreView } from './ExploreScreen.test-support';
import { earnedCell, knowledgeFixture } from '../persistence/canonical/knowledge/region.test-support';
import { checkpointJson } from '../persistence/canonical/game/checkpoint';
import type { GameView } from '../services/game/GameView';
import type { KnowledgeRegionScope } from '../persistence/canonical/knowledge/region';

const read = vi.hoisted(() => vi.fn((_snapshot: unknown, _scope: unknown) => ({ pending: false })));
const canvas = vi.hoisted(() => vi.fn((_props: ComponentProps<typeof MazeCanvas>) => undefined));
vi.mock('../hooks/useMazePerception', () => ({ useMazePerception: read }));
vi.mock('./MazeCanvas', () => ({ MazeCanvas: (props: ComponentProps<typeof MazeCanvas>) => { canvas(props); return <canvas />; } }));
afterEach(() => { cleanup(); vi.clearAllMocks(); });
const noop = () => {};
const props = { status: 'Ready', autoActive: false, wavesActive: false, autoThrottleMs: 500, onMove: noop,
  onAutoToggle: noop, onWavesToggle: noop, onAutoThrottleChange: noop, onTown: noop, onCharacters: noop, onSaves: noop,
  onNewGame: noop, onRandomBattlesChange: noop };
it('passes the canonical snapshot and only exposes a chest from current visible observation', async () => {
  const game = exploreView(), f = knowledgeFixture(), cell = earnedCell();
  game.observation = await f.observe([cell]); game.checkpoint = f.checkpoint(); game.snapshot.checkpoint = checkpointJson(game.checkpoint);
  const open = vi.fn(), { rerender } = render(<ExploreScreen {...props} game={game} onOpenChest={open} observationHead="ignored-legacy-id" />);
  expect(read.mock.calls.at(-1)?.[0]).toEqual(game.snapshot);
  fireEvent.click(screen.getByRole('button', { name: 'Open chest' })); expect(open).toHaveBeenCalledWith('chest');
  rerender(<ExploreScreen {...props} game={{ ...game, observation: null }} onOpenChest={open} chests={[cell.world]} />);
  expect(screen.getByRole('button', { name: 'Open chest' })).toBeDisabled();
  rerender(<ExploreScreen {...props} game={{ ...game, observation: { ...game.observation,
    cells: [{ ...cell, chests: [{ id: 'chest', opened: true }] }] } }} onOpenChest={open} />);
  expect(screen.getByRole('button', { name: 'Open chest' })).toBeDisabled(); expect(open).toHaveBeenCalledTimes(1);
});

function latestCanvas() { return canvas.mock.calls.at(-1)![0]; }
function latestScope() { return read.mock.calls.at(-1)![1] as KnowledgeRegionScope; }
function inspectCamera() {
  act(() => latestCanvas().onCameraChange(current => ({ ...current, mode: 'manual', origin: { row: -100, column: -200 } })));
}
async function observedGame() {
  const game = exploreView(), fixture = knowledgeFixture();
  game.observation = await fixture.observe([earnedCell(25, 13)]); game.checkpoint = fixture.checkpoint();
  game.snapshot.checkpoint = checkpointJson(game.checkpoint);
  return game;
}
function changedGame(game: GameView, update: (next: GameView) => void) {
  const next = structuredClone(game); next.snapshot.revision++;
  update(next); next.snapshot.checkpoint = checkpointJson(next.checkpoint); return next;
}
function expectCentered(game: GameView) {
  const scope = latestScope(), world = game.observation!.cells[0].world;
  expect(scope.row).toBe(world.row - Math.floor(scope.rows / 2));
  expect(scope.column).toBe(world.column - Math.floor(scope.columns / 2));
}

it('immediately follows a moved actor with the inspected zoom and keeps following when the actor returns', async () => {
  const game = await observedGame(), { rerender } = render(<ExploreScreen {...props} game={game} />);
  act(() => latestCanvas().onSizeChange?.({ width: 1397, height: 1197 }));
  fireEvent.click(screen.getByRole('button', { name: 'Zoom in' })); inspectCamera();
  expect(latestCanvas().camera).toEqual({ mode: 'manual', zoom: 1.15, origin: { row: -100, column: -200 } });
  const moved = changedGame(game, next => {
    next.checkpoint.position.cell.row++;
    next.observation!.header.actor = structuredClone(next.checkpoint.position);
    next.observation!.cells[0].at = structuredClone(next.checkpoint.position);
    next.observation!.cells[0].world.row++;
  });
  const firstMovementRender = canvas.mock.calls.length;
  rerender(<ExploreScreen {...props} game={moved} />);
  for (const [frame] of canvas.mock.calls.slice(firstMovementRender))
    expect(frame.camera).toEqual({ mode: 'follow', zoom: 1.15, origin: undefined });
  expectCentered(moved);
  rerender(<ExploreScreen {...props} game={changedGame(game, () => {})} />);
  expect(latestCanvas().camera).toEqual({ mode: 'follow', zoom: 1.15, origin: undefined });
  expectCentered(game);
});

it('preserves manual inspection and zoom when a newer snapshot has not changed the actor address', async () => {
  const game = await observedGame(), { rerender } = render(<ExploreScreen {...props} game={game} />);
  fireEvent.click(screen.getByRole('button', { name: 'Zoom in' })); inspectCamera();
  const before = structuredClone(latestCanvas().camera), scope = structuredClone(latestScope());
  const blocked = changedGame(game, next => { next.snapshot.roots.execution = 'blocked-move-receipt'; });
  const firstBlockedRender = canvas.mock.calls.length;
  rerender(<ExploreScreen {...props} game={blocked} status="Movement blocked" />);
  for (const [frame] of canvas.mock.calls.slice(firstBlockedRender)) expect(frame.camera).toEqual(before);
  expect(latestScope()).toEqual(scope);
  expect(screen.getByLabelText('Camera zoom 115%')).toBeVisible();
});

it.each(['floor', 'generation', 'game identity'] as const)('resets inspection immediately on a new %s while retaining zoom', async identity => {
  const game = await observedGame(), { rerender } = render(<ExploreScreen {...props} game={game} />);
  fireEvent.click(screen.getByRole('button', { name: 'Zoom out' })); inspectCamera();
  const next = changedGame(game, next => {
    if (identity === 'generation') next.snapshot.generation = 'another-generation';
    else if (identity === 'game identity') { next.id = 'another-game'; next.snapshot.gameId = next.id; }
    else {
      next.checkpoint.position.level++;
      next.observation!.header.actor.level = next.checkpoint.position.level;
      next.observation!.cells[0].at.level = next.checkpoint.position.level;
    }
  });
  const firstResetRender = canvas.mock.calls.length;
  rerender(<ExploreScreen {...props} game={next} />);
  for (const [frame] of canvas.mock.calls.slice(firstResetRender))
    expect(frame.camera).toEqual({ mode: 'follow', zoom: 0.85, origin: undefined });
  expectCentered(next);
});

it('keeps pan, zoom and recenter interactions local without issuing game commands', async () => {
  const game = await observedGame(), before = structuredClone(game);
  const commands = { onMove: vi.fn(), onAutoToggle: vi.fn(), onWavesToggle: vi.fn(), onAutoThrottleChange: vi.fn(),
    onTown: vi.fn(), onCharacters: vi.fn(), onSaves: vi.fn(), onNewGame: vi.fn(), onRandomBattlesChange: vi.fn(),
    onOpenChest: vi.fn(), onStopWalking: vi.fn(), onTileClick: vi.fn(), onStageMove: vi.fn(async () => undefined), onStageStairs: vi.fn() };
  render(<ExploreScreen {...props} {...commands} game={game} />);
  inspectCamera(); fireEvent.click(screen.getByRole('button', { name: 'Zoom in' }));
  expect(latestCanvas().camera).toEqual({ mode: 'manual', zoom: 1.15, origin: { row: -100, column: -200 } });
  fireEvent.click(screen.getByRole('button', { name: 'Recenter camera' }));
  expect(latestCanvas().camera).toEqual({ mode: 'follow', zoom: 1.15, origin: undefined });
  expectCentered(game);
  fireEvent.click(screen.getByRole('button', { name: 'Zoom out' }));
  expect(latestCanvas().camera.zoom).toBe(1);
  for (const command of Object.values(commands)) expect(command).not.toHaveBeenCalled();
  expect(game).toEqual(before);
});
