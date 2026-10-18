import { test, expect, evidence } from './canonical-agentica-interaction.test';
import { confirmed, effectsOf, expectSingleChestEffect, pulse, reloadOriginal } from './canonical-agentica-interaction.support';
import { MAX_LAUNCH_START_BYTES } from '../../src/persistence/canonical/agentica/launch.types';

test('inspect token admits without effects; driver opens once, retains sanitized decision, and Stop ACKs only the child', async ({ page }, info) => {
  const { s, peer } = await confirmed(page);
  const startBytes = Buffer.byteLength(JSON.stringify(s.entry.request), 'utf8');
  expect(s.entry.request.capabilities.map(c => c.id)).toEqual(['maze.observe', 'maze.inspect', 'maze.navigate', 'maze.explore', 'maze.interact']);
  expect(MAX_LAUNCH_START_BYTES).toBe(3584); expect(startBytes).toBeLessThanOrEqual(MAX_LAUNCH_START_BYTES);
  expect(s.action.arguments).toEqual({ target: s.inspected.target });
  expect(s.operationId).toBe(s.proof.operationId);
  expect(s.proof.proof!.value).toMatchObject({ proof: 'interaction' });
  expect(s.after).toEqual(s.before); expect(await effectsOf(page)).toEqual(s.before);
  const pending = await page.evaluate(id => window.canonicalAgenticaInteraction.readInteraction(id), s.operationId);
  expect(pending.value.progress).toMatchObject({ status: 'pending', sequence: 0, result: null });
  expect(pending.value.operation.ackPolicy).toBe('verified-host');
  expect(await pulse(page)).toEqual({ status: 'applied-interaction', sequence: 1 });
  const applied = (await page.evaluate(a => window.canonicalAgenticaInteraction.operation(a), s.action)).value!;
  const after = await effectsOf(page), chest = expectSingleChestEffect(s.before, after);
  expect(applied.kind).toBe('interaction'); expect(applied.progress.status).toBe('applied');
  const event = applied.event!.data.event;
  expect(Object.keys(event).sort()).toEqual(['actionId', 'eventId', 'hostId', 'kind', 'observation', 'operationId', 'sequence', 'sessionEpoch', 'sessionId', 'summary', 'usage']);
  expect(event).toMatchObject({ kind: 'progress', sequence: 2, actionId: s.action.actionId, operationId: s.operationId, usage: {} });
  expect(event.observation.data).toEqual({ scope: 'actor', actor: { level: after.roster.checkpoint.position.level,
    ...after.roster.checkpoint.position.cell, facing: after.roster.checkpoint.facing, mode: after.roster.checkpoint.mode },
    source: { sequence: after.observation.header.sequence, id: after.roster.checkpoint.knowledge!.id, revision: after.observation.header.revision },
    interaction: { kind: 'open-chest', outcome: 'applied', itemsReceived: chest.loot!.length } });
  for (const id of [chest.id, ...chest.loot!.map(item => item.id)]) expect(JSON.stringify(event)).not.toContain(id);
  expect(await pulse(page)).toEqual({ status: 'locally-settled', progress: 'applied' });
  const decision = await pulse(page);
  expect(decision).toMatchObject({ status: 'decision-required', event: { kind: 'decision', sequence: 3 } });
  expect('event' in decision && decision.event).not.toHaveProperty('completion');
  expect(await pulse(page)).toEqual(decision); expect(peer.deliveries).toEqual([applied.confirmation.data.probe]);
  await page.evaluate(() => window.canonicalAgenticaInteraction.cancel());
  expect(await pulse(page)).toEqual({ status: 'terminal-prefix-delivered', sequence: 2 });
  expect(peer.deliveries[1]).toEqual(event);
  expect(await pulse(page)).toEqual({ status: 'terminal-acknowledged', disposition: 'decision' });
  expect(peer.stops).toEqual(['event' in decision ? decision.event : null]);
  const terminal = (await page.evaluate(s => window.canonicalAgenticaInteraction.terminal(s.action, s.binding),
    { action: s.action, binding: s.binding })).value!;
  const root = await page.evaluate(id => window.canonicalAgenticaInteraction.live(id), s.boot.launchGuard);
  expect(terminal.bound.operation.state).toBe('acknowledged'); expect(terminal.bound.progress).toEqual(applied.progress);
  expect(root!.state).toBe('settled'); expect(root!.terminal!.disposition).toBe('cancelled');
  expect((await page.evaluate(() => window.canonicalAgenticaInteraction.readCanonicalHead())).head.quota.reservations).toBe(1);
  expect(peer.entry().wakeRunId).toBeUndefined(); expect(await effectsOf(page)).toEqual(after);
  await reloadOriginal(page, s);
  const replay = await page.evaluate(async a => {
    const f = window.canonicalAgenticaInteraction, before = await f.dump(), result = await f.dispatch(a);
    return { before, after: await f.dump(), result };
  }, s.action);
  expect(replay.result).toEqual(s.admission); expect(replay.after).toBe(replay.before);
  expect(await pulse(page)).toEqual({ status: 'terminal-acknowledged', disposition: 'decision' });
  expect(await effectsOf(page)).toEqual(after); expect(peer.deliveries).toHaveLength(2); expect(peer.stops).toHaveLength(1);
  expect(peer.violations).toEqual([]);
  await evidence(info, 'interaction-decision-stop-reload.json', { s, startBytes, pending, applied, after, event, decision, terminal, root, replay, deliveries: peer.deliveries, stops: peer.stops });
});

for (const afterApply of [false, true]) test(`Stop ${afterApply ? 'after' : 'before'} apply preserves exactly the committed outcome`, async ({ page }, info) => {
  const { s, peer } = await confirmed(page);
  if (afterApply) expect(await pulse(page)).toEqual({ status: 'applied-interaction', sequence: 1 });
  const beforeStop = await effectsOf(page);
  if (afterApply) expectSingleChestEffect(s.before, beforeStop); else expect(beforeStop).toEqual(s.before);
  await page.evaluate(() => window.canonicalAgenticaInteraction.cancel());
  if (afterApply) expect(await pulse(page)).toEqual({ status: 'terminal-prefix-delivered', sequence: 2 });
  expect(await pulse(page)).toEqual({ status: 'terminal-acknowledged', disposition: 'cancelled' });
  const r = await page.evaluate(async s => {
    const f = window.canonicalAgenticaInteraction, before = await f.dump();
    const refused = await f.refusal(async () => f.apply(s.action, await f.applyRequest(s.operationId)));
    return { refused, before, after: await f.dump(), state: await f.readInteraction(s.operationId) };
  }, { action: s.action, operationId: s.operationId });
  expect(r.refused.rejected).toBe(true); expect(r.after).toBe(r.before);
  expect(r.state.value.progress.sequence).toBe(afterApply ? 1 : 0);
  expect(await effectsOf(page)).toEqual(beforeStop); expect(peer.violations).toEqual([]);
  await evidence(info, `cancel-${afterApply ? 'after' : 'before'}-apply.json`, { s, r, beforeStop, deliveries: peer.deliveries });
});
