import { test, expect, evidence } from './canonical-interaction.test';
import type { OperationPreparation } from '../../src/persistence/canonical/operationHost';

test('empty hook results allow each phase without granting hidden-world reads', async ({ page }, info) => {
  const r = await page.evaluate(async () => {
    const c = window.canonicalInteraction, seed = await c.seed(), before = await c.snapshot();
    const empty = { async prepare() {}, async commit() { return {}; } };
    const admission = await c.admit(seed.command, { host: empty }), admitted = await c.readInteraction(admission.id);
    const afterAdmission = await c.snapshot(), request = await c.applyRequest(admission.id);
    const key = c.content.records.chestKey(1, seed.command.chestId);
    const exists = !!(await c.readCanonical(pages => pages.get('world', key))).value;
    const beforeRefusals = await c.dump(), refusals = [];
    for (const phase of ['prepare', 'commit'] as const) for (const method of ['get', 'scan', 'witness'] as const) {
      let disclosed = false;
      const forbidden = async (view: OperationPreparation) => {
        if (method === 'get') await view.knowledge.get('world', key);
        else if (method === 'scan') await view.knowledge.scan('world', key, undefined, 1);
        else await view.knowledge.witness('world', key);
        disclosed = true;
      };
      const failure = await c.refusal(() => c.executeInteractionCommand(request, { host: {
        prepare: phase === 'prepare' ? forbidden : empty.prepare,
        async commit(view) { if (phase === 'commit') await forbidden(view); return {}; },
      } }));
      refusals.push({ phase, method, disclosed, failure, dump: await c.dump() });
    }
    const retained = await c.readInteraction(admission.id), afterRefusals = await c.snapshot();
    const applied = await c.executeInteractionCommand(request, { host: empty }), state = await c.readInteraction(admission.id);
    const settled = await c.settle(admission.id, { host: empty }), terminal = await c.readInteractionTerminal(admission.id);
    return { seed, before, admission, admitted, afterAdmission, exists, beforeRefusals, refusals, retained, afterRefusals,
      applied, state, settled, terminal, after: await c.snapshot() };
  });
  await evidence(info, 'empty-hooks-and-world-read-refusal.json', r);
  expect(r.exists).toBe(true); expect(r.afterAdmission).toEqual(r.before); expect(r.refusals).toHaveLength(6);
  for (const attempt of r.refusals) {
    expect(attempt.disclosed).toBe(false); expect(attempt.failure.rejected).toBe(true);
    expect(attempt.failure.message).toContain('host cannot read hidden world'); expect(attempt.dump).toBe(r.beforeRefusals);
  }
  expect(r.retained).toEqual(r.admitted); expect(r.afterRefusals).toEqual(r.before);
  for (const outcome of [r.admission.outcome, r.applied, r.settled.outcome]) {
    expect(outcome.replayed).toBe(false); expect(outcome.receipt.result).toHaveProperty('host', {});
  }
  for (const head of [r.admitted.head, r.state.head, r.terminal.head]) expect(head.checkpoint.position).toEqual(r.seed.position);
  expect(r.state.value.progress).toMatchObject({ sequence: 1, status: 'applied' });
  expect(r.terminal.value.disposition).toBe('decision');
  expect(r.after.roster.state.inventory.items.filter(item => item.questId === r.seed.target.room.contractId)).toHaveLength(1);
});
