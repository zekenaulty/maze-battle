import { afterEach, describe, expect, it, vi } from 'vitest';
import { checkpointJson, gameCheckpoint } from '../game/checkpoint';
import { projectGameSnapshot } from '../game/projection';
import { loadBattle, saveBattle } from './records';
import { mechanicsFixture } from './mechanics.test-support';
import { executeBattleCommand } from './command';

afterEach(() => vi.restoreAllMocks());
describe('battle projection and old-save coherence', () => {
  it('keeps pre-combat v9 snapshots with no battle valid and absent paused metadata defaults false', async () => {
    const f = await mechanicsFixture(); f.storage.install();
    const old = await f.read((p, h) => projectGameSnapshot(p, h)); expect(old.battle).toBeUndefined(); expect(old.randomBattles).toBe(false);
    await executeBattleCommand(f.request({ kind: 'start', returnMode: 'manual' }));
    await f.editBattle(b => { delete b.paused; });
    const current = await f.read((p, h) => projectGameSnapshot(p, h, old));
    expect(current.battleAutomationPaused).toBe(false); expect(current.battle).toBeDefined();
    await f.editParty(s => { s.party[0].hp--; });
    const next = await f.read((p, h) => projectGameSnapshot(p, h, current)); expect(next.party[0].hp).toBe(current.party[0].hp - 1);
  });

  it.each(['origin', 'active-mode', 'lost-mode', 'missing', 'lost-party'] as const)('rejects %s mismatch instead of publishing an incoherent view', async corruption => {
    const f = await mechanicsFixture(); f.storage.install();
    await executeBattleCommand(f.request({ kind: 'start', returnMode: 'manual' }));
    await f.work(async tx => {
      const c = gameCheckpoint(tx.head.checkpoint), before = (await loadBattle(tx.pages))!, next = structuredClone(before);
      if (corruption === 'origin') next.origin.cell.row++;
      if (corruption.startsWith('lost')) next.battle.status = 'lost';
      if (corruption === 'missing') await saveBattle(tx.pages, before, null); else await saveBattle(tx.pages, before, next);
      if (corruption === 'active-mode' || corruption === 'lost-party') tx.setCheckpoint(checkpointJson({ ...c, mode: 'manual' }));
    });
    await expect(f.read((p, h) => projectGameSnapshot(p, h))).rejects.toThrow('Canonical storage:');
  });
});
