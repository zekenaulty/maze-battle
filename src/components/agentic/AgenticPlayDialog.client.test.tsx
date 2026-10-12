import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AgenticPlayDialog } from './AgenticPlayDialog';
import { RpgAgenticaClient } from '../../services/agentica/rpg/client';
import type { GameSession } from '../../services/game/GameSession';

const mocks = vi.hoisted(() => ({ read: vi.fn(), recover: vi.fn(async () => undefined) }));
vi.mock('../../persistence/rpgAgentica/launchRecords', () => ({ readRpgLaunch: mocks.read }));
vi.mock('../../services/agentica/rpg/journey', () => ({ retainedRpgJourney: async () => undefined }));
vi.mock('../../services/agentica/rpg/transport', () => ({ RpgAgenticaTransport: class {
  sdk = { connected: true };
  recover = mocks.recover;
  close() {}
} }));

afterEach(() => { cleanup(); vi.clearAllMocks(); });
const endpoint = 'ws://127.0.0.1:5189/api/host', entrance = { floor: 2, row: 0, column: 1 };
const position = { floor: 2, row: 3, column: 4 };
const session = { view: { game: { id: 'game' } } } as unknown as GameSession;

describe('Agentic dialog retained quest identity', () => {
  it('recovers the selected ID from the private quest binding and keeps its item specification out of the view', async () => {
    mocks.read.mockResolvedValue({ id: 'launch', url: endpoint, stopped: false, binding: { runId: 'retained' },
      draft: { completionTarget: entrance, mode: 'quest',
        quest: { id: 'accepted-fetch', baseId: 'private-base', token: 'private-token', required: 1 } } });
    const client = new RpgAgenticaClient({ session, url: endpoint, target: position });
    try {
      await client.recover();
      expect(client.view).toMatchObject({ mode: 'quest', questId: 'accepted-fetch', target: entrance, state: 'awaiting-adoption' });
      expect(client.view).not.toHaveProperty('quest');
      expect(JSON.stringify(client.view)).not.toMatch(/private-base|private-token/);
      const onStart = vi.fn();
      render(<AgenticPlayDialog position={position} entrance={entrance}
        quests={[{ id: 'accepted-fetch', title: 'Recover cache', itemName: 'Guild Cache' }]}
        view={client.view} busy={false} canStop controlled endpoint={endpoint} onStart={onStart}
        onEndpointChange={vi.fn()} onReconnect={vi.fn()} onAdopt={vi.fn()} onStop={vi.fn()} onClose={vi.fn()} />);
      expect(screen.getByRole('radio', { name: 'Retrieve quest item' })).toBeChecked();
      expect(screen.getByRole('combobox')).toHaveValue('accepted-fetch');
      expect(onStart).not.toHaveBeenCalled();
      fireEvent.click(screen.getByRole('button', { name: 'Start' }));
      expect(onStart).toHaveBeenCalledExactlyOnceWith(endpoint, entrance, 'quest', 'accepted-fetch');
    } finally { client.close(); }
  });

  it.each([undefined, 'exploration'] as const)('clears a stale selected quest when recovering mode %s', async mode => {
    mocks.read.mockResolvedValue({ id: 'launch', url: endpoint, stopped: false,
      draft: { completionTarget: position, mode } });
    const client = new RpgAgenticaClient({ session, url: endpoint, target: entrance, mode: 'quest', questId: 'stale' });
    try {
      await client.recover();
      expect(client.view.mode).toBe(mode);
      expect(client.view.questId).toBeUndefined();
      expect(client.view.target).toEqual(position);
    } finally { client.close(); }
  });
});
