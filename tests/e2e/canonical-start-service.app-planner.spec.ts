import { createHash } from 'node:crypto';
import { test, expect, serviceProof } from './canonical-start-service.decision.test';
import { serviceOrigin } from '../agentica-start-service/service.mjs';
import type { AgenticaAction } from '../../src/services/agentica/contracts';
import { plannerPair } from './canonical-start-service.planner-compare.mjs';
import { assertPlannerWindows } from './canonical-start-service.planner-wire.mjs';

interface CaptureEntry { root: string; window: string; call: number; method: 'create' | 'refine'; bytes: number; sha256: string; raw: string }
interface Capture { entries: CaptureEntry[]; maxRoots: number; maxWindows: number; maxCalls: number; maxBytes: number }
async function capture(): Promise<Capture> {
  const response = await fetch(serviceOrigin + '/fixture/planner-inputs');
  expect(response.ok).toBe(true); return response.json();
}

test.use({ freshCorpus: true });
test('paired corpus actual planner inputs: initial, refinement and explicit successor', async ({ page, wire }, info) => {
  test.setTimeout(240_000);
  const roots: { variant: 'A' | 'B'; entries: CaptureEntry[]; actions: AgenticaAction[] }[] = [];
  try {
    for (const variant of ['A', 'B'] as const) {
      await page.goto('/tests/e2e/canonical-start-service.html');
      await page.evaluate(async variant => {
        await new Promise<void>((resolve, reject) => {
          const request = indexedDB.deleteDatabase('maze-battle');
          request.onsuccess = () => resolve(); request.onerror = () => reject(request.error);
          request.onblocked = () => reject(Error('Prior isolated corpus still owns its database'));
        });
        // @ts-expect-error Genesis only; the variant never reaches the App profile or policy.
        const { initializeCorpus }: typeof import('./canonical-corpus.initialize') = await import('/tests/e2e/canonical-corpus.initialize.ts');
        await initializeCorpus(variant, 'corpus-genesis');
      }, variant);
      await page.goto('/?corpusProof=1&plannerCaptureProof=1');
      await expect(page.getByText(/Dungeon 1 - Ready/)).toBeVisible();
      const contractId = await page.evaluate(async () => {
        // @ts-expect-error Attach to the actual App and accept the public guild offer without discovery movement.
        await import('/tests/e2e/canonical-start-service.fixture.ts'); await window.canonicalStartService.boot();
        // @ts-expect-error Reuse ordinary setup, do not pass its independent target oracle to the policy.
        const { acceptAppSurvey }: typeof import('./canonical-start-service.corpus-fixture') = await import('/tests/e2e/canonical-start-service.corpus-fixture.ts');
        return (await acceptAppSurvey()).target.contractId;
      });
      const start = wire.received.length, sentStart = wire.sent.length;
      await page.getByRole('button', { name: 'Agentic play', exact: true }).click();
      const dialog = page.getByRole('dialog', { name: 'Agentic play', exact: true });
      await dialog.getByRole('combobox', { name: 'Return quest (optional)', exact: true }).selectOption(contractId);
      await dialog.getByRole('textbox', { name: 'Objective', exact: true }).fill('Locate the survey seal in an ordinary chest, retrieve it, then return to the entrance.');
      await dialog.getByRole('button', { name: 'Start Agentic play', exact: true }).click();
      await expect(dialog.getByRole('status').filter({ hasText: /^decision$/ })).toBeVisible({ timeout: 60_000 });
      const submissions = wire.sent.slice(sentStart).filter(frame => frame.type === 'start.durable');
      expect(submissions).toHaveLength(1);
      const root = submissions[0].payload.request.sessionId, first = await capture();
      const initial = first.entries.filter(entry => entry.root === root);
      expect(new Set(initial.map(e => e.window)).size).toBe(1);
      expect(initial.map(e => e.method)).toEqual(['create', 'refine', 'refine', 'refine']);
      const wakes = wire.sent.filter(frame => frame.type === 'operation.wake').length;
      await dialog.getByRole('button', { name: 'Continue', exact: true }).click();
      await expect.poll(() => wire.sent.filter(frame => frame.type === 'operation.wake').length).toBe(wakes + 1);
      await expect.poll(async () => new Set((await capture()).entries.filter(e => e.root === root).map(e => e.window)).size).toBe(2);
      await expect(dialog.getByRole('status').filter({ hasText: /^decision$/ })).toBeVisible({ timeout: 60_000 });
      await expect(dialog.getByRole('alert')).toHaveCount(0);
      const snapshot = await capture(), entries = snapshot.entries.filter(e => e.root === root);
      expect(snapshot).toMatchObject({ maxRoots: 2, maxWindows: 2, maxCalls: 8, maxBytes: 262144 });
      expect(entries.map(e => e.method)).toEqual(['create', 'refine', 'refine', 'refine', 'create', 'refine', 'refine', 'refine']);
      for (const entry of entries) {
        expect(Buffer.byteLength(entry.raw)).toBe(entry.bytes);
        expect(entry.bytes).toBeLessThanOrEqual(snapshot.maxBytes);
        expect(createHash('sha256').update(entry.raw).digest('hex')).toBe(entry.sha256);
        const value = JSON.parse(entry.raw), request = value.request;
        expect(Object.keys(value).sort()).toEqual(['refinementObservation', 'request']);
        expect(Object.keys(request).sort()).toEqual(['ContextFrames', 'ExecutionContext', 'Observations', 'Receipts',
          'Request', 'SessionContext', 'ToolDescriptors', 'ToolSurface'].sort());
        expect(request.ToolDescriptors.length).toBeGreaterThanOrEqual(5);
        expect(request.ToolSurface.ToolDescriptors).toEqual(request.ToolDescriptors);
        expect(request.ToolSurface.ExecutionContext).toEqual(request.ExecutionContext);
        expect(request.ContextFrames.map((f: { Kind: string }) => f.Kind)).toEqual(['agentica.host_context', 'agentica.goal_spine']);
        expect(request.ContextFrames.every((f: object) => Object.hasOwn(f, 'CompactPayload'))).toBe(true);
        expect(request.SessionContext.RunId).toBe(entry.window);
        expect(request.Request.Context.sessionId).toBe(root);
        const current = request.ContextFrames.find((f: { Kind: string }) => f.Kind === 'agentica.host_context').Payload.currentObservation;
        const delivered = wire.sent.flatMap(frame => frame.type === 'start.durable' ? [frame.payload.request.observation]
          : frame.type === 'action.result' || frame.type === 'operation.wake' ? [frame.payload.observation] : [])
          .find(observation => observation?.observationId === current.Reference.ObservationId)!;
        expect(delivered).toBeDefined();
        expect(current.Data).toEqual(delivered.data);
        expect(current.Reference.Revision).toBe(delivered.revision);
        expect(Date.parse(current.Reference.ObservedAt)).toBe(Date.parse(delivered.observedAt));
        expect(value.refinementObservation === null).toBe(entry.method === 'create');
        if (entry.method === 'refine') expect(request.Observations).toContainEqual(value.refinementObservation);
      }
      expect(entries.slice(0, initial.length)).toEqual(initial);
      const actions = wire.received.slice(start).filter(({ frame }) => frame.type === 'action.request').map(({ frame }) => frame.payload as AgenticaAction);
      assertPlannerWindows(root, entries, wire.sent, wire.received.slice(start).map(({ frame }) => frame));
      expect(actions.map(a => a.capabilityId)).toEqual(['maze.inspect', 'maze.inspect', 'maze.inspect', 'maze.explore',
        'maze.inspect', 'maze.inspect', 'maze.inspect', 'maze.explore']);
      for (const offset of [0, 4]) {
        expect(actions.slice(offset, offset + 3).map(action => action.arguments)).toEqual([
          { scope: 'objective' }, { scope: 'objects' }, { scope: 'frontiers' }]);
        const data = JSON.parse(entries[offset + 3].raw).request.ContextFrames[0].Payload.currentObservation.Data;
        expect(actions[offset + 3].arguments.frontier).toBe(data.frontiers[0].frontier);
        expect(data.frontiers[0].direction).toBe(offset === 0 || variant === 'A' ? 'east' : 'north');
      }
      roots.push({ variant, entries, actions });
      const counters = await serviceProof();
      expect(counters.paidProviderCalls).toBe(0);
      await dialog.getByRole('button', { name: 'Stop Agentic play', exact: true }).click();
      await expect(dialog.getByRole('status').filter({ hasText: /^stopped$/ })).toBeVisible();
      await dialog.getByRole('button', { name: 'Recovery', exact: true }).click();
      const recovery = page.getByRole('dialog', { name: 'Agentica recovery', exact: true });
      await recovery.getByRole('button', { name: 'Inspect original 1', exact: true }).click();
      await expect(page.getByRole('region', { name: 'Original action inspection' })).toContainText(actions.at(-1)!.actionId);
      await recovery.getByRole('button', { name: 'Reconcile navigation', exact: true }).click();
      await expect(recovery.getByRole('status').filter({ hasText: /terminal prefix delivered/ })).toBeVisible();
      await recovery.getByRole('button', { name: 'Inspect original 1', exact: true }).click();
      await recovery.getByRole('button', { name: 'Reconcile navigation', exact: true }).click();
      await expect(recovery.getByRole('status').filter({ hasText: /acknowledged \(decision\)/ })).toBeVisible();
      await recovery.getByRole('button', { name: 'Stop Agentic session', exact: true }).click();
      await expect(recovery.getByRole('status').filter({ hasText: 'Root Stop acknowledged' })).toBeVisible();
      const allocations = await page.evaluate(async () => {
        // @ts-expect-error Independent cleanup assertion, never policy input.
        const { readCanonicalHead }: typeof import('../../src/persistence/canonical/read') = await import('/src/persistence/canonical/read.ts');
        return (await readCanonicalHead()).head.allocations;
      });
      expect(allocations).toEqual({}); expect(await serviceProof()).toEqual(counters);
      expect(await capture()).toEqual(snapshot);
    }
    expect(roots).toHaveLength(2);
    const pair = plannerPair();
    const differences = roots[0].entries.map((entry, i) => pair.compare(entry.raw, roots[1].entries[i].raw));
    await info.attach('planner-pair-comparison.json', { body: JSON.stringify({ differences, allowances: pair.allowances }, null, 2), contentType: 'application/json' });
    expect(differences.slice(0, 7)).toEqual(Array.from({ length: 7 }, () => []));
    expect(differences[7]).not.toEqual([]);
    expect(differences[7]).toContainEqual({ path: '/request/ContextFrames/0/Payload/currentObservation/Data/frontiers/0/direction', left: 'east', right: 'north' });
    const disclosed = /^\/(request\/Observations\/2\/Data\/observation\/data|request\/ContextFrames\/0\/Payload\/currentObservation\/Data|refinementObservation\/Data\/observation\/data)\/frontiers\/[0-3]\/(direction|at\/(column|row)|source\/index|frontier\/selection\/(direction|at\/cell\/(column|row)|source\/index))$/;
    expect(differences[7].every((difference: { path: string }) => disclosed.test(difference.path))).toBe(true);
  } finally {
    await info.attach('planner-inputs-raw.json', { body: JSON.stringify(await capture(), null, 2), contentType: 'application/json' });
    await info.attach('planner-pair-raw.json', { body: JSON.stringify({ roots, sent: wire.sent, received: wire.received }, null, 2), contentType: 'application/json' });
  }
});
