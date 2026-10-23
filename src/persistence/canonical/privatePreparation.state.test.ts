// @vitest-environment node
import { expect, it, vi } from 'vitest';
import { preparationFixture, specification, worldKey } from './privatePreparation.test-support';
import type { Json, RecordArea } from './types';

it.each(['set', 'absent-delete'] as const)('refuses declaration after prior %s', async method => {
  const f = preparationFixture(), w = f.stage();
  if (method === 'set') await w.pages.set('world', 'before', 1); else await w.pages.delete('world', 'missing');
  await expect(w.controller.begin(specification(), worldKey)).rejects.toThrow('already started');
  expect(() => w.controller.assertUsable()).toThrow('not usable');
});

it.each([['knowledge', 'anything'], ['execution', 'other'], ['execution', 'private-capacity/floor-1'], ['world', 'roster/party']])(
  'poisons on a caught out-of-scope write %s/%s', async (area, key) => {
    const w = preparationFixture().stage(); await w.controller.begin(specification(), worldKey);
    expect(() => w.pages.set(area as RecordArea, key, null)).toThrow('scope');
    expect(() => w.controller.assertUsable()).toThrow('not usable');
  });

it('fails closed when the parent write hook is unavailable or itself fails', async () => {
  for (const hook of [undefined, () => { throw Error('prior restoration'); }]) {
    const w = preparationFixture().stage(); Reflect.set(w.pages, 'restrictWrites', hook);
    await expect(w.controller.begin(specification(), worldKey)).rejects.toThrow();
    expect(() => w.controller.assertUsable()).toThrow('not usable');
    expect((await w.pages.prepare()).records).toEqual([]);
  }
});

it('refuses unawaited begin and prevents the delayed read from later writing an anchor', async () => {
  const w = preparationFixture().stage(); let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; }), get = w.pages.get.bind(w.pages);
  vi.spyOn(w.pages, 'get').mockImplementationOnce(async (area, key) => { await gate; return get(area, key); });
  const pending = w.controller.begin(specification(), worldKey).catch(String);
  expect(() => w.controller.assertUsable()).toThrow('pending'); release();
  expect(await pending).toContain('not usable'); expect((await w.pages.prepare()).records).toEqual([]);
});

it('poisons both attempts when a concurrent duplicate begin is caught', async () => {
  const w = preparationFixture().stage(), first = w.controller.begin(specification(), worldKey).catch(String);
  await expect(w.controller.begin(specification(), worldKey)).rejects.toThrow('already declared');
  expect(await first).toContain('not usable'); expect(() => w.controller.assertUsable()).toThrow();
});

it('poisons a caught duplicate begin after successful declaration', async () => {
  const w = preparationFixture().stage(); await w.controller.begin(specification(), worldKey);
  await expect(w.controller.begin(specification(), worldKey)).rejects.toThrow('already declared');
  expect(() => w.controller.decorate({})).toThrow('not usable');
});

it.each(['duplicate', 'sealed', 'finished'])('a caught %s close poisons finalization', async timing => {
  const w = preparationFixture().stage(), handle = await w.controller.begin(specification(), worldKey);
  if (timing === 'duplicate') handle.close();
  if (timing === 'sealed') w.controller.assertUsable();
  if (timing === 'finished') { w.controller.decorate({}); w.controller.finish(1); }
  expect(() => handle.close()).toThrow('close is sealed or repeated');
  expect(() => w.controller.assertUsable()).toThrow('not usable');
});

it('cannot write after close and cannot finish twice', async () => {
  const first = preparationFixture().stage(), handle = await first.controller.begin(specification(), worldKey); handle.close();
  expect(() => first.pages.set('world', 'dungeon/1', null)).toThrow('sealed');
  expect(() => first.controller.assertUsable()).toThrow();
  const second = preparationFixture().stage(); await second.controller.begin(specification(), worldKey);
  second.controller.decorate({}); second.controller.finish(1);
  expect(() => second.controller.finish(1)).toThrow('missing or repeated');
  expect(() => second.controller.assertUsable()).toThrow();
});

it.each([null, [], 'text', { privateAllocation: {} }])('rejects invalid declared result %j and poisons subsequent checks', async outcome => {
  const w = preparationFixture().stage(); await w.controller.begin(specification(), worldKey);
  expect(() => w.controller.decorate(outcome as Json)).toThrow(); expect(() => w.controller.assertUsable()).toThrow();
});

it('rejects the reserved result field even without a preparation declaration', () => {
  const w = preparationFixture().stage();
  expect(() => w.controller.decorate({ privateAllocation: {} })).toThrow('reserved');
  expect(() => w.controller.assertUsable()).toThrow();
});

it.each([-1, NaN, 100_001])('rejects invalid/exhausting exact-byte consumption %s', async bytes => {
  const w = preparationFixture().stage(); await w.controller.begin(specification(), worldKey); w.controller.decorate({});
  expect(() => w.controller.finish(bytes)).toThrow(); expect(() => w.controller.assertUsable()).toThrow();
});

it('rejects premature finish and duplicate decoration', async () => {
  const first = preparationFixture().stage(); await first.controller.begin(specification(), worldKey);
  expect(() => first.controller.finish(1)).toThrow('missing or repeated'); expect(() => first.controller.assertUsable()).toThrow();
  const second = preparationFixture().stage(); await second.controller.begin(specification(), worldKey); second.controller.decorate({});
  expect(() => second.controller.decorate({})).toThrow('already finalized'); expect(() => second.controller.assertUsable()).toThrow();
});
