import { expect, test } from '@playwright/test';
import type { AgenticaStart } from '../../src/services/agentica/contracts';
import type {} from './agentica-proving';
import { persistEvidence } from './agentica-evidence';

const service = process.env.MAZE_AGENTICA_PROOF_URL;
test.skip(!service, 'Requires the explicit provider-free Agentica fixture host.');
test.setTimeout(180000);

test('human takeover fences effects and a fresh run retains learned map history', async ({ page, request }, info) => {
  const starts: AgenticaStart[] = [];
  page.on('websocket', socket => socket.on('framesent', frame => {
    const message = JSON.parse(String(frame.payload));
    if (message.type === 'start') starts.push(message.payload);
  }));
  const url = service!.replace(/^http/, 'ws') + '/api/host';
  await page.goto('/tests/e2e/agentica-proving.html');
  await page.waitForFunction(() => Boolean(window.proving));
  const first = await page.evaluate(url => window.proving.start(url, undefined, 8), url);
  await page.waitForFunction(() => Boolean(window.proving.takeoverAction)
    || window.proving.events.some(event => ['outcome', 'run.terminated'].includes(event.message.type)));
  expect(await page.evaluate(() => window.proving.takeoverAction)).toBeDefined();
  await expect.poll(async () => page.evaluate(async slot => {
    const action = window.proving.takeoverAction!;
    return (await window.proving.records(slot)).actions.find(value => JSON.parse(value.record.fingerprint).actionId === action.actionId)?.record.status;
  }, first.slot)).toBe('completed');
  const action = await page.evaluate(() => window.proving.takeoverAction!);
  const beforeCancel = await page.evaluate(slot => window.proving.records(slot), first.slot);
  const conflict = beforeCancel.actions.find(value => JSON.parse(value.record.fingerprint).actionId === action.actionId)!;
  expect(conflict.record.result).toMatchObject({ disposition: 'conflict', beforeRevision: 8, afterRevision: 8 });
  expect(beforeCancel.domain.some(receipt => receipt.request.actionId === conflict.commandId)).toBe(false);
  await page.evaluate(() => window.proving.client!.cancel());
  const afterCancel = await page.evaluate(slot => window.proving.records(slot), first.slot);
  expect(afterCancel.snapshot).toEqual(beforeCancel.snapshot);
  const replay = await page.evaluate(({ slot, action }) => window.proving.persistence.executeAgenticaAction(slot, action), { slot: first.slot, action });
  expect(replay).toEqual(conflict.record.result);

  const known = beforeCancel.snapshot.room.knowledge!;
  const visible = new Set(beforeCancel.snapshot.observation.visibleCells.map(cell => JSON.stringify([cell.spaceId, cell.row, cell.column])));
  const remembered = Object.entries(known.cells).filter(([key]) => !visible.has(key));
  expect(remembered.length).toBeGreaterThan(0);
  await page.evaluate(() => window.proving.client!.close());
  await page.reload(); await page.waitForFunction(() => Boolean(window.proving));
  const reloaded = await page.evaluate(slot => window.proving.stream.loadStreamSnapshot(slot), first.slot);
  expect(reloaded).toEqual(beforeCancel.snapshot);
  const second = await page.evaluate(({ url, slot }) => window.proving.start(url, slot), { url, slot: first.slot });
  expect(second.binding.scopeId).toBe(first.binding.scopeId);
  expect(second.binding.objectiveId).toBe(first.binding.objectiveId);
  expect(Number(second.binding.sessionEpoch)).toBeGreaterThan(Number(first.binding.sessionEpoch));
  const projected = starts.at(-1)!.observation.data.knowledge as typeof known;
  for (const [key, cell] of remembered) expect(projected.cells[key]).toEqual(cell);
  let terminal: any;
  await expect.poll(async () => {
    terminal = await (await request.get(`${service}/api/runs/${second.binding.runId}`)).json();
    return !['starting', 'running', 'awaiting_host'].includes(terminal.status);
  }, { timeout: 150000, intervals: [100, 250, 500] }).toBe(true);
  expect(terminal.status, JSON.stringify(terminal.outcome?.outcome)).toBe('succeeded');
  const final = await page.evaluate(slot => window.proving.records(slot), first.slot);
  expect(final.snapshot.checkpoint.collectedChests).toBe(1);
  const provider = await (await request.get('http://127.0.0.1:5080/evidence')).json();
  const recovered = provider.filter((call: any) => call.scope === second.binding.scopeId && call.epoch === second.binding.sessionEpoch && call.recovered);
  expect(recovered.length).toBeGreaterThan(0);
  const recoveredPage = recovered.find((call: any) => call.recoveredKnowledge?.revision === beforeCancel.snapshot.checkpoint.revision)?.recoveredKnowledge;
  expect(recoveredPage).toBeDefined();
  for (const [key, cell] of remembered) expect(recoveredPage.cells[key]).toEqual(cell);
  await page.evaluate(() => window.proving.client!.close());
  await persistEvidence(info, 'takeover-continuity-evidence', {
    first: first.binding, second: second.binding, fencedRevision: 8, originalConflict: conflict.record.result,
    rememberedCells: remembered.length, originalObservedAtPreserved: true, exactRecoveredEntriesEqual: true, recoveredReads: recovered.length,
    completion: final.snapshot.checkpoint, boundary: 'Host-reprojected saved knowledge in a new epoch, not inherited service hypotheses.',
  });
});
