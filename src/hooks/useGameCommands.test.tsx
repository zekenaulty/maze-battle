import { cleanup, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { GameState } from '../domain/types';
import { createNewGameState } from '../domain/gameFactory';
import { useGameCommands } from './useGameCommands';
import type { GameTransition } from './useGameLoop';

const sell = vi.hoisted(() => vi.fn((game: GameState) => game));
vi.mock('../domain/items/inventory', async (original) => ({ ...await original<typeof import('../domain/items/inventory')>(), sellItem: sell }));
afterEach(() => { cleanup(); sell.mockClear(); });

describe('sale command contract', () => {
  it.each([undefined, 1, 7])('forwards explicit quantity %s to the current-state domain transition', (amount) => {
    const transition = vi.fn<GameTransition>();
    const { result } = renderHook(() => useGameCommands(transition));
    result.current.sell('herb', amount);
    const [update, context] = transition.mock.calls[0];
    expect(context).toEqual({ action: 'sell', source: 'manual' });
    const current = createNewGameState({ mode: 'town' });
    expect(update(current)).toBe(current);
    expect(sell).toHaveBeenCalledExactlyOnceWith(current, 'herb', amount ?? 1);
  });
});
