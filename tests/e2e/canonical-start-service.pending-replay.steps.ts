import type { Page } from '@playwright/test';
import { expect, type DecisionWire } from './canonical-start-service.decision.test';
import { canonicalEvidence, assertRetainedRecovery, tryPendingRecovery, type PendingSetup } from './canonical-start-service.pending-recovery.steps';

export async function refuseChangedRecovery(page: Page, wire: DecisionWire, setup: PendingSetup, serialized: string, restarted: boolean) {
  const original = JSON.parse(serialized), before = await canonicalEvidence(page);
  const retained = await assertRetainedRecovery(page, setup, original.result);
  const cases = [
    { body: { ...original, hostId: 'foreign-host' }, code: 'custody.not_found' },
    { body: { ...original, sessionId: 'foreign-session' }, code: 'custody.not_found' },
    { body: { ...original, result: { ...original.result, sessionEpoch: 'foreign-epoch' } },
      code: restarted ? 'custody.result_binding' : 'action.session' },
    { body: { ...original, result: { ...original.result, summary: 'changed-result' } },
      code: restarted ? 'custody.result_changed' : 'action.duplicate_changed' },
    { body: { ...original, result: { ...original.result, evidenceId: 'changed-evidence' } },
      code: restarted ? 'custody.result_changed' : 'action.duplicate_changed' },
  ];
  const refused = [];
  for (const item of cases) {
    wire.expectedRefusals.push({ method: 'POST', path: '/api/recovery', status: 409, code: item.code });
    const response = await page.evaluate(body => window.canonicalStartService.postPendingRecovery(body), JSON.stringify(item.body));
    expect(response.status).toBe(409); expect(response.body.code).toBe(item.code); refused.push(response);
    expect(await assertRetainedRecovery(page, setup, original.result)).toEqual(retained);
    expect(await canonicalEvidence(page)).toEqual(before);
  }
  const posts = wire.http.filter(item => item.method === 'POST' && new URL(item.url).pathname === '/api/recovery').length;
  const changed = { ...setup.action, arguments: { ...setup.action.arguments, scope: 'changed' } };
  expect((await tryPendingRecovery(page, changed)).error!.message).toContain('recovery original request or binding changed');
  expect(wire.http.filter(item => item.method === 'POST' && new URL(item.url).pathname === '/api/recovery')).toHaveLength(posts);
  expect(await assertRetainedRecovery(page, setup, original.result)).toEqual(retained);
  expect(await canonicalEvidence(page)).toEqual(before);
  return refused;
}

export async function replayExactRecovery(page: Page, serialized: string, actionId: string) {
  const response = await page.evaluate(body => window.canonicalStartService.postPendingRecovery(body), serialized);
  expect(response).toEqual({ status: 200, body: { actionId, resolved: true, duplicate: true } });
  return response;
}
