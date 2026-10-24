import { test, expect } from '@playwright/test';
import { commutationConsumer, type ConsumerFrame } from './canonical-agentica-transport.commutation.setup';

test('real SDK and shared game commute acceptance notices but preserve terminal authority order', async ({ browser }, info) => {
  const cases = [];
  for (const mode of ['status-first', 'acks-first', 'direct-first', 'terminal-before', 'terminal-after'] as const) {
    const c = await commutationConsumer(browser);
    try {
      const first = c.action('commutation-first'), result = await c.invoke(first);
      expect(result.disposition, JSON.stringify(result)).toBe('applied');
      const status: ConsumerFrame = { protocolVersion: 1, runId: first.runId, requestId: null, type: 'status', payload: { status: 'running' } };
      const direct: ConsumerFrame = { ...status, type: 'action.accepted', payload: { actionId: first.actionId, duplicate: false } };
      const evidence: ConsumerFrame = { ...status, type: 'action.accepted', payload: { actionId: first.actionId,
        disposition: result.disposition, evidenceId: result.evidenceId, afterRevision: result.afterRevision } };
      const notices = mode === 'status-first' ? [status, evidence, direct]
        : mode === 'direct-first' ? [direct, evidence, status] : [evidence, direct, status];
      const before = await c.snapshot(), count = await c.page.evaluate(() => window.transportReview.status().notices.length);
      for (const frame of notices) c.send(frame);
      await c.page.waitForFunction(n => window.transportReview.status().notices.length === n + 3, count);
      const after = await c.snapshot();
      expect({ ...after, messages: [] }).toEqual({ ...before, messages: [] });
      expect(after.messages[0].slice(-3)).toEqual(notices);
      const terminal = { ...status, type: 'run.terminated', payload: {} };
      if (mode === 'terminal-before') {
        c.send(terminal); await c.page.waitForFunction(() => window.transportReview.status().phases[0] === 'closed');
        // The real transport closes its socket on termination; later traffic has no delivery authority.
        const action = c.action('commutation-next');
        c.send({ protocolVersion: 1, type: 'action.request', runId: action.runId, payload: action });
        await c.page.evaluate(() => window.transportReview.drain());
      }
      const next = mode === 'terminal-before' ? null : await c.invoke(c.action('commutation-next')), afterNext = await c.snapshot();
      if (mode === 'terminal-before') {
        expect(c.incoming.filter(frame => frame.type === 'action.result' && frame.payload.actionId === 'commutation-next')).toEqual([]);
        expect(afterNext.authority[0].connected).toBe(false); expect(afterNext.database).toEqual(after.database);
      } else expect(next?.disposition).toBe('applied');
      if (mode === 'terminal-after') {
        c.send(terminal); await c.page.waitForFunction(() => window.transportReview.status().phases[0] === 'closed');
      }
      const final = await c.snapshot();
      cases.push({ mode, result, before, notices, after, next, afterNext, final, sent: structuredClone(c.incoming) });
    } finally { await c.close(); }
  }
  await info.attach('consumer-commutation-raw.json', { body: JSON.stringify(cases), contentType: 'application/json' });
  for (const value of cases.slice(1, 3)) {
    expect(cases[0].after.database).toEqual(value.after.database);
    expect(cases[0].after.authority).toEqual(value.after.authority);
    expect(cases[0].afterNext.database).toEqual(value.afterNext.database);
    expect(cases[0].afterNext.authority).toEqual(value.afterNext.authority);
    expect(cases[0].sent).toEqual(value.sent);
  }
  expect(cases[3].final.phases).toEqual(['closed']); expect(cases[4].final.phases).toEqual(['closed']);
  expect(cases[3].next).toBeNull(); expect(cases[4].next?.disposition).toBe('applied');
  expect(cases[3].final.database).not.toEqual(cases[4].final.database);
});
