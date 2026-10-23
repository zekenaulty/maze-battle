// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';
import { travelCareChoices } from '../../../domain/automation/autoPolicy';
import { gameCheckpoint } from '../game/checkpoint';
import * as preparation from '../game/preparation';
import * as rosterCommand from '../game/rosterCommand';
import { commitAutoCommand } from './command';
import { preparationFixture } from './preparation.test-support';
import { AUTO_STATE_KEY } from './records';

afterEach(() => vi.restoreAllMocks());
const autoLimits = { reads: 16384, writes: 1024, bytes: 16 * 1024 * 1024 };
const tick = (f: Awaited<ReturnType<typeof preparationFixture>>, revision = f.snapshot().revision) =>
  f.work(tx => commitAutoCommand(tx, { kind: 'tick', revision }, `tick-${revision}`), autoLimits);

describe('exclusive Auto floor preparation', () => {
  it.each(['none', 'unavailable'] as const)('advances one real batch without ordinary writes (%s travel care)', async care => {
    const f = await preparationFixture(care), prepare = vi.spyOn(preparation, 'commitFloorPreparation');
    const roster = vi.spyOn(rosterCommand, 'commitRosterCommand');
    expect(travelCareChoices(f.party)).toEqual(care === 'none' ? []
      : [{ kind: 'camp', actorId: f.party.party.find(actor => actor.role === 'healer')!.id, skillId: 'heal' }]);
    const phases = new Set<string>();
    let ready = false, batches = 0;
    for (; batches < 128 && !ready; batches++) {
      prepare.mockClear(); roster.mockClear();
      const step = await tick(f), result = step.result;
      expect(prepare).toHaveBeenCalledTimes(1);
      expect(roster).toHaveBeenCalledTimes(care === 'none' ? 0 : 1);
      if (care === 'unavailable') expect(await roster.mock.results[0].value).toEqual({ kind: 'camp', outcome: 'unchanged' });
      expect(result).toMatchObject({ kind: 'tick', outcome: 'planning', rosterChanged: false, needsFloor: null,
        action: { kind: 'prepare-floor', channel: 'preparation', level: 2 } });
      if (!('action' in result) || !result.action || typeof result.action.phase !== 'string') throw Error('Missing preparation action');
      phases.add(result.action.phase); ready = result.action.phase === 'ready';
      expect(step.setCheckpoint).not.toHaveBeenCalled();
      expect(step.before.checkpoint).toEqual(step.after.checkpoint);
      expect(step.before.roots.knowledge).toBe(step.after.roots.knowledge);
      expect(step.before.roots.execution).toBe(step.after.roots.execution);
      // Includes attempted writes, not just final retained records (which could hide a rewrite).
      expect(step.set.mock.calls.length).toBeGreaterThan(0);
      for (const [area, key] of [...step.set.mock.calls, ...step.remove.mock.calls]) {
        expect(area).toBe('world');
        expect(key === 'dungeon/1/stairs' && batches === 0
          || /^(dungeon(?:\/2(?:\/|$)|$)|game\/preparation\/2$|contract\/floor-2:)/.test(key), key).toBe(true);
      }
      if (batches === 0) expect(step.staged.records.find(row => row.key === 'dungeon/1/stairs')?.value)
        .toMatchObject({ upper: gameCheckpoint(step.before.checkpoint).position, lower: { level: 2 } });
      expect(step.staged.records.some(row => row.key !== 'game/preparation/2')).toBe(true);
      expect(step.set.mock.calls.filter(([, key]) => key === 'game/preparation/2')).toHaveLength(batches === 0 ? 2 : 1);
      expect(step.staged.records.every(row => row.area === 'world' && !row.key.startsWith('auto/') && !row.key.startsWith('roster/'))).toBe(true);
    }
    expect(ready).toBe(true);
    expect(phases).toEqual(new Set(['generation', 'quality', 'roles', 'content', 'ready']));
    expect(gameCheckpoint(f.snapshot().checkpoint).position.level).toBe(1);
    prepare.mockClear(); roster.mockClear();
    const descent = await tick(f);
    expect(prepare).not.toHaveBeenCalled();
    expect(descent.result).toMatchObject({ kind: 'tick', outcome: 'applied', needsFloor: null,
      action: { kind: 'stairs', channel: 'exploration', moved: true, position: { level: 2 } } });
    expect(descent.setCheckpoint).toHaveBeenCalledTimes(1);
    expect(descent.after.roots.knowledge).not.toBe(descent.before.roots.knowledge);
    expect(gameCheckpoint(descent.after.checkpoint).position.level).toBe(2);
    expect(descent.set.mock.calls.filter(([, key]) => key === AUTO_STATE_KEY)).toHaveLength(1);
    expect(descent.set.mock.calls.some(([, key]) => key === 'game/preparation/2')).toBe(false);
    console.info(JSON.stringify({ exclusiveAutoPreparation: { care, batches, phases: [...phases], descent: descent.stats } }));
  });

  it('finishes applied travel care without mixing in preparation', async () => {
    const f = await preparationFixture('available'), prepare = vi.spyOn(preparation, 'commitFloorPreparation');
    const result = await tick(f);
    expect(result.result).toMatchObject({ outcome: 'applied', rosterChanged: true, needsFloor: null,
      action: { kind: 'camp', outcome: 'applied', channel: 'roster' } });
    expect(prepare).not.toHaveBeenCalled();
    expect(result.setCheckpoint).toHaveBeenCalledTimes(1);
    expect(result.staged.records.some(row => row.key.startsWith('roster/'))).toBe(true);
    expect(result.staged.records.some(row => row.key === AUTO_STATE_KEY)).toBe(true);
  });

  it('rejects a stale tick without entering preparation or staging records', async () => {
    const f = await preparationFixture(), prepare = vi.spyOn(preparation, 'commitFloorPreparation');
    const step = await tick(f, f.snapshot().revision - 1);
    expect(step.result).toEqual({ kind: 'tick', outcome: 'stale', rosterChanged: false, needsFloor: null });
    expect(prepare).not.toHaveBeenCalled(); expect(step.set).not.toHaveBeenCalled(); expect(step.setCheckpoint).not.toHaveBeenCalled();
    expect(step.staged.records).toEqual([]); expect(step.staged.nodes).toEqual([]);
  });
});
