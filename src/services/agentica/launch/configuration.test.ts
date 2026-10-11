import { afterEach, describe, expect, it, vi } from 'vitest';
import { checkLab, DEFAULT_LAUNCH, labHttpUrl, launchProvider } from './configuration';
import { appendLaunchEvent, journalWriter, mayPrepare, retainedLaunchPhase, type LaunchJournal } from './journal';
import { messageSummary, readLaunchUsage } from './telemetry';

afterEach(() => vi.unstubAllGlobals());
describe('explicit launcher policy', () => {
  it('forwards only approved non-secret provider settings', () => {
    const provider = launchProvider({ ...DEFAULT_LAUNCH, apiKey: 'never-forward' } as typeof DEFAULT_LAUNCH);
    expect(provider).toEqual({ provider: 'openai', model: 'gpt-6-luna', thinkingEffort: 'high',
      includeThoughtSummaries: false, contextWindowTokens: 131072, maxOutputTokens: 4096 });
  });
  it('keeps fixture requests independent of the selected real model', () => {
    expect(launchProvider({ ...DEFAULT_LAUNCH, provider: 'fixture' })).toMatchObject({ provider: 'fixture', model: 'fixture-model' });
    expect(launchProvider({ ...DEFAULT_LAUNCH, provider: 'fixture' })).not.toHaveProperty('thinkingEffort');
  });
  it.each(['wss://127.0.0.1/api/host', 'ws://example.com/api/host', 'ws://user:pass@localhost/api/host', 'ws://localhost/api/host?key=secret'])(
    'rejects unsafe connection %s', url => expect(() => launchProvider({ ...DEFAULT_LAUNCH, url })).toThrow());
  it('uses read-only metadata for readiness without creating runs', async () => {
    const fetcher = vi.fn().mockResolvedValueOnce({ ok: true, json: async () => ({ status: 'ready', protocolVersion: 1 }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ configured: true, model: 'gpt-6-luna', thinkingEffort: 'high' }) });
    vi.stubGlobal('fetch', fetcher);
    expect(await checkLab(DEFAULT_LAUNCH)).toMatchObject({ model: 'gpt-6-luna' });
    expect(fetcher.mock.calls.map(call => call[0])).toEqual(['http://127.0.0.1:5078/api/health', 'http://127.0.0.1:5078/api/providers/openai/settings']);
    expect(fetcher.mock.calls.every(call => !call[1].method)).toBe(true);
  });
  it('refuses an unconfigured credential before paid launch', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce({ ok: true, json: async () => ({ status: 'ready', protocolVersion: 1 }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ configured: false }) }));
    await expect(checkLab(DEFAULT_LAUNCH)).rejects.toThrow('credential in Lab');
  });
  it('restores only a recovery marker, never an active launch', () => {
    const journal = { phase: 'running' } as LaunchJournal;
    expect(retainedLaunchPhase(journal)).toBe('recovery-required');
    expect(mayPrepare(journal)).toBe(false);
    expect(retainedLaunchPhase({ phase: 'preparing' } as LaunchJournal)).toBe('failed');
  });
  it('bounds the operator feed, not source receipts', () => {
    let journal = { events: [] } as unknown as LaunchJournal;
    for (let i = 0; i < 200; i++) journal = appendLaunchEvent(journal, 'progress', 'x'.repeat(3000));
    expect(journal.events).toHaveLength(80);
    expect(journal.events[0].text).toHaveLength(1200);
  });
  it('coalesces a burst of telemetry to one active and one pending durable snapshot', async () => {
    let release!: () => void;
    const wait = new Promise<void>(resolve => { release = resolve; });
    const write = vi.fn().mockImplementationOnce(() => wait).mockResolvedValue(undefined);
    const save = journalWriter(write);
    const first = save({ slot: 'first' } as LaunchJournal);
    for (let i = 0; i < 1000; i++) void save({ slot: String(i) } as LaunchJournal);
    expect(write).toHaveBeenCalledTimes(1);
    release(); await first;
    expect(write).toHaveBeenCalledTimes(2);
    expect(write).toHaveBeenLastCalledWith({ slot: '999' });
  });
  it('uses safe progress counters, without forwarding arbitrary payload fields', () => {
    expect(messageSummary({ protocolVersion: 1, type: 'progress', payload: { droppedRecords: 3,
      record: { kind: 'activity', activity: 'planning', outputCharacters: 50, elapsedMs: 100, private: 'secret' } } }))
      .toBe('activity / planning / 50 output characters / 100ms / 3 telemetry updates dropped');
  });
  it('does not fabricate zero usage when the service cannot report it', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) }));
    await expect(readLaunchUsage(DEFAULT_LAUNCH.url, 'run')).rejects.toThrow('usage is unavailable');
    expect(labHttpUrl(DEFAULT_LAUNCH.url, '/api/runs/run')).toBe('http://127.0.0.1:5078/api/runs/run');
  });
});
