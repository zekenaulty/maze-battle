// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { CanonicalPages } from '../pages';
import { canonicalFence, type CanonicalOperationWork } from '../transaction';
import { MIN_TERMINAL_BYTES, type CanonicalOperation, type CanonicalRecord, type CanonicalRequest, type JsonObject } from '../types';
import { json } from '../world/records';
import { retainLaunchAdmission } from './launch.admission';
import { assertLaunchGrant } from './launch.grant';
import { loadLaunch } from './launch.read';
import { launchPages, launchWriter } from './launch.records';
import { launchProofFixture, launchStartFixture } from './launch.test-support';
import { retainLaunchTransition } from './launch.transitions';
import { launchBinding, launchGuardId, launchSessionId } from './launch.validation';
import { returnObjective } from './objective.binding';
import { readPublication } from './publication';
import { readPublicationSelection, retainPublicationSelection } from './publication-selection';
import * as grants from './run-grant.read';
import type { ProtocolRef, Publication } from './types';
import { protocolAction, protocolHead } from './types.test-support';

vi.mock('./publication', async original => ({
  ...await original<typeof import('./publication')>(), readPublication: vi.fn(),
}));
afterEach(() => { vi.restoreAllMocks(); vi.clearAllMocks(); });

function fixture() {
  const head = protocolHead(), start = launchStartFixture(head.revision);
  start.sessionId = launchSessionId(head.gameId, 'launch');
  const objective = returnObjective({ schema: 1, kind: 'retrieve-return', launchId: 'launch', objectiveId: start.objectiveId,
    quest: { ref: { key: 'quest/fetch', id: 'accepted-row' }, questId: 'fetch', title: 'Fetch',
      acceptedAt: '2026-10-20T00:00:00.000Z', item: { baseId: 'collectible', displayName: 'Collectible', token: 'token' } },
    entrance: { at: { level: 1, cell: { spaceId: 'earned', row: 0, column: 0 } },
      source: { sequence: 1, id: 'observation', index: 0 } } });
  const root = { key: 'agentica/publications/root', id: 'root-record' };
  const publication = (): Publication => ({ schema: 1, kind: 'agentica-publication', sourceAttemptId: 'root',
    sourceRequest: { expected: canonicalFence(head), operation: 'agentica.publish', attemptId: 'root', input: {}, deadlineAt: null },
    owner: head.owner, epoch: head.epoch, observation: null, wireRevision: head.revision,
    snapshot: { generation: head.generation, gameId: head.gameId, revision: head.revision,
      roots: { world: head.roots.world, knowledge: head.roots.knowledge }, checkpoint: structuredClone(head.checkpoint) } });
  const initial = { ...publication(), objective };
  const publications = new Map<string, { ref: ProtocolRef; value: Publication }>([[root.key, { ref: root, value: initial }]]);
  // Publication provenance is covered in objective.binding.test.ts; lifecycle checks stay real here.
  vi.mocked(readPublication).mockImplementation(async (_pages, ref) => {
    const row = publications.get(ref.key); expect(row?.ref).toEqual(ref); return structuredClone(row!.value);
  });
  const binding = launchBinding({ schema: 1, kind: 'agentica-launch', launchId: 'launch', endpoint: 'ws://localhost:5295',
    publication: root, start }), records = new Map<string, CanonicalRecord>();
  const receipts = new Map<string, { source: CanonicalRequest; receipt: { afterRevision: number; result: JsonObject } }>();
  let serial = 0, guard: CanonicalOperation;
  const pages = {
    get: vi.fn(async (area: string, key: string) => {
      expect(area).toBe('execution'); return structuredClone(records.get(key));
    }),
    set: vi.fn(async (area: string, key: string, value: JsonObject) => {
      expect(area).toBe('execution');
      const row: CanonicalRecord = { generation: head.generation, gameId: head.gameId, area: 'execution', key, indexes: [],
        id: `row-${++serial}`, revision: head.revision + 1, value: structuredClone(value) };
      records.set(key, row); return structuredClone(row);
    }),
    witness: vi.fn(async (area: string, prefix: string) => {
      expect([area, prefix]).toEqual(['execution', 'agentica/launches/']); return null;
    }),
    sourceReceipt: async (id: string) => { expect(receipts.has(id)).toBe(true); return structuredClone(receipts.get(id)!); },
    savedSnapshot: async () => { throw Error('Publication boundary is supplied by this unit fixture'); },
  } as unknown as CanonicalPages;
  const tx = { head, pages, liveOperation: async (id: string) => {
    expect(id).toBe(launchGuardId('launch')); return structuredClone(guard);
  } } as CanonicalOperationWork;
  async function write(operation: string, input: unknown, work: (request: CanonicalRequest) => Promise<JsonObject>) {
    const source: CanonicalRequest = { expected: canonicalFence(head), operation, input: json(input),
      attemptId: `attempt-${++serial}`, deadlineAt: null };
    const result = await work(source);
    receipts.set(source.attemptId, { source: structuredClone(source), receipt: { afterRevision: ++head.revision, result } });
  }
  async function admit() {
    await write('operation.admit', { operationId: launchGuardId('launch'), binding, terminalBytes: MIN_TERMINAL_BYTES, ackPolicy: 'verified-host' },
      async request => {
        guard = { generation: head.generation, gameId: head.gameId, id: launchGuardId('launch'), binding: json(binding),
          admissionAttemptId: request.attemptId, owner: head.owner, epoch: head.epoch, revision: head.revision + 1,
          state: 'admitted', ackPolicy: 'verified-host' } as CanonicalOperation;
        tx.operation = guard; return retainLaunchAdmission(tx, request);
      });
  }
  const load = () => loadLaunch(launchPages(tx), 'launch');
  async function grant() {
    await admit(); await write('agentica.launch.dispatch', { launchId: 'launch' }, request => retainLaunchTransition(tx, request));
    const dispatched = (await load()).dispatch!;
    await write('agentica.launch.announce', { launchId: 'launch', dispatch: dispatched.ref,
      ...launchProofFixture(start, dispatched.source.attemptId) }, request => retainLaunchTransition(tx, request));
    await write('agentica.launch.grant', { launchId: 'launch', run: (await load()).run!.ref, publication: root },
      request => retainLaunchTransition(tx, request));
    return (await load()).grant!.ref;
  }
  const action = () => ({ ...protocolAction(), runId: 'service-run', sessionId: start.sessionId, capabilityId: 'maze.observe',
    sessionEpoch: String(head.epoch), expectedRevision: head.revision, deadlineAt: new Date(Date.now() + 60_000).toISOString() });
  return { tx, head, root, binding, initial, publications, publication, pages, records, admit, load, grant, action, write, objective };
}

describe('return objective launch binding', () => {
  it.each(['launchId', 'objectiveId'] as const)('refuses a mismatched %s at admission before writes', async field => {
    const f = fixture(); f.initial.objective[field] = 'foreign';
    await expect(f.admit()).rejects.toThrow('launch return objective binding changed');
    expect(f.pages.set).not.toHaveBeenCalled();
  });

  it.each(['launchId', 'objectiveId'] as const)('refuses a mismatched %s on retained launch load', async field => {
    const f = fixture(); await f.admit(); f.initial.objective[field] = 'foreign';
    await expect(f.load()).rejects.toThrow('launch return objective binding changed');
  });

  it('returns the original typed objective with the initial grant without changing canonical state', async () => {
    const f = fixture(), grant = await f.grant(), before = structuredClone(f.records), action = f.action();
    action.expectedRevision = f.initial.wireRevision;
    const authorized = await assertLaunchGrant(f.tx, grant, action, f.root);
    expect(authorized.objective).toEqual({ publication: f.root, value: f.objective });
    expect(f.records).toEqual(before);
    authorized.objective!.value.quest.ref.id = 'mutated';
    expect((await assertLaunchGrant(f.tx, grant, action, f.root)).objective!.value).toEqual(f.objective);
  });

  it.each(['owner', 'epoch', 'world', 'checkpoint', 'expired'] as const)('refuses %s drift rather than returning objective authority', async changed => {
    const f = fixture(), grant = await f.grant(), action = f.action(); action.expectedRevision = f.initial.wireRevision;
    if (changed === 'owner') f.head.owner = 'foreign';
    if (changed === 'epoch') f.head.epoch++;
    if (changed === 'world') f.head.roots.world = 'foreign-world';
    if (changed === 'checkpoint') f.head.checkpoint.wave = 2;
    if (changed === 'expired') action.deadlineAt = '2026-01-01T00:00:00.000Z';
    await expect(assertLaunchGrant(f.tx, grant, action, f.root)).rejects.toThrow();
  });

  it('keeps the original objective across a certified successor grant and an untyped selected publication', async () => {
    const f = fixture(), initialGrant = await f.grant(), certified = await grants.loadRunGrant(launchPages(f.tx), initialGrant);
    const previous = (await readPublicationSelection(f.pages, 'launch'))!.ref;
    const next: ProtocolRef = { key: 'agentica/publications/next', id: 'next-record' };
    const successor = { key: 'agentica/operations/successor/grant', id: 'successor-record' };
    const fresh = f.publication(); f.publications.set(next.key, { ref: next, value: fresh });
    await f.write('agentica.decision.grant', {}, async request => {
      const writer = launchWriter(f.tx, request);
      await retainPublicationSelection(f.tx, request,
        { launchId: 'launch', grant: successor, publication: next, previousSelection: previous }, writer);
      return writer.receipt();
    });
    // Only the already-certified successor boundary is stubbed, not root launch or selection validation.
    certified.record.ref = successor; certified.started = { ...certified.started, runId: 'successor-run' };
    vi.spyOn(grants, 'loadRunGrant').mockResolvedValueOnce(certified);
    const action = { ...f.action(), runId: 'successor-run', expectedRevision: fresh.wireRevision };
    const before = structuredClone(f.records), result = await assertLaunchGrant(f.tx, successor, action, next);
    expect(result.publication.objective).toBeUndefined();
    expect(result.objective).toEqual({ publication: f.root, value: f.objective });
    expect(f.records).toEqual(before);
  });
});
