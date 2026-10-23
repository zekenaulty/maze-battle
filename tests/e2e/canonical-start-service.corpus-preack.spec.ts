import { test, expect, serviceProof } from './canonical-start-service.decision.test';
import { corpusActions, corpusEffects } from './canonical-start-service.corpus-recovery.steps';
import { arm, evidence, fault, reloadJourney, selectedJourney, snapshot, startPreackJourney } from './canonical-start-service.corpus-preack.steps';
import type { AgenticaOperationEntry } from '../../src/services/agentica/sdk/agentica-host.mjs';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

test.use({ freshCorpus: true });
for (const cut of ['progress', 'transfer'] as const) test(`actual App preack recovery: ${cut}`, async ({ page, wire }, info) => {
  test.setTimeout(240_000);
  const setup = await startPreackJourney(page, cut), action = await selectedJourney(page, wire);
  const history: unknown[] = [];
  let lost: Awaited<ReturnType<typeof fault>>;
  const effects = () => corpusEffects(page, setup.setup.target);
  const content = (state: Awaited<ReturnType<typeof effects>>) => ({ chest: state.chest, quest: state.quest,
    inventory: state.inventory, stash: state.stash, questItems: state.questItems });
  try {
    if (cut === 'progress') {
      await arm(page, 'progress', action.actionId);
      await expect.poll(async () => (await fault(page))?.held).toBe(true);
    } else {
      await page.evaluate(id => Reflect.set(globalThis, '__activeJourneyAction', id), action.actionId);
      await page.waitForFunction(() => !!Reflect.get(globalThis, '__activeJourneyPaused'));
    }
    const before = await evidence(page, action), stopped = await snapshot(page), beforeEffects = await effects();
    const counters = await serviceProof(), sent = structuredClone(wire.sent), actions = structuredClone(corpusActions(wire));
    history.push({ stage: 'first-cut', before, stopped, beforeEffects, counters, fault: await fault(page) });
    if (before.operation.kind !== 'navigation') throw Error('Expected selected navigation.');
    expect(before.operation.progress).toMatchObject({ status: 'running', steps: 1, sequence: 1 });
    expect(before.operation.progress.binding.limits).toEqual({ steps: 64, replans: 4, durationMs: 120_000 });
    expect(before.operation.progress.position).not.toEqual(before.operation.progress.binding.target);
    expect(before.operation.custodyAck).toBeTruthy(); expect(before.terminal).toBeNull(); expect(before.intent).toBeNull();
    expect(Boolean(before.operation.acknowledgement)).toBe(cut === 'transfer');
    expect(counters.paidProviderCalls).toBe(0);
    expect(Buffer.byteLength(JSON.stringify(before.root.binding.start))).toBeLessThanOrEqual(3584);
    expect(sent.filter(frame => frame.type === 'start.durable')).toHaveLength(1);
    if (cut === 'progress') {
      const held = await fault(page); expect(held!.request!.body).toEqual(before.operation.event!.data.event);
      expect(wire.http.some(row => (row.body as { eventId?: string })?.eventId === held!.request!.body.eventId)).toBe(false);
    }
    expect(beforeEffects.chest.chest.opened).toBe(false); expect(beforeEffects.questItems).toEqual([]);
    let recovery = await reloadJourney(page);
    const reloaded = await snapshot(page);
    expect(reloaded.head.owner).not.toBe(stopped.head.owner); expect(reloaded.head.epoch).toBeGreaterThan(stopped.head.epoch);
    expect(reloaded.head.checkpoint).toEqual(stopped.head.checkpoint); expect(reloaded.head.roots).toEqual(stopped.head.roots);
    expect(reloaded.launch).toEqual(stopped.launch); expect(content(await effects())).toEqual(content(beforeEffects));
    expect(wire.sent).toEqual(sent); expect(await serviceProof()).toEqual(counters);
    const inspect = async () => {
      const prior = await snapshot(page), http = wire.http.length;
      await recovery.getByRole('button', { name: 'Inspect original 1', exact: true }).click();
      await expect(recovery.getByText(action.actionId, { exact: true })).toBeVisible();
      await expect(recovery.getByRole('button', { name: 'Resume navigation', exact: true })).toBeEnabled();
      expect(await snapshot(page)).toEqual(prior); expect(wire.http).toHaveLength(http);
      expect(wire.sent).toEqual(sent); expect(await serviceProof()).toEqual(counters);
    };
    await inspect();
    if (cut === 'transfer') {
      await arm(page, 'transfer', action.actionId);
      await recovery.getByRole('button', { name: 'Resume navigation', exact: true }).click();
      await expect.poll(async () => (await fault(page))?.held).toBe(true);
      lost = await fault(page);
      const transferring = await evidence(page, action), transferSnapshot = await snapshot(page);
      history.push({ stage: 'accepted-transfer-lost', lost, transferring, transferSnapshot });
      expect(lost?.accepted?.status).toBe(200); expect(lost?.request?.body).toEqual(transferring.intent!.data.event);
      const acceptedEvent = (lost!.accepted!.body as AgenticaOperationEntry).latestEvent!, expectedEvent = transferring.intent!.data.event;
      // .NET serializes UTC as +00:00 rather than Z. No gameplay/source field is normalized; raw replies remain retained.
      expect(Date.parse(acceptedEvent.observation.observedAt)).toBe(Date.parse(expectedEvent.observation.observedAt));
      expect(acceptedEvent).toMatchObject({ ...expectedEvent,
        observation: { ...expectedEvent.observation, observedAt: acceptedEvent.observation.observedAt } });
      expect(transferring.ack).toBeNull(); expect(transferring.authority).toBeNull();
      expect(transferring.operation.progress).toEqual(before.operation.progress);
      recovery = await reloadJourney(page);
      const secondReload = await snapshot(page);
      expect(secondReload.head.epoch).toBeGreaterThan(transferSnapshot.head.epoch);
      expect(secondReload.head.checkpoint).toEqual(transferSnapshot.head.checkpoint);
      expect(secondReload.head.roots).toEqual(transferSnapshot.head.roots);
      expect(await evidence(page, action)).toEqual(transferring);
      await inspect();
    }
    await recovery.getByRole('button', { name: 'Resume navigation', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: 'Agentic play', exact: true });
    await expect(dialog.getByRole('status').filter({ hasText: /^decision$/ })).toBeVisible({ timeout: 60_000 });
    await expect(dialog.getByRole('alert')).toHaveCount(0);
    const arrived = await evidence(page, action), arrivedEffects = await effects();
    history.push({ stage: 'arrived', arrived, arrivedEffects });
    if (arrived.operation.kind !== 'navigation') throw Error('Expected same navigation.');
    expect(arrived.original).toEqual(before.original); expect(arrived.binding).toEqual(before.binding);
    expect(arrived.operation.operation.id).toBe(before.operation.operation.id);
    expect(arrived.operation.confirmation).toEqual(before.operation.confirmation);
    for (const field of ['binding', 'startedAt', 'deadline'] as const) expect(arrived.operation.progress[field]).toEqual(before.operation.progress[field]);
    expect(arrived.operation.progress).toMatchObject({ status: 'arrived', steps: 22, replans: 2 });
    expect(arrivedEffects.checkpoint.position).toEqual(before.operation.progress.binding.target);
    expect(content(arrivedEffects)).toEqual(content(beforeEffects));
    expect(arrived.root.binding).toEqual(before.root.binding); expect(arrived.root.grant).toEqual(before.root.grant); expect(arrived.root.run).toEqual(before.root.run);
    expect(arrived.intent!.data.event.usage).toEqual({ steps: 1, replans: 0 });
    expect(arrived.ack!.data.entry.usage).toEqual(before.operation.confirmation.data.entry.usage);
    expect(wire.sent).toEqual(sent); expect(corpusActions(wire)).toEqual(actions); expect(await serviceProof()).toEqual(counters);
    const posts = wire.http.filter(r => r.method === 'POST' && r.url.endsWith('/api/operations/events')).map(r => r.body as { actionId: string; kind: string; sequence: number });
    const originalProgress = before.operation.event!.data.event;
    expect(posts.filter(p => p.actionId === action.actionId && p.kind === 'progress' && p.sequence === originalProgress.sequence)).toEqual([originalProgress]);
    const transfers = wire.http.filter(row => row.method === 'POST' && row.url.endsWith('/api/operations/events')
      && (row.body as { actionId?: string; kind?: string })?.actionId === action.actionId && (row.body as { kind: string }).kind === 'transfer');
    expect(transfers.map(row => row.body)).toEqual(cut === 'transfer'
      ? [lost!.request!.body, lost!.request!.body, arrived.intent!.data.event] : [arrived.intent!.data.event]);
    if (lost) {
      expect(transfers.slice(0, 2).map(row => row.serializedBody)).toEqual([lost.request!.serializedBody, lost.request!.serializedBody]);
      const replies = wire.responses.filter(row => row.method === 'POST' && row.url.endsWith('/api/operations/events')
        && (row.body as AgenticaOperationEntry).latestEvent?.eventId === lost!.request!.body.eventId);
      expect(replies.map(row => row.body)).toEqual([lost.accepted!.body, lost.accepted!.body]);
      expect(arrived.intent!.data.previous).toEqual(lost.request!.body);
    }
    const beforeReplay = await snapshot(page);
    const replay = await page.evaluate(async action => {
      // @ts-expect-error Original retained hooks only; fresh submissions are forbidden by the helper.
      const { journeyReplay }: typeof import('./canonical-start-service.room-journey-evidence') = await import('/tests/e2e/canonical-start-service.room-journey-evidence.ts');
      return journeyReplay([action]);
    }, action);
    expect(replay[0].retry.submissions).toBe(0);
    expect(replay[0].original.original).toEqual(before.original.original);
    expect(replay[0].retry.results[0].actionResult).toEqual(replay[0].original.result);
    expect(replay[0].retry.results[0].reconciled).toEqual(replay[0].original.result);
    expect(await snapshot(page)).toEqual(beforeReplay); expect(await serviceProof()).toEqual(counters);
    await dialog.getByRole('button', { name: 'Stop Agentic play', exact: true }).click();
    await expect(dialog.getByRole('status').filter({ hasText: /^stopped$/ })).toBeVisible();
    await dialog.getByRole('button', { name: 'Recovery', exact: true }).click();
    recovery = page.getByRole('dialog', { name: 'Agentica recovery', exact: true });
    await recovery.getByRole('button', { name: 'Stop Agentic session', exact: true }).click();
    await expect(recovery.getByRole('status').filter({ hasText: 'Local Stop recorded; service Stop is pending.' })).toBeVisible();
    for (let attempt = 0; attempt < 3 && (await snapshot(page)).head.allocations[arrived.operation.operation.id]; attempt++) {
      await recovery.getByRole('button', { name: 'Inspect original 1', exact: true }).click();
      await expect(recovery.getByText(action.actionId, { exact: true })).toBeVisible();
      await recovery.getByRole('button', { name: 'Reconcile navigation', exact: true }).click();
      await expect(recovery.getByRole('status').filter({ hasText: /prefix delivered|acknowledged/i })).toBeVisible();
      await expect(recovery.getByRole('alert')).toHaveCount(0);
    }
    expect((await snapshot(page)).head.allocations).not.toHaveProperty(arrived.operation.operation.id);
    await recovery.getByRole('button', { name: 'Stop Agentic session', exact: true }).click();
    await expect(recovery.getByRole('status').filter({ hasText: 'Root Stop acknowledged' })).toBeVisible();
    const settled = await snapshot(page);
    expect(settled.head.allocations).toEqual({}); expect(settled.head.quota.reservations).toBe(0);
    expect(settled.head.checkpoint).toEqual(arrivedEffects.head.checkpoint);
    expect(settled.head.roots.world).toEqual(arrivedEffects.head.roots.world);
    expect(settled.head.roots.knowledge).toEqual(arrivedEffects.head.roots.knowledge);
    expect(content(await effects())).toEqual(content(beforeEffects)); expect(await serviceProof()).toEqual(counters);
    const settledCustody = await evidence(page, action);
    expect(settledCustody.operation.operation.state).toBe('acknowledged'); expect(settledCustody.root.guard.state).toBe('acknowledged');
    expect(settledCustody.acknowledgements.operation).toBeTruthy(); expect(settledCustody.acknowledgements.root).toBeTruthy();
    expect(wire.sent).toEqual(sent); expect(corpusActions(wire)).toEqual(actions);
    history.push({ stage: 'settled', settled, custody: settledCustody, replay });
  } finally {
    const hashes = Object.fromEntries(['playActiveNavigation', 'playController', 'playNavigation', 'operationDriver', 'operationTransfer', 'navigationRecovery']
      .map(name => [`src/services/agentica/game/${name}.ts`, createHash('sha256').update(readFileSync(`src/services/agentica/game/${name}.ts`)).digest('hex')]));
    await info.attach('preack-proof.json', { body: JSON.stringify({ cut, setup, action, history,
      current: await snapshot(page).catch(String), custody: await evidence(page, action).catch(String), fault: await fault(page).catch(String),
      counters: await serviceProof(), sent: wire.sent, received: wire.received, http: wire.http, responses: wire.responses,
      hashes, alerts: await page.getByRole('alert').allTextContents() }, null, 2), contentType: 'application/json' });
  }
});
