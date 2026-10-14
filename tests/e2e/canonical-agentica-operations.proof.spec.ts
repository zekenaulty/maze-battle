import { test, expect } from './canonical-agentica-operations.test';

for (const change of ['probe-data', 'custody-ref', 'first-previous-null', 'first-previous-kind', 'first-previous-id', 'wire-sequence'] as const) {
  test(`source-witness-preserving ${change} corruption fails closed`, async ({ page }) => {
    const r = await page.evaluate(async change => {
      const { canonicalJson } = await import('../../src/services/agentica/sdk/agentica-host.mjs');
      const f = window.canonicalAgenticaOperations, s = await f.boot(); await f.confirm(s.action, s.binding, s.entry);
      await f.acceptCustody(s.action, s.entry);
      const first = await f.advance(s.action); await f.ack(s.action, { ...s.entry, latestEvent: first.state!.event!.data.event });
      const state = first.state!, ref = change === 'probe-data' ? state.confirmation.reference : state.event!.reference;
      const head = (await f.readCanonicalHead()).head, db = await f.openCanonicalDatabase(), row = (await db.get('records', [head.gameId, ref.id]))!;
      const value = row.value as { sourceAttemptId: string; data: Record<string, unknown> };
      if (change === 'probe-data') value.data.probe = { ...state.confirmation.data.probe,
        observation: { ...state.confirmation.data.probe.observation, observedAt: '2030-01-01T00:00:00.000Z' } };
      if (change === 'custody-ref') value.data.custody = { ...state.custodyAck!.reference, id: crypto.randomUUID() };
      if (change === 'first-previous-null') value.data.previous = null;
      if (change === 'first-previous-kind') value.data.previous = { kind: 'progress', reference: state.confirmation.reference };
      if (change === 'first-previous-id') value.data.previous = { kind: 'custody-probe', reference: { ...state.confirmation.reference, id: crypto.randomUUID() } };
      if (change === 'wire-sequence') value.data.event = { ...state.event!.data.event, sequence: 1 };
      const receipt = (await db.get('receipts', [head.gameId, value.sourceAttemptId]))!;
      // Preserve the generic source witness to exercise semantic bindings, not just byte mismatch detection.
      const result = receipt.result as { agenticaOperation?: { recordWitness: string }; host?: { event: { recordWitness: string } } };
      if (change === 'probe-data') result.agenticaOperation!.recordWitness = canonicalJson(row);
      else result.host!.event.recordWitness = canonicalJson(row);
      await db.put('records', row, [head.gameId, row.id]); await db.put('receipts', receipt, [head.gameId, receipt.attemptId]); db.close();
      const before = await f.dump(), read = await f.read(s.action).then(() => 'accepted', String);
      const identity = await f.prepareAction(s.action), request = await f.command('navigation.advance', { operationId: s.operationId, sequence: 1 });
      const advance = await f.executeNavigationCommand(request, { host: f.operationProgressHooks(identity, state.confirmation.reference) }).then(() => 'accepted', String);
      return { read, advance, unchanged: before === await f.dump() };
    }, change);
    expect(r.read).toMatch(/^Error:/); expect(r.advance).toMatch(/^Error:/); expect(r.unchanged).toBe(true);
  });
}

test('probe ACK and progress ACK cannot substitute for each other', async ({ page }) => {
  const r = await page.evaluate(async () => {
    const f = window.canonicalAgenticaOperations, s = await f.boot(), confirmed = await f.confirm(s.action, s.binding, s.entry);
    const before = await f.dump(), probe = { ...s.entry, latestEvent: confirmed.state!.confirmation.data.probe };
    const wrongProgress = await f.ack(s.action, probe, confirmed.state!.confirmation.reference).then(() => 'accepted', String);
    const unchangedBefore = before === await f.dump(); await f.custodyAck(s.action, probe);
    const moved = await f.advance(s.action), afterMove = await f.dump();
    const wrongCustody = await f.custodyAck(s.action, { ...s.entry, latestEvent: moved.state!.event!.data.event }).then(() => 'accepted', String);
    return { wrongProgress, wrongCustody, unchangedBefore, unchangedAfter: afterMove === await f.dump(), state: (await f.read(s.action)).value };
  });
  expect(r.wrongProgress).toMatch(/^Error:/); expect(r.wrongCustody).toMatch(/^Error:/);
  expect(r.unchangedBefore).toBe(true); expect(r.unchangedAfter).toBe(true);
  expect(r.state!.custodyAck).not.toBeNull(); expect(r.state!.acknowledgement).toBeNull();
});
