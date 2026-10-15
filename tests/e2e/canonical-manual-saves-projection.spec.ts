import { expect, test } from './canonical-manual-saves.test';

for (const corruption of ['missing-settings', 'invalid-settings', 'missing-pack', 'missing-observation']) {
  test(`candidate ${corruption} rejects load before replacing a healthy current head`, async ({ page }) => {
    const result = await page.evaluate(async corruption => {
      const c = window.manualSaves; await c.seed();
      const observe = async () => c.executeCanonical(c.command((await c.readCanonicalHead()).head, 'fixture.observe'), async tx => {
        tx.setCheckpoint(c.roster.checkpointJson(await c.recordGameObservation(tx, c.roster.gameCheckpoint(tx.head.checkpoint))));
        return true;
      });
      if (corruption === 'missing-observation') { await c.prepareWorld(); await observe(); }
      const snapshot = (await c.readCanonicalHead()).head, save = await c.create();
      const key = corruption === 'missing-pack' ? 'roster/pack' : c.SETTINGS_KEY;
      const old = (await c.readCanonical(p => p.get('world', key))).value!;
      await c.executeSettingsCommand(c.command((await c.readCanonicalHead()).head, 'settings.command', { kind: 'throttle', ms: 600 }));
      if (corruption === 'missing-pack') await c.roster.edit(state => ({ ...state, inventory: { ...state.inventory, gold: 999 } }));
      if (corruption === 'missing-observation') await observe();
      const db = await c.openCanonicalDatabase();
      if (corruption === 'invalid-settings') await db.put('records', { ...old, value: { schema: 1, autoThrottleMs: -1 } }, [old.gameId, old.id]);
      else await db.delete('records', [snapshot.gameId, corruption === 'missing-observation'
        ? c.roster.gameCheckpoint(snapshot.checkpoint).knowledge!.id : old.id]);
      db.close();
      const current = (await c.readCanonicalHead()).head, healthy = await c.projectGame(current), before = await c.dump();
      const error = await c.act({ kind: 'load', id: save.id }).then(() => 'accepted', String);
      const after = await c.dump(), projected = await c.projectGame((await c.readCanonicalHead()).head);
      return { error, before, after, current, healthy: healthy.value, projected: projected.value };
    }, corruption);
    expect(result.error).toMatch(/^Error:/);
    expect(result.after).toEqual(result.before);
    expect(result.projected).toEqual(result.healthy);
    expect(result.projected.snapshot.revision).toBe(result.current.revision);
  });
}

test('caught candidate read failures poison restore; validation exposes no writes and cannot replace roots', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const c = window.manualSaves; await c.seed(); const save = await c.create(), head = (await c.readCanonicalHead()).head;
    const key = `manual-saves/snapshot/${save.id}`, before = await c.dump();
    const error = await c.executeCanonical(c.command(head, 'fixture.restore'), async tx => {
      try {
        await tx.restoreSnapshot(key, async pages => { try { await pages.get('world', ''); } catch { /* Must still abort. */ } });
      } catch { /* The outer transaction must also remain poisoned. */ }
      return true;
    }).then(() => 'accepted', String);
    const after = await c.dump(); let methods: string[] = [];
    const loaded = await c.executeCanonical(c.command(head, 'fixture.restore'), async tx => {
      await tx.restoreSnapshot(key, async (pages, snapshot) => {
        methods = Object.keys(pages).sort(); await c.projectGameSnapshot(pages, snapshot);
        snapshot.roots.world = null; snapshot.checkpoint = {};
      }); return true;
    });
    return { error, before, after, methods, loaded: loaded.head, head };
  });
  expect(result.error).toMatch(/^Error:/); expect(result.after).toEqual(result.before);
  expect(result.methods).toEqual(['get', 'scan', 'witness']);
  expect(result.loaded!.roots.world).toBe(result.head.roots.world);
  expect(result.loaded!.checkpoint).toEqual(result.head.checkpoint);
});
