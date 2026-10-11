import { beforeEach, describe, expect, it, vi } from 'vitest';
import { addressKey } from '../../../domain/expedition/address';
import { StreamPlanner } from '../../../domain/expedition/streaming/planner';
import type { StreamActionResult } from '../../../domain/expedition/streaming/types';
import type { CellAddress } from '../../../domain/expedition/types';
import * as api from '../../../persistence/streamRepository';
import { loadTopologyHeader } from '../../../persistence/topologyRepository';
import { loadDirectedStreamKnowledge } from '../../expedition/directed/knowledge';
import { LAUNCH_SCENARIO_COMMAND_LIMIT, prepareLaunchScenario } from './scenario';

vi.mock('../../../persistence/streamRepository', () => ({ createStreamSlot: vi.fn(), claimStreamControl: vi.fn(),
  executeStreamAction: vi.fn(), loadStreamSnapshot: vi.fn(), readStreamKnowledge: vi.fn(), loadStreamControl: vi.fn() }));
vi.mock('../../../persistence/topologyRepository', () => ({ loadTopologyHeader: vi.fn() }));
vi.mock('../../expedition/directed/knowledge', () => ({ loadDirectedStreamKnowledge: vi.fn() }));

const at = (spaceId: string): CellAddress => ({ spaceId, row: 1, column: 1 });
const control = { sessionId: 'prelude', epoch: 0 };
function snapshot(spaceId: string, chest = false): api.StreamSnapshot {
  const address = at(spaceId);
  return { checkpoint: { position: address, revision: 0, topologyRevision: 0 },
    room: { space: { spec: { kind: 'room' } }, knowledge: { spaceId,
      cells: { [addressKey(address)]: address }, chests: chest ? { chest: { ...address, id: 'chest', opened: false } } : {} } },
  } as api.StreamSnapshot;
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(done => { resolve = done; });
  return { promise, resolve };
}

beforeEach(() => {
  vi.restoreAllMocks(); vi.resetAllMocks();
  vi.mocked(loadTopologyHeader).mockResolvedValue(undefined);
  vi.mocked(api.createStreamSlot).mockResolvedValue(snapshot('entry'));
  vi.mocked(api.claimStreamControl).mockResolvedValue(control);
  vi.mocked(api.loadStreamControl).mockResolvedValue(control);
  vi.mocked(api.executeStreamAction).mockResolvedValue({ disposition: 'applied' } as never);
  vi.mocked(api.loadStreamSnapshot).mockResolvedValueOnce(snapshot('second')).mockResolvedValueOnce(snapshot('third', true))
    .mockResolvedValueOnce(snapshot('second')).mockResolvedValue(snapshot('entry'));
  vi.spyOn(StreamPlanner.prototype, 'choose').mockReturnValue({ command: { type: 'move', direction: 'east' }, reason: 'Observed' });
  vi.mocked(loadDirectedStreamKnowledge).mockResolvedValue({
    plan: { status: 'ready', route: [at('second'), at('entry'), at('third')] },
    knowledge: { direction: () => 'east' },
  } as never);
});

describe('explicit local scenario preparation', () => {
  it('returns three observed arrival cells with the third-room chest first', async () => {
    const progress = vi.fn();
    const result = await prepareLaunchScenario('fresh', progress);
    expect(result.slot).toBe('fresh');
    expect(result.destinations.map(item => item.address)).toEqual([at('third'), at('entry'), at('second')]);
    expect(api.createStreamSlot).toHaveBeenCalledWith('fresh', {
      version: 'spaces-v2', worldId: expect.any(String), floorId: 'floor', seed: 55, level: 1,
    });
    expect(api.claimStreamControl).toHaveBeenCalledTimes(1);
    expect(vi.mocked(api.claimStreamControl).mock.calls[0][2]).toBeNull();
    expect(vi.mocked(api.executeStreamAction).mock.calls.map(([, request]) => request.command)).toEqual([
      { type: 'move', direction: 'east' }, { type: 'move', direction: 'east' },
      { type: 'move', direction: 'west' }, { type: 'move', direction: 'west' },
    ]);
    expect(vi.mocked(loadDirectedStreamKnowledge).mock.calls.every(([, target]) => target.kind === 'cell')).toBe(true);
    expect(progress).toHaveBeenLastCalledWith('Scenario ready after 4/4000 local commands.');
  });

  it('rejects existing slots before create or control claim', async () => {
    vi.mocked(loadTopologyHeader).mockResolvedValue({} as never);
    await expect(prepareLaunchScenario('existing')).rejects.toThrow('fresh slot');
    expect(api.createStreamSlot).not.toHaveBeenCalled();
    expect(api.claimStreamControl).not.toHaveBeenCalled();
  });

  it('uses a distinct recipe identity for each creation attempt', async () => {
    vi.mocked(api.claimStreamControl).mockRejectedValue(new Error('Stop after create'));
    await expect(prepareLaunchScenario('racing')).rejects.toThrow('Stop after create');
    await expect(prepareLaunchScenario('racing')).rejects.toThrow('Stop after create');
    const [first, second] = vi.mocked(api.createStreamSlot).mock.calls;
    expect(first[1].worldId).not.toBe(second[1].worldId);
  });

  it('does no repository work when already cancelled', async () => {
    const abort = new AbortController(); abort.abort();
    await expect(prepareLaunchScenario('cancelled', undefined, abort.signal)).rejects.toMatchObject({ name: 'AbortError' });
    expect(loadTopologyHeader).not.toHaveBeenCalled();
  });

  it('checks cancellation after a progress callback before creation', async () => {
    const abort = new AbortController();
    await expect(prepareLaunchScenario('cancelled', () => abort.abort(), abort.signal)).rejects.toMatchObject({ name: 'AbortError' });
    expect(api.createStreamSlot).not.toHaveBeenCalled();
  });

  it('does not claim after cancellation during slot creation', async () => {
    const abort = new AbortController();
    vi.mocked(api.createStreamSlot).mockImplementation(async () => { abort.abort(); return snapshot('entry'); });
    await expect(prepareLaunchScenario('cancelled', undefined, abort.signal)).rejects.toMatchObject({ name: 'AbortError' });
    expect(api.claimStreamControl).not.toHaveBeenCalled();
  });

  it('settles the one in-flight action before acknowledging abort, with no inverse or retry', async () => {
    const abort = new AbortController(), entered = deferred<void>(), action = deferred<StreamActionResult>();
    vi.mocked(api.executeStreamAction).mockImplementation(() => { entered.resolve(); return action.promise; });
    const preparing = prepareLaunchScenario('cancelled', undefined, abort.signal);
    let settled = false;
    const result = preparing.catch(error => { settled = true; return error; });
    await entered.promise; abort.abort(); await Promise.resolve();
    expect(settled).toBe(false);
    action.resolve({ disposition: 'applied' } as StreamActionResult);
    expect(await result).toMatchObject({ name: 'AbortError' });
    expect(api.executeStreamAction).toHaveBeenCalledTimes(1);
    expect(api.loadStreamSnapshot).not.toHaveBeenCalled();
  });

  it('stops at a refused action without retrying', async () => {
    vi.mocked(api.executeStreamAction).mockResolvedValue({ disposition: 'conflict', reason: 'Control changed' } as never);
    await expect(prepareLaunchScenario('fresh')).rejects.toThrow('Control changed');
    expect(api.executeStreamAction).toHaveBeenCalledTimes(1);
  });

  it('bounds discovery even if the planner never discovers a third room', async () => {
    vi.mocked(api.loadStreamSnapshot).mockReset().mockResolvedValue(snapshot('entry'));
    await expect(prepareLaunchScenario('bounded')).rejects.toThrow('4000, including return');
    expect(api.executeStreamAction).toHaveBeenCalledTimes(LAUNCH_SCENARIO_COMMAND_LIMIT);
  });

  it('charges inverse moves to the same total limit', async () => {
    vi.mocked(api.loadStreamSnapshot).mockReset().mockImplementation(async () => {
      const count = vi.mocked(api.executeStreamAction).mock.calls.length;
      return count === 2001 ? snapshot('third', true) : snapshot('second');
    });
    await expect(prepareLaunchScenario('bounded-return')).rejects.toThrow('4000, including return');
    const requests = vi.mocked(api.executeStreamAction).mock.calls.map(([, request]) => request.command);
    expect(requests).toHaveLength(LAUNCH_SCENARIO_COMMAND_LIMIT);
    expect(requests.filter(command => command.type === 'move' && command.direction === 'west')).toHaveLength(1999);
  });

  it('does not report ready after ownership changes', async () => {
    vi.mocked(api.loadStreamControl).mockResolvedValue({ sessionId: 'another-owner', epoch: 1 });
    await expect(prepareLaunchScenario('fresh')).rejects.toThrow('control changed');
  });

  it('rejects a final route that does not cross all three rooms', async () => {
    vi.mocked(loadDirectedStreamKnowledge).mockResolvedValue({
      plan: { status: 'ready', route: [] }, knowledge: { direction: () => 'east' },
    } as never);
    await expect(prepareLaunchScenario('fresh')).rejects.toThrow('does not cross three known rooms');
  });
});
