import { describe, expect, it, vi } from 'vitest';
import { ExpeditionActionSession } from './actionSession';
import type { ExpeditionCheckpoint, ExpeditionObservation } from './types';
import type { ExpeditionActionRequest } from './protocol';

function fixture() {
  let revision = 0;
  const execute = vi.fn(async () => { revision++; return { applied: true, reason: 'Moved.' }; });
  const session = new ExpeditionActionSession('session', {
    checkpoint: () => ({ revision } as ExpeditionCheckpoint), execute,
    observe: () => ({ revision, visibleCells: [] } as unknown as ExpeditionObservation),
  }, 3);
  const request: ExpeditionActionRequest = { version: 1, sessionId: 'session', epoch: 0, actionId: 'action', expectedRevision: 0, command: { type: 'move', direction: 'east' } };
  return { session, execute, request };
}

describe('browser-owned expedition action session', () => {
  it('applies once and reconciles the original result even after takeover', async () => {
    const { session, request, execute } = fixture();
    const first = await session.request(request);
    session.takeOver();
    expect(await session.request(request)).toEqual(first);
    expect(execute).toHaveBeenCalledTimes(1);
    first.reason = 'caller mutation';
    const queried = (await session.result(request.actionId))!;
    queried.reason = 'query mutation';
    expect((await session.request(request)).reason).toBe('Moved.');
    expect((await session.request({ ...request, command: { type: 'collect' } })).disposition).toBe('refused');
    expect((await session.request({ ...request, actionId: 'next', expectedRevision: 1 })).disposition).toBe('conflict');
  });

  it('checks revisions, IDs and strict command schemas before dispatch', async () => {
    const { session, request, execute } = fixture();
    expect((await session.request({ ...request, expectedRevision: 9 })).disposition).toBe('conflict');
    expect((await session.request({ ...request, command: { type: 'move', direction: 'diagonal' } as never })).disposition).toBe('refused');
    expect((await session.request({ ...request, command: { type: 'collect', hiddenTarget: 'vault' } as never })).disposition).toBe('refused');
    expect((await session.request({ ...request, actionId: '' })).disposition).toBe('refused');
    expect(execute).not.toHaveBeenCalled();
  });

  it('allows one mutation in flight and deduplicates an awaiting command', async () => {
    const { session, request, execute } = fixture();
    let release!: () => void;
    execute.mockImplementationOnce(async () => { await new Promise<void>(resolve => { release = resolve; }); return { applied: true, reason: 'Moved.' }; });
    const pending = session.request(request);
    const duplicate = session.request(structuredClone(request));
    expect((await session.request({ ...request, actionId: 'other' })).disposition).toBe('unavailable');
    session.takeOver();
    release();
    expect(await duplicate).toEqual(await pending);
    expect(execute).toHaveBeenCalledTimes(1);
  });

  it('retains uncertain results rather than retrying an effect', async () => {
    const { session, request, execute } = fixture();
    execute.mockRejectedValueOnce(new Error('Storage acknowledgment failed.'));
    expect((await session.request(request)).disposition).toBe('unresolved');
    expect((await session.request(request)).disposition).toBe('unresolved');
    expect(execute).toHaveBeenCalledTimes(1);
  });
});
