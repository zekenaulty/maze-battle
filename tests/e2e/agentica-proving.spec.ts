import { expect, test } from '@playwright/test';
import type {} from './agentica-proving';
import { persistEvidence } from './agentica-evidence';

const service = process.env.MAZE_AGENTICA_PROOF_URL;
test.skip(!service, 'Set MAZE_AGENTICA_PROOF_URL to the explicit provider-free fixture host.');
test.setTimeout(180000);

for (const loseAcknowledgement of [false, true]) {
  test(`real Agentica loop collects one chest${loseAcknowledgement ? ' after lost acknowledgement' : ''}`, async ({ page, request }, info) => {
    if (loseAcknowledgement) await page.addInitScript(() => {
      const Native = window.WebSocket;
      window.WebSocket = class extends Native {
        send(data: string | ArrayBufferLike | Blob | ArrayBufferView) {
          if (typeof data === 'string' && !window.droppedAction) {
            const message = JSON.parse(data);
            if (message.type === 'action.result' && message.payload.disposition === 'applied') {
              window.droppedAction = { actionId: message.payload.actionId, droppedAt: Date.now(), result: message.payload };
              this.close(); return;
            }
          }
          super.send(data);
        }
      };
    });
    await page.goto('/tests/e2e/agentica-proving.html');
    await page.waitForFunction(() => Boolean(window.proving));
    const started = await page.evaluate(url => window.proving.start(url), service!.replace(/^http/, 'ws') + '/api/host');
    const replayed: unknown[] = [];
    if (loseAcknowledgement) {
      await page.waitForFunction(() => Boolean(window.droppedAction) && !window.proving.client?.connected);
      page.on('websocket', socket => socket.on('framesent', frame => {
        const message = JSON.parse(String(frame.payload));
        if (message.type === 'action.result') replayed.push(message.payload);
      }));
      await page.evaluate(() => window.proving.client!.reconnect());
    }
    let terminal: { status: string; outcome?: { outcome?: unknown } } | undefined;
    await expect.poll(async () => {
      const response = await request.get(`${service}/api/runs/${started.binding.runId}`);
      const snapshot = await response.json();
      terminal = snapshot;
      return !['running', 'starting', 'awaiting_host'].includes(snapshot.status);
    }, { timeout: 150000, intervals: [100, 250, 500] }).toBe(true);
    expect(terminal?.status, JSON.stringify(terminal?.outcome?.outcome)).toBe('succeeded');
    const proof = await page.evaluate(slot => window.proving.records(slot), started.slot);
    expect(proof.snapshot.checkpoint.collectedChests).toBe(1);
    expect(proof.snapshot.checkpoint.visitedSpaces).toBeGreaterThanOrEqual(3);
    expect(proof.actions.every(value => value.record.status === 'completed')).toBe(true);
    expect(proof.actions.some(value => value.record.result!.disposition === 'refused')).toBe(true);
    expect(proof.actions.filter(value => value.record.result!.completion)).toHaveLength(1);
    expect(proof.domain).toHaveLength(proof.actions.length);
    const events = await page.evaluate(() => window.proving.events);
    expect(events.some(event => event.message.type === 'progress')).toBe(true);
    const telemetry = await page.evaluate(() => window.proving.telemetry);
    if (loseAcknowledgement) {
      const dropped = await page.evaluate(() => window.droppedAction!);
      expect(replayed).toContainEqual(dropped.result);
      const retained = proof.actions.find(value => JSON.parse(value.record.fingerprint).actionId === dropped.actionId)!;
      expect(retained.record.result).toEqual(dropped.result);
    }
    const finish = proof.actions.find(value => value.record.result!.completion)!;
    const originalAction = JSON.parse(finish.record.fingerprint);
    const originalResult = finish.record.result;
    const body = await (await request.get(`${service}/api/runs/${started.binding.runId}`)).json();
    expect(body.pendingActions).toHaveLength(0);
    await page.evaluate(() => window.proving.client!.close());
    await page.reload(); await page.waitForFunction(() => Boolean(window.proving));
    const replay = await page.evaluate(async ({ slot, action }) => ({ result: await window.proving.persistence.reconcileAgenticaAction(slot, action),
      snapshot: await window.proving.stream.loadStreamSnapshot(slot) }), { slot: started.slot, action: originalAction });
    expect(replay.result).toEqual(originalResult);
    expect(replay.snapshot).toEqual(proof.snapshot);
    const provider = await (await request.get('http://127.0.0.1:5080/evidence')).json();
    const calls = provider.filter((call: { scope: string }) => call.scope === started.binding.scopeId);
    expect(calls.length).toBeGreaterThan(2);
    expect(calls.every((call: { firstDeltaAt: number; completedAt: number }) => call.firstDeltaAt < call.completedAt)).toBe(true);
    expect(telemetry).toHaveLength(calls.length);
    expect(new Set(telemetry.map(call => call.callId)).size).toBe(calls.length);
    const live = calls.map((call: any, index: number) => {
      expect(call.call).toBe(index + 1);
      const browser = telemetry[index];
      expect(browser.startedAt).toBeDefined(); expect(browser.completedAt).toBeGreaterThanOrEqual(call.completedAt);
      const delta = browser.deltas.find(delta => delta.outputCharacters > 0 && delta.at >= call.beganAt && delta.at < call.completedAt);
      return delta && { callId: browser.callId, ordinal: call.call, beganAt: call.beganAt, delta,
        providerCompletedAt: call.completedAt, browserCompletedAt: browser.completedAt };
    }).filter(Boolean);
    expect(live.length).toBeGreaterThan(0);
    expect(calls.some((call: { recovered: boolean; compacted: boolean }) => call.recovered && call.compacted)).toBe(true);
    await persistEvidence(info, 'cross-runtime-evidence', { runId: started.binding.runId, scopeId: started.binding.scopeId,
      snapshot: proof.snapshot.checkpoint, receiptCount: proof.actions.length, providerCalls: calls.length,
      completionEvidence: originalResult!.completion, replayEqual: true, liveTextDelta: live[0], exactSourceRecovered: true,
      lostAcknowledgement: loseAcknowledgement, droppedResultReplayedExactly: loseAcknowledgement });
  });
}
