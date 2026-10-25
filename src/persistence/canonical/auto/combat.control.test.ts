import { afterEach, describe, expect, it, vi } from 'vitest';
import { autoCombatFixture } from './combat.test-support';
import { executeBattleCommand } from '../combat/command';
import { executeSettingsCommand } from '../game/settings';
import { gameCheckpoint } from '../game/checkpoint';
import { enemy } from '../combat/combat.test-support';

afterEach(() => vi.restoreAllMocks());
describe('Auto combat authority and actor preferences', () => {
  it('preserves a mixed hero preference set when entering and progressing a fight', async () => {
    const f = await autoCombatFixture(); vi.spyOn(Math, 'random').mockReturnValue(0);
    await f.editParty(s => { s.party.forEach((a, i) => a.autoBattle = i === 0); });
    await f.tick(); expect((await f.roster()).state.party.map(a => a.autoBattle)).toEqual([true, false, false]);
    await f.editBattle(b => { b.battle.enemies = [{ ...enemy(), hp: 100_000, maxHp: 100_000 }]; });
    const before = (await f.roster()).state.party;
    await f.tick(); const after = (await f.roster()).state.party;
    expect(after.map(a => a.autoBattle)).toEqual([true, false, false]);
    expect(after[0].gcdUntil).toBeGreaterThan(0); expect(after.slice(1)).toEqual(before.slice(1));
  });

  it('blocks selected kill entry with all actors off without overriding preferences or skipping the objective', async () => {
    const f = await autoCombatFixture(); await f.editParty(s => { s.party.forEach(a => a.autoBattle = false); });
    const result = (await f.tick()).receipt.result;
    expect(result).toMatchObject({ outcome: 'blocked', rosterChanged: false }); expect(String((result as { reason: string }).reason)).toContain('auto battle enabled');
    expect(await f.current()).toBeNull(); expect((await f.state())!.objective?.id).toBe(f.contract.id);
    expect((await f.roster()).state.party.every(a => !a.autoBattle)).toBe(true); expect(gameCheckpoint(f.head().checkpoint).mode).toBe('manual');
  });

  it.each(['paused', 'all-off', 'manual-return', 'waves-return'] as const)('does not run enemy turns or travel care for %s combat', async guard => {
    const f = await autoCombatFixture(); vi.spyOn(Math, 'random').mockReturnValue(0); await f.tick();
    if (guard === 'all-off') await f.editParty(s => { s.party.forEach(a => a.autoBattle = false); });
    else await f.editBattle(b => { if (guard === 'paused') b.paused = true; else b.battle.returnMode = guard === 'manual-return' ? 'manual' : 'waves'; });
    const roots = f.head().roots, cp = f.head().checkpoint, b = await f.current();
    expect((await f.tick()).receipt.result).toMatchObject({ outcome: 'paused', rosterChanged: false });
    expect(f.head().roots).toEqual(roots); expect(f.head().checkpoint).toEqual(cp); expect(await f.current()).toEqual(b);
  });

  it('fences a queued Auto turn after Stop while the same battle ID persists', async () => {
    const f = await autoCombatFixture(); await f.tick(); const b = (await f.current())!, revision = f.head().revision;
    await executeSettingsCommand(f.request({ kind: 'auto', enabled: false }, 'settings.command'));
    const roots = f.head().roots, cp = f.head().checkpoint;
    expect((await f.tick(revision)).receipt.result).toMatchObject({ outcome: 'stale' });
    expect(f.head().roots).toEqual(roots); expect(f.head().checkpoint).toEqual(cp);
    expect(await f.current()).toMatchObject({ paused: true, battle: { id: b.battle.id, returnMode: 'manual' } });
  });

  it('retains manual-mode defeat and reports recovery instead of continuing floor work or paying pending loot', async () => {
    const f = await autoCombatFixture(); vi.spyOn(Math, 'random').mockReturnValue(0); await f.tick();
    await f.editParty(s => { s.party.forEach((a, i) => { a.hp = 1; a.autoBattle = i === 0; a.gcdUntil = Number.MAX_SAFE_INTEGER; }); });
    await f.editBattle(b => { b.battle.enemies = Array.from({ length: 10 }, (_, i) => ({ ...enemy(`killer-${i}`), hp: 9999, maxHp: 9999,
      gcdUntil: 0, combat: { baseDamage: 1e6, scaleWith: 'strength' }, skills: [{ id: 'attack', cooldown: 0 }] })); });
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const inventory = (await f.roster()).state.inventory, result = (await f.tick()).receipt.result;
    expect(result).toMatchObject({ outcome: 'blocked', rosterChanged: true }); expect((await f.current())!.battle.status).toBe('lost');
    expect((await f.state())!.status).toBe('blocked'); expect(gameCheckpoint(f.head().checkpoint).mode).toBe('manual');
    expect((await f.roster()).state.inventory).toEqual(inventory);
    const roots = f.head().roots; await f.tick(); expect(f.head().roots).toEqual(roots);
  });

  it('keeps battle mode coherent when the shared stall guard pauses automatic combat', async () => {
    const f = await autoCombatFixture(); vi.spyOn(Math, 'random').mockReturnValue(0); await f.tick();
    await f.editBattle(b => { b.stalledTicks = 31; });
    await f.editParty(s => { s.party.forEach(a => a.gcdUntil = Number.MAX_SAFE_INTEGER); });
    expect((await f.tick()).receipt.result).toMatchObject({ outcome: 'blocked' });
    expect(await f.current()).toMatchObject({ paused: true, stalledTicks: 32 });
    expect(gameCheckpoint(f.head().checkpoint).mode).toBe('battle'); expect((await f.state())!.status).toBe('blocked');
    const b = (await f.current())!;
    await executeBattleCommand(f.request({ kind: 'automation', battleId: b.battle.id, mode: 'auto-play', enabled: true }));
    expect((await f.current())!.paused).toBe(false);
  });
});
