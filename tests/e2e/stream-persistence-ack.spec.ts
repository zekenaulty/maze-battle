import { expect, test } from '@playwright/test';
import type {} from './stream-persistence-review';

test('lost action/control acknowledgments reconcile after reload without reexecuting or reusing an ID', async ({ page }) => {
  await page.goto('/tests/e2e/stream-persistence-review.html');
  await page.waitForFunction(() => Boolean(window.streamReview));
  const input = await page.evaluate(async () => {
    await window.stream.setup();
    return window.stream.request({ type: 'prepare', frontierId: 'socket-0' }, 'unknown-ack');
  });
  await expect(page.evaluate(async input => {
    await window.stream.api.executeStreamAction('stream', input);
    throw new Error('Simulated lost committed acknowledgment');
  }, input)).rejects.toThrow('lost committed');
  await page.reload(); await page.waitForFunction(() => Boolean(window.streamReview));
  await expect(page.evaluate(async () => {
    await window.stream.api.claimStreamControl('stream', 'replacement', 0);
    throw new Error('Simulated lost claim acknowledgment');
  })).rejects.toThrow('lost claim');
  const result = await page.evaluate(async input => {
    const { api, raw } = window.stream;
    const before = await raw();
    const control = await api.loadStreamControl('stream');
    let claimError = '', reuseError = '';
    try { await api.claimStreamControl('stream', 'replacement', 0); } catch (error) { claimError = String(error); }
    const receipt = (await api.loadStreamAction('stream', input))!;
    const replay = await api.executeStreamAction('stream', input, () => { throw new Error('Reexecuted unknown outcome'); });
    try { await api.executeStreamAction('stream', { ...input, ...control }); } catch (error) { reuseError = String(error); }
    const fenced = await api.executeStreamAction('stream', { ...input, actionId: 'old-owner' });
    return { control, claimError, reuseError, receipt, replay, fenced,
      unchanged: JSON.stringify(before) === JSON.stringify(await raw()) };
  }, input);
  expect(result.control).toEqual({ sessionId: 'replacement', epoch: 1 });
  expect(result.claimError).toContain('epoch conflict'); expect(result.reuseError).toContain('reused');
  expect(result.replay).toEqual(result.receipt.result); expect(result.replay.afterRevision).toBe(1);
  expect(result.fenced.disposition).toBe('conflict'); expect(result.unchanged).toBe(true);
});
