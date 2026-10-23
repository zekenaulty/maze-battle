// @vitest-environment node
import { expect, it, vi } from 'vitest';
import { accountHead, appendedBytes } from './accounting';
import { preparationWorldWrite } from './game/floorCapacity';
import { preparationFixture, specification } from './privatePreparation.test-support';
import type { CanonicalHead, CanonicalReceipt } from './types';
import { fingerprint } from './validation';

const primary = 'dungeon/1/space/entry', earnedIndex = 'spaces/1/entry', rogueIndex = 'roster/foreign';
type Fixture = ReturnType<typeof preparationFixture>;
const dump = (f: Fixture, head: CanonicalHead) => structuredClone({ head,
  records: [...f.records], nodes: [...f.nodes], receipts: [...f.receipts] });

// Ordinary unrestricted setup uses real writers, including a pre-existing foreign index for removal probes.
async function setup(foreign = false) {
  const f = preparationFixture(); await f.established(); const w = f.stage();
  const roster = await w.pages.set('world', 'roster/party', { protected: true }, ['roster/party']);
  const row = await w.pages.set('world', primary, { original: true }, [earnedIndex, ...(foreign ? [rogueIndex] : [])]);
  const staged = await w.pages.prepare();
  const receipt: CanonicalReceipt = { generation: w.head.generation, gameId: w.head.gameId, attemptId: w.source.attemptId,
    fingerprint: fingerprint(w.source), beforeRevision: w.head.revision, afterRevision: w.head.revision + 1,
    committedAt: '2026-10-23T00:00:00.000Z', result: { setup: true } };
  const head = accountHead(w.head, { ...w.head, revision: receipt.afterRevision, roots: staged.roots },
    appendedBytes(staged.records, staged.nodes, receipt));
  for (const record of staged.records) f.records.set(record.id, record);
  for (const node of staged.nodes) f.nodes.set(node.node.id, node);
  f.receipts.set(receipt.attemptId, receipt);
  return { f, head, row, roster };
}

async function refused(s: Awaited<ReturnType<typeof setup>>, w: ReturnType<Fixture['stage']>, before: ReturnType<typeof dump>) {
  expect(() => w.controller.assertUsable()).toThrow('not usable');
  await expect(w.pages.prepare()).rejects.toThrow('not usable');
  expect(dump(s.f, s.head)).toEqual(before);
  const fresh = s.f.stage(s.head).pages;
  expect(await fresh.get('world', primary)).toEqual(s.row);
  expect(await fresh.get('world', 'roster/party')).toEqual(s.roster);
  expect((await fresh.scan('world', 'spaces/1/')).rows).toEqual([s.row]);
  const expected = s.row.indexes.includes(rogueIndex) ? [s.row, s.roster] : [s.roster];
  expect((await fresh.scan('world', 'roster/')).rows).toEqual(expected);
}

it.each(['floors/1', 'spaces/1/probe', 'chests/1/entry/probe', 'contracts/1/floor-1:probe'])(
  'permits insert, replacement and removal under the actual index grammar: %s', async index => {
    const s = await setup(), w = s.f.stage(s.head), allows = vi.fn(preparationWorldWrite(1));
    await w.controller.begin(specification(), allows);
    const key = 'dungeon/1/index-probe';
    const row = await w.pages.set('world', key, { version: 1 }, [index]);
    expect((await w.pages.scan('world', index)).rows).toEqual([row]);
    const replacement = await w.pages.set('world', key, { version: 2 }, [index]);
    expect((await w.pages.scan('world', index)).rows).toEqual([replacement]);
    await w.pages.delete('world', key);
    expect((await w.pages.scan('world', index)).rows).toEqual([]);
    expect(allows).toHaveBeenCalledWith(key, false);
    expect(allows.mock.calls.filter(([k, isIndex]) => k === index && isIndex === true)).toHaveLength(4);
    const saved = await s.f.commit(w), fresh = s.f.stage(saved.head).pages;
    expect((await fresh.scan('world', index)).rows).toEqual([]);
    expect(await fresh.get('world', primary)).toEqual(s.row);
    expect(await fresh.get('world', 'roster/party')).toEqual(s.roster);
  });

it.each([rogueIndex, 'spaces/2/probe', 'spaces/10/probe', 'floors/1/extra', 'floors/10', 'dungeon/1/primary-shaped-index'])(
  'refuses rogue insertion on an allowed primary without leaking staged index changes: %s', async index => {
    const s = await setup(), before = dump(s.f, s.head), w = s.f.stage(s.head);
    await w.controller.begin(specification(), preparationWorldWrite(1));
    // The valid old index is removed and a valid new index staged before the offending insertion.
    await expect(w.pages.set('world', primary, { replaced: true }, ['spaces/1/new', index])).rejects.toThrow('scope');
    await refused(s, w, before);
    const fresh = s.f.stage(s.head).pages;
    expect((await fresh.scan('world', index)).rows).toEqual([]);
    expect((await fresh.scan('world', 'spaces/1/new')).rows).toEqual([]);
  });

it.each(['replace', 'delete'] as const)('refuses foreign old-index removal through %s and preserves the same world root', async action => {
  const s = await setup(true), before = dump(s.f, s.head), w = s.f.stage(s.head);
  await w.controller.begin(specification(), preparationWorldWrite(1));
  // The permitted old index precedes the forbidden one, so failure must poison a partially changed tree.
  const change = action === 'replace' ? w.pages.set('world', primary, { replaced: true }, ['spaces/1/new'])
    : w.pages.delete('world', primary);
  await expect(change).rejects.toThrow('scope');
  await refused(s, w, before);
  expect((await s.f.stage(s.head).pages.scan('world', rogueIndex)).rows).toEqual([s.row]);
});
