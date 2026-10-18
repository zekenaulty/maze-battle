import { test, expect, serviceProof } from './canonical-start-service.decision.test';
import type { Page } from '@playwright/test';
import type { GameSession } from '../../src/services/game/GameSession';
import type { AgenticaMessage, AgenticaOperationEntry } from '../../src/services/agentica/sdk/agentica-host.mjs';

interface DelayedAcceptanceProbe {
  held: string | null; heldMilliseconds: number; released: boolean;
  commands: { operation: string; whileHeld: boolean; outcome: 'pending' | 'committed' | 'failed'; error?: string }[];
  controller: { controlled: boolean; busy: boolean; recoveryRequired: boolean; lifetimeCurrent: boolean; status: string };
}
declare global { interface Window { __appStartAcceptance?: {
  read(): DelayedAcceptanceProbe; release(): number; dispose(): void;
} } }

async function delayNavigationAcceptance(page: Page) {
  await page.evaluate(() => {
    const session = Reflect.get(globalThis, '__canonicalStartAppSession') as GameSession | undefined;
    if (!session || window.__appStartAcceptance) throw Error('One actual App session and one result gate required.');
    const lifetime = session.hostSignal, originalSend = WebSocket.prototype.send, submit = session.submitHostCommand;
    const commands: DelayedAcceptanceProbe['commands'] = [];
    let held: { socket: WebSocket; data: string; at: number } | undefined, releasedAt: number | undefined;
    const observedSubmit: GameSession['submitHostCommand'] = async command => {
      if (commands.length >= 128) throw Error('Delayed acceptance command evidence bound exceeded.');
      const entry: DelayedAcceptanceProbe['commands'][number] = {
        operation: command.kind === 'fresh' ? command.operation : command.request.operation,
        whileHeld: !!held && releasedAt === undefined, outcome: 'pending',
      };
      commands.push(entry);
      try { const result = await submit(command); entry.outcome = 'committed'; return result; }
      catch (error) { entry.outcome = 'failed'; entry.error = String(error); throw error; }
    };
    function delayedSend(this: WebSocket, data: Parameters<WebSocket['send']>[0]) {
      if (this.url === 'ws://127.0.0.1:5259/api/host' && typeof data === 'string' && releasedAt === undefined) {
        const frame = JSON.parse(data) as AgenticaMessage;
        // Completed saveAction is read-only validation, not a submitHostCommand stage. Hold its exact outgoing result instead.
        if (frame.type === 'action.result' && frame.payload.operation) {
          if (held) throw Error('Only one navigation result may be held.');
          held = { socket: this, data, at: performance.now() }; return;
        }
      }
      originalSend.call(this, data);
    }
    session.submitHostCommand = observedSubmit; WebSocket.prototype.send = delayedSend;
    window.__appStartAcceptance = {
      read: () => ({ held: held?.data ?? null, heldMilliseconds: held ? (releasedAt ?? performance.now()) - held.at : 0,
        released: releasedAt !== undefined, commands: structuredClone(commands), controller: {
          controlled: session.view.controlled, busy: !!session.view.busy, recoveryRequired: !!session.view.recoveryRequired,
          lifetimeCurrent: session.hostSignal === lifetime && !lifetime.aborted, status: session.view.status,
        } }),
      release() {
        if (!held || releasedAt !== undefined || held.socket.readyState !== WebSocket.OPEN) throw Error('Original result is not releasable.');
        releasedAt = performance.now(); WebSocket.prototype.send = originalSend;
        originalSend.call(held.socket, held.data); return releasedAt - held.at;
      },
      dispose() {
        if (WebSocket.prototype.send === delayedSend) WebSocket.prototype.send = originalSend;
        if (session.submitHostCommand === observedSubmit) session.submitHostCommand = submit;
        if (held && releasedAt === undefined) held.socket.close();
      },
    };
  });
}

test('actual App explicitly starts earned navigation, survives panel close, and stops without another model activation', async ({ page, wire }, info) => {
  await page.setViewportSize({ width: 390, height: 844 }); await page.goto('/');
  await expect(page.getByText(/Dungeon 1 - Ready/)).toBeVisible();
  await page.evaluate(async () => {
    // @ts-expect-error Test-only reader attaches to the actual hook-owned GameSession.
    await import('/tests/e2e/canonical-start-service.fixture.ts');
    await window.canonicalStartService.boot();
  });
  const before = await page.evaluate(() => window.canonicalStartService.snapshot());
  expect(before.launch).toBeNull(); expect(wire.sent).toEqual([]);
  await page.getByRole('button', { name: 'Agentic play', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Agentic play', exact: true });
  await expect(dialog.getByRole('button', { name: 'Start Agentic play', exact: true })).toBeDisabled();
  await dialog.getByRole('textbox', { name: 'Objective', exact: true }).fill('Inspect the earned map and room, observe, then navigate to one adjacent earned cell.');
  await dialog.getByRole('button', { name: 'Start Agentic play', exact: true }).click();
  await expect(dialog.getByRole('button', { name: 'Stop Agentic play', exact: true })).toBeEnabled();
  await dialog.getByRole('button', { name: 'Close dialog', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Party', exact: true })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Saves', exact: true })).toBeDisabled();
  await expect.poll(() => wire.sent.filter(message => message.type === 'action.result').length).toBe(4);
  await page.getByRole('button', { name: 'Agentic play', exact: true }).click();
  await expect(dialog.getByRole('status').filter({ hasText: /^decision$/ })).toBeVisible({ timeout: 20_000 });
  await expect(dialog.getByRole('textbox', { name: 'Objective', exact: true })).toHaveValue('Inspect the earned map and room, observe, then navigate to one adjacent earned cell.');
  expect(await dialog.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
  await page.screenshot({ path: info.outputPath('agentic-decision-mobile.png') });
  await page.setViewportSize({ width: 1280, height: 800 });
  expect(await dialog.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
  await page.screenshot({ path: info.outputPath('agentic-decision-desktop.png') });
  expect(wire.sent.filter(message => message.type === 'start.durable')).toHaveLength(1);
  expect(wire.sent.filter(message => ['operation.wake', 'operation.adopt', 'resume'].includes(message.type))).toEqual([]);
  const capabilities = wire.received.filter(({ frame }) => frame.type === 'action.request').map(({ frame }) => frame.payload.capabilityId);
  expect(capabilities).toEqual(['maze.inspect', 'maze.inspect', 'maze.observe', 'maze.navigate']);
  const arrived = await page.evaluate(() => window.canonicalStartService.snapshot()), counters = await serviceProof();
  expect(arrived.head.checkpoint.position).not.toEqual(before.head.checkpoint.position);
  expect(before.head.roots.world).not.toBeNull();
  expect(arrived.head.roots.world).toEqual(before.head.roots.world);
  expect(Object.keys(arrived.launch!.binding.start.observation.data)).toEqual(['scope', 'actor', 'source']);
  expect(arrived.launch!.guard.terminal).toBeUndefined();
  await dialog.getByRole('button', { name: 'Close dialog', exact: true }).click();
  await expect.poll(() => page.locator('canvas[aria-label="Dungeon map"]').evaluate((canvas: HTMLCanvasElement) => {
    const pixels = canvas.getContext('2d')!.getImageData(0, 0, canvas.width, canvas.height).data;
    const colors = new Set<string>();
    for (let i = 0; i < pixels.length; i += 128) colors.add(`${pixels[i]},${pixels[i + 1]},${pixels[i + 2]}`);
    return colors.size;
  })).toBeGreaterThan(10);
  await page.screenshot({ path: info.outputPath('agentic-navigation-desktop.png') });
  await page.getByRole('button', { name: 'Stop Agentic play', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Stop Agentic play', exact: true })).toHaveCount(0);
  const stopped = await page.evaluate(() => window.canonicalStartService.snapshot());
  expect(stopped.launch!.guard.state).toBe('settled');
  expect(stopped.launch!.guard.terminal!.disposition).toBe('cancelled');
  expect(stopped.head.checkpoint).toEqual(arrived.head.checkpoint);
  expect(await serviceProof()).toEqual(counters);
  await page.getByRole('button', { name: 'Agentic play', exact: true }).click();
  await dialog.getByRole('button', { name: 'Recovery', exact: true }).click();
  const recovery = page.getByRole('dialog', { name: 'Agentica recovery', exact: true });
  await recovery.getByRole('button', { name: 'Inspect original 1', exact: true }).click();
  await recovery.getByRole('button', { name: 'Reconcile navigation', exact: true }).click();
  await expect(recovery.getByRole('status').filter({ hasText: 'Navigation terminal prefix delivered through sequence 2' })).toBeVisible();
  await recovery.getByRole('button', { name: 'Inspect original 1', exact: true }).click();
  await recovery.getByRole('button', { name: 'Reconcile navigation', exact: true }).click();
  await expect(recovery.getByRole('status').filter({ hasText: 'Navigation acknowledged' })).toBeVisible();
  await recovery.getByRole('button', { name: 'Stop Agentic session', exact: true }).click();
  await expect(recovery.getByRole('status').filter({ hasText: 'Root Stop acknowledged' })).toBeVisible();
  const final = await page.evaluate(() => window.canonicalStartService.snapshot());
  expect(final.launch!.guard.state).toBe('acknowledged');
  expect(final.head.allocations).toEqual({}); expect(final.head.checkpoint).toEqual(arrived.head.checkpoint);
  expect(await serviceProof()).toEqual(counters);
  await page.screenshot({ path: info.outputPath('actual-app-start-stop-desktop.png') });
  await info.attach('actual-app-start-stop.json', { body: JSON.stringify({ before, arrived, stopped, final, counters,
    sent: wire.sent, http: wire.http }, null, 2), contentType: 'application/json' });
});

test('actual App waits through delayed navigation result acceptance without confirming reserved custody or poisoning control', async ({ page, wire }, info) => {
  await page.goto('/'); await expect(page.getByText(/Dungeon 1 - Ready/)).toBeVisible();
  await page.evaluate(async () => {
    // @ts-expect-error Test-only reader attaches to the actual hook-owned GameSession.
    await import('/tests/e2e/canonical-start-service.fixture.ts');
    await window.canonicalStartService.boot();
  });
  const evidence: Record<string, unknown> = {};
  const registryReplies = () => wire.responses.filter(row => row.method === 'GET' && new URL(row.url).pathname === '/api/operations');
  await delayNavigationAcceptance(page);
  try {
    const before = await page.evaluate(() => window.canonicalStartService.snapshot()); evidence.before = before;
    expect(before.launch).toBeNull(); expect(wire.sent).toEqual([]);
    await page.getByRole('button', { name: 'Agentic play', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: 'Agentic play', exact: true });
    await expect(dialog).toContainText('observation-sequence');
    await dialog.getByRole('textbox', { name: 'Objective', exact: true }).fill('Inspect the earned map and room, observe, then navigate to one adjacent earned cell.');
    await dialog.getByRole('button', { name: 'Start Agentic play', exact: true }).click();
    await expect.poll(() => page.evaluate(() => window.__appStartAcceptance!.read().held !== null), { timeout: 10_000 }).toBe(true);
    const held = await page.evaluate(async () => ({ gate: window.__appStartAcceptance!.read(),
      snapshot: await window.canonicalStartService.snapshot(), native: await window.canonicalStartService.readPendingCanonicalEvidence() }));
    evidence.held = held;
    const frame = JSON.parse(held.gate.held!) as AgenticaMessage;
    const actions = wire.received.filter(({ frame }) => frame.type === 'action.request').map(({ frame }) => frame.payload);
    expect(actions.map(action => action.capabilityId)).toEqual(['maze.inspect', 'maze.inspect', 'maze.observe', 'maze.navigate']);
    const action = actions[3];
    expect(frame).toMatchObject({ type: 'action.result', runId: action.runId, payload: {
      actionId: action.actionId, sessionId: action.sessionId, sessionEpoch: action.sessionEpoch,
      operation: { operationId: expect.any(String) },
    } });
    expect(wire.sent.filter(message => message.type === 'action.result')).toHaveLength(3);
    const assertReserved = (reply: ReturnType<typeof registryReplies>[number]) => {
      expect(reply.status).toBe(200);
      const url = new URL(reply.url);
      expect(url.searchParams.get('hostId')).toBe('maze-battle'); expect(url.searchParams.get('sessionId')).toBe(action.sessionId);
      const matches = (reply.body as AgenticaOperationEntry[]).filter(entry => entry.action.runId === action.runId && entry.action.actionId === action.actionId);
      expect(matches).toHaveLength(1); expect(matches[0]).toMatchObject({ state: 'reserved', action, activeEpoch: action.sessionEpoch });
      expect(matches[0].admission ?? null).toBeNull();
    };
    await expect.poll(() => registryReplies().length).toBeGreaterThanOrEqual(1);
    assertReserved(registryReplies()[0]);
    const firstPoll = await page.evaluate(() => window.__appStartAcceptance!.read()); evidence.firstPoll = firstPoll;
    expect(firstPoll.controller).toMatchObject({ controlled: true, busy: false, recoveryRequired: false, lifetimeCurrent: true });
    expect(firstPoll.commands.filter(command => command.operation === 'agentica.operation.confirm')).toEqual([]);
    const counters = await serviceProof(); evidence.counters = counters;
    expect(counters.paidProviderCalls).toBe(0);
    // More than one 250 ms driver tick must observe the genuine reserved entry, with no artificial HTTP responses.
    await expect.poll(() => page.evaluate(() => window.__appStartAcceptance!.read().heldMilliseconds)).toBeGreaterThanOrEqual(750);
    const reserved = await page.evaluate(async () => ({ gate: window.__appStartAcceptance!.read(),
      snapshot: await window.canonicalStartService.snapshot(), native: await window.canonicalStartService.readPendingCanonicalEvidence() }));
    evidence.reserved = reserved;
    expect(reserved.gate.controller).toMatchObject({ controlled: true, busy: false, recoveryRequired: false, lifetimeCurrent: true });
    expect(reserved.gate.commands.filter(command => command.operation === 'agentica.operation.confirm' || command.whileHeld)).toEqual([]);
    expect(reserved.native).toEqual(held.native); expect(reserved.snapshot.head).toEqual(held.snapshot.head);
    expect(reserved.snapshot.head.checkpoint.position).toEqual(before.head.checkpoint.position);
    await expect.poll(() => registryReplies().length).toBeGreaterThanOrEqual(2);
    for (const reply of registryReplies()) assertReserved(reply);
    evidence.reservedReplies = structuredClone(registryReplies());
    expect(await serviceProof()).toEqual(counters);
    expect(wire.sent.filter(message => message.type === 'action.result')).toHaveLength(3);
    expect(wire.received.filter(({ frame: reply }) => reply.type === 'action.accepted' && reply.payload.actionId === action.actionId)).toEqual([]);
    await expect(dialog.getByRole('status').filter({ hasText: /^navigating$/ })).toBeVisible();
    await expect(dialog.getByRole('alert')).toHaveCount(0);
    await expect(dialog.getByRole('button', { name: 'Stop Agentic play', exact: true })).toBeEnabled();

    const delayedMilliseconds = await page.evaluate(() => window.__appStartAcceptance!.release());
    evidence.delayedMilliseconds = delayedMilliseconds; expect(delayedMilliseconds).toBeGreaterThanOrEqual(750);
    await expect.poll(() => wire.sent.filter(message => message.type === 'action.result').length).toBe(4);
    expect(wire.sent.filter(message => message.type === 'action.result' && message.payload.actionId === action.actionId)).toEqual([frame]);
    await expect.poll(() => wire.received.some(({ frame: reply }) => reply.type === 'action.accepted'
      && reply.payload.actionId === action.actionId && reply.payload.duplicate === false)).toBe(true);
    await expect(dialog.getByRole('status').filter({ hasText: /^decision$/ })).toBeVisible({ timeout: 20_000 });
    await expect(dialog.getByRole('alert')).toHaveCount(0);
    const arrived = await page.evaluate(async () => ({ gate: window.__appStartAcceptance!.read(), snapshot: await window.canonicalStartService.snapshot() }));
    evidence.arrived = arrived;
    expect(arrived.gate.controller).toMatchObject({ controlled: true, busy: false, recoveryRequired: false, lifetimeCurrent: true });
    expect(arrived.gate.commands.filter(command => command.operation === 'agentica.operation.confirm'))
      .toEqual([{ operation: 'agentica.operation.confirm', whileHeld: false, outcome: 'committed' }]);
    expect(arrived.gate.commands.filter(command => command.outcome === 'failed')).toEqual([]);
    expect(arrived.snapshot.head.checkpoint.position).not.toEqual(before.head.checkpoint.position);
    expect(arrived.snapshot.head.roots.world).toEqual(before.head.roots.world);
    expect(arrived.snapshot.launch!.guard.terminal).toBeUndefined(); expect(await serviceProof()).toEqual(counters);

    await dialog.getByRole('button', { name: 'Stop Agentic play', exact: true }).click();
    await expect(dialog.getByRole('status').filter({ hasText: /^stopped$/ })).toBeVisible();
    await dialog.getByRole('button', { name: 'Recovery', exact: true }).click();
    const recovery = page.getByRole('dialog', { name: 'Agentica recovery', exact: true });
    await recovery.getByRole('button', { name: 'Inspect original 1', exact: true }).click();
    await recovery.getByRole('button', { name: 'Reconcile navigation', exact: true }).click();
    await expect(recovery.getByRole('status').filter({ hasText: 'Navigation terminal prefix delivered through sequence 2' })).toBeVisible();
    await recovery.getByRole('button', { name: 'Inspect original 1', exact: true }).click();
    await recovery.getByRole('button', { name: 'Reconcile navigation', exact: true }).click();
    await expect(recovery.getByRole('status').filter({ hasText: 'Navigation acknowledged' })).toBeVisible();
    await recovery.getByRole('button', { name: 'Stop Agentic session', exact: true }).click();
    await expect(recovery.getByRole('status').filter({ hasText: 'Root Stop acknowledged' })).toBeVisible();
    const final = await page.evaluate(() => window.canonicalStartService.snapshot()); evidence.final = final;
    expect(final.head.allocations).toEqual({}); expect(final.launch!.guard.state).toBe('acknowledged');
    expect(final.head.checkpoint).toEqual(arrived.snapshot.head.checkpoint);
    await expect(recovery.getByText('Session clearance', { exact: true }).locator('..')).toContainText('Unknown');
    expect(wire.sent.filter(message => message.type === 'start.durable')).toHaveLength(1);
    expect(wire.sent.filter(message => ['operation.wake', 'operation.adopt', 'resume'].includes(message.type))).toEqual([]);
    expect(await serviceProof()).toEqual(counters);
  } finally {
    evidence.finalProbe = await page.evaluate(() => {
      const probe = window.__appStartAcceptance?.read(); window.__appStartAcceptance?.dispose(); delete window.__appStartAcceptance; return probe;
    }).catch(String);
    await info.attach('actual-app-delayed-acceptance.json', { body: JSON.stringify({ ...evidence,
      sent: wire.sent, received: wire.received, http: wire.http, responses: wire.responses }, null, 2), contentType: 'application/json' });
  }
});
