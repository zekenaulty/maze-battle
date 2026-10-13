import { test, expect } from '@playwright/test';
import type {} from './canonical-town-party.fixture';
import type { CanonicalRequest } from '../../src/persistence/canonical/types';

test.beforeEach(async ({ page }) => {
  await page.route('**/*', route => new URL(route.request().url()).origin === 'http://127.0.0.1:5221' ? route.continue() : route.abort());
  await page.goto('/tests/e2e/canonical-town-party.fixture.html');
  await page.waitForFunction(() => !!window.townParty);
});

test('attribute spending and actor policies persist; exact replay spends only once', async ({ page }) => {
  const start = await page.evaluate(async () => {
    const r = window.townParty.roster;
    await r.seed('town');
    await r.edit(state => ({ ...state, party: state.party.map((actor, i) => i === 0
      ? { ...actor, attributes: { ...actor.attributes, available: 2 } } : actor) }));
    const actorId = 'fixture-world-warrior';
    const spent = await r.act({ kind: 'spend-attribute', actorId, attribute: 'vitality' });
    await r.act({ kind: 'auto-spend', actorId, enabled: false });
    await r.act({ kind: 'actor-auto', actorId, enabled: false });
    return { spent, state: (await r.read()).value.state };
  });
  await page.reload(); await page.waitForFunction(() => !!window.townParty);
  const after = await page.evaluate(async encoded => {
    const request: CanonicalRequest = JSON.parse(encoded);
    const r = window.townParty.roster, replay = await r.executeRosterCommand(request);
    return { replay, state: (await r.read()).value.state };
  }, JSON.stringify(start.spent.request));
  expect(after.state).toEqual(start.state);
  expect(after.state.party[0]).toMatchObject({ maxHp: 112, hp: 110, autoSpendPoints: false, autoBattle: false,
    attributes: { vitality: 31, available: 1 } });
  expect(after.replay.replayed).toBe(true);
  expect(after.replay.receipt).toEqual(start.spent.outcome.receipt);
  expect(after.state.mode).toBe('town');
  expect(after.state).not.toHaveProperty('maze');
  expect(after.state).not.toHaveProperty('battle');
});

for (const skillId of ['heal', 'groupHeal', 'resurrect'] as const) test(`${skillId} persists equipment-aware effects and timers with exact replay`, async ({ page }) => {
  const result = await page.evaluate(async skillId => {
    const c = window.townParty, r = c.roster;
    await r.seed('manual', [{ ...r.createItemInstance('iron-sword', 1), id: 'vitality-weapon', stats: { maxHp: 20, vitality: 5 } }]);
    await r.act({ kind: 'equip', actorId: 'fixture-world-warrior', itemId: 'vitality-weapon' });
    await r.edit(state => ({ ...state, party: state.party.map((actor, i) => i === 0 ? { ...actor, hp: skillId === 'resurrect' ? 0 : 1 } : actor) }));
    const { head } = await c.readCanonicalHead();
    await c.executeCanonical(c.worldRequest(head, 'fixture.log'), async tx => {
      tx.setCheckpoint(r.checkpointJson({ ...r.gameCheckpoint(tx.head.checkpoint), activityLog: Array.from({ length: 12 }, (_, i) => `Entry ${i}`) }));
      return {};
    });
    const untouched = () => c.readCanonical(async pages => ({ mage: await pages.get('world', 'roster/actor/fixture-world-mage'),
      item: await pages.get('world', 'roster/item/vitality-weapon'), room: await pages.get('world', 'dungeon/1/space/entry') }));
    const before = (await untouched()).value;
    const action = await r.act({ kind: 'camp', actorId: 'fixture-world-healer', skillId });
    return { action, before, untouched: (await untouched()).value, after: (await r.read()).value };
  }, skillId);
  expect(result.action.outcome.receipt.result).toEqual({ kind: 'camp', outcome: 'applied' });
  expect(result.untouched).toEqual(result.before);
  expect(result.after.state.party[0].hp).toBe(skillId === 'heal' ? 50 : skillId === 'groupHeal' ? 36 : 70);
  expect(result.after.state.party[2].mp).toBe(skillId === 'heal' ? 106 : skillId === 'groupHeal' ? 102 : 90);
  expect(result.after.checkpoint.activityLog).toHaveLength(12);
  expect(result.after.state.party[2].skills.find(skill => skill.id === skillId)?.cooldownUntil).toBeGreaterThan(Date.parse(result.after.state.updatedAt));
  await page.reload(); await page.waitForFunction(() => !!window.townParty);
  const reloaded = await page.evaluate(async encoded => {
    const request: CanonicalRequest = JSON.parse(encoded);
    const r = window.townParty.roster, replay = await r.executeRosterCommand(request);
    return { replay, state: (await r.read()).value };
  }, JSON.stringify(result.action.request));
  expect(reloaded.state).toEqual(result.after);
  expect(reloaded.replay.replayed).toBe(true);
  expect(reloaded.replay.receipt).toEqual(result.action.outcome.receipt);
});

test('teleport remains unsupported and rejects before changing durable state', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const c = window.townParty, r = c.roster;
    await r.seed();
    const before = await c.readCanonicalHead(), state = (await r.read()).value;
    const request = c.worldRequest(before.head, 'roster.command', { kind: 'camp', actorId: 'fixture-world-mage', skillId: 'teleport' });
    let error = '';
    try { await r.executeRosterCommand(request); } catch (caught) { error = String(caught); }
    return { error, before, after: await c.readCanonicalHead(), state, next: (await r.read()).value };
  });
  expect(result.error).toContain('unsupported camp skill');
  expect(result.after.head).toEqual(result.before.head);
  expect(result.next).toEqual(result.state);
});
