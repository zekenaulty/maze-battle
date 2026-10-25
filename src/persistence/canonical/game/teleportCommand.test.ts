import { afterEach, describe, expect, it, vi } from 'vitest';
import { applySkill } from '../../../domain/combat/applySkill';
import { createCombatContext } from '../../../domain/combat/battleContext';
import { executeBattleCommand } from '../combat/command';
import { mechanicsFixture } from '../combat/mechanics.test-support';
import { listFloorContracts } from '../content/queries';
import { loadAcceptedQuest, loadChest, loadContract, loadRoomContent } from '../content/records';
import { validateKnowledge } from '../knowledge/evidence';
import { encodeActor } from '../roster/actorValidation';
import { executeCanonical } from '../transaction';
import { DEFAULT_WORK_LIMITS } from '../types';
import { checkpointJson, gameCheckpoint } from './checkpoint';
import { executeContentCommand } from './contentCommand';
import { commitExplorationCommand, executeExplorationCommand, explorationCommand } from './explorationCommand';
import { executeSettingsCommand } from './settings';
import { teleportDestinations } from './teleportDestination';
import * as destinations from './teleportDestination';

afterEach(() => vi.restoreAllMocks());
async function ready() {
  const f = await mechanicsFixture(); f.storage.install();
  const rng = vi.spyOn(Math, 'random').mockReturnValue(0.5); vi.spyOn(Date, 'now').mockReturnValue(10_000);
  const actorId = (await f.roster()).state.party.find(a => a.skills.some(s => s.id === 'teleport'))!.id;
  return { ...f, rng, actorId, cast: () => f.request({ kind: 'teleport', actorId }, 'exploration.command') };
}

describe('canonical explicit exploration Teleport', () => {
  it('atomically preserves the floor, facing and skill rules, adds source-bound sight, then replays without any effect', async () => {
    const f = await ready();
    await f.editParty(s => { Object.assign(s.party.find(a => a.id === f.actorId)!.skills.find(s => s.id === 'teleport')!, { charges: 2, maxCharges: 2 }); });
    const before = gameCheckpoint(f.head().checkpoint), roster = (await f.roster()).state;
    const choices = await f.read(p => teleportDestinations(p, before.position));
    const expected = createCombatContext(roster, () => 0.5, 10_000);
    expect(applySkill(expected.party.find(a => a.id === f.actorId)!, 'teleport', expected)).toBe(true);
    const stored = f.storage.snapshot(), request = f.cast(), result = await executeExplorationCommand(request), next = gameCheckpoint(f.head().checkpoint);
    expect(result.receipt.result).toMatchObject({ kind: 'teleport', outcome: 'applied', moved: true, crossed: false });
    expect(next.position).toEqual(choices[Math.floor(choices.length / 2)]);
    expect(next.position.level).toBe(before.position.level); expect(next.position.cell.spaceId).toBe(before.position.cell.spaceId);
    expect(next.position).not.toEqual(before.position); expect(next.facing).toBe(before.facing); expect(next.mode).toBe(before.mode);
    const party = (await f.roster()).state.party;
    expect(party).toEqual(expected.party.map(encodeActor));
    expect(party.find(a => a.id === f.actorId)).toMatchObject({ mp: roster.party.find(a => a.id === f.actorId)!.mp - 20,
      gcdUntil: 10_250, skills: expect.arrayContaining([expect.objectContaining({ id: 'teleport', cooldownUntil: 12_000, charges: 1 })]) });
    const evidence = await f.read(p => validateKnowledge(p, next.knowledge));
    expect(evidence!.header.actor).toEqual(next.position); expect(next.knowledge!.sequence).toBe(before.knowledge!.sequence + 1);
    expect(result.stats.reads).toBeLessThanOrEqual(DEFAULT_WORK_LIMITS.reads);
    expect(result.stats.writes).toBeLessThanOrEqual(DEFAULT_WORK_LIMITS.writes);
    expect(result.stats.readBytes + result.stats.writeBytes).toBeLessThanOrEqual(DEFAULT_WORK_LIMITS.bytes);
    const addedWorld = [...f.storage.snapshot().get('records')!.entries()]
      .filter(([key, row]) => row.area === 'world' && !stored.get('records')!.has(key));
    expect(addedWorld.length).toBeGreaterThan(0);
    expect(addedWorld.every(([, row]) => row.key.startsWith('roster/actor/'))).toBe(true);
    expect(f.rng).toHaveBeenCalledTimes(1);
    const committed = f.storage.snapshot(); f.rng.mockImplementation(() => { throw Error('Replay used fresh RNG'); });
    const replay = await executeExplorationCommand(request);
    expect(replay.replayed).toBe(true); expect(replay.receipt).toEqual(result.receipt);
    expect(replay.stats).toMatchObject({ reads: 2, writes: 0 }); expect(f.storage.snapshot()).toEqual(committed);
    await expect(executeExplorationCommand({ ...request, input: { kind: 'teleport', actorId: 'foreign' } })).rejects.toThrow();
    expect(f.storage.snapshot()).toEqual(committed);
  });

  it.each(['foreign', 'unowned', 'dead', 'mana', 'gcd', 'cooldown', 'charges'] as const)('refuses %s without spending or moving', async defect => {
    const f = await ready();
    await f.editParty(s => {
      const a = s.party.find(a => a.id === f.actorId)!;
      if (defect === 'unowned') a.skills = a.skills.filter(s => s.id !== 'teleport');
      if (defect === 'dead') a.hp = 0;
      if (defect === 'mana') a.mp = 19;
      if (defect === 'gcd') a.gcdUntil = 10_001;
      if (defect === 'cooldown') a.skills.find(s => s.id === 'teleport')!.cooldownUntil = 10_001;
      if (defect === 'charges') Object.assign(a.skills.find(s => s.id === 'teleport')!, { charges: 0, maxCharges: 2 });
    });
    const before = f.head(), request = defect === 'foreign'
      ? f.request({ kind: 'teleport', actorId: 'foreign' }, 'exploration.command') : f.cast();
    expect((await executeExplorationCommand(request)).receipt.result).toEqual({ kind: 'teleport', outcome: 'unavailable' });
    expect(f.head().checkpoint).toEqual(before.checkpoint); expect(f.head().roots).toEqual(before.roots); expect(f.rng).not.toHaveBeenCalled();
  });

  it.each(['town', 'battle'] as const)('does not escape %s', async mode => {
    const f = await ready();
    if (mode === 'battle') await executeBattleCommand(f.request({ kind: 'start', returnMode: 'manual' }));
    else await f.work(async tx => tx.setCheckpoint(checkpointJson({ ...gameCheckpoint(tx.head.checkpoint), mode: 'town' })));
    f.rng.mockClear(); const before = f.head();
    expect((await executeExplorationCommand(f.cast())).receipt.result).toMatchObject({ outcome: 'unavailable' });
    expect(f.head().roots).toEqual(before.roots); expect(f.head().checkpoint).toEqual(before.checkpoint); expect(f.rng).not.toHaveBeenCalled();
  });

  it('does not charge when the bounded selector has no eligible destination', async () => {
    const f = await ready(), before = f.head(); vi.spyOn(destinations, 'teleportDestinations').mockResolvedValue([]);
    expect((await executeExplorationCommand(f.cast())).receipt.result).toMatchObject({ outcome: 'unavailable' });
    expect(f.head().roots).toEqual(before.roots); expect(f.head().checkpoint).toEqual(before.checkpoint); expect(f.rng).not.toHaveBeenCalled();
  });

  it('fails closed when the checkpoint no longer matches its validated observation', async () => {
    const f = await ready();
    await f.work(async tx => {
      const c = gameCheckpoint(tx.head.checkpoint); c.position.cell.row++;
      tx.setCheckpoint(checkpointJson(c));
    });
    const before = f.storage.snapshot();
    await expect(executeExplorationCommand(f.cast())).rejects.toThrow('observe the teleport origin');
    expect(f.storage.snapshot()).toEqual(before); expect(f.rng).not.toHaveBeenCalled();
  });

  it.each(['records', 'receipts', 'heads', 'observation', 'budget'] as const)('rolls back party, position, observation and receipt on %s failure', async failure => {
    const f = await ready(), request = f.cast(), before = f.storage.snapshot();
    if (['records', 'receipts', 'heads'].includes(failure)) f.storage.failOnce(failure);
    const result = failure === 'budget'
      ? executeCanonical(request, tx => commitExplorationCommand(tx, request.input), { limits: { ...DEFAULT_WORK_LIMITS, writes: 1 } })
      : failure === 'observation' ? executeCanonical(request, tx => commitExplorationCommand(tx, request.input, async () => { throw Error('Injected observation failure'); }))
      : executeExplorationCommand(request);
    await expect(result).rejects.toThrow(failure === 'budget' ? 'budget exhausted' : `Injected ${failure} failure`);
    expect(f.storage.snapshot()).toEqual(before);
    expect((await executeExplorationCommand(request)).replayed).toBe(false);
  });

  it('lands on a real quest chest without opening, accepting, progressing, awarding, or rolling an encounter', async () => {
    const f = await ready(), contracts = await f.read(p => listFloorContracts(p, 1, undefined, 16));
    const contract = contracts.contracts.find(c => c.objective === 'fetch')!;
    await f.atRoom(contract.targetRoomId);
    await executeSettingsCommand(f.request({ kind: 'encounters', enabled: true }, 'settings.command'));
    const content = await f.read(p => loadRoomContent(p, 1, contract.targetRoomId)), chest = await f.read(p => loadChest(p, 1, content.chestId!));
    // Unit placement away from the chest; destination selection remains the production policy.
    const posted = await f.read(p => loadContract(p, contract.id)); expect(posted.accepted).toBe(false);
    f.rng.mockReturnValue(0); await executeExplorationCommand(f.cast());
    expect(await f.read(p => loadContract(p, contract.id))).toEqual(posted);
    expect(await f.read(p => loadAcceptedQuest(p, posted))).toBeNull();
    vi.spyOn(Date, 'now').mockReturnValue(13_000);
    await executeContentCommand(f.request({ kind: 'accept-quest', contractId: contract.id }, 'content.command'));
    const before = (await f.roster()).state, c = await f.read(p => loadContract(p, contract.id));
    const quest = await f.read(p => loadAcceptedQuest(p, c));
    const choices = await f.read(p => teleportDestinations(p, gameCheckpoint(f.head().checkpoint).position));
    const index = choices.findIndex(at => at.cell.row === chest.chest.position.row && at.cell.column === chest.chest.position.column);
    expect(index).toBeGreaterThanOrEqual(0); f.rng.mockClear().mockReturnValue((index + 0.5) / choices.length);
    await executeExplorationCommand(f.cast());
    expect(gameCheckpoint(f.head().checkpoint).position.cell).toEqual({ spaceId: chest.spaceId, ...chest.chest.position });
    expect(await f.read(p => loadChest(p, 1, content.chestId!))).toEqual(chest);
    expect(await f.read(p => loadContract(p, contract.id))).toEqual(c);
    expect(await f.read(p => loadAcceptedQuest(p, c))).toEqual(quest);
    const after = (await f.roster()).state;
    expect(after.inventory).toEqual(before.inventory); expect(after.stash).toEqual(before.stash);
    expect(await f.current()).toBeNull(); expect(f.rng).toHaveBeenCalledTimes(1);
  });

  it('rejects stale, mutated and caller-targeted input rather than expanding authority', async () => {
    const f = await ready(), request = f.cast();
    await executeExplorationCommand(f.cast()); const before = f.storage.snapshot();
    await expect(executeExplorationCommand(request)).rejects.toThrow('stale owner or revision'); expect(f.storage.snapshot()).toEqual(before);
    for (const input of [{ kind: 'teleport' }, { kind: 'teleport', actorId: '' }, { kind: 'teleport', actorId: f.actorId, destination: {} },
      { kind: 'teleport', actorId: f.actorId, seed: 1 }, { kind: 'teleport', actorId: f.actorId, direction: 'east' }])
      expect(() => explorationCommand(input)).toThrow();
  });
});
