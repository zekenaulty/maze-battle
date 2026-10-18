// @vitest-environment node
import { beforeEach, expect, it, vi } from 'vitest';
import { recoveryOriginal } from './recovery.records';
import { readSource } from './validation.source';
import { prepareAction, restoreRetainedAction } from './validation';
import { protocolAction } from './types.test-support';
import type { OperationRead } from './operation.types';

vi.mock('./validation.source', async importOriginal => ({ ...await importOriginal<typeof import('./validation.source')>(), readSource: vi.fn() }));
vi.mock('./validation', async importOriginal => ({ ...await importOriginal<typeof import('./validation')>(), restoreRetainedAction: vi.fn() }));
beforeEach(() => vi.clearAllMocks());

async function fixture(capabilityId = 'maze.explore', effect = 'writesLocalState') {
  const identity = await prepareAction({ ...protocolAction(), capabilityId, arguments: { frontier: 'malformed pending selection' } });
  const ref = { key: identity.storageKey, id: 'original' }, binding = {
    grant: { key: 'agentica/grants/original', id: 'original-grant' }, publication: { key: 'agentica/publications/original', id: 'original-pub' } };
  vi.mocked(readSource).mockResolvedValue({ effect, sourceRequest: { input: { action: identity.storageKey, ...binding } } } as unknown as Awaited<ReturnType<typeof readSource>>);
  vi.mocked(restoreRetainedAction).mockResolvedValue(identity);
  const pages = {} as OperationRead;
  return { identity, ref, binding, pages, load: () => recoveryOriginal(pages, ref) };
}

it.each(['maze.navigate', 'maze.explore'])('discovers an unresolved %s original without executing or reparsing arguments', async capability => {
  const f = await fixture(capability), result = await f.load();
  expect(result.identity).toBe(f.identity);
  expect(result.candidate).toEqual({ operationId: `travel-${f.identity.storageKey.slice(-64)}`, original: f.ref, binding: f.binding });
  expect(restoreRetainedAction).toHaveBeenCalledWith(f.pages, f.ref, f.binding);
});

it.each([['maze.explore', 'readOnly'], ['maze.other', 'writesLocalState'], ['maze.inspect', 'writesLocalState']])
('rejects discovery of %s with %s', async (capability, effect) => {
  await expect((await fixture(capability, effect)).load()).rejects.toThrow('original navigation');
});

it('propagates corrupt immutable reserve evidence rather than reporting absence', async () => {
  const f = await fixture(); vi.mocked(readSource).mockRejectedValue(new Error('source receipt changed'));
  await expect(f.load()).rejects.toThrow('source receipt changed');
  expect(restoreRetainedAction).not.toHaveBeenCalled();
});
