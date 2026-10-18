// @vitest-environment node
import { beforeEach, expect, it, vi } from 'vitest';
import type { CanonicalHostPort } from '../../game/CanonicalHostCommand';
import { readCanonical } from '../../../persistence/canonical/read';
import { readAction } from '../../../persistence/canonical/agentica/actions';
import { protocolAction, protocolResult } from '../../../persistence/canonical/agentica/types.test-support';
import { actionFingerprint, actionKey } from '../sdk/agentica-host.mjs';
import { executeGameAction } from './actionExecution';
import { createGameActionHooks } from './actionHooks';

vi.mock('../../../persistence/canonical/read', () => ({ readCanonical: vi.fn(async work => ({ value: await work({}) })) }));
vi.mock('../../../persistence/canonical/agentica/actions', async importOriginal => ({
  ...await importOriginal<typeof import('../../../persistence/canonical/agentica/actions')>(), readAction: vi.fn(),
}));
vi.mock('./actionExecution', () => ({ executeGameAction: vi.fn() }));
beforeEach(() => vi.clearAllMocks());

function fixture() {
  const binding = { grant: { key: 'agentica/grants/grant', id: 'grant' }, publication: { key: 'agentica/publications/pub', id: 'pub' } };
  const action = { ...protocolAction(), capabilityId: 'maze.explore', arguments: { frontier: 'retained original input' } };
  const port = { hostSignal: new AbortController().signal, submitHostCommand: vi.fn() } as unknown as CanonicalHostPort;
  const original = { original: { action, publication: binding.publication, effect: 'writesLocalState' }, result: null };
  vi.mocked(readAction).mockResolvedValue(original as unknown as Awaited<ReturnType<typeof readAction>>);
  return { binding, action, port, original, hooks: createGameActionHooks(port, binding) };
}

it('accepts retained writable explore reservations but cannot reexecute after reload', async () => {
  const f = fixture();
  await f.hooks.saveAction!(actionKey(f.action), { fingerprint: actionFingerprint(f.action), status: 'pending' });
  expect((await f.hooks.onAction!(f.action)).disposition).toBe('unresolved');
  expect(executeGameAction).not.toHaveBeenCalled(); expect(f.port.submitHostCommand).not.toHaveBeenCalled();
});

it('returns the original completed approach without refreshing or admitting another operation', async () => {
  const f = fixture(), result = { ...protocolResult(f.action), operation: { operationId: 'travel', summary: 'Original approach' } };
  Object.assign(f.original, { result });
  expect(await f.hooks.onAction!(f.action)).toEqual(result);
  expect(readCanonical).toHaveBeenCalledOnce(); expect(executeGameAction).not.toHaveBeenCalled();
  expect(f.port.submitHostCommand).not.toHaveBeenCalled();
});

it.each(['read-only explore', 'unknown read-only', 'unknown writable', 'foreign publication'])('rejects retained reservation: %s', async damage => {
  const f = fixture();
  if (damage === 'read-only explore' || damage === 'unknown read-only') f.original.original.effect = 'readOnly';
  if (damage.startsWith('unknown')) f.original.original.action.capabilityId = 'maze.other';
  if (damage === 'foreign publication') f.original.original.publication.id = 'foreign';
  await expect(f.hooks.saveAction!(actionKey(f.action), { fingerprint: actionFingerprint(f.action), status: 'pending' })).rejects.toThrow('publication or effect');
  expect(f.port.submitHostCommand).not.toHaveBeenCalled();
});
