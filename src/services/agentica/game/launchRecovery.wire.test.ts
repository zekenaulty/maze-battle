import { describe, expect, it } from 'vitest';
import { startRecoveryUrl } from './launchRecovery.wire';

describe('durable initial-start recovery routing', () => {
  it('looks up the exact original attempt, with escaped identity and no stale query', () => {
    const url = new URL(startRecoveryUrl('ws://localhost:5000/api/host?old=1#fragment',
      { hostId: 'maze-battle', sessionId: 'a/b', attemptId: 'a&b' }));
    expect(url.protocol).toBe('http:'); expect(url.pathname).toBe('/api/starts'); expect(url.hash).toBe('');
    expect([...url.searchParams]).toEqual([['hostId', 'maze-battle'], ['sessionId', 'a/b'], ['attemptId', 'a&b']]);
  });
  it('uses the explicit durable Stop endpoint over the same secure origin', () => {
    expect(startRecoveryUrl('wss://example.test/api/host?old=1#fragment')).toBe('https://example.test/api/starts/stop');
  });
});
