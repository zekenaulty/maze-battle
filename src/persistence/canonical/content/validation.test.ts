import { describe, expect, it } from 'vitest';
import { createGuildContract } from '../../../domain/guild/contractFactory';
import { advanceQuestProgress, claimQuest, questFromContract } from '../../../domain/quests/questRules';
import { createItemInstance } from '../../../domain/items/loot';
import { encodeItem } from '../roster/itemValidation';
import { storedChest, storedContract, storedQuest, validateQuest } from './validation';
import { contentCommand } from '../game/contentCommand';

const now = '2026-10-13T12:00:00.000Z';
const contract = () => createGuildContract({ floor: 1, originRoomId: 'hub', target: { id: 'vault', kind: 'treasure', name: 'Vault' } });
const quest = () => questFromContract(contract(), now);
describe('canonical content validation', () => {
  it('accepts actual shared contract, quest and claimed state without normalization', () => {
    storedContract({ schema: 1, contract: contract(), accepted: false });
    const active = quest(), complete = advanceQuestProgress(active, 1, now), claimed = claimQuest(complete, now)!;
    for (const value of [active, complete, claimed.quest]) expect(() => validateQuest(value)).not.toThrow();
    expect(() => storedQuest({ schema: 1, quest: complete, award: { itemId: `quest-item:${complete.id}`, chestId: 'chest' } })).not.toThrow();
  });
  it.each([
    ['bad source', (q: ReturnType<typeof quest>) => ({ ...q, source: 'elsewhere' })],
    ['premature completion', (q: ReturnType<typeof quest>) => ({ ...q, status: 'complete', completedAt: now })],
    ['active completed progress', (q: ReturnType<typeof quest>) => ({ ...q, task: { ...q.task, progress: 1 } })],
    ['unclaimed timestamp', (q: ReturnType<typeof quest>) => ({ ...q, claimedAt: now })],
    ['negative progress', (q: ReturnType<typeof quest>) => ({ ...q, task: { ...q.task, progress: -1 } })],
    ['unknown fields', (q: ReturnType<typeof quest>) => ({ ...q, obsolete: true })],
    ['empty objective', (q: ReturnType<typeof quest>) => ({ ...q, task: { ...q.task, required: 0 } })],
    ['item on kill quest', (q: ReturnType<typeof quest>) => ({ ...q, task: { ...q.task, objective: 'kill' } })],
    ['unknown category', (q: ReturnType<typeof quest>) => ({ ...q, task: { ...q.task, monsterTags: ['unknown'] } })],
    ['fractional floor', (q: ReturnType<typeof quest>) => ({ ...q, floor: 1.5 })],
    ['bad date', (q: ReturnType<typeof quest>) => ({ ...q, acceptedAt: 'yesterday' })],
  ])('rejects %s', (_label, alter) => expect(() => validateQuest(alter(quest()))).toThrow());
  it('rejects a fabricated award identity and receipt chronology', () => {
    expect(() => storedQuest({ schema: 1, quest: quest(), award: { itemId: 'different', chestId: 'chest' } })).toThrow();
    const complete = advanceQuestProgress(quest(), 1, '2026-10-12T12:00:00.000Z');
    expect(() => validateQuest(complete)).toThrow();
  });
  it('keeps unopened state separate from immutable post-open loot', () => {
    const row = { schema: 1, spaceId: 'vault', chest: { id: 'chest', level: 1, position: { row: 1, column: 1 }, opened: false } };
    expect(() => storedChest(row)).not.toThrow();
    expect(() => storedChest({ ...row, chest: { ...row.chest, loot: [] } })).toThrow();
    expect(() => storedChest({ ...row, chest: { ...row.chest, opened: true } })).toThrow();
    const items = ['a', 'b'].map(id => encodeItem({ ...createItemInstance('rusty-sword', 1), id }));
    expect(() => storedChest({ ...row, chest: { ...row.chest, opened: true, loot: items } })).not.toThrow();
    expect(() => storedChest({ ...row, chest: { ...row.chest, opened: true, loot: [items[0], items[0]] } })).toThrow();
  });
  it.each([
    { kind: 'move', chestId: 'x' }, { kind: 'open-chest', questId: 'x' },
    { kind: 'open-chest', chestId: 'x', questId: 'y' }, { kind: 'accept-quest', contractId: '' },
    { kind: 'claim-quest', questId: 'path/escape' }, { kind: 'claim-quest' },
  ])('rejects mismatched command $kind', command => expect(() => contentCommand(command)).toThrow());
});
