// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { readReturnEvidence, returnEvidence, returnSatisfied, type ReturnEvidence } from './objective.evidence';
import { evidenceFixture } from './objective.evidence.test-support';

const corrupt: [string, (e: ReturnEvidence) => void][] = [
  ['schema', e => { Object.assign(e, { schema: 2 }); }],
  ['outer extra field', e => { Object.assign(e, { complete: true }); }],
  ['missing arrival', e => { Reflect.deleteProperty(e, 'arrival'); }],
  ['outer identity', e => { e.gameId = 'invalid/id'; }],
  ['quest game identity', e => { e.quest.gameId = 'other'; }],
  ['quest generation identity', e => { e.quest.generation = 'other'; }],
  ['quest extra field', e => { Object.assign(e.quest, { objectiveId: 'forged' }); }],
  ['quest namespace', e => { Object.assign(e.quest.quest, { key: 'contract/quest' }); }],
  ['quest identity', e => { Object.assign(e.quest.quest, { key: 'quest/' }); }],
  ['quest reference id', e => { Object.assign(e.quest.quest, { id: 'invalid/id' }); }],
  ['reference extra field', e => { Object.assign(e.quest.quest, { revision: 1 }); }],
  ['quest floor', e => { e.quest.floor = 2; }],
  ['quest status', e => { Object.assign(e.quest, { status: 'finished' }); }],
  ['container extra field', e => { Object.assign(e.quest.containers, { equipment: e.quest.containers.pack }); }],
  ['container namespace', e => { Object.assign(e.quest.containers.pack, { key: 'roster/stash' }); }],
  ['container reference id', e => { Object.assign(e.quest.containers.stash, { id: '' }); }],
  ['missing item with credited count', e => { e.quest.items = []; }],
  ['extra matching item', e => { e.quest.items.push(structuredClone(e.quest.items[0])); }],
  ['item namespace', e => { Object.assign(e.quest.items[0].source, { key: 'dungeon/1/chest/hidden' }); }],
  ['foreign quest item', e => { Object.assign(e.quest.items[0].source, { key: 'roster/item/quest-item:other' }); }],
  ['item reference id', e => { Object.assign(e.quest.items[0].source, { id: 'invalid/id' }); }],
  ['item owner', e => { Object.assign(e.quest.items[0], { owner: 'equipped' }); }],
  ['item count', e => { Object.assign(e.quest.items[0], { count: 2 }); }],
  ['item extra field', e => { Object.assign(e.quest.items[0], { awardVerified: true }); }],
  ['pack count', e => { e.quest.packCount = 0; }],
  ['stash count', e => { e.quest.stashCount = 1; }],
  ['negative count', e => { e.quest.packCount = -1; }],
  ['fractional count', e => { e.quest.packCount = 0.5; }],
  ['nonfinite count', e => { e.quest.packCount = NaN; }],
  ['arrival sequence', e => { e.arrival!.sequence = 0; }],
  ['arrival reference id', e => { e.arrival!.id = 'invalid/id'; }],
  ['arrival index', e => { e.arrival!.index = 113; }],
  ['arrival extra field', e => { Object.assign(e.arrival!, { town: true }); }],
];
describe('strict private return evidence codec and predicate', () => {
  it.each(corrupt)('rejects %s without normalizing or crediting satisfaction', async (_name, damage) => {
    const f = await evidenceFixture(), value = await readReturnEvidence(f.pages, f.snapshot(), f.objective);
    damage(value);
    expect(() => returnEvidence(value)).toThrow();
    expect(() => returnSatisfied(value)).toThrow();
  });

  it.each([
    ['pack', 'complete', true, true], ['pack', 'claimed', true, true], ['pack', 'active', true, false],
    ['pack', 'complete', false, false], ['stash', 'claimed', true, false], [null, 'complete', true, false],
  ] as const)('requires pack ownership, completed status and arrival together: %s %s %s', async (owner, status, arrived, expected) => {
    const f = await evidenceFixture(owner, status, !arrived);
    if (owner !== null && status === 'active') f.quest.award = { itemId: f.stored.item.id, chestId: 'unresolved-source' };
    const value = await readReturnEvidence(f.pages, f.snapshot(), f.objective);
    expect(returnEvidence(value)).toEqual(value); expect(returnSatisfied(value)).toBe(expected);
  });

  it('returns a detached projection without claiming to resolve the award source', async () => {
    const f = await evidenceFixture(), value = await readReturnEvidence(f.pages, f.snapshot(), f.objective);
    const result = returnEvidence(value);
    value.arrival!.id = 'changed'; value.quest.items.length = 0; value.quest.packCount = 0;
    expect(result.arrival!.id).not.toBe('changed'); expect(result.quest.items).toHaveLength(1);
    expect(returnSatisfied(result)).toBe(true);
    expect(f.get.mock.calls.some(([, key]) => /chest|award/.test(key))).toBe(false);
    expect(Object.keys(result).sort()).toEqual(['arrival', 'gameId', 'generation', 'quest', 'schema']);
  });
});
