import { afterEach, describe, expect, it, vi } from 'vitest';
import { MAX_STALLED_COMBAT_TICKS } from '../../../domain/automation/autopilotCombat';
import { executeBattleCommand } from '../combat/command';
import { executeRosterCommand } from '../game/rosterCommand';
import { executeSaveCommand } from '../game/manualSaves';
import { snapshotOf } from '../read';
import { started, trace } from './gameplay.test-support';
import { readGameplayTelemetry } from './records';

afterEach(() => vi.restoreAllMocks());

describe('gameplay trace control and save chronology', () => {
  it('suppresses stale, paused, refused and ordinary cooldown waits while tracing real pause/unpause once', async () => {
    const f = await started(), b = (await f.current())!;
    const stop = () => executeBattleCommand(f.request({ kind: 'automation', battleId: b.battle.id, enabled: false, mode: 'manual' }));
    await stop(); const paused = (await trace(f)).sequence; await stop();
    await executeBattleCommand(f.request({ kind: 'tick', battleId: b.battle.id }));
    await executeBattleCommand(f.request({ kind: 'round', battleId: b.battle.id, revision: f.head().revision - 1 }));
    await f.editParty(s => { s.party.forEach(a => { a.autoBattle = false; a.gcdUntil = Date.now() + 60_000; }); });
    await f.editBattle(s => { s.battle.enemies.forEach(e => { e.gcdUntil = Date.now() + 60_000; }); });
    const actorId = (await f.roster()).state.party[0].id;
    await executeBattleCommand(f.request({ kind: 'skill', battleId: b.battle.id, actorId, skillId: 'slash' }));
    await executeBattleCommand(f.request({ kind: 'round', battleId: b.battle.id }));
    expect((await trace(f)).sequence).toBe(paused);
    await executeRosterCommand(f.request({ kind: 'actor-auto', actorId, enabled: true }, 'roster.command'));
    const resumed = await trace(f); expect(resumed.sequence).toBe(paused + 1);
    expect(resumed.events.at(-1)?.fact).toMatchObject({ event: 'resumed', trigger: 'actor-auto', actorId, paused: false,
      actors: [{ id: actorId, before: { autoBattle: false }, after: { autoBattle: true } }, {}, {}] });
    await executeBattleCommand(f.request({ kind: 'automation', battleId: b.battle.id, mode: 'manual', enabled: true }));
    expect((await trace(f)).sequence).toBe(resumed.sequence);
  });

  it('retains the stall transition but not the preceding cooldown-only tick or subsequent paused ticks', async () => {
    const f = await started('auto-play'), b = (await f.current())!;
    await f.editParty(s => { s.party.forEach(a => { a.gcdUntil = Date.now() + 60_000; }); });
    await f.editBattle(s => { s.stalledTicks = MAX_STALLED_COMBAT_TICKS - 2; s.battle.enemies.forEach(e => { e.gcdUntil = Date.now() + 60_000; }); });
    const tick = () => executeBattleCommand(f.request({ kind: 'tick', battleId: b.battle.id }));
    await tick(); expect((await trace(f)).sequence).toBe(1);
    await tick(); expect((await trace(f)).events.at(-1)?.fact).toMatchObject({ event: 'stalled', paused: true, newlyDefeatedCount: 0 });
    await tick(); expect((await trace(f)).sequence).toBe(2);
  });

  it('keeps execution chronology across manual world restore while old pinned readers remain unchanged', async () => {
    const f = await started(), b = (await f.current())!, pinned = snapshotOf(f.head());
    const save = f.request({ kind: 'create', label: 'Battle' }, 'save.command'); await executeSaveCommand(save);
    await executeBattleCommand(f.request({ kind: 'end', battleId: b.battle.id }));
    const beforeRestore = (await trace(f)).events;
    await executeSaveCommand(f.request({ kind: 'load', id: save.attemptId }, 'save.command'));
    expect((await f.current())!.battle.id).toBe(b.battle.id);
    expect((await trace(f)).events).toEqual(beforeRestore);
    expect((await readGameplayTelemetry(pinned)).events).toHaveLength(1);
    await executeBattleCommand(f.request({ kind: 'end', battleId: b.battle.id }));
    const after = await trace(f); expect(after.sequence).toBe(3);
    expect(after.events[2].revision).toBeGreaterThan(after.events[1].revision);
    expect(after.events[2].fact).toEqual(after.events[1].fact);
  });
});
