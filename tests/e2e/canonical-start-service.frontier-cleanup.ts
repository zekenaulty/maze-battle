import { expect, type Page } from '@playwright/test';
import type { AgenticaAction } from '../../src/services/agentica/contracts';
import { ACKNOWLEDGEMENT_BYTES } from '../../src/persistence/canonical/types';

/** Explicit UI reconciliation of the original child; no replacement controller or automatic retry. */
export async function cleanupFrontier(page: Page, initial: AgenticaAction, successor: AgenticaAction) {
  const stopped = await page.evaluate(() => window.canonicalStartService.snapshot());
  await page.getByRole('dialog', { name: 'Agentic play', exact: true }).getByRole('button', { name: 'Recovery', exact: true }).click();
  const recovery = page.getByRole('dialog', { name: 'Agentica recovery', exact: true });
  // Root Stop is still pending while the child's final progress/decision has not reached the service.
  const root = await page.evaluate(() => window.canonicalStartService.snapshot());
  expect(root.launch!.guard.state).toBe('settled');
  expect(root.head.quota.reservations).toBe(2);
  expect(root.head.quota.reservedBytes).toBe(2 * ACKNOWLEDGEMENT_BYTES);
  const details = () => page.evaluate(async ([first, child]) => {
    // @ts-expect-error Read-only exact-original inspection in the native Vite fixture.
    return (await import('/tests/e2e/canonical-start-service.app-evidence.ts')).appNavigationEvidence(first, child);
  }, [initial, successor]);
  const retained = await details();
  expect(Object.keys(root.head.allocations).sort()).toEqual([root.launch!.guard.id, retained.child!.operation.id].sort());
  await recovery.getByRole('button', { name: 'Inspect original 1', exact: true }).click();
  await expect(recovery.getByText(successor.actionId, { exact: true })).toBeVisible();
  expect(await page.evaluate(() => window.canonicalStartService.snapshot())).toEqual(root);
  await recovery.getByRole('button', { name: 'Reconcile navigation', exact: true }).click();
  await expect(recovery.getByRole('status').filter({ hasText: 'Navigation terminal prefix delivered through sequence' })).toBeVisible();
  expect(await page.evaluate(() => window.canonicalStartService.snapshot())).toEqual(root);
  await recovery.getByRole('button', { name: 'Inspect original 1', exact: true }).click();
  await expect(recovery.getByText(successor.actionId, { exact: true })).toBeVisible();
  await recovery.getByRole('button', { name: 'Reconcile navigation', exact: true }).click();
  await expect(recovery.getByRole('status').filter({ hasText: 'Navigation acknowledged (decision). Session clearance remains unknown.' })).toBeVisible();
  const childAck = await page.evaluate(() => window.canonicalStartService.snapshot());
  expect(Object.keys(childAck.head.allocations)).toEqual([root.launch!.guard.id]);
  expect(childAck.head.quota).toMatchObject({ reservations: 1, reservedBytes: ACKNOWLEDGEMENT_BYTES });
  await recovery.getByRole('button', { name: 'Stop Agentic session', exact: true }).click();
  await expect(recovery.getByRole('status').filter({ hasText: 'Root Stop acknowledged' })).toBeVisible();
  const final = await page.evaluate(() => window.canonicalStartService.snapshot()), evidence = await details();
  expect(final.launch!.guard.state).toBe('acknowledged');
  expect(final.head.allocations).toEqual({});
  expect(final.head.quota).toMatchObject({ reservations: 0, reservedBytes: 0 });
  expect(final.head.checkpoint).toEqual(stopped.head.checkpoint);
  for (const area of ['world', 'knowledge'] as const) expect(final.head.roots[area]).toEqual(stopped.head.roots[area]);
  expect(evidence.child!.operation.state).toBe('acknowledged');
  expect(evidence.child!.operation.terminal).toEqual(retained.child!.operation.terminal);
  expect(evidence.child!.progress).toEqual(retained.child!.progress);
  expect(evidence.childTerminal!.event).toEqual(retained.childTerminal!.event);
  expect(evidence.parent!.operation).toEqual(retained.parent!.operation);
  return { root, childAck, final, evidence };
}
