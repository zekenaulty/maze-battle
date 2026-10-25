import { expect, test } from '@playwright/test';
import { appGame } from './canonical-app-auto-kill.support';
import { capture, head, isolate, reduceHpToOne, stable, startPaused, win } from './canonical-app-battle-recovery.support';

test('labelled HP-only fixture: actual loss -> End -> town rest -> dungeon return', async ({ page, context, baseURL }, info) => {
  const denied = await isolate(context, baseURL), errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  try {
    const started = await startPaused(page);
    for (const actor of started.party) {
      const toggle = page.getByRole('checkbox', { name: `${actor.displayName} auto battle`, exact: true });
      await toggle.click();
      await expect(toggle).not.toBeChecked();
      await expect.poll(async () => (await appGame(page)).party.find(a => a.id === actor.id)?.autoBattle).toBe(false);
    }
    await expect.poll(async () => (await appGame(page)).party.every(actor => !actor.autoBattle)).toBe(true);
    const before = await appGame(page), fixture = await reduceHpToOne(page), reduced = await appGame(page);
    expect(reduced.party).toEqual(before.party.map(actor => ({ ...actor, hp: 1 })));
    expect(reduced.battle).toEqual(before.battle);
    expect(reduced.inventory).toEqual(before.inventory); expect(reduced.stash).toEqual(before.stash);
    expect(reduced.quests).toEqual(before.quests); expect(reduced.checkpoint).toEqual(before.checkpoint);
    expect(reduced.snapshot.roots.knowledge).toBe(before.snapshot.roots.knowledge);
    await info.attach('labelled-hp-fixture', { body: JSON.stringify(fixture), contentType: 'application/json' });
    await capture(page, info, 'before-hp-reload');
    await page.reload();
    await expect(page.getByRole('heading', { name: /Battle / })).toBeVisible();
    expect((await appGame(page)).battle?.id).toBe(before.battle?.id);
    for (let i = 0; i < 10 && (await appGame(page)).battle?.status === 'active'; i++) {
      await page.getByRole('button', { name: 'Round', exact: true }).click();
      await page.waitForTimeout(1000);
    }
    const lost = await appGame(page);
    expect(lost.battle?.status).toBe('lost'); expect(lost.battle?.id).toBe(started.battle?.id);
    expect(lost.party.every(actor => actor.hp === 0)).toBe(true);
    expect(lost.inventory).toEqual(before.inventory); expect(lost.stash).toEqual(before.stash);
    expect(lost.quests).toEqual(before.quests); expect(lost.battleAutomationPaused).toBe(true);
    await stable(page);
    await page.screenshot({ path: info.outputPath('lost.png') });
    await page.getByRole('button', { name: 'End', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Town', exact: true })).toBeVisible();
    const town = await appGame(page);
    expect(town.battle).toBeUndefined(); expect(town.mode).toBe('town'); expect(town.townReturnMode).toBe('manual');
    expect(town.party).toEqual(lost.party); expect(town.inventory).toEqual(before.inventory);
    await page.getByRole('tab', { name: 'Inn', exact: true }).click();
    await page.getByRole('button', { name: 'Rest - Free', exact: true }).click();
    await expect.poll(async () => (await appGame(page)).party.every(a => a.hp === a.maxHp && a.mp === a.maxMp)).toBe(true);
    const rested = await appGame(page);
    expect(rested.inventory).toEqual(before.inventory); expect(rested.stash).toEqual(before.stash);
    await page.screenshot({ path: info.outputPath('rested-town.png') });
    await page.getByRole('button', { name: 'Dungeon', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Maze Battle', exact: true })).toBeVisible();
    const returned = await appGame(page);
    expect(returned.mode).toBe('manual'); expect(returned.battle).toBeUndefined();
    expect(returned.checkpoint.position).toEqual(started.checkpoint.position);
    expect(returned.party).toEqual(rested.party); expect(returned.inventory).toEqual(rested.inventory);
    await stable(page);
    await info.attach('loss-town-return', { contentType: 'application/json', body: JSON.stringify({ before, reduced, lost, town, rested, returned }) });
    expect(errors).toEqual([]); expect(denied).toEqual([]);
  } finally { await capture(page, info, 'loss-final-commits'); }
});

test('active battle named save restores paused identity and pays one wallet after load/reload', async ({ page, context, baseURL }, info) => {
  const denied = await isolate(context, baseURL), errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  try {
    await startPaused(page);
    await page.getByRole('button', { name: 'Waves', exact: true }).click();
    await page.getByRole('button', { name: 'Saves', exact: true }).click();
    const saved = await appGame(page);
    expect(saved.battle?.status).toBe('active'); expect(saved.battleAutomationPaused).toBe(false);
    await page.getByRole('button', { name: 'New save', exact: true }).click();
    await expect(page.getByText('Manual save created.', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Close dialog', exact: true }).click();
    await page.getByRole('button', { name: 'Stop Waves', exact: true }).click();
    const first = await win(page);
    expect(first.game.inventory.gold).toBe(saved.inventory.gold + first.gold);
    await capture(page, info, 'first-victory');
    await page.getByRole('button', { name: 'Saves', exact: true }).click();
    await page.getByRole('button', { name: 'Load', exact: true }).click();
    await page.getByRole('button', { name: 'Load save', exact: true }).click();
    await expect(page.getByRole('heading', { name: /Battle / })).toBeVisible();
    const restored = await appGame(page);
    expect(restored.battle).toEqual({ ...saved.battle, returnMode: 'manual' });
    expect(restored.battleAutomationPaused).toBe(true);
    expect(restored.party).toEqual(saved.party); expect(restored.inventory).toEqual(saved.inventory);
    expect(restored.stash).toEqual(saved.stash); expect(restored.quests).toEqual(saved.quests);
    expect(restored.checkpoint.position).toEqual(saved.checkpoint.position);
    await stable(page);
    await page.screenshot({ path: info.outputPath('restored-battle.png') });
    await capture(page, info, 'before-restored-reload');
    await page.reload();
    await expect(page.getByRole('heading', { name: /Battle / })).toBeVisible();
    const reloaded = await appGame(page);
    expect(reloaded.battle).toEqual(restored.battle); expect(reloaded.party).toEqual(restored.party);
    expect(reloaded.inventory).toEqual(saved.inventory); expect(reloaded.battleAutomationPaused).toBe(true);
    await stable(page);
    const second = await win(page);
    expect(second.gold).toBe(first.gold);
    expect(second.game.inventory.gold).toBe(saved.inventory.gold + second.gold);
    expect(second.game.inventory.items.length).toBe(saved.inventory.items.length + second.items);
    expect(new Set(second.game.inventory.items.map(item => item.id)).size).toBe(second.game.inventory.items.length);
    expect(second.game.stash).toEqual(saved.stash);
    await capture(page, info, 'second-victory');
    await page.reload();
    await expect(page.getByRole('heading', { name: 'Maze Battle', exact: true })).toBeVisible();
    expect((await appGame(page)).inventory).toEqual(second.game.inventory);
    expect((await appGame(page)).party).toEqual(second.game.party);
    await stable(page);
    await info.attach('named-save-wallet', { contentType: 'application/json', body: JSON.stringify({ saved, first, restored, reloaded, second }) });
    expect(errors).toEqual([]); expect(denied).toEqual([]);
  } finally { await capture(page, info, 'save-final-commits'); }
});

test('second tab explicitly takes active battle control paused; old tab cannot cast', async ({ page, context, baseURL }, info) => {
  const denied = await isolate(context, baseURL), errors: string[] = [];
  context.on('page', tab => tab.on('pageerror', error => errors.push(error.message)));
  page.on('pageerror', error => errors.push(error.message));
  const peer = await context.newPage();
  try {
    const started = await startPaused(page), hero = started.party[0];
    const slash = page.getByRole('article', { name: hero.displayName, exact: true }).getByRole('button', { name: 'Slash', exact: true });
    await slash.click();
    await expect.poll(async () => (await appGame(page)).battle?.round).toBeGreaterThan(started.battle!.round);
    await peer.goto('/');
    await expect(peer.getByRole('button', { name: 'Take control', exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Waves', exact: true }).click();
    // An ordinary settings dialog suspends scheduling, not the durable active/unpaused battle.
    await page.getByRole('button', { name: 'Battle settings', exact: true }).click();
    const before = await appGame(page), previousHead = await head(page);
    expect(before.battle?.status).toBe('active'); expect(before.battleAutomationPaused).toBe(false);
    await stable(page);
    await peer.getByRole('button', { name: 'Take control', exact: true }).click();
    await expect(peer.getByRole('button', { name: 'Take control', exact: true })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Take control', exact: true })).toBeVisible();
    const current = await head(peer), adopted = await appGame(peer);
    expect(current.owner).not.toBe(previousHead.owner); expect(current.epoch).toBeGreaterThan(previousHead.epoch);
    expect(current.gameId).toBe(previousHead.gameId); expect(current.generation).toBe(previousHead.generation);
    expect(adopted.battle).toEqual({ ...before.battle, returnMode: 'manual' });
    expect(adopted.battleAutomationPaused).toBe(true); expect(adopted.party).toEqual(before.party);
    expect(adopted.inventory).toEqual(before.inventory); expect(adopted.stash).toEqual(before.stash);
    expect(adopted.quests).toEqual(before.quests); expect(adopted.checkpoint.position).toEqual(before.checkpoint.position);
    await stable(peer);
    await page.getByRole('button', { name: 'Close dialog', exact: true }).click();
    await expect(slash).toBeDisabled();
    await expect(page.getByRole('button', { name: 'Round', exact: true })).toBeDisabled();
    await expect(page.getByRole('checkbox', { name: `${hero.displayName} auto battle` })).toBeDisabled();
    await stable(peer);
    expect(await head(peer)).toEqual(current);
    expect((await appGame(peer)).party).toEqual(adopted.party);
    await peer.screenshot({ path: info.outputPath('new-owner-paused.png') });
    await page.screenshot({ path: info.outputPath('old-owner-read-only.png') });
    await peer.getByRole('article', { name: hero.displayName, exact: true }).getByRole('button', { name: 'Slash', exact: true }).click();
    await expect.poll(async () => (await appGame(peer)).battle?.round).toBeGreaterThan(adopted.battle!.round);
    await info.attach('two-tab-custody', { contentType: 'application/json', body: JSON.stringify({ previousHead, current, before, adopted, afterNewOwnerCast: await appGame(peer), errors }) });
    expect(errors).toEqual([]); expect(denied).toEqual([]);
  } finally { await capture(page, info, 'old-tab-commits'); await capture(peer, info, 'new-tab-commits'); }
});
