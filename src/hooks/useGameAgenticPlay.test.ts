import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createGuildContract } from '../domain/guild/contractFactory';
import { questFromContract } from '../domain/quests/questRules';
import type { GameSession } from '../services/game/GameSession';
import type { GameView } from '../services/game/GameView';
import { useGameAgenticPlay } from './useGameAgenticPlay';

const m = vi.hoisted(() => ({ start: vi.fn(), close: vi.fn(), stop: vi.fn(), create: vi.fn() }));
vi.mock('../config/agentica', () => ({ readGameAgenticaProfile: () => ({ profile: {
  endpoint: 'ws://127.0.0.1:1/api/host', provider: { provider: 'fixture', contextWindowTokens: 4096, maxOutputTokens: 256 },
  limits: { maxSteps: 4, maxRefinements: 1, maxPlanContinuations: 1, timeoutSeconds: 60, actionTimeoutSeconds: 10 },
} }) }));
vi.mock('../services/agentica/game/playController', () => ({
  idleGamePlay: { phase: 'idle', active: false }, createGamePlayController: m.create,
}));

const quest = (target = 'vault') => questFromContract(createGuildContract({ floor: 1, originRoomId: 'hub',
  target: { id: target, kind: 'treasure', name: 'Vault' } }), '2026-10-20T00:00:00.000Z');
let game: GameView, session: GameSession;
beforeEach(() => {
  vi.resetAllMocks(); m.start.mockResolvedValue(undefined);
  m.create.mockReturnValue({ start: m.start, stop: m.stop, close: m.close });
  game = { mode: 'manual', checkpoint: { position: { level: 1 } }, quests: [quest()], contracts: [] } as unknown as GameView;
  session = { hostSignal: new AbortController().signal, get view() { return { game }; } } as GameSession;
});
afterEach(cleanup);

describe('owner return selection launch plumbing', () => {
  it('offers only current accepted single-item floor-one fetch quests, across all accepted statuses', () => {
    game.quests = ['active', 'complete', 'claimed'].map(status => ({ ...quest(status), status } as GameView['quests'][number]));
    const eligible = [...game.quests];
    for (const [id, patch] of [
      ['floor2', { floor: 2 }], ['unaccepted', { acceptedAt: '' }],
      ['explore', { task: { ...quest().task, objective: 'explore' } }],
      ['multiple', { task: { ...quest().task, required: 2 } }],
      ['no-item', { task: { ...quest().task, item: undefined } }],
    ] as const) game.quests.push({ ...quest(id), ...patch } as GameView['quests'][number]);
    game.contracts = [createGuildContract({ floor: 1, originRoomId: 'hub', target: { id: 'offer', kind: 'treasure', name: 'Offer' } })];
    const { result } = renderHook(() => useGameAgenticPlay(session));
    expect(result.current.returnQuests).toEqual(eligible); expect(m.create).not.toHaveBeenCalled(); expect(m.start).not.toHaveBeenCalled();
  });

  it.each(['town', 'auto-play', 'waves', 'floor2'] as const)('offers no typed selection in %s', mode => {
    if (mode === 'floor2') game.checkpoint.position.level = 2; else game.mode = mode;
    const { result } = renderHook(() => useGameAgenticPlay(session));
    expect(result.current.returnQuests).toEqual([]);
    act(() => result.current.start('Return.', game.quests[0].id));
    expect(m.start).not.toHaveBeenCalled(); expect(result.current.error).toContain('current accepted');
  });

  it('passes exactly the explicit selected ID to the existing launch option', () => {
    const { result } = renderHook(() => useGameAgenticPlay(session)), selected = game.quests[0].id;
    act(() => result.current.start('Return with the seal.', selected));
    expect(m.start).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ objective: 'Return with the seal.', returnQuestId: selected,
      objectiveId: expect.any(String), endpoint: 'ws://127.0.0.1:1/api/host' }));
    expect(m.stop).not.toHaveBeenCalled();
  });

  it('leaves the ordinary free-text default untyped despite eligible quests', () => {
    const { result } = renderHook(() => useGameAgenticPlay(session));
    act(() => result.current.start('Explore.'));
    expect(m.start).toHaveBeenCalledOnce(); expect(m.start.mock.calls[0][0]).not.toHaveProperty('returnQuestId');
  });

  it('rechecks current GameView at click time even before a React rerender', () => {
    const { result } = renderHook(() => useGameAgenticPlay(session)), selected = game.quests[0].id, start = result.current.start;
    game = { ...game, quests: [quest('replacement')] };
    act(() => start('Return.', selected));
    expect(m.start).not.toHaveBeenCalled(); expect(result.current.error).toContain('current accepted');
  });

  it.each(['', 'foreign'])('refuses nonselected identity %s without creating a controller', id => {
    const { result } = renderHook(() => useGameAgenticPlay(session));
    act(() => result.current.start('Return.', id));
    expect(m.create).not.toHaveBeenCalled(); expect(m.start).not.toHaveBeenCalled();
  });
});
