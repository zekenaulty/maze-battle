import { test, expect, type Page } from '@playwright/test';
import { attach, audit, isolated, ready, state } from './canonical-generated-endurance.support';
import { transferPeer } from './canonical-generated-endurance.transfer-peer';
import type { AgenticaAction } from '../../src/services/agentica/contracts';

const proof = (page: Page, action: AgenticaAction) => page.evaluate(async action =>
  (await import('../../tests/e2e/canonical-generated-endurance.transfer')).proof(action), action);

test('generated seed 781: explicit second-tab takeover resumes original active navigation through verified offline transfer', async ({ page, context }, info) => {
  test.setTimeout(60_000);
  const evidence: Record<string, unknown> = { seed: 781, custody: 'offline HTTP peer; actual App takeover and inspected Resume; no service or provider' };
  let other: Page | undefined, release = () => {};
  try {
    const boot = await isolated(context, page, 781); evidence.boot = boot;
    const sockets: string[] = []; evidence.sockets = sockets;
    await context.routeWebSocket('**/*', socket => {
      if (socket.url().startsWith('ws://127.0.0.1:5474/')) socket.connectToServer();
      else { sockets.push(socket.url()); socket.close(); }
    });
    const initial = await state(page);
    const admitted = await page.evaluate(async () => (await import('../../tests/e2e/canonical-generated-endurance.agent')).begin());
    evidence.admitted = admitted;
    expect(admitted.funded.start.limits).toEqual({ maxSteps: 4, maxRefinements: 1, maxPlanContinuations: 1, timeoutSeconds: 60, actionTimeoutSeconds: 10 });
    const remote = await transferPeer(context, admitted.entry); release = remote.release;
    evidence.attempts = remote.attempts; evidence.reads = remote.reads; evidence.peerErrors = remote.errors;
    await page.evaluate(async () => (await import('../../tests/e2e/canonical-generated-endurance.agent')).attach());
    const pulse = () => page.evaluate(async () => (await import('../../tests/e2e/canonical-generated-endurance.agent')).pulse());
    for (const expected of ['confirmed', 'custody-confirmed', 'advanced', 'acknowledged']) expect((await pulse()).status).toBe(expected);
    const before = await proof(page, admitted.action), head = await audit(page); evidence.before = before; evidence.headBefore = head;
    if (before.operation.kind !== 'navigation') throw Error('Expected navigation');
    expect(before.operation.progress.steps).toBe(1); expect(before.operation.progress.status).toBe('running');
    expect(before.operation.acknowledgement).toBeTruthy(); expect(before.terminal).toBeNull(); expect(before.intent).toBeNull();
    const deliveries = remote.attempts.length, reads = remote.reads.length;
    other = await context.newPage(); const errors: string[] = []; other.on('pageerror', error => errors.push(error.message)); evidence.otherErrors = errors;
    await other.goto('/'); await ready(other, false);
    await other.getByRole('button', { name: 'Take control', exact: true }).click(); await ready(other);
    const taken = await audit(other); evidence.taken = taken;
    expect(taken.head.owner).not.toBe(head.head.owner); expect(taken.head.epoch).toBeGreaterThan(head.head.epoch);
    expect(taken.head.roots).toEqual(head.head.roots); expect(taken.head.checkpoint).toEqual(head.head.checkpoint);
    expect((await proof(other, admitted.action)).operation).toEqual(before.operation); expect(remote.attempts).toHaveLength(deliveries);
    await expect(page.getByRole('button', { name: 'Take control', exact: true })).toBeVisible();
    await expect(pulse()).rejects.toThrow();
    expect((await audit(other)).head).toEqual(taken.head); expect(remote.attempts).toHaveLength(deliveries);
    await other.getByRole('button', { name: 'Agentic play', exact: true }).click();
    const recovery = other.getByRole('dialog', { name: 'Agentica recovery', exact: true });
    await recovery.getByRole('button', { name: 'Inspect original 1', exact: true }).click();
    await expect(recovery.getByRole('button', { name: 'Resume navigation', exact: true })).toBeEnabled();
    expect((await audit(other)).head).toEqual(taken.head); expect(remote.attempts).toHaveLength(deliveries); expect(remote.reads).toHaveLength(reads);
    await recovery.getByRole('button', { name: 'Resume navigation', exact: true }).click();
    await expect.poll(remote.held).toBe(true);
    const held = await proof(other, admitted.action); evidence.held = held;
    expect(held.intent).toBeTruthy(); expect(held.ack).toBeNull(); expect(held.authority).toBeNull(); expect(held.adoptions).toBeNull();
    expect(held.operation.progress).toEqual(before.operation.progress);
    expect(held.operation.operation).toEqual(before.operation.operation); expect(held.root.guard).toEqual(before.root.guard);
    remote.release();
    const dialog = other.getByRole('dialog', { name: 'Agentic play', exact: true });
    await expect(dialog.getByRole('status').filter({ hasText: /^decision$/ })).toBeVisible({ timeout: 15_000 });
    await expect(dialog.getByRole('alert')).toHaveCount(0);
    const arrived = await proof(other, admitted.action); evidence.arrived = arrived;
    if (arrived.operation.kind !== 'navigation') throw Error('Expected retained navigation');
    expect(arrived.original).toEqual(before.original); expect(arrived.binding).toEqual(before.binding);
    expect(arrived.operation.operation.id).toBe(before.operation.operation.id);
    expect(arrived.operation.confirmation).toEqual(before.operation.confirmation);
    for (const key of ['binding', 'startedAt', 'deadline'] as const) expect(arrived.operation.progress[key]).toEqual(before.operation.progress[key]);
    expect(arrived.operation.progress.status).toBe('arrived'); expect(arrived.operation.progress.steps).toBe(3);
    expect(arrived.operation.progress.position).toEqual(admitted.target);
    expect(arrived.operation.progress.replans).toBeGreaterThan(before.operation.progress.replans);
    expect(arrived.root.binding).toEqual(before.root.binding); expect(arrived.root.grant).toEqual(before.root.grant); expect(arrived.root.run).toEqual(before.root.run);
    expect(arrived.intent!.data.navigationSequence).toBe(before.operation.progress.sequence);
    expect(arrived.intent!.data.event.usage).toEqual({ steps: 1, replans: before.operation.progress.replans });
    expect(arrived.ack!.data.entry).toEqual(held.intent && { ...admitted.entry, activeEpoch: String(taken.head.epoch), latestEvent: held.intent.data.event });
    for (const kind of ['guard', 'navigation'] as const) expect(arrived.adoptions![kind].source.attemptId).toBe(`${arrived.intent!.reference.id}:${kind}`);
    expect(arrived.authority!.data).toMatchObject({ guardAdoption: arrived.adoptions!.guard.source.attemptId,
      navigationAdoption: arrived.adoptions!.navigation.source.attemptId });
    const revisions = [arrived.intent!.row.revision, arrived.ack!.row.revision, arrived.adoptions!.guard.receipt.afterRevision,
      arrived.adoptions!.navigation.receipt.afterRevision, arrived.authority!.row.revision];
    for (let i = 1; i < revisions.length; i++) expect(revisions[i]).toBeGreaterThan(revisions[i - 1]);
    for (const custody of [arrived.root.guard, arrived.operation.operation, arrived.operation.progress]) {
      expect(custody.owner).toBe(taken.head.owner); expect(custody.epoch).toBe(taken.head.epoch);
    }
    expect(arrived.terminal!.event.sessionEpoch).toBe(String(taken.head.epoch));
    const finalView = await state(other);
    for (const key of ['inventory', 'stash', 'quests'] as const) expect(finalView[key]).toEqual(initial[key]);
    const replay = await other.evaluate(async action =>
      (await import('../../tests/e2e/canonical-generated-endurance.transfer')).replayAdoptions(action), admitted.action);
    evidence.replay = replay;
    expect(replay.guard.receipt).toEqual(arrived.adoptions!.guard.receipt);
    expect(replay.navigation.receipt).toEqual(arrived.adoptions!.navigation.receipt);
    for (const result of [replay.guard, replay.navigation]) { expect(result.replayed).toBe(true); expect(result.stats.writes).toBe(0); expect(result.stats.writeBytes).toBe(0); }
    expect(replay.after.head).toEqual(replay.before.head);
    for (const key of ['records', 'nodes', 'receipts'] as const) expect(replay.after[key]).toBe(replay.before[key]);
    const cleanup = await other.evaluate(async action =>
      (await import('../../tests/e2e/canonical-generated-endurance.transfer')).cleanup(action), admitted.action);
    evidence.cleanup = cleanup; expect(cleanup.forbiddenCalls).toBe(0);
    expect(cleanup.pulses.at(-1)?.status).toBe('terminal-acknowledged'); expect(cleanup.state.acknowledgement).toBeTruthy();
    const final = await audit(other); evidence.final = final; evidence.peer = remote.entry();
    expect(final.head.quota.reservations).toBe(0); expect(final.head.quota.reservedBytes).toBe(0);
    expect(remote.attempts.filter(row => row.event.kind === 'transfer')).toHaveLength(1);
    expect(remote.attempts.map(row => row.event.kind)).toEqual(['progress', 'progress', 'transfer', 'progress', 'progress', 'decision']);
    expect(remote.attempts.map(row => row.event.sequence)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(remote.entry().usage).toEqual(admitted.entry.usage); expect(remote.errors).toEqual([]);
    expect(sockets).toEqual([]); expect(boot.unexpected).toEqual([]); expect(boot.errors).toEqual([]); expect(errors).toEqual([]);
  } finally {
    release(); await other?.close();
    await page.evaluate(async () => (await import('../../tests/e2e/canonical-generated-endurance.agent')).close()).catch(() => {});
    await attach(info, 'generated-active-transfer.json', evidence);
  }
});
