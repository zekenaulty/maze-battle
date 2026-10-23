import { test, expect, serviceProof } from './canonical-start-service.decision.test';
import { corpusActions, corpusEffects, reachChestBoundary, startCorpus } from './canonical-start-service.corpus-recovery.steps';
import { custody, domain, onePackItem, reloadRecovery, replay, results } from './canonical-start-service.corpus-delivery.steps';
import { assertSingleProgressDelivery } from './canonical-start-service.corpus-delivery.checks';
import type { PreacceptanceFault } from './canonical-start-service.corpus-preacceptance.fault';
import type { AgenticaMessage } from '../../src/services/agentica/sdk/agentica-host.mjs';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

test.use({ freshCorpus: true });

for (const cut of ['progress', 'completion'] as const) {
  const invariant = cut === 'progress' ? 'undispatched committed interaction progress survives reload'
    : 'unaccepted committed completion survives reload without assuming remote success';
  test(`actual App corpus preacceptance: ${invariant}`, async ({ page, wire }, info) => {
    test.setTimeout(300_000);
    const { setup, dialog } = await startCorpus(page, 'A'), stages: Record<string, unknown> = { setup, cut, invariant };
    const effects = () => corpusEffects(page, setup.target);
    const fault = () => page.evaluate(async () => {
      // @ts-expect-error Test-only output; never planner input.
      const { preacceptanceFault }: typeof import('./canonical-start-service.corpus-preacceptance.fault') = await import('/tests/e2e/canonical-start-service.corpus-preacceptance.fault.ts');
      return preacceptanceFault();
    });
    let held: PreacceptanceFault | undefined;
    try {
      const interaction = await reachChestBoundary(page, wire, true);
      const applied = await effects(), admitted = await custody(page, interaction);
      stages.applied = applied; stages.admitted = admitted;
      onePackItem(applied);
      expect(applied.checkpoint.position).toEqual(setup.target.at);
      expect(admitted.operation.operation.state).toBe('settled');
      expect(admitted.terminal.event.sequence).toBe(3);
      expect(admitted.terminal.previous!.sequence).toBe(2);
      await page.evaluate(async ({ cut, actionId }) => {
        // @ts-expect-error The transport cut is installed only after the real collection commit.
        const faults: typeof import('./canonical-start-service.corpus-preacceptance.fault') = await import('/tests/e2e/canonical-start-service.corpus-preacceptance.fault.ts');
        if (cut === 'progress') faults.holdProgressBeforeDispatch(actionId);
        else faults.holdCompletionBeforeDispatch();
      }, { cut, actionId: interaction.actionId });

      const wakes = wire.sent.filter(frame => frame.type === 'operation.wake').length;
      if (cut === 'progress') {
        await dialog.getByRole('button', { name: 'Continue', exact: true }).click();
      } else {
        for (let window = 0; window < 3; window++) {
          await expect(dialog.getByRole('status').filter({ hasText: /^(decision|satisfied)$/ })).toBeVisible({ timeout: 60_000 });
          if (await dialog.getByRole('status').filter({ hasText: /^satisfied$/ }).count()) break;
          const count = corpusActions(wire).length;
          await dialog.getByRole('button', { name: 'Continue', exact: true }).click();
          await expect.poll(() => corpusActions(wire).length).toBeGreaterThan(count);
        }
        await expect(dialog.getByRole('status').filter({ hasText: /^satisfied$/ })).toBeVisible({ timeout: 60_000 });
        await expect(dialog.getByRole('button', { name: 'Continue', exact: true })).toBeDisabled();
        await expect(dialog).not.toContainText('Agentica outcome received');
      }
      await expect.poll(async () => (await fault())?.attempts.length).toBe(1);
      held = await fault(); stages.fault = held;
      const actions = corpusActions(wire), finalAction = actions.at(-1)!;
      const before = await effects(), retained = await results(page, actions);
      stages.before = before; stages.retained = retained;
      onePackItem(before);
      expect(actions.filter(action => action.capabilityId === 'maze.interact')).toEqual([interaction]);
      for (const field of ['inventory', 'stash', 'quest', 'chest'] as const) expect(before[field]).toEqual(applied[field]);
      expect(JSON.parse(held!.attempts[0].serialized)).toEqual(held!.attempts[0].payload);
      if (cut === 'progress') {
        expect(held!.attempts[0].payload).toEqual(admitted.terminal.previous);
        const dispatched = wire.http.filter(row => row.method === 'POST' && row.url.endsWith('/api/operations/events')
          && (row.body as { actionId?: string })?.actionId === interaction.actionId);
        expect(dispatched).toHaveLength(1);
        expect(dispatched[0].body).toEqual(admitted.terminal.predecessor);
        expect(admitted.terminal.predecessor!.sequence).toBe(1);
        expect(wire.sent.filter(frame => frame.type === 'operation.wake')).toHaveLength(wakes);
      } else {
        const completion = held!.attempts[0].payload as AgenticaMessage;
        expect(finalAction.arguments).toEqual({ scope: 'objective' });
        expect(completion).toMatchObject({ type: 'action.result', runId: finalAction.runId,
          payload: { actionId: finalAction.actionId, disposition: 'applied',
            completion: { evidenceId: completion.payload.evidenceId },
            observation: { data: { scope: 'objective', status: 'satisfied', carried: 1, atReturn: true } } } });
        expect(retained.at(-1)!.result).toEqual(completion.payload);
        expect(retained.at(-1)!.source.objective).toMatchObject({ evidence: { quest: { packCount: 1, stashCount: 0 } } });
        expect(retained.at(-1)!.source.objective!.evidence.arrival).not.toBeNull();
        expect(before.checkpoint.position).toEqual(setup.position);
        expect(wire.sent.filter(frame => frame.type === 'action.result' && frame.payload.actionId === finalAction.actionId)).toEqual([]);
        expect(wire.received.filter(({ frame }) => frame.runId === finalAction.runId
          && (frame.type === 'outcome' || frame.type === 'action.accepted'))).toEqual([]);
      }
      const counters = await serviceProof(), sent = structuredClone(wire.sent);
      held = await fault(); expect(held!.attempts).toHaveLength(1); stages.fault = held;
      const recovery = await reloadRecovery(page, wire);
      stages.reloaded = await effects();
      expect(domain(await effects())).toEqual(domain(before));
      expect(await results(page, actions)).toEqual(retained);
      const http = wire.http.length;
      if (cut === 'progress') {
        await recovery.getByRole('button', { name: 'Inspect original 1', exact: true }).click();
        await expect(page.getByRole('region', { name: 'Original action inspection' })).toContainText(interaction.actionId);
      } else await recovery.getByRole('button', { name: 'Refresh local records', exact: true }).click();
      expect(wire.http).toHaveLength(http); expect(wire.sent).toEqual(sent);
      expect(domain(await effects())).toEqual(domain(before));
      if (cut === 'progress') {
        await expect(recovery.getByRole('button', { name: /Resume|Adopt/ })).toHaveCount(0);
        await recovery.getByRole('button', { name: 'Stop interaction', exact: true }).click();
        await expect(recovery.getByRole('status').filter({ hasText: 'Navigation stopped' })).toBeVisible();
        await recovery.getByRole('button', { name: 'Stop Agentic session', exact: true }).click();
        await expect(recovery.getByRole('status').filter({ hasText: 'Local Stop recorded; service Stop is pending.' })).toBeVisible();
        await recovery.getByRole('button', { name: 'Inspect original 1', exact: true }).click();
        await recovery.getByRole('button', { name: 'Reconcile interaction', exact: true }).click();
        await expect(recovery.getByRole('status').filter({ hasText: 'Navigation terminal prefix delivered through sequence 2.' })).toBeVisible();
        await recovery.getByRole('button', { name: 'Inspect original 1', exact: true }).click();
        await recovery.getByRole('button', { name: 'Reconcile interaction', exact: true }).click();
        await expect(recovery.getByRole('status').filter({ hasText: /acknowledged/i })).toBeVisible();
      } else {
        await recovery.getByRole('button', { name: 'Check service', exact: true }).click();
        await expect(recovery.getByRole('status').filter({ hasText: /Original root is (retained|settled)/ })).toBeVisible();
        await recovery.getByRole('button', { name: 'Stop Agentic session', exact: true }).click();
        await expect(recovery.getByRole('status').filter({ hasText: 'Local Stop recorded; service Stop is pending.' })).toBeVisible();
        await recovery.getByRole('button', { name: 'Inspect original 1', exact: true }).click();
        await recovery.getByRole('button', { name: 'Check action custody', exact: true }).click();
        await recovery.getByRole('button', { name: `Inspect action ${finalAction.actionId}`, exact: true }).click();
        await expect(recovery.getByRole('region', { name: 'Selected pending action' })).toContainText(finalAction.actionId);
        expect(domain(await effects())).toEqual(domain(before));
        await recovery.getByRole('button', { name: 'Reconcile pending action', exact: true }).click();
        await expect.poll(() => wire.responses.filter(row => row.method === 'POST' && new URL(row.url).pathname === '/api/recovery')
          .map(row => row.status)).toEqual([200]);
        const posts = wire.http.filter(row => row.method === 'POST' && new URL(row.url).pathname === '/api/recovery');
        expect(posts).toHaveLength(1);
        expect(posts[0].body).toEqual({ hostId: 'maze-battle', sessionId: finalAction.sessionId, result: retained.at(-1)!.result });
        await expect(recovery.getByRole('status').filter({ hasText: 'Action reconciled with retained completion.' })).toBeVisible();
      }
      await recovery.getByRole('button', { name: 'Stop Agentic session', exact: true }).click();
      await expect(recovery.getByRole('status').filter({ hasText: 'Root Stop acknowledged' })).toBeVisible();
      await expect(recovery.getByRole('alert')).toHaveCount(0);
      await expect.poll(() => (wire.responses.filter(row => row.method === 'POST' && new URL(row.url).pathname === '/api/starts/stop')
        .at(-1)?.body as { terminal?: { reason?: string } })?.terminal?.reason).toMatch(/^(stopped|interrupted)$/);
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
      if (cut === 'progress') {
        const ack = reconciled.acknowledgements.operation!;
        const { witness: beforeWitness, ...beforeGuard } = admitted.operation.operation;
        const { witness: afterWitness, ...afterGuard } = reconciled.operation.operation;
        expect(JSON.parse(beforeWitness)).toEqual(beforeGuard);
        expect(afterGuard).toEqual({ ...beforeGuard, owner: final.head.owner, epoch: final.head.epoch,
          revision: ack.receipt.afterRevision, state: 'acknowledged', acknowledgementAttemptId: ack.receipt.attemptId });
        expect(JSON.parse(afterWitness)).toEqual(afterGuard);
      }
      // Only this live guard changes on the progress cut; historical sources and every other operation stay exact.
      const afterAcknowledgement = retained.map(row => cut === 'progress' && row.action.actionId === interaction.actionId
        ? { ...row, operation: { ...row.operation!, operation: reconciled.operation.operation } } : row);
      stages.replay = await replay(page, actions);
      expect((await effects()).head).toEqual(final.head); expect(await results(page, actions)).toEqual(afterAcknowledgement);
      expect(await serviceProof()).toEqual(counters); expect(counters.paidProviderCalls).toBe(0);
      expect(wire.sent).toEqual(sent); expect(corpusActions(wire)).toEqual(actions);
      expect(wire.sent.filter(frame => frame.type === 'start.durable')).toHaveLength(1);
      if (cut === 'progress') assertSingleProgressDelivery(wire.http, admitted.terminal.previous!);
      stages.counters = counters;
    } finally {
      await info.attach('corpus-preacceptance-proof.json', { body: JSON.stringify({ ...stages,
        completionProofSha256: createHash('sha256').update(readFileSync('src/persistence/canonical/agentica/completion-recovery.proof.ts')).digest('hex'),
        fault: held ?? await fault().catch(String), final: await effects().catch(String),
        sent: wire.sent, received: wire.received, http: wire.http, responses: wire.responses,
        counters: await serviceProof(), alerts: await page.getByRole('alert').allTextContents().catch(String) }, null, 2), contentType: 'application/json' });
    }
  });
}
