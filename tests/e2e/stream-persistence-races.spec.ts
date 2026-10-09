import { expect, test } from '@playwright/test';
import type {} from './stream-persistence-fixture';

test('cross-tab epoch, checkpoint and topology CAS reject losers; exact concurrent IDs reconcile', async ({ page, context }) => {
  const fixture = '/tests/e2e/stream-persistence-fixture.html';
  await page.goto(fixture); await page.waitForFunction(() => Boolean(window.stream));
  await page.evaluate(() => window.stream.setup());
  const second = await context.newPage(); await second.goto(fixture); await second.waitForFunction(() => Boolean(window.stream));
  const claims = await Promise.all([
    page.evaluate(() => window.stream.api.claimStreamControl('stream', 'owner-b', 0).catch(error => String(error))),
    second.evaluate(() => window.stream.api.claimStreamControl('stream', 'owner-c', 0).catch(error => String(error))),
  ]);
  expect(claims.filter(value => typeof value === 'string')).toHaveLength(1);
  expect(claims.filter(value => typeof value !== 'string')).toHaveLength(1);
  const input = await page.evaluate(() => window.stream.request({ type: 'prepare', frontierId: 'socket-0' }, 'race-a'));
  const outcomes = await Promise.all([
    page.evaluate(input => window.stream.api.executeStreamAction('stream', input), input),
    second.evaluate(input => window.stream.api.executeStreamAction('stream', { ...input, actionId: 'race-b' }), input),
  ]);
  expect(outcomes.map(value => value.disposition).sort()).toEqual(['applied', 'conflict']);
  const next = await page.evaluate(() => window.stream.request({ type: 'move', direction: 'north' }, 'duplicate'));
  const staleTopology = await second.evaluate(input => window.stream.api.executeStreamAction('stream', { ...input, actionId: 'stale-topology', expectedTopologyRevision: 0 }), next);
  expect(staleTopology.disposition).toBe('conflict');
  const duplicates = await Promise.all([
    page.evaluate(input => window.stream.api.executeStreamAction('stream', input), next),
    second.evaluate(input => window.stream.api.executeStreamAction('stream', input), next),
  ]);
  expect(duplicates[0]).toEqual(duplicates[1]); expect(duplicates[0].disposition).toBe('applied');
  expect((await page.evaluate(() => window.stream.api.loadStreamSnapshot('stream'))).checkpoint.revision).toBe(2);
  expect(await page.evaluate(() => window.stream.api.loadStreamAction('stream', 'stale-topology'))).toBeUndefined();
  const loser = outcomes[0].disposition === 'conflict' ? 'race-a' : 'race-b';
  expect(await page.evaluate(id => window.stream.api.loadStreamAction('stream', id), loser)).toBeUndefined();
});
