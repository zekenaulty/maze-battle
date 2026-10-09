import { expect, test } from '@playwright/test';
import type {} from './stream-persistence-review';

test.beforeEach(async ({ page }) => {
  await page.goto('/tests/e2e/stream-persistence-review.html');
  await page.waitForFunction(() => Boolean(window.streamReview));
  await page.evaluate(() => window.stream.setup());
});

test('a deleted previously visited page cannot be recreated by returning through a learned port', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const crossing = await window.streamReview.firstCrossing();
    const { api, request, raw, openDB, topology } = window.stream;
    const parent = crossing.after.room.knowledge!.openings[crossing.after.room.knowledge!.parentOpeningId!];
    const input = await request({ type: 'move', direction: parent.direction }, 'missing-return');
    const db = await openDB(topology.TOPOLOGY_DATABASE);
    await db.delete('streamKnowledge', ['stream', crossing.before.room.space.spec.id]); db.close();
    const before = await raw();
    let error = '';
    try { await api.executeStreamAction('stream', input); } catch (value) { error = String(value); }
    return { error, unchanged: JSON.stringify(before) === JSON.stringify(await raw()), receipt: await api.loadStreamAction('stream', input) };
  });
  expect(result.error).toMatch(/lost|missing|parent/i);
  expect(result.unchanged).toBe(true); expect(result.receipt).toBeUndefined();
});

for (const corruption of ['destination', 'cell-links', 'opening-direction', 'cleared', 'missing-parent', 'completed-parent']) {
  test(`reject ${corruption} evidence without repairing it or admitting a receipt`, async ({ page }) => {
    const result = await page.evaluate(async corruption => {
      const { after } = await window.streamReview.firstCrossing();
      const { api, request, raw, openDB, topology } = window.stream;
      const input = await request({ type: 'collect' }, 'corrupt-command');
      const knowledge = structuredClone(after.room.knowledge!);
      const parent = knowledge.openings[knowledge.parentOpeningId!];
      if (corruption === 'destination') parent.destination!.spaceId = 'invented-room';
      if (corruption === 'opening-direction') parent.direction = parent.direction === 'north' ? 'east' : 'north';
      if (corruption === 'cell-links') for (const cell of Object.values(knowledge.cells)) cell.links = [];
      if (corruption === 'cleared') knowledge.cleared = true;
      if (corruption === 'missing-parent') delete knowledge.parentOpeningId;
      if (corruption === 'completed-parent') knowledge.completedExits.push(knowledge.parentOpeningId!);
      const db = await openDB(topology.TOPOLOGY_DATABASE);
      await db.put('streamKnowledge', knowledge, ['stream', knowledge.spaceId]); db.close();
      const before = await raw();
      const errors: string[] = [];
      for (const operation of [() => api.loadStreamSnapshot('stream'), () => api.executeStreamAction('stream', input)]) {
        try { await operation(); errors.push(''); } catch (value) { errors.push(String(value)); }
      }
      return { errors, unchanged: JSON.stringify(before) === JSON.stringify(await raw()), receipt: await api.loadStreamAction('stream', input) };
    }, corruption);
    expect(result.errors.every(Boolean), JSON.stringify(result.errors)).toBe(true);
    expect(result.unchanged).toBe(true); expect(result.receipt).toBeUndefined();
  });
}

test('impossible checkpoint work counters fail before admitting a command', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const { api, act, request, raw, openDB, topology } = window.stream;
    await act({ type: 'prepare', frontierId: 'socket-0' });
    const input = await request({ type: 'collect' }, 'counter-corruption');
    const db = await openDB(topology.TOPOLOGY_DATABASE);
    const checkpoint = await db.get('streamCheckpoints', ['stream']);
    checkpoint.visitedSpaces = 3; // Zero moves cannot have visited three spaces.
    await db.put('streamCheckpoints', checkpoint, ['stream']); db.close();
    const before = await raw();
    let error = '';
    try { await api.executeStreamAction('stream', input); } catch (value) { error = String(value); }
    return { error, unchanged: JSON.stringify(before) === JSON.stringify(await raw()) };
  });
  expect(result.error).toContain('counter'); expect(result.unchanged).toBe(true);
});
