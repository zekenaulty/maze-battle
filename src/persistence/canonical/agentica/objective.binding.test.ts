// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { canonicalJson } from '../../../services/agentica/sdk/agentica-host.mjs';
import { addQuest, questMemory } from '../content/acceptedQueries.test-support';
import { checkpointJson } from '../game/checkpoint';
import { earnedCell } from '../knowledge/region.test-support';
import { returnFixture } from '../knowledge/townReturn.test-support';
import { observationIntegrityKey } from '../knowledge/observation.integrity';
import type { CanonicalPages } from '../pages';
import { canonicalFence, type CanonicalWork } from '../transaction';
import type { CanonicalRecord, CanonicalRequest, JsonObject } from '../types';
import { bindReturnObjective, objectiveSelection, returnObjective, validateLaunchObjective, validateObjectiveSelection } from './objective.binding';
import { readPublication, retainPublication } from './publication';
import type { ProtocolRef, Publication } from './types';
import { protocolHead } from './types.test-support';

async function fixture(status: 'active' | 'complete' | 'claimed' = 'active', floor = 1) {
  const world = questMemory(), selected = await addQuest(world, 'vault', status, floor), earned = await returnFixture();
  const head = protocolHead(); head.checkpoint = checkpointJson(earned.checkpoint());
  const request: CanonicalRequest = { expected: canonicalFence(head), attemptId: 'publish', operation: 'agentica.publish',
    input: { returnQuest: { launchId: 'launch', objectiveId: 'return', questId: selected.quest.quest.id } }, deadlineAt: null };
  const records = new Map<string, CanonicalRecord>(), sources = new Map<string, { request: CanonicalRequest; proof: JsonObject }>();
  const get = vi.fn<CanonicalPages['get']>(async (area, key) => {
    if (area === 'knowledge') return earned.pages.get(area, key);
    if (area === 'world') {
      expect([selected.record.key, selected.contractRecord.key]).toContain(key);
      return world.pages.get(area, key);
    }
    expect(area).toBe('execution'); expect(key).toBe('agentica/publications/publish');
    return structuredClone(records.get(key));
  });
  const set = vi.fn<CanonicalPages['set']>(async (area, key, value, indexes = []) => {
    expect(area).toBe('execution'); expect(key).toBe('agentica/publications/publish');
    const row: CanonicalRecord = { generation: head.generation, gameId: head.gameId, area, key, indexes,
      value: structuredClone(value), id: 'publication-record', revision: head.revision + 1 };
    records.set(key, row); return structuredClone(row);
  });
  const pages = {
    get, set, scan: vi.fn(async () => { throw Error('Forbidden scan'); }),
    witness: vi.fn<CanonicalPages['witness']>((...args) => earned.pages.witness(...args)),
    savedSnapshot: vi.fn(async (key: string) => {
      const record = records.get(key)!, value = record.value as unknown as Publication;
      const original = sources.get(value.sourceAttemptId)!;
      // Stand in for the kernel's exact savedSnapshot receipt/witness boundary.
      expect(original.proof).toMatchObject({ snapshotRecordId: record.id, snapshotWitness: canonicalJson(record) });
      return structuredClone({ record, source: original.request, snapshot: value.snapshot });
    }),
  } as unknown as CanonicalPages;
  const tx = { head, pages, setCheckpoint() { throw Error('Forbidden checkpoint write'); },
    restoreSnapshot() { throw Error('Forbidden restore'); }, liveOperation() { throw Error('Forbidden operation read'); } } as CanonicalWork;
  async function publish() {
    const original = structuredClone(request), written = await retainPublication(tx, request);
    sources.set(original.attemptId, { request: original, proof: written.receipt }); return written.reference;
  }
  const expected = { schema: 1 as const, kind: 'retrieve-return' as const, launchId: 'launch', objectiveId: 'return',
    quest: { ref: selected.ref, questId: selected.quest.quest.id, title: selected.quest.quest.title,
      acceptedAt: selected.quest.quest.acceptedAt, item: selected.quest.quest.task.item! },
    entrance: { at: earned.town.at, source: { sequence: 1, id: earned.original.id, index: 0 } } };
  return { ...selected, world, earned, head, request, records, sources, pages, get, set, tx, publish, expected };
}

describe('owner-selected return objective publication', () => {
  it.each(['active', 'complete', 'claimed'] as const)('binds exact world sources for %s without inventory or hidden reads', async status => {
    const f = await fixture(status), before = structuredClone(f.world.records);
    const objective = await bindReturnObjective(f.tx, f.request);
    expect(objective).toEqual(f.expected);
    expect(returnObjective(objective)).toEqual(f.expected); // World quest refs are not Agentica protocol refs.
    expect(f.get.mock.calls.filter(([area]) => area === 'world').map(([, key]) => key))
      .toEqual([f.ref.key, f.ref.key, f.contractRecord.key]);
    // Full/source checks include proof reads; this is the fixture's logical count, not a runtime cap.
    const proofs = new Set([observationIntegrityKey(f.earned.original.sequence),
      observationIntegrityKey(f.earned.checkpoint().knowledge!.sequence)]);
    expect(f.get.mock.calls.filter(([area, key]) => area === 'knowledge' && proofs.has(key))).toHaveLength(6);
    expect(f.get.mock.calls).toHaveLength(23);
    expect(f.pages.scan).not.toHaveBeenCalled(); expect(f.set).not.toHaveBeenCalled();
    expect(f.world.records).toEqual(before);
    objective!.quest.item.token = 'changed'; objective!.entrance.at.cell.spaceId = 'changed';
    expect(await bindReturnObjective(f.tx, f.request)).toEqual(f.expected);
  });

  it('retains and rereads the exact objective and original owner selection without rereading world/knowledge', async () => {
    const f = await fixture(), ref = await f.publish(), reads = f.get.mock.calls.length;
    const publication = await readPublication(f.pages, ref);
    expect(publication.objective).toEqual(f.expected); expect(publication.sourceRequest).toEqual(f.request);
    expect(publication.snapshot).toEqual({ generation: f.head.generation, gameId: f.head.gameId, revision: f.head.revision,
      roots: { world: f.head.roots.world, knowledge: f.head.roots.knowledge }, checkpoint: f.head.checkpoint });
    expect(f.get).toHaveBeenCalledTimes(reads); expect(f.set).toHaveBeenCalledTimes(1);
    expect(() => validateLaunchObjective(publication, 'launch', 'return')).not.toThrow();
    for (const [launch, objective] of [['foreign', 'return'], ['launch', 'foreign']])
      expect(() => validateLaunchObjective(publication, launch, objective)).toThrow('binding changed');
    publication.objective!.quest.item.token = 'mutated-return';
    expect((await readPublication(f.pages, ref)).objective).toEqual(f.expected);
  });

  it('owns the selection and head before yielding during publication', async () => {
    const f = await fixture(), original = structuredClone(f.request), checkpoint = structuredClone(f.head.checkpoint);
    let release!: () => void;
    const paused = new Promise<void>(resolve => { release = resolve; }), witness = vi.mocked(f.pages.witness).getMockImplementation()!;
    vi.spyOn(f.pages, 'witness').mockImplementation(async (...args) => { await paused; return witness(...args); });
    const pending = f.publish();
    (f.request.input as JsonObject).returnQuest = { launchId: 'other', objectiveId: 'other', questId: 'other' };
    f.head.checkpoint.mode = 'town'; f.head.owner = 'other';
    release();
    const publication = await readPublication(f.pages, await pending);
    expect(publication.sourceRequest).toEqual(original); expect(publication.objective).toEqual(f.expected);
    expect(publication.snapshot.checkpoint).toEqual(checkpoint); expect(publication.owner).toBe('owner');
  });

  it('bounds wide observations without scanning intervening history', async () => {
    const f = await fixture(), wide = Array.from({ length: 113 }, (_, column) => earnedCell(200, column, 'wide', 0, column));
    for (let n = 0; n < 16; n++) await f.earned.observe(wide);
    f.head.checkpoint = checkpointJson(f.earned.checkpoint()); f.earned.reads.length = 0;
    expect((await readPublication(f.pages, await f.publish())).objective).toEqual(f.expected);
    const sequence = f.earned.checkpoint().knowledge!.sequence;
    const sequences = f.earned.reads.flatMap(key => /\/observation\/(\d+)/.exec(key)?.slice(1) ?? []).map(Number);
    expect(sequences.length).toBeGreaterThan(0);
    expect(sequences.every(value => value === 1 || value === sequence)).toBe(true);
    expect(f.get.mock.calls.length).toBeLessThanOrEqual(105); expect(f.pages.witness).toHaveBeenCalledTimes(3);
    expect(f.pages.scan).not.toHaveBeenCalled();
  });

  it('keeps ordinary publications untyped even when free text mentions a quest', async () => {
    const f = await fixture(); f.request.input = { objective: 'Retrieve and return the selected quest.' };
    expect(objectiveSelection(f.request)).toBeUndefined();
    expect((await readPublication(f.pages, await f.publish())).objective).toBeUndefined();
    expect(f.get.mock.calls.some(([area]) => area === 'world')).toBe(false);
  });

  it.each(['auto-play', 'town', 'waves', 'floor2'] as const)('refuses %s control before any objective reads', async mode => {
    const f = await fixture();
    if (mode === 'floor2') (f.head.checkpoint.position as JsonObject).level = 2; else f.head.checkpoint.mode = mode;
    await expect(bindReturnObjective(f.tx, f.request)).rejects.toThrow('manual floor-one');
    expect(f.get).not.toHaveBeenCalled(); expect(f.set).not.toHaveBeenCalled();
  });

  it.each(['unaccepted', 'missing', 'foreign-floor', 'no-knowledge'] as const)('refuses %s source without publishing', async defect => {
    const f = await fixture('active', defect === 'foreign-floor' ? 2 : 1);
    if (defect === 'unaccepted') f.contract.accepted = false;
    if (defect === 'missing') f.world.records.delete(f.ref.key);
    if (defect === 'no-knowledge') f.head.checkpoint.knowledge = null;
    await expect(f.publish()).rejects.toThrow(); expect(f.set).not.toHaveBeenCalled();
  });

  it('refuses a quest record replaced between selection and exact-reference validation', async () => {
    const f = await fixture(), get = f.get.getMockImplementation()!;
    f.get.mockImplementation(async (...args) => {
      const row = await get(...args);
      if (args[1] === f.ref.key) f.record.id = 'replacement';
      return row;
    });
    await expect(f.publish()).rejects.toThrow(); expect(f.set).not.toHaveBeenCalled();
  });

  it.each(['world', 'knowledge'] as const)('propagates %s budget exhaustion without retaining an objective', async area => {
    const f = await fixture(), failure = Error('read budget exhausted'), get = f.get.getMockImplementation()!;
    f.get.mockImplementation((...args) => args[0] === area ? Promise.reject(failure) : get(...args));
    await expect(f.publish()).rejects.toBe(failure); expect(f.set).not.toHaveBeenCalled();
  });

  it.each(['launchId', 'objectiveId', 'questId'] as const)('rejects changed owner %s in a retained objective', async field => {
    const f = await fixture(), request = structuredClone(f.request);
    ((request.input as JsonObject).returnQuest as JsonObject)[field] = 'foreign';
    expect(() => validateObjectiveSelection(f.expected, request)).toThrow('selection changed');
  });

  it('rejects typed selection in non-publication commands and implicit addition/removal', async () => {
    const f = await fixture();
    expect(() => objectiveSelection({ ...f.request, operation: 'agentica.decision.grant' })).toThrow('explicitly published');
    expect(() => validateObjectiveSelection(undefined, f.request)).toThrow('selection changed');
    expect(() => validateObjectiveSelection(f.expected, { ...f.request, input: {} })).toThrow('selection changed');
  });

  it.each(['owner', 'epoch', 'revision'] as const)('refuses stale %s publication authority before any read or write', async field => {
    const f = await fixture();
    if (field === 'owner') f.request.expected.owner = 'foreign'; else f.request.expected[field]++;
    await expect(f.publish()).rejects.toThrow('writer custody changed');
    expect(f.get).not.toHaveBeenCalled(); expect(f.set).not.toHaveBeenCalled(); expect(f.pages.witness).not.toHaveBeenCalled();
  });

  it.each(['agentica-prefix', 'wrong-quest', 'invalid-record-id', 'wrong-floor'] as const)('rejects %s objective references', async defect => {
    const f = await fixture(), objective = structuredClone(f.expected);
    if (defect === 'agentica-prefix') objective.quest.ref.key = `agentica/${objective.quest.ref.key}`;
    if (defect === 'wrong-quest') objective.quest.ref.key = 'quest/foreign';
    if (defect === 'invalid-record-id') objective.quest.ref.id = 'invalid/id';
    if (defect === 'wrong-floor') objective.entrance.at.level = 2;
    expect(() => returnObjective(objective)).toThrow();
  });

  it('rejects mismatched publication identity and tampered retained objective evidence', async () => {
    const f = await fixture(), ref = await f.publish();
    await expect(readPublication(f.pages, { ...ref, id: 'foreign' } satisfies ProtocolRef)).rejects.toThrow('reference');
    const row = f.records.get(ref.key)!.value as unknown as Publication;
    row.objective!.entrance.source.id = 'forged';
    await expect(readPublication(f.pages, ref)).rejects.toThrow();
  });
});
