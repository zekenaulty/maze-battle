import { describe, expect, it } from 'vitest';
import { battle } from '../combat/combat.test-support';
import { snapshotOf } from '../read';
import type { JsonObject } from '../types';
import { battleFact } from './facts';
import { loadGameplayTelemetry, recordGameplay } from './records';
import { traceFixture } from './records.test-support';
import { GAMEPLAY_TRACE_HEADER, gameplayTraceSlot } from './types';

describe('bounded gameplay trace records', () => {
  it('treats the absent old-v9 header as empty, without scans or writes', async () => {
    const f = traceFixture();
    expect(await loadGameplayTelemetry(f.tx.pages, snapshotOf(f.head))).toEqual({ sequence: 0, events: [] });
    expect(f.get).toHaveBeenCalledTimes(1); expect(f.set).not.toHaveBeenCalled(); expect(f.scan).not.toHaveBeenCalled();
  });

  it('recycles exactly 64 fixed slots with bounded append and chronological read work', async () => {
    const f = traceFixture();
    for (let i = 0; i < 70; i++) {
      f.get.mockClear(); f.set.mockClear(); await f.append();
      expect(f.get.mock.calls.length).toBeLessThanOrEqual(3); expect(f.set).toHaveBeenCalledTimes(2);
    }
    f.get.mockClear(); const trace = await loadGameplayTelemetry(f.tx.pages, snapshotOf(f.head));
    expect(trace.sequence).toBe(70); expect(trace.events.map(e => e.sequence)).toEqual(Array.from({ length: 64 }, (_, i) => i + 7));
    expect(f.get).toHaveBeenCalledTimes(65); expect(f.records.size).toBe(65); expect(f.scan).not.toHaveBeenCalled();
    if (trace.events[0].fact.kind === 'reward') trace.events[0].fact.targetId = 'mutated';
    expect((f.records.get(gameplayTraceSlot(7))!.value as JsonObject).fact).toHaveProperty('targetId', 'quest');
  });

  it.each(['header-schema', 'header-revision', 'slot-sequence', 'missing-slot', 'foreign-game', 'foreign-generation',
    'foreign-key', 'world-area', 'indexed', 'future', 'extra-field', 'bad-time', 'unsafe-number'] as const)('rejects %s without repairing history', async defect => {
    const f = traceFixture(); await f.append();
    const header = f.records.get(GAMEPLAY_TRACE_HEADER)!, row = f.records.get(gameplayTraceSlot(1))!;
    const value = row.value as JsonObject;
    if (defect === 'header-schema') (header.value as JsonObject).schema = 2;
    if (defect === 'header-revision') (header.value as JsonObject).lastRevision = 2;
    if (defect === 'slot-sequence') value.sequence = 2;
    if (defect === 'missing-slot') f.records.delete(row.key);
    if (defect === 'foreign-game') row.gameId = 'foreign';
    if (defect === 'foreign-generation') row.generation = 'foreign';
    if (defect === 'foreign-key') row.key = 'foreign';
    if (defect === 'world-area') row.area = 'world';
    if (defect === 'indexed') row.indexes = ['unexpected'];
    if (defect === 'future') row.revision++;
    if (defect === 'extra-field') value.hidden = 'unexpected';
    if (defect === 'bad-time') value.at = 'yesterday';
    if (defect === 'unsafe-number') (value.fact as JsonObject).walletGoldAfter = Infinity;
    const before = structuredClone(f.records);
    await expect(loadGameplayTelemetry(f.tx.pages, snapshotOf(f.head))).rejects.toThrow(); expect(f.records).toEqual(before);
  });

  it('rejects dangling latest slots before append and never overwrites a foreign slot', async () => {
    const f = traceFixture(); await f.append(); f.records.delete(gameplayTraceSlot(1)); const before = structuredClone(f.records);
    await expect(f.append()).rejects.toThrow('missing trace slot'); expect(f.records).toEqual(before);
  });

  it('fits maximum identities/resources in a complete bounded record and rejects fabricated metrics/skills', async () => {
    const f = traceFixture(); f.head.gameId = 'g'.repeat(128); f.head.generation = 's'.repeat(128);
    const b = battle(); b.battle.id = 'b'.repeat(128); b.origin.cell.spaceId = 'r'.repeat(128);
    const fact = battleFact('turn', { kind: 'round' }, b, b);
    const stats = { hp: Number.MAX_SAFE_INTEGER, mp: Number.MAX_SAFE_INTEGER, level: Number.MAX_SAFE_INTEGER,
      xp: Number.MAX_SAFE_INTEGER, gold: Number.MAX_SAFE_INTEGER, autoBattle: true };
    fact.actors = Array.from({ length: 3 }, (_, i) => ({ id: `${i}${'a'.repeat(127)}`, before: stats, after: stats }));
    await f.append(fact);
    for (const row of f.records.values()) expect(new TextEncoder().encode(JSON.stringify(row)).length).toBeLessThanOrEqual(4096);
    expect((await loadGameplayTelemetry(f.tx.pages, snapshotOf(f.head))).events[0].fact).toEqual(fact);
    await expect(recordGameplay(f.tx, { ...fact, damage: 100 } as typeof fact)).rejects.toThrow();
    await expect(f.append({ ...fact, trigger: 'skill', actorId: 'hero', skillId: 'invented' as never })).rejects.toThrow('invalid trace skill');
  });

  it.each(['duplicate-actor', 'false-payout', 'false-status', 'false-trigger', 'oversized', 'pending-after-close'] as const)('rejects inconsistent %s facts', async defect => {
    const f = traceFixture(), b = battle(), fact = battleFact('turn', { kind: 'round' }, b, b);
    if (defect === 'duplicate-actor') {
      const stats = { hp: 1, mp: 1, level: 1, xp: 1, gold: 1, autoBattle: true };
      fact.actors = Array.from({ length: 2 }, () => ({ id: 'same', before: stats, after: stats }));
    }
    if (defect === 'false-payout') fact.walletGoldDelta = 1;
    if (defect === 'false-status') fact.status = 'won';
    if (defect === 'false-trigger') fact.trigger = 'start';
    if (defect === 'oversized') fact.battleId = 'x'.repeat(4097);
    if (defect === 'pending-after-close') { fact.event = 'won'; fact.status = 'won'; }
    await expect(f.append(fact)).rejects.toThrow(); expect(f.records.size).toBe(0);
  });
});
