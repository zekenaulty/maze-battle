// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { questIndexes } from '../content/records';
import { gameCheckpoint } from '../game/checkpoint';
import { observationKey } from '../knowledge/keys';
import { earnedCell } from '../knowledge/region.test-support';
import { cells, header } from '../knowledge/townReturn.test-support';
import { readReturnEvidence, returnSatisfied } from './objective.evidence';
import { evidenceFixture } from './objective.evidence.test-support';

describe('private current return evidence', () => {
  it.each(['complete', 'claimed'] as const)('qualifies a %s selected item in pack at the currently observed town stair', async status => {
    const f = await evidenceFixture('pack', status), snapshot = f.snapshot();
    const before = structuredClone([f.records, f.knowledge.records]);
    const evidence = await readReturnEvidence(f.pages, snapshot, f.objective), anchor = gameCheckpoint(snapshot.checkpoint).knowledge!;
    expect(evidence).toMatchObject({ schema: 1, generation: snapshot.generation, gameId: snapshot.gameId,
      quest: { quest: f.ref, floor: 1, status, packCount: 1, stashCount: 0 },
      arrival: { sequence: anchor.sequence, id: anchor.id, index: 0 } });
    expect(evidence.arrival).not.toEqual(f.objective.entrance.source);
    expect(returnSatisfied(evidence)).toBe(true);
    expect([f.records, f.knowledge.records]).toEqual(before);
    expect(f.get.mock.calls.map(call => call[1])).toEqual([
      f.ref.key, f.ref.key, f.contractRecord.key, f.ref.key, f.contractRecord.key, 'roster/pack', 'roster/stash', f.key,
    ]);
    expect(f.scan.mock.calls).toEqual([['world', f.prefix, undefined, 1], ['world', f.itemRecord!.indexes[0], undefined, 1]]);
    expect(f.knowledge.reads).toEqual([observationKey(2), `${observationKey(2)}/0`, observationKey(2), `${observationKey(2)}/0`]);
    expect(f.witness).toHaveBeenCalledWith('knowledge', 'perception/');
  });

  it.each([
    [null, 'active'], [null, 'complete'], [null, 'claimed'], ['stash', 'complete'], ['stash', 'claimed'],
  ] as const)('does not infer pack custody from %s/%s progress or award history', async (owner, status) => {
    const f = await evidenceFixture(owner, status), evidence = await readReturnEvidence(f.pages, f.snapshot(), f.objective);
    expect(evidence.quest).toMatchObject({ status, packCount: 0, stashCount: owner === 'stash' ? 1 : 0 });
    expect(evidence.arrival).not.toBeNull(); expect(returnSatisfied(evidence)).toBe(false);
  });

  it('does not infer completion merely from a pack item and arrival while the quest is active', async () => {
    const f = await evidenceFixture('pack', 'active');
    f.quest.award = { itemId: f.stored.item.id, chestId: 'unresolved-award-source' };
    const evidence = await readReturnEvidence(f.pages, f.snapshot(), f.objective);
    expect(evidence.quest).toMatchObject({ status: 'active', packCount: 1 });
    expect(returnSatisfied(evidence)).toBe(false);
  });

  it('follows the stable quest ID through legitimate progress and a new immutable row identity', async () => {
    const f = await evidenceFixture(null, 'active'), snapshot = f.snapshot();
    const empty = await readReturnEvidence(f.pages, snapshot, f.objective);
    f.quest.quest.task.progress = 1; f.quest.quest.status = 'complete';
    f.quest.quest.completedAt = '2026-10-20T01:00:00.000Z';
    f.quest.award = { itemId: `quest-item:${f.quest.quest.id}`, chestId: 'private-source' };
    f.record.id = 'new-quest-row'; f.record.revision = 8; f.record.indexes = questIndexes(f.quest);
    const progressed = await readReturnEvidence(f.pages, snapshot, f.objective);
    expect(empty.quest.quest.id).toBe(f.objective.quest.ref.id);
    expect(progressed.quest).toMatchObject({ quest: { key: f.objective.quest.ref.key, id: 'new-quest-row' }, status: 'complete', packCount: 0 });
    expect(returnSatisfied(progressed)).toBe(false);
  });

  it('returns the actor index at the 113-cell bound, not the first nearby town flag', async () => {
    const f = await evidenceFixture();
    const visible = Array.from({ length: 113 }, (_, n) => earnedCell(-5, -2 + n, 'room', 0, n)).reverse();
    visible[112].stairs = ['town'];
    await f.knowledge.observe(visible);
    const snapshot = f.snapshot();
    snapshot.checkpoint.position = { level: 1, cell: { ...f.objective.entrance.at.cell } };
    header(f.knowledge, 3).actor = structuredClone(f.objective.entrance.at);
    f.knowledge.reads.length = 0;
    const evidence = await readReturnEvidence(f.pages, snapshot, f.objective);
    expect(evidence.arrival).toEqual({ sequence: 3, id: gameCheckpoint(snapshot.checkpoint).knowledge!.id, index: 112 });
    expect(f.knowledge.reads).toHaveLength(18);
  });

  it.each(['away', 'town', 'auto-play', 'waves'] as const)('reports no arrival in %s without reading or acquiring sight', async mode => {
    const f = await evidenceFixture('pack', 'complete', mode === 'away'), snapshot = f.snapshot();
    if (mode !== 'away') snapshot.checkpoint.mode = mode;
    const reads = f.knowledge.reads.length, writes = f.knowledge.writes.length;
    const evidence = await readReturnEvidence(f.pages, snapshot, f.objective);
    expect(evidence.arrival).toBeNull(); expect(returnSatisfied(evidence)).toBe(false);
    expect(f.knowledge.reads).toHaveLength(reads); expect(f.knowledge.writes).toHaveLength(writes);
    expect(f.witness).not.toHaveBeenCalled();
  });

  it('snapshots caller arguments and read methods before yielding and owns the returned evidence', async () => {
    const f = await evidenceFixture(), snapshot = f.snapshot(), original = structuredClone(snapshot);
    const objective = structuredClone(f.objective), bound = structuredClone(objective), get = f.pages.get;
    let release!: () => void;
    const paused = new Promise<void>(resolve => { release = resolve; });
    f.pages.get = async (...args) => { await paused; return get(...args); };
    const pending = readReturnEvidence(f.pages, snapshot, objective);
    snapshot.gameId = 'changed'; snapshot.revision = 0; snapshot.checkpoint.position = { level: 99 };
    objective.quest.title = 'changed'; objective.quest.item.token = 'changed'; objective.entrance.at.cell.row = 99;
    f.pages.get = async () => { throw Error('caller changed method'); };
    release();
    const result = await pending;
    expect(result.quest.packCount).toBe(1); expect(result.arrival?.sequence).toBe(2);
    Object.assign(result.quest.quest, { id: 'changed' }); Object.assign(result.quest.items[0].source, { id: 'changed' });
    result.arrival!.id = 'changed';
    f.pages.get = get;
    expect(await readReturnEvidence(f.pages, original, bound)).not.toEqual(result);
    expect(f.record.id).not.toBe('changed'); expect(f.itemRecord!.id).not.toBe('changed');
  });
});

describe('return evidence refuses contradictory or missing sources', () => {
  it.each(['title', 'acceptedAt', 'baseId', 'displayName', 'token', 'floor', 'required', 'kind'] as const)(
    'rejects changed selected quest %s rather than silently selecting a replacement', async field => {
      const f = await evidenceFixture(null, 'active'), q = f.quest.quest, c = f.contract.contract;
      if (field === 'title') q.title = c.title = 'Changed quest';
      else if (field === 'acceptedAt') q.acceptedAt = '2026-10-20T01:00:00.000Z';
      else if (field === 'floor') { q.floor = c.floor = 2; f.record.indexes = questIndexes(f.quest); f.contractRecord.indexes = [`contracts/2/${q.id}`]; }
      else if (field === 'required') q.task.required = c.task.required = 2;
      else if (field === 'kind') { q.task.objective = c.task.objective = c.objective = 'scout'; delete q.task.item; delete c.task.item; }
      else q.task.item![field] = c.task.item![field] = 'changed';
      await expect(readReturnEvidence(f.pages, f.snapshot(), f.objective)).rejects.toThrow('return quest definition changed');
      expect(f.scan).not.toHaveBeenCalled(); expect(f.witness).not.toHaveBeenCalled();
    });

  it.each(['quest', 'contract', 'pack', 'stash'] as const)('requires the current %s source even when no collectible exists', async kind => {
    const f = await evidenceFixture(null, 'active');
    f.records.delete(kind === 'quest' ? f.ref.key : kind === 'contract' ? f.contractRecord.key : `roster/${kind}`);
    await expect(readReturnEvidence(f.pages, f.snapshot(), f.objective)).rejects.toThrow(/missing/);
  });

  it.each(['anchor', 'header', 'chunk', 'witness', 'actor', 'stair', 'future', 'foreign', 'oversized', 'sequence', 'revision', 'policy'] as const)(
    'requires current earned arrival evidence: %s', async defect => {
      const f = await evidenceFixture(), snapshot = f.snapshot();
      if (defect === 'anchor') snapshot.checkpoint.knowledge = null;
      else if (defect === 'header') f.knowledge.records.delete(observationKey(2));
      else if (defect === 'chunk') f.knowledge.records.delete(`${observationKey(2)}/0`);
      else if (defect === 'witness') f.witness.mockResolvedValue('foreign-witness');
      else if (defect === 'actor') header(f.knowledge, 2).actor.cell.row = 1;
      else if (defect === 'stair') cells(f.knowledge, 2)[0].stairs = [];
      else if (defect === 'future') f.knowledge.records.get(observationKey(2))!.revision = snapshot.revision + 1;
      else if (defect === 'foreign') f.knowledge.records.get(observationKey(2))!.gameId = 'other-game';
      else if (defect === 'sequence') header(f.knowledge, 2).sequence = 3;
      else if (defect === 'revision') header(f.knowledge, 2).revision = 3;
      else if (defect === 'policy') Object.assign(header(f.knowledge, 2), { policy: 'hidden-geometry' });
      else header(f.knowledge, 2).count = 114;
      await expect(readReturnEvidence(f.pages, snapshot, f.objective)).rejects.toThrow();
    });

  it.each(['generation', 'gameId', 'revision'] as const)('rejects %s from world records outside the supplied snapshot', async field => {
    const f = await evidenceFixture(), snapshot = f.snapshot();
    if (field === 'revision') f.record.revision = snapshot.revision + 1;
    else f.record[field] = 'foreign';
    await expect(readReturnEvidence(f.pages, snapshot, f.objective)).rejects.toThrow();
    expect(f.scan).not.toHaveBeenCalled(); expect(f.witness).not.toHaveBeenCalled();
  });

  it.each(['nearby-stair', 'other-actor'] as const)('does not confuse a valid covered cell with checkpoint arrival: %s', async defect => {
    const f = await evidenceFixture(), nearby = earnedCell(-5, -1, 'room', 0, 1);
    nearby.stairs = ['town'];
    const actor = structuredClone(f.town);
    if (defect === 'nearby-stair') actor.stairs = [];
    await f.knowledge.observe([actor, nearby]);
    const snapshot = f.snapshot();
    if (defect === 'other-actor') header(f.knowledge, 3).actor = nearby.at;
    await expect(readReturnEvidence(f.pages, snapshot, f.objective)).rejects.toThrow(
      defect === 'nearby-stair' ? 'lacks visible town stair' : 'actor differs from checkpoint');
  });

  it('propagates bounded-reader failures instead of reporting absent items or arrival', async () => {
    const f = await evidenceFixture();
    f.scan.mockRejectedValueOnce(Error('read budget exhausted'));
    await expect(readReturnEvidence(f.pages, f.snapshot(), f.objective)).rejects.toThrow('read budget exhausted');
  });

  it.each(['identity', 'roots', 'revision', 'checkpoint', 'objective'] as const)('rejects malformed caller %s before reading', async defect => {
    const f = await evidenceFixture(), snapshot = f.snapshot();
    if (defect === 'identity') snapshot.gameId = 'invalid/game';
    else if (defect === 'roots') Object.assign(snapshot.roots, { hidden: 'extra' });
    else if (defect === 'revision') snapshot.revision = -1;
    else if (defect === 'checkpoint') snapshot.checkpoint.obsolete = true;
    else Object.assign(f.objective.quest.ref, { key: 'quest/other-quest' });
    await expect(readReturnEvidence(f.pages, snapshot, f.objective)).rejects.toThrow();
    expect(f.allGet).not.toHaveBeenCalled(); expect(f.scan).not.toHaveBeenCalled(); expect(f.witness).not.toHaveBeenCalled();
  });
});
