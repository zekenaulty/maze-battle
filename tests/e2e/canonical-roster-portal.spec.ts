import { test, expect } from './canonical-test';
import type { CanonicalRequest } from '../../src/persistence/canonical/types';

for (const kind of ['portal', 'use'] as const) test(`${kind} consumes the same portal stock and preserves the exact return position`, async ({ page }) => {
  const start = await page.evaluate(async kind => {
    const r = window.canonical.roster; await r.seed('auto-play');
    const before = (await r.read()).value;
    const action = await r.act(kind === 'portal' ? { kind } : { kind, itemId: 'town-portal' });
    return { before, action, town: (await r.read()).value };
  }, kind);
  expect(start.town.state.mode).toBe('town'); expect(start.town.state.townReturnMode).toBe('auto-play');
  expect(start.town.state.inventory.items.some(item => item.baseId === 'town-portal')).toBe(false);
  await page.reload(); await page.waitForFunction(() => !!window.canonical);
  const end = await page.evaluate(async encoded => {
    const request: CanonicalRequest = JSON.parse(encoded);
    const r = window.canonical.roster; const replay = await r.executeRosterCommand(request);
    await r.act({ kind: 'leave-town' }); const returned = (await r.read()).value;
    const empty = await r.act({ kind: 'portal' }); return { returned, replay, empty };
  }, JSON.stringify(start.action.request));
  expect(end.replay.replayed).toBe(true); expect(end.returned.checkpoint.position).toEqual(start.before.checkpoint.position);
  expect(end.returned.state.mode).toBe('auto-play'); expect(end.empty.outcome.receipt.result).toEqual({ kind: 'portal', outcome: 'unchanged' });
});

for (const unavailable of ['locked', 'stash', 'defeated'] as const) test(`${unavailable} stock or party cannot fund a portal`, async ({ page }) => {
  const result = await page.evaluate(async unavailable => {
    const r = window.canonical.roster; await r.seed(unavailable === 'stash' ? 'town' : 'manual');
    if (unavailable === 'stash') { await r.act({ kind: 'stash', itemId: 'town-portal' }); await r.act({ kind: 'leave-town' }); }
    if (unavailable === 'locked') await r.act({ kind: 'lock', itemId: 'town-portal' });
    if (unavailable === 'defeated') await r.edit(s => ({ ...s, party: s.party.map(actor => ({ ...actor, hp: 0 })) }));
    const before = (await r.read()).value; const outcome = await r.act({ kind: 'portal' });
    return { before, after: (await r.read()).value, result: outcome.outcome.receipt.result };
  }, unavailable);
  expect(result.after).toEqual(result.before); expect(result.result).toEqual({ kind: 'portal', outcome: 'unchanged' });
});

test('a missing established return room aborts portal consumption instead of regenerating', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const c = window.canonical, r = c.roster; let { head } = await r.seed();
    await c.executeCanonical(c.command(head), async tx => { await tx.pages.delete('world', 'dungeon/1/space/entry'); return {}; });
    const before = await c.dump(); let error = '';
    try { await r.act({ kind: 'portal' }); } catch (e) { error = String(e); }
    return { error, unchanged: before.content === (await c.dump()).content, state: (await r.read()).value.state };
  });
  expect(result.error).toContain('missing established world record'); expect(result.unchanged).toBe(true);
  expect(result.state.inventory.items.some(item => item.id === 'town-portal')).toBe(true);
});

test('healing uses shared potency, changes one actor/stack, and does not invoke automatic town care', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const c = window.canonical, r = c.roster; await r.seed();
    await r.edit(s => ({ ...s, party: s.party.map((actor, index) => index === 0 ? { ...actor, hp: 40 } : actor) }));
    const before = (await c.readCanonical(p => p.get('world', 'roster/actor/fixture-world-mage'))).value;
    await r.act({ kind: 'use', itemId: 'health-herb', actorId: 'fixture-world-warrior' });
    return { state: (await r.read()).value.state, sameMage: JSON.stringify(before) === JSON.stringify((await c.readCanonical(p => p.get('world', 'roster/actor/fixture-world-mage'))).value) };
  });
  expect(result.state.party[0].hp).toBe(75); expect(result.sameMage).toBe(true); expect(result.state.mode).toBe('manual');
  expect(result.state.inventory.items.some(item => item.id === 'health-herb')).toBe(false);
});
