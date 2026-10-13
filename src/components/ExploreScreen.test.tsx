import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { ExploreScreen } from './ExploreScreen';
import { exploreView } from './ExploreScreen.test-support';
import { earnedCell, knowledgeFixture } from '../persistence/canonical/knowledge/region.test-support';
import { checkpointJson } from '../persistence/canonical/game/checkpoint';

const read = vi.hoisted(() => vi.fn((_snapshot: unknown, _scope: unknown) => ({ pending: false })));
vi.mock('../hooks/useMazePerception', () => ({ useMazePerception: read }));
vi.mock('./MazeCanvas', () => ({ MazeCanvas: () => <canvas /> }));
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
