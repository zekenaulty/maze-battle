// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { actionKey } from '../../../services/agentica/sdk/agentica-host.mjs';
import { prepareAction, prepareActionLookup, prepareLookedUpAction, validateActionLookup, validatePrepared } from './validation';
import { readActionByKey } from './actions.lookup';
import type { ProtocolRead } from './types';
import { protocolAction } from './types.test-support';

describe('bounded SDK original-action lookup', () => {
  it('shares the exact original hash without hashing inside a transaction', async () => {
    const action = protocolAction(), lookup = await prepareActionLookup(actionKey(action)), prepared = await prepareAction(action);
    expect(lookup.storageKey).toBe(prepared.storageKey);
    expect(prepareLookedUpAction(lookup, action)).toEqual(prepared);
    expect(() => validatePrepared(prepareLookedUpAction(lookup, action))).not.toThrow();
  });
  it('accepts escaped maximum wire identities without widening the stored record key', async () => {
    const action = protocolAction();
    for (const key of ['actionId', 'runId', 'sessionId', 'sessionEpoch'] as const) action[key] = '"'.repeat(128);
    const lookup = await prepareActionLookup(actionKey(action));
    expect(lookup.key.length).toBeGreaterThan(1024); expect(lookup.storageKey.length).toBeLessThan(128);
  });
  it.each(['null', '{}', '["one"]', '["a","b","c","d","e"]', '["","b","c","d"]', '["a",1,"c","d"]',
    '[ "a", "b", "c", "d" ]'])('rejects invalid or noncanonical keys: %s', async key => {
    await expect(prepareActionLookup(key)).rejects.toThrow();
  });
  it('rejects forged hashes and another action under the same lookup', async () => {
    const a = protocolAction(), lookup = await prepareActionLookup(actionKey(a));
    expect(() => validateActionLookup({ ...lookup })).toThrow('prepare');
    expect(() => prepareLookedUpAction(lookup, { ...a, actionId: 'other' })).toThrow('identity');
    expect(Object.isFrozen(lookup)).toBe(true);
  });
  it('returns absent only after excluding an orphaned result', async () => {
    const lookup = await prepareActionLookup(actionKey(protocolAction())), reads: string[] = [];
    const pages = { get: async (_area: string, key: string) => { reads.push(key); return undefined; } } as ProtocolRead;
    expect(await readActionByKey(pages, lookup)).toBeNull();
    expect(reads).toEqual([lookup.storageKey, `${lookup.storageKey}/result`]);
    pages.get = async (_area, key) => key.endsWith('/result') ? {} as never : undefined;
    await expect(readActionByKey(pages, lookup)).rejects.toThrow('without original');
  });
});
