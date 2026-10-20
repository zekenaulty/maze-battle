import { matchesQuestItem } from '../../src/domain/quests/questItems';
import type { GameSession } from '../../src/services/game/GameSession';
import { test, expect, serviceProof } from './canonical-start-service.decision.test';
import { attachCorpusApp, corpusActions, corpusEffects, reachChestBoundary, startCorpus } from './canonical-start-service.corpus-recovery.steps';

test.use({ freshCorpus: true });

for (const variant of ['A', 'B'] as const) for (const collected of [false, true]) {
  test(`${variant}: cold corpus quota and reload ${collected ? 'after' : 'before'} collection preserve effects during funded recovery`, async ({ page, wire }, info) => {
    test.setTimeout(240_000);
    const { setup } = await startCorpus(page, variant);
    const effects = () => corpusEffects(page, setup.target);
    try {
      const original = await reachChestBoundary(page, wire, collected), before = await effects();
      const custody = () => page.evaluate(async action => {
        // @ts-expect-error Test-only exact retained source audit, never planner input.
        const { corpusCustody }: typeof import('./canonical-start-service.corpus-recovery.evidence') = await import('/tests/e2e/canonical-start-service.corpus-recovery.evidence.ts');
        return corpusCustody(action);
      }, original);
      const admitted = await custody();
      const counters = await serviceProof(), actions = corpusActions(wire), sent = wire.sent.length;
      expect(before.chest.chest.opened).toBe(collected);
      expect(before.checkpoint.position).toEqual(setup.target.at);
      expect(before.inventory.items.filter(item => matchesQuestItem(item, before.quest.quest))).toHaveLength(collected ? 1 : 0);
      expect(before.stash.items.filter(item => matchesQuestItem(item, before.quest.quest))).toEqual([]);
      expect(actions.filter(a => a.capabilityId === 'maze.interact')).toHaveLength(collected ? 1 : 0);
      expect(wire.sent.filter(frame => frame.type === 'action.result').every(frame => !frame.payload.completion)).toBe(true);
      const quota = await page.evaluate(() => window.canonicalStartService.fillQuota());
      expect(quota.refusal).toContain('Manual control is unavailable during Agentic Play');
      expect(quota.head.quota.limitBytes).toBe(quota.head.quota.usedBytes + quota.head.quota.reserveBytes + quota.head.quota.reservedBytes);
      await page.reload();
      await expect(page.getByRole('region', { name: 'Game recovery', exact: true }).getByRole('status'))
        .toContainText('storage quota exhausted');
      await attachCorpusApp(page);
      const capacity = await page.evaluate(() => {
        const session = Reflect.get(globalThis, '__canonicalStartAppSession') as GameSession;
        return { refusal: session.view.status, view: session.view };
      });
      expect(capacity.refusal).toMatch(/capacity|quota|limit/i); expect(capacity.view.recoveryRequired).toBe(true);
      expect(capacity.view.controlled).toBe(false); expect(capacity.view.busy).toBe(false);
      const reloaded = await effects();
      const domain = (state: Awaited<ReturnType<typeof effects>>) => ({ checkpoint: state.checkpoint,
        gameId: state.head.gameId, generation: state.head.generation,
        inventory: state.inventory, stash: state.stash, quest: state.quest, chest: state.chest,
        world: state.head.roots.world, knowledge: state.head.roots.knowledge });
      expect(domain(reloaded)).toEqual(domain(before));
      expect(await serviceProof()).toEqual(counters);
      expect(corpusActions(wire)).toEqual(actions); expect(wire.sent.slice(sent)).toEqual([]);

      await page.getByRole('button', { name: 'Agentica recovery', exact: true }).click();
      const recovery = page.getByRole('dialog', { name: 'Agentica recovery', exact: true });
      const kind = collected ? 'interaction' : 'navigation';
      await recovery.getByRole('button', { name: 'Inspect original 1', exact: true }).click();
      await expect(page.getByRole('region', { name: 'Original action inspection' })).toContainText(original.actionId);
      await expect(recovery.getByRole('button', { name: `Stop ${kind}`, exact: true })).toBeEnabled();
      await recovery.getByRole('button', { name: `Stop ${kind}`, exact: true }).click();
      await expect(recovery.getByRole('status').filter({ hasText: 'Navigation stopped' })).toBeVisible();
      await recovery.getByRole('button', { name: 'Stop Agentic session', exact: true }).click();
      await expect(recovery.getByRole('status').filter({ hasText: 'Local Stop recorded; service Stop is pending.' })).toBeVisible();
      const stopped = await effects();
      expect((await custody()).root.guard).toMatchObject({ state: 'settled', terminal: { disposition: 'cancelled' } });
      for (let attempt = 0; attempt < 3 && (await effects()).head.allocations[admitted.operation.operation.id]; attempt++) {
        await recovery.getByRole('button', { name: 'Inspect original 1', exact: true }).click();
        await expect(page.getByRole('region', { name: 'Original action inspection' })).toContainText(original.actionId);
        await recovery.getByRole('button', { name: `Reconcile ${kind}`, exact: true }).click();
        await expect(recovery.getByRole('status').filter({ hasText: /prefix delivered|acknowledged/i })).toBeVisible();
        await expect(recovery.getByRole('alert')).toHaveCount(0);
      }
      expect((await effects()).head.allocations).not.toHaveProperty(admitted.operation.operation.id);
      await recovery.getByRole('button', { name: 'Stop Agentic session', exact: true }).click();
      await expect(recovery.getByRole('status').filter({ hasText: 'Root Stop acknowledged' })).toBeVisible();
      const final = await effects();
      const reconciled = await custody();
      for (const state of [reloaded, stopped, final]) {
        expect(state.head.quota.limitBytes).toBe(quota.head.quota.limitBytes);
        expect(state.head.quota.reserveBytes).toBe(quota.head.quota.reserveBytes);
      }
      expect(reconciled.original).toEqual(admitted.original); expect(reconciled.binding).toEqual(admitted.binding);
      expect(reconciled.operation.progress).toEqual(admitted.operation.progress);
      expect(reconciled.terminal.event).toEqual(admitted.terminal.event);
      expect(reconciled.operation.operation).toMatchObject({ id: admitted.operation.operation.id, state: 'acknowledged',
        admissionAttemptId: admitted.operation.operation.admissionAttemptId, terminal: admitted.operation.operation.terminal });
      expect(reconciled.root.guard).toMatchObject({ id: admitted.root.guard.id, state: 'acknowledged',
        admissionAttemptId: admitted.root.guard.admissionAttemptId });
      expect(reconciled.acknowledgements.operation!.source).toMatchObject({ operation: 'operation.acknowledge',
        attemptId: reconciled.operation.operation.acknowledgementAttemptId,
        input: { operationId: admitted.operation.operation.id } });
      expect(reconciled.acknowledgements.root!.source).toMatchObject({ operation: 'operation.acknowledge',
        attemptId: reconciled.root.guard.acknowledgementAttemptId, input: { operationId: admitted.root.guard.id } });
      expect(reconciled.acknowledgements.operation!.receipt.attemptId).toBe(reconciled.operation.operation.acknowledgementAttemptId);
      expect(reconciled.acknowledgements.root!.receipt.attemptId).toBe(reconciled.root.guard.acknowledgementAttemptId);
      expect(Object.keys(reloaded.head.allocations).sort()).toEqual([admitted.root.guard.id, admitted.operation.operation.id].sort());
      expect(final.head.allocations).toEqual({});
      expect(final.head.quota).toMatchObject({ reservations: 0, reservedBytes: 0 });
      expect(domain(final)).toEqual(domain(before));
      expect(await serviceProof()).toEqual(counters);
      expect(wire.sent.slice(sent)).toEqual([]);
      expect(corpusActions(wire)).toEqual(actions);
      expect(counters.paidProviderCalls).toBe(0);
      await info.attach('corpus-quota-recovery.json', { body: JSON.stringify({ variant, collected, setup, original, before,
        quota, capacity, reloaded, stopped, final, admitted, reconciled, counters, sent: wire.sent, received: wire.received, http: wire.http,
        responses: wire.responses }, null, 2), contentType: 'application/json' });
    } finally {
      await info.attach('corpus-quota-final-state.json', { body: JSON.stringify({ variant, collected, state: await effects().catch(String),
        snapshot: await page.evaluate(() => window.canonicalStartService.snapshot()).catch(String), counters: await serviceProof(),
        sent: wire.sent, received: wire.received, http: wire.http, responses: wire.responses,
        alerts: await page.getByRole('alert').allTextContents().catch(String) }, null, 2), contentType: 'application/json' });
    }
  });
}
