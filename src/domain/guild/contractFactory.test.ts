import { describe, expect, it } from 'vitest';
import { chestAt, lineMaze, roomAt } from '../automation/autopilotTestFixtures';
import { createNewGameState } from '../gameFactory';
import { createGuildContract, guildContractId, guildContractPriority } from './contractFactory';
import { guildContractsForFloor } from './contracts';

describe('shared contract factory', () => {
  it.each([
    ['boss', 'kill', 'Clear', 'hostiles', 3, 155, 0],
    ['treasure', 'fetch', 'Recover Cache:', 'guild cache', 1, 109, 1],
    ['exit', 'locate', 'Locate', 'descent route', 1, 85, 2],
    ['safe', 'scout', 'Scout', 'safe room', 1, 71, 3],
    ['ordinary', 'scout', 'Scout', 'room', 1, 55, 3],
  ] as const)('retains the %s template without any maze or geometry', (kind, objective, prefix, noun, required, rewardGold, priority) => {
    const target = { id: 'target', kind, name: 'The Room' };
    const contract = createGuildContract({ floor: 3, originRoomId: 'hub', target });
    expect(contract).toMatchObject({
      id: `floor-3:hub:target:${objective}`, floor: 3, originRoomId: 'hub', targetRoomId: 'target',
      targetRoomName: 'The Room', targetRoomKind: kind, objective,
      task: { objective, noun, required }, title: `${prefix} The Room`, rewardGold, status: 'posted',
    });
    expect(contract.description).toContain('Last fix: Unmapped room.');
    expect(guildContractId(3, 'hub', target)).toBe(contract.id);
    expect(guildContractPriority(contract)).toBe(priority);
    expect(!!contract.task.item).toBe(kind === 'treasure');
  });

  it.each(['located', 'nearby'] as const)('uses caller-observed location for %s contracts without changing identity', status => {
    const input = { floor: 0, originRoomId: 'hub', target: { id: 'cache', kind: 'treasure' as const, name: 'Cache' } };
    const posted = createGuildContract(input);
    const observed = createGuildContract({ ...input, status, location: { row: 12, column: 34 } });
    expect(observed.id).toBe(posted.id);
    expect(observed.status).toBe(status);
    expect(observed.description).toBe('Guild request: recover the guild cache from a chest in this room. Last fix: 13, 35.');
    expect(observed.rewardGold).toBe(73);
    expect(observed.task).toEqual(posted.task);
  });

  it('does not share mutable template tasks or item specs between contracts', () => {
    const input = { floor: 1, originRoomId: 'hub', target: { id: 'cache', kind: 'treasure' as const, name: 'Cache' } };
    const first = createGuildContract(input);
    first.task.required = 99;
    first.task.item!.baseId = 'changed';
    const second = createGuildContract(input);
    expect(second.task.required).toBe(1);
    expect(second.task.item!.baseId).toBe('guild-cache');
  });

  it('does not require coordinates for observed status or disclose coordinates for a posted contract', () => {
    const input = { floor: 1, originRoomId: 'hub', target: { id: 'cache', kind: 'treasure' as const, name: 'Cache' } };
    expect(createGuildContract({ ...input, status: 'located' })).toMatchObject({
      status: 'located', description: 'Guild request: recover the guild cache from a chest in this room. Last fix: Unmapped room.',
    });
    expect(createGuildContract({ ...input, location: { row: 12, column: 34 } }).description).toContain('Last fix: Unmapped room.');
  });

  it('legacy discovery produces the same contract and excludes accepted identities', () => {
    const hub = roomAt('hub', 'hub', 0), target = roomAt('cache', 'treasure', 2);
    const game = createNewGameState({ maze: lineMaze(4, [hub, target], 2), chests: [chestAt(2)] });
    const contract = createGuildContract({ floor: 1, originRoomId: hub.id, target, status: 'nearby', location: target.center });
    expect(guildContractsForFloor(game)).toEqual([contract]);
    expect(guildContractsForFloor(game, new Set([contract.id]))).toEqual([]);
  });
});
