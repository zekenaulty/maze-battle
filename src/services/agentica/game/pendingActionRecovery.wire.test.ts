// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { pendingDescriptor, pendingPage, pendingRunUrl } from './pendingActionRecovery.wire';
import type { PendingActionDescriptor } from './pendingActionRecovery.types';

const run = { hostId: 'maze-battle', sessionId: 'session', sessionEpoch: '2', runId: 'successor' };
const descriptor = (actionId = 'pending'): PendingActionDescriptor => ({ actionId, requestHash: `sha256:${'a'.repeat(64)}`,
  capabilityHash: `sha256:${'b'.repeat(64)}`, disposition: null, recoveryRetention: 'reserved' });
const page = () => ({ ...run, items: [descriptor()], nextAfterActionId: null as string | null });

describe('bounded pending run descriptors', () => {
  it.each(['hostId', 'sessionId', 'sessionEpoch', 'runId'])('refuses foreign %s', field => {
    expect(() => pendingPage({ ...page(), [field]: 'foreign' }, run, null)).toThrow('run changed');
  });
  it.each(['too many', 'duplicate', 'unordered', 'before cursor', 'missing cursor', 'extra request', 'short continuation', 'wrong continuation'])
  ('refuses %s pages', kind => {
    const input: Record<string, unknown> = page(); let after: string | null = null;
    if (kind === 'too many') input.items = Array.from({ length: 17 }, (_, n) => descriptor(`a${n}`));
    if (kind === 'duplicate') input.items = [descriptor(), descriptor()];
    if (kind === 'unordered') input.items = [descriptor('b'), descriptor('a')];
    if (kind === 'before cursor') after = 'pending';
    if (kind === 'missing cursor') delete input.nextAfterActionId;
    if (kind === 'extra request') input.request = {};
    if (kind === 'short continuation') input.nextAfterActionId = 'pending';
    if (kind === 'wrong continuation') {
      input.items = Array.from({ length: 16 }, (_, n) => descriptor(`a${String(n).padStart(2, '0')}`));
      input.nextAfterActionId = 'wrong';
    }
    expect(() => pendingPage(input, run, after)).toThrow();
  });
  it.each(['hash', 'long id', 'missing field', 'extra request', 'nonstring disposition', 'nonstring retention'])('refuses %s descriptors', kind => {
    const item: Record<string, unknown> = { ...descriptor() };
    if (kind === 'hash') item.requestHash = 'invented';
    if (kind === 'long id') item.actionId = 'a'.repeat(129);
    if (kind === 'missing field') delete item.disposition;
    if (kind === 'extra request') item.request = {};
    if (kind === 'nonstring disposition') item.disposition = false;
    if (kind === 'nonstring retention') item.recoveryRetention = {};
    expect(() => pendingDescriptor(item)).toThrow();
  });
  it('requires null-or-string states, allowing retained terminal entries without inferring clearance', () => {
    const input = page(); input.items = [{ ...descriptor(), recoveryRetention: null, disposition: 'refused' }];
    expect(pendingPage(input, run, null)).toMatchObject({ rootClear: 'unknown', sessionClear: 'unknown', items: input.items });
  });
  it('bounds the complete page bytes before interpreting its contents', () => {
    expect(() => pendingPage({ ...page(), padding: 'x'.repeat(33 * 1024) }, run, null)).toThrow();
  });
  it('uses the retained endpoint and exact run; cursor cannot alter query identity', () => {
    const url = new URL(pendingRunUrl('wss://example.test/api/host?old=1#fragment', run, 'a&runId=evil'));
    expect(url.origin).toBe('https://example.test'); expect(url.pathname).toBe('/api/recovery/run');
    expect(Object.fromEntries(url.searchParams)).toEqual({ ...run, afterActionId: 'a&runId=evil' }); expect(url.hash).toBe('');
  });
});
