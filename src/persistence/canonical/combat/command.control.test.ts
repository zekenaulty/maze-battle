import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Json } from '../types';
import { gameCheckpoint } from '../game/checkpoint';
import { executeRosterCommand } from '../game/rosterCommand';
import { executeSettingsCommand } from '../game/settings';
import { executeExplorationCommand } from '../game/explorationCommand';
import { mechanicsFixture } from './mechanics.test-support';
import { executeBattleCommand } from './command';
import { battleCommand } from './input';
import { enemy } from './combat.test-support';

afterEach(() => vi.restoreAllMocks());
async function ready() {
  const f = await mechanicsFixture(); f.storage.install(); vi.spyOn(Math, 'random').mockReturnValue(0);
  await executeBattleCommand(f.request({ kind: 'start', returnMode: 'auto-play' })); return f;
}

describe('battle control and scheduled intent fences', () => {
  it('linked Stop preserves preferences, sets manual return, pauses ticks, and settings cannot clobber battle mode', async () => {
    const f = await ready(), b = (await f.current())!, preferences = (await f.roster()).state.party.map(a => a.autoBattle);
    const queuedRevision = f.head().revision;
    await executeSettingsCommand(f.request({ kind: 'auto', enabled: false }, 'settings.command'));
    expect(await f.current()).toMatchObject({ paused: true, battle: { id: b.battle.id, returnMode: 'manual' } });
    expect(gameCheckpoint(f.head().checkpoint).mode).toBe('battle'); expect((await f.roster()).state.party.map(a => a.autoBattle)).toEqual(preferences);
    const roots = f.head().roots, cp = f.head().checkpoint;
    const stale = await executeBattleCommand(f.request({ kind: 'tick', battleId: b.battle.id, revision: queuedRevision }));
    expect(stale.receipt.result).toEqual({ kind: 'tick', outcome: 'stale' }); expect(f.head().roots).toEqual(roots); expect(f.head().checkpoint).toEqual(cp);
    await executeBattleCommand(f.request({ kind: 'tick', battleId: b.battle.id })); expect(f.head().roots).toEqual(roots);
    await executeSettingsCommand(f.request({ kind: 'auto', enabled: true }, 'settings.command'));
    expect(await f.current()).toMatchObject({ paused: false, battle: { returnMode: 'auto-play' } });
    expect(gameCheckpoint(f.head().checkpoint).mode).toBe('battle');
  });

  it('resume enables all actors only when all were off; individual explicit enable can unpause without rewriting others', async () => {
    const f = await ready(), b = (await f.current())!;
    await f.editParty(s => { s.party.forEach(a => a.autoBattle = false); });
    await executeBattleCommand(f.request({ kind: 'automation', battleId: b.battle.id, mode: 'waves', enabled: false }));
    const roots = f.head().roots;
    await executeBattleCommand(f.request({ kind: 'tick', battleId: b.battle.id })); expect(f.head().roots).toEqual(roots);
    const actorId = (await f.roster()).state.party[1].id;
    await executeRosterCommand(f.request({ kind: 'actor-auto', actorId, enabled: true }, 'roster.command'));
    expect((await f.current())!.paused).toBe(false); expect((await f.roster()).state.party.map(a => a.autoBattle)).toEqual([false, true, false]);
    await executeBattleCommand(f.request({ kind: 'automation', battleId: b.battle.id, mode: 'waves', enabled: true }));
    expect((await f.roster()).state.party.map(a => a.autoBattle)).toEqual([false, true, false]);
    await f.editParty(s => { s.party.forEach(a => a.autoBattle = false); });
    const off = f.head().roots;
    await executeBattleCommand(f.request({ kind: 'tick', battleId: b.battle.id })); expect(f.head().roots).toEqual(off);
    await executeBattleCommand(f.request({ kind: 'automation', battleId: b.battle.id, mode: 'waves', enabled: true }));
    expect((await f.roster()).state.party.every(a => a.autoBattle)).toBe(true);
  });

  it('allows explicit paused rounds to run the existing hero/enemy AI pass and blocks movement/portal/camp escape', async () => {
    const f = await ready(), b = (await f.current())!;
    await f.editBattle(b => { b.paused = true; b.battle.enemies = [{ ...enemy(), hp: 100_000, maxHp: 100_000 }]; });
    const at = gameCheckpoint(f.head().checkpoint).position;
    await executeExplorationCommand(f.request({ kind: 'move', direction: 'east', triggerStairs: false }, 'exploration.command'));
    expect(gameCheckpoint(f.head().checkpoint).position).toEqual(at);
    await executeRosterCommand(f.request({ kind: 'portal' }, 'roster.command')); expect(gameCheckpoint(f.head().checkpoint).mode).toBe('battle');
    const healer = (await f.roster()).state.party.find(a => a.role === 'healer')!, roots = f.head().roots;
    await executeRosterCommand(f.request({ kind: 'camp', actorId: healer.id, skillId: 'heal' }, 'roster.command'));
    expect(f.head().roots).toEqual(roots);
    await executeBattleCommand(f.request({ kind: 'round', battleId: b.battle.id }));
    expect((await f.current())!.battle.round).toBe(b.battle.round + 1); expect((await f.current())!.paused).toBe(true);
  });

  it('uses the retained legacy 32-stall bound without persisting refreshed idle effects or adding an enemy clock', async () => {
    const f = await ready(), b = (await f.current())!;
    await f.editBattle(b => { b.stalledTicks = 31; });
    await f.editParty(s => { s.party.forEach(a => a.gcdUntil = Number.MAX_SAFE_INTEGER); });
    const before = (await f.roster()).state;
    await executeBattleCommand(f.request({ kind: 'tick', battleId: b.battle.id }));
    expect(await f.current()).toMatchObject({ stalledTicks: 32, paused: true, battle: { round: b.battle.round } });
    expect((await f.roster()).state.party).toEqual(before.party);
  });

  it('rejects stale scheduled wave starts before RNG or gameplay reads/effects; manual start may omit revision', async () => {
    const f = await mechanicsFixture(); f.storage.install(); const rng = vi.spyOn(Math, 'random').mockReturnValue(0);
    const roots = f.head().roots, checkpoint = f.head().checkpoint;
    const result = await executeBattleCommand(f.request({ kind: 'start', returnMode: 'waves', revision: f.head().revision - 1 }));
    expect(result.receipt.result).toEqual({ kind: 'start', outcome: 'stale' }); expect(rng).not.toHaveBeenCalled();
    expect(f.head().roots).toEqual(roots); expect(f.head().checkpoint).toEqual(checkpoint);
    await executeBattleCommand(f.request({ kind: 'start', returnMode: 'waves', revision: f.head().revision })); expect(await f.current()).not.toBeNull();
  });

  it('does not substitute stale battle IDs even when revision is current', async () => {
    const f = await ready(), before = f.storage.snapshot();
    await expect(executeBattleCommand(f.request({ kind: 'tick', battleId: 'foreign', revision: f.head().revision }))).rejects.toThrow('stale battle ID');
    expect(f.storage.snapshot()).toEqual(before);
  });
});

describe('strict combat intent JSON', () => {
  it.each([null, {}, { kind: 'start', returnMode: 'town' }, { kind: 'start', returnMode: 'waves', revision: -1 },
    { kind: 'tick', battleId: 'b', revision: 1.5 }, { kind: 'tick', battleId: 'b', revision: Number.MAX_SAFE_INTEGER + 1 },
    { kind: 'tick', battleId: 'b', now: 100 }, { kind: 'round', battleId: 'b', enemies: [] },
    { kind: 'skill', battleId: 'b', actorId: 'a', skillId: 'hidden' },
    { kind: 'skill', battleId: 'b', actorId: 'a', skillId: 'slash', targetId: 'e' },
    { kind: 'skill', battleId: 'b', actorId: 'a', skillId: 'slash', stats: {} },
    { kind: 'automation', battleId: 'b', mode: 'manual', enabled: 1 }, { kind: 'end', battleId: '../x' },
    { kind: 'end', battleId: 'b', revision: NaN }, { kind: 'start', returnMode: 'manual', revision: undefined }])('rejects unsupported input %j', input => {
    expect(() => battleCommand(input)).toThrow('Canonical storage:');
  });

  it('aborts unsupported domain intent without publishing a receipt or gameplay effects', async () => {
    const f = await mechanicsFixture(), open = f.storage.install(), before = f.storage.snapshot();
    const request = f.request({ kind: 'round', battleId: 'b', now: 1 } as Json);
    await expect(executeBattleCommand(request)).rejects.toThrow(); expect(f.storage.snapshot()).toEqual(before);
    // Request JSON is admitted by the kernel, but its domain payload is rejected with an abort.
    expect(open).toHaveBeenCalledTimes(1);
  });
});
