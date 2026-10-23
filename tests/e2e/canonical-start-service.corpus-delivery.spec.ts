import { test, expect, serviceProof } from './canonical-start-service.decision.test';
import { corpusActions, corpusEffects, reachChestBoundary, startCorpus } from './canonical-start-service.corpus-recovery.steps';
import { custody, domain, fault, onePackItem, reloadRecovery, replay, results } from './canonical-start-service.corpus-delivery.steps';
import type { DeliveryFault } from './canonical-start-service.corpus-delivery.fault';
import { assertSingleCompletionAttempt, assertSingleProgressDelivery } from './canonical-start-service.corpus-delivery.checks';

test.use({ freshCorpus: true });

for (const cut of ['interaction progress', 'completion confirmation'] as const) {
  test(`actual App corpus delivery: reload after lost ${cut}`, async ({ page, wire }, info) => {
    test.setTimeout(300_000);
    const { setup, dialog } = await startCorpus(page, 'A');
    const effects = () => corpusEffects(page, setup.target);
    let lost: DeliveryFault | undefined;
    const stages: Record<string, unknown> = { setup, cut };
    try {
      const interaction = await reachChestBoundary(page, wire, true);
      const applied = await effects(), admitted = await custody(page, interaction);
      stages.applied = applied; stages.admitted = admitted;
      onePackItem(applied);
      expect(applied.checkpoint.position).toEqual(setup.target.at);
      expect(corpusActions(wire).filter(action => action.capabilityId === 'maze.interact')).toHaveLength(1);
      expect(admitted.operation.operation.state).toBe('settled');
      expect(admitted.terminal.event.sequence).toBe(3);
      expect(admitted.terminal.previous!.sequence).toBe(2);

      if (cut === 'interaction progress') {
        await page.evaluate(async actionId => {
          // @ts-expect-error One-shot transport fault after real service commit.
          const { loseProgressReply }: typeof import('./canonical-start-service.corpus-delivery.fault') = await import('/tests/e2e/canonical-start-service.corpus-delivery.fault.ts');
          loseProgressReply(actionId);
        }, interaction.actionId);
        const wakes = wire.sent.filter(frame => frame.type === 'operation.wake').length;
        await dialog.getByRole('button', { name: 'Continue', exact: true }).click();
        await expect.poll(async () => (await fault(page))?.withheld.length).toBe(1);
        await expect(dialog.getByRole('alert')).toContainText('Fixture discarded');
        expect(wire.sent.filter(frame => frame.type === 'operation.wake')).toHaveLength(wakes);
      } else {
        await page.evaluate(async () => {
          // @ts-expect-error Future successor sockets only; real completion is forwarded once.
          const { loseCompletionConfirmation }: typeof import('./canonical-start-service.corpus-delivery.fault') = await import('/tests/e2e/canonical-start-service.corpus-delivery.fault.ts');
          loseCompletionConfirmation();
        });
        for (let window = 0; window < 3; window++) {
          await expect(dialog.getByRole('status').filter({ hasText: /^(decision|satisfied)$/ })).toBeVisible({ timeout: 60_000 });
          if (await dialog.getByRole('status').filter({ hasText: /^satisfied$/ }).count()) break;
          const count = corpusActions(wire).length;
          await dialog.getByRole('button', { name: 'Continue', exact: true }).click();
          await expect.poll(() => corpusActions(wire).length).toBeGreaterThan(count);
        }
        await expect(dialog.getByRole('status').filter({ hasText: /^satisfied$/ })).toBeVisible({ timeout: 60_000 });
        await expect(dialog).toContainText('Service delivery is unconfirmed');
        await expect(dialog).not.toContainText('Agentica outcome received');
        await expect(dialog.getByRole('button', { name: 'Continue', exact: true })).toBeDisabled();
        const completion = wire.sent.filter(frame => frame.type === 'action.result' && frame.payload.completion);
        expect(completion).toHaveLength(1);
        const finalAction = corpusActions(wire).at(-1)!;
        expect(finalAction.arguments).toEqual({ scope: 'objective' });
        expect(completion[0].payload).toMatchObject({ actionId: finalAction.actionId, disposition: 'applied',
          completion: { evidenceId: completion[0].payload.evidenceId },
          observation: { data: { scope: 'objective', status: 'satisfied', carried: 1, atReturn: true } } });
        const outcome = wire.received.find(({ frame }) => frame.type === 'outcome' && frame.runId === finalAction.runId);
        expect(outcome?.frame.payload).toMatchObject({ outcome: { status: 'succeeded', stopReason: 'complete' } });
        const proof = await results(page, [finalAction]); stages.completion = proof;
        expect(proof[0].result).toEqual(completion[0].payload);
        expect(proof[0].source.objective).toMatchObject({ evidence: { quest: { packCount: 1, stashCount: 0 } } });
        expect(proof[0].source.objective!.evidence.arrival).not.toBeNull();
        expect((await effects()).checkpoint.position).toEqual(setup.position);
      }
      lost = await fault(page); stages.fault = lost;
      expect(lost!.sent).toHaveLength(1);
      if (cut === 'interaction progress') {
        expect(lost!.sent[0]).toMatchObject({ body: admitted.terminal.previous });
        expect(lost!.withheld[0]).toMatchObject({ status: 200 });
      } else {
        assertSingleCompletionAttempt(lost!);
        expect(lost!.withheld).toEqual(expect.arrayContaining([
          expect.objectContaining({ type: 'action.accepted' }), expect.objectContaining({ type: 'outcome' }),
        ]));
      }
      const before = await effects(), retained = await results(page, corpusActions(wire));
      stages.before = before; stages.retained = retained;
      onePackItem(before);
      for (const field of ['inventory', 'stash', 'quest', 'chest'] as const) expect(before[field]).toEqual(applied[field]);
      const counters = await serviceProof(), sent = structuredClone(wire.sent), actions = corpusActions(wire);
      lost = await fault(page); stages.fault = lost;
      if (cut === 'completion confirmation') assertSingleCompletionAttempt(lost!);
      const recovery = await reloadRecovery(page, wire), reloaded = await effects(); stages.reloaded = reloaded;
      expect(domain(reloaded)).toEqual(domain(before));
      expect(await results(page, actions)).toEqual(retained);
      const afterReload = await custody(page, interaction); stages.afterReload = afterReload;
      expect(afterReload.original).toEqual(admitted.original); expect(afterReload.binding).toEqual(admitted.binding);
      expect(afterReload.operation.progress).toEqual(admitted.operation.progress);
      expect(afterReload.terminal.event).toEqual(admitted.terminal.event);

      if (cut === 'interaction progress') {
        const http = wire.http.length;
        await recovery.getByRole('button', { name: 'Inspect original 1', exact: true }).click();
        await expect(page.getByRole('region', { name: 'Original action inspection' })).toContainText(interaction.actionId);
        expect(wire.http).toHaveLength(http); expect(wire.sent).toEqual(sent);
        await expect(recovery.getByRole('button', { name: /Resume|Adopt/ })).toHaveCount(0);
        await recovery.getByRole('button', { name: 'Stop interaction', exact: true }).click();
        await expect(recovery.getByRole('status').filter({ hasText: 'Navigation stopped' })).toBeVisible();
        await recovery.getByRole('button', { name: 'Stop Agentic session', exact: true }).click();
        await expect(recovery.getByRole('status').filter({ hasText: 'Local Stop recorded; service Stop is pending.' })).toBeVisible();
        await recovery.getByRole('button', { name: 'Inspect original 1', exact: true }).click();
        await expect(page.getByRole('region', { name: 'Original action inspection' })).toContainText(interaction.actionId);
        await recovery.getByRole('button', { name: 'Reconcile interaction', exact: true }).click();
        await expect(recovery.getByRole('status').filter({ hasText: /acknowledged/i })).toBeVisible();
      } else {
        await recovery.getByRole('button', { name: 'Check service', exact: true }).click();
        await expect(recovery.getByRole('status').filter({ hasText: /Original root is (retained|settled)/ })).toBeVisible();
      }
      await recovery.getByRole('button', { name: 'Stop Agentic session', exact: true }).click();
      await expect(recovery.getByRole('status').filter({ hasText: 'Root Stop acknowledged' })).toBeVisible();
      await expect(recovery.getByRole('alert')).toHaveCount(0);
      const final = await effects(), reconciled = await custody(page, interaction);
      stages.final = final; stages.reconciled = reconciled;
      expect(domain(final)).toEqual(domain(before)); onePackItem(final);
      expect(final.head.allocations).toEqual({});
      expect(final.head.quota).toMatchObject({ reservations: 0, reservedBytes: 0,
        limitBytes: before.head.quota.limitBytes, reserveBytes: before.head.quota.reserveBytes });
      expect(reconciled.original).toEqual(admitted.original); expect(reconciled.binding).toEqual(admitted.binding);
      expect(reconciled.operation.progress).toEqual(admitted.operation.progress);
      expect(reconciled.terminal.event).toEqual(admitted.terminal.event);
      for (const kind of ['root', 'operation'] as const) {
        const operation = kind === 'root' ? reconciled.root.guard : reconciled.operation.operation;
        expect(operation.state).toBe('acknowledged');
        expect(reconciled.acknowledgements[kind]!.source).toMatchObject({ operation: 'operation.acknowledge',
          attemptId: operation.acknowledgementAttemptId, input: { operationId: operation.id } });
        expect(reconciled.acknowledgements[kind]!.receipt.attemptId).toBe(operation.acknowledgementAttemptId);
      }
      stages.replay = await replay(page, actions);
      expect((await effects()).head).toEqual(final.head);
      expect(await serviceProof()).toEqual(counters); expect(counters.paidProviderCalls).toBe(0);
      expect(wire.sent).toEqual(sent); expect(corpusActions(wire)).toEqual(actions);
      expect(wire.sent.filter(frame => frame.type === 'start.durable')).toHaveLength(1);
      if (cut === 'interaction progress') assertSingleProgressDelivery(wire.http, admitted.terminal.previous!);
      stages.counters = counters;
    } finally {
      await info.attach('corpus-delivery-proof.json', { body: JSON.stringify({ ...stages, fault: lost ?? await fault(page).catch(String),
        final: await effects().catch(String), sent: wire.sent, received: wire.received, http: wire.http, responses: wire.responses,
        counters: await serviceProof(), alerts: await page.getByRole('alert').allTextContents().catch(String) }, null, 2), contentType: 'application/json' });
    }
  });
}
