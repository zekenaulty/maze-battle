import { describe, expect, it } from 'vitest';
import { deferred, fixtureUrl } from './clientPolicy';

describe('shared Agentica fixture policy', () => {
  it.each(['wss://localhost:5079/api/host', 'ws://example.com/api/host', 'ws://localhost.evil/api/host',
    'ws://user@localhost/api/host', 'ws://localhost/api/host?provider=openai', 'ws://localhost/elsewhere',
    'ws://localhost/api/host#fragment'])('rejects unsafe endpoint %s', url => {
    expect(() => fixtureUrl(url)).toThrow('loopback');
  });

  it.each(['localhost', '127.0.0.1', '[::1]'])('retains the exact loopback endpoint for %s', host => {
    const url = `ws://${host}:5079/api/host`;
    expect(fixtureUrl(url)).toBe(url);
  });

  it('retains the first deferred outcome without hiding rejection from callers', async () => {
    const ready = deferred<string>();
    ready.resolve('original'); ready.resolve('replacement'); ready.reject(new Error('late'));
    await expect(ready.promise).resolves.toBe('original');
    const refused = deferred<void>(), error = new Error('original failure');
    refused.reject(error);
    await expect(refused.promise).rejects.toBe(error);
  });
});
