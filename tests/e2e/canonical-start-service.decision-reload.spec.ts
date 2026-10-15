import { test, expect, serviceProof } from './canonical-start-service.decision.test';
import { completeInitialDecision, counterDelta, scriptedWindow, absentWindow } from './canonical-start-service.decision.steps';
import { reloadDecision } from './canonical-start-service.decision-adoption.steps';
import { pulseError, terminalWindow } from './canonical-start-service.decision-recovery.steps';

for (const stage of ['intent', 'claim', 'grant'] as const) {
  test(`browser reload after adoption ${stage} refuses fresh continuation and explicitly recovers retained custody`, async ({ page, wire }) => {
    const { before, original } = await completeInitialDecision(page, stage === 'grant' ? 'navigation' : 'terminal');
    const reference = original.originals[3]!.reference;
    await reloadDecision(page, reference);
    await page.evaluate(() => window.canonicalStartService.prepareDecision());
    if (stage !== 'intent') {
      if (stage === 'claim') await page.evaluate(() => window.canonicalStartService.decisionReplyAfterOutcome());
      for (const status of ['connected', 'prefix-delivered', 'claimed'])
        expect((await page.evaluate(() => window.canonicalStartService.pulseDecision())).status).toBe(status);
      if (stage === 'grant') {
        for (const status of ['guard-adopted', 'attached'])
          expect((await page.evaluate(() => window.canonicalStartService.pulseDecision())).status).toBe(status);
        await expect.poll(async () => (await page.evaluate(() => window.canonicalStartService.readDecision())).messages
          .some(item => item.message.type === 'outcome'), { timeout: 15_000 }).toBe(true);
      }
    }
    const retained = await page.evaluate(() => window.canonicalStartService.readDecision());
    const child = stage === 'grant' ? retained.originals.find(row => row!.original.action.capabilityId === 'maze.navigate'
      && row!.original.action.runId === retained.claim!.data.started.runId)! : null;
    expect(stage === 'grant' ? !!child && !!retained.grant : retained.grant === null).toBe(true);
    const counters = await serviceProof(), sentBeforeReload = wire.sent.length;
    expect(counterDelta(counters, before)).toEqual({ created: stage === 'intent' ? 1 : 2, initial: scriptedWindow,
      successor: stage === 'intent' ? absentWindow : stage === 'claim' ? terminalWindow : scriptedWindow });
    const reconstructed = await reloadDecision(page, reference);
    expect(reconstructed.head.owner).not.toBe(retained.head.owner); expect(reconstructed.head.epoch).toBeGreaterThan(retained.head.epoch);
    expect(reconstructed.head.checkpoint).toEqual(retained.head.checkpoint);
    expect(reconstructed.intent).toEqual(retained.intent); expect(reconstructed.claim).toEqual(retained.claim);
    expect(reconstructed.grant).toEqual(retained.grant); expect(reconstructed.selection).toEqual(retained.selection);
    expect(reconstructed.originals).toEqual([original.originals[3]]); expect(reconstructed.actions).toEqual([]);
    expect(reconstructed.messages).toEqual([]); expect(reconstructed.launch).toEqual(retained.launch);
    expect((await pulseError(page)).message).toContain('current-owner intention');
    const refused = await page.evaluate(() => window.canonicalStartService.readDecision());
    expect(refused.head).toEqual(reconstructed.head); expect(refused.intent).toEqual(reconstructed.intent);
    expect(refused.claim).toEqual(reconstructed.claim); expect(refused.grant).toEqual(reconstructed.grant);
    expect(refused.wakes).toEqual([]); expect(refused.adoptions).toEqual([]);
    expect((await page.evaluate(() => window.canonicalStartService.readDecisionController())).binding).toBeUndefined();
    expect(wire.sent.slice(sentBeforeReload)).toEqual([]); expect(await serviceProof()).toEqual(counters);

    expect(await page.evaluate(() => window.canonicalStartService.cancelDecision())).toEqual({ status: 'locally-stopped' });
    if (stage !== 'claim') {
      expect(await page.evaluate(() => window.canonicalStartService.stopDecisionRoot())).toMatchObject({ status: 'stop-requested', settled: false });
      await page.evaluate(reference => window.canonicalStartService.attachNavigationCleanup(reference), child?.reference ?? reference);
      const pending = await page.evaluate(() => window.canonicalStartService.readRetainedNavigation());
      expect(pending.original).toEqual(child ?? original.originals[3]);
      expect(pending.progress.steps).toBe(stage === 'grant' ? 0 : 1);
      await page.evaluate(() => window.canonicalStartService.cancelRetainedNavigation());
      for (let pulse = 0; pulse < 3; pulse++) {
        const result = await page.evaluate(() => window.canonicalStartService.deliverRetainedNavigation());
        if (result.status === 'terminal-acknowledged') break;
        expect(result.status).toBe('terminal-prefix-delivered');
      }
      const recovered = await page.evaluate(() => window.canonicalStartService.readRetainedNavigation());
      expect(recovered.operation.state).toBe('acknowledged');
      expect(recovered.progress.steps).toBe(pending.progress.steps);
      expect(recovered.head.allocations[recovered.operation.id]).toBeUndefined();
    }
    expect(await page.evaluate(() => window.canonicalStartService.stopDecisionRoot())).toMatchObject({ status: 'settled', settled: true });
    expect(await page.evaluate(() => window.canonicalStartService.acknowledgeDecision())).toEqual({ status: 'navigation-acknowledged' });
    const settled = await page.evaluate(() => window.canonicalStartService.readDecision());
    expect(settled.head.checkpoint).toEqual(retained.head.checkpoint);
    expect(settled.operation!.operation.state).toBe('acknowledged'); expect(settled.launch!.guard.state).toBe('acknowledged');
    expect(settled.head.allocations[settled.operation!.operation.id]).toBeUndefined();
    expect(settled.head.allocations[settled.launch!.guard.id]).toBeUndefined();
    expect(settled.intent!.data).toEqual(retained.intent!.data); expect(settled.claim?.data ?? null).toEqual(retained.claim?.data ?? null);
    expect(settled.grant?.record ?? null).toEqual(retained.grant?.record ?? null); expect(settled.selection).toEqual(retained.selection);
    expect(settled.originals).toEqual([original.originals[3]]);
    expect(settled.launch!.grant).toEqual(original.launch!.grant); expect(settled.launch!.run).toEqual(original.launch!.run);
    expect(settled.terminal!.event).toEqual(original.terminal!.event);
    const receipts = await page.evaluate(() => window.canonicalStartService.readDecisionStopEvidence());
    expect(receipts.navigation.acknowledgement!.source.input).toMatchObject({ proof: {
      delivery: stage === 'intent' ? 'stop-decision' : 'decision-root-stop',
    } });
    expect(await page.evaluate(() => window.canonicalStartService.acknowledgeDecision())).toEqual({ status: 'navigation-acknowledged' });
    expect(await page.evaluate(() => window.canonicalStartService.stopDecisionRoot())).toMatchObject({ status: 'settled', settled: true });
    expect((await page.evaluate(() => window.canonicalStartService.readDecision())).head).toEqual(settled.head);
    expect(await page.evaluate(() => window.canonicalStartService.readDecisionStopEvidence())).toEqual(receipts);
    expect(await serviceProof()).toEqual(counters); expect(wire.sent.slice(sentBeforeReload)).toEqual([]);
    expect(wire.sent.filter(frame => frame.type === 'operation.adopt')).toHaveLength(stage === 'intent' ? 0 : 1);
    expect(wire.sent.filter(frame => ['resume', 'operation.wake'].includes(frame.type))).toEqual([]);
    expect(wire.sent.filter(frame => frame.type === 'start.durable')).toHaveLength(1);
    expect(wire.http.filter(request => request.url.endsWith('/api/operations/stop-decision'))).toHaveLength(stage === 'intent' ? 1 : 0);
    expect(wire.received.filter(item => item.frame.type === 'error')).toEqual([]);
  });
}
