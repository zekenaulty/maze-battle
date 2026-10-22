import { test, expect, reload, attach } from './canonical-exploration-prefix.test';
import type { CanonicalRequest } from '../../src/persistence/canonical/types';

const cases = [
  { mode: 'resume', history: 'compact', moves: 126 },
  { mode: 'adopt', history: 'compact', moves: 126 },
  { mode: 'adopt', history: 'original', moves: 160 },
] as const;
for (const { mode, history, moves } of cases) test(`22-step earned survey: ${mode}, ${moves}-move history, native 16-step refill, exact replay and funded Stop`, async ({ page }, info) => {
  const limits = { steps: mode === 'resume' ? 26 : 32, replans: 1, durationMs: 120_000 };
  const initial = await page.evaluate(async ({ limits, history }) => {
    const c = window.canonicalExplorationPrefix, seeded = await c.seed(history), effects = await c.effects();
    const admission = await c.admit(limits);
    try {
      const atomic = history === 'original'
        ? [await c.rejectObservationProof('storage-failure'), await c.rejectObservationProof('write-budget')] : [];
      const memoryAtomic = [];
      if (history === 'original') {
        const storage = await c.rejectMemoryProof(admission.id, 'storage-failure'); memoryAtomic.push(storage);
        memoryAtomic.push(await c.rejectMemoryProof(admission.id, 'write-budget', storage.setsBeforeProof));
      }
      const approach = await c.capture(admission.id, 8), survey = await c.survey();
      const first = history === 'original' ? await c.capture(admission.id, 7) : [];
      const audit = history === 'original'
        ? await c.auditRequiredSources((await c.readDestination(admission.id)).value.progress.route[0].to) : null;
      const prefix = [...first, ...await c.capture(admission.id, 16 - first.length)];
      return { seeded, effects, admission, atomic, memoryAtomic, audit, approach, survey, prefix, retained: await c.readDestination(admission.id), digest: await c.digest() };
    } catch (cause) {
      const retained = await c.readDestination(admission.id), next = retained.value.progress.route[0]?.to;
      return { error: String(cause), seeded, admission, retained,
        audit: next ? await c.auditRequiredSources(next).catch(error => ({ error: String(error) })) : null };
    }
  }, { limits, history });
  await attach(info, 'earned-prelude-and-first-prefix.json', initial);
  if ('error' in initial) {
    expect(initial.error).toContain('exploration read budget exhausted');
    expect(history).toBe('original');
    expect(initial.retained.value.progress).toMatchObject({ steps: 15, sequence: 15,
      binding: initial.admission.state.value.progress.binding });
    const cleanup = await page.evaluate(async serialized => {
      const { id, request } = JSON.parse(serialized) as { id: string; request: CanonicalRequest };
      return window.canonicalExplorationPrefix.cleanupBudgetFailure(id, request);
    }, JSON.stringify({ id: initial.admission.id, request: initial.admission.request }));
    await attach(info, 'budget-refusal-replay-and-funded-stop.json', cleanup);
    expect(cleanup.refused).toMatchObject({ rejected: true, message: expect.stringContaining('exploration read budget exhausted') });
    expect(cleanup.repeatedRefusal).toEqual(cleanup.refused); expect(cleanup.unchanged).toBe(true);
    expect(cleanup.admissionReplay.receipt).toEqual(initial.admission.outcome.receipt);
    for (const replay of [cleanup.admissionReplay, cleanup.cancelReplay, cleanup.ackReplay]) {
      expect(replay.replayed).toBe(true); expect(replay.stats.writes).toBe(0);
    }
    expect(cleanup.unchangedAfterReplay).toBe(true);
    expect(cleanup.final.value.progress).toEqual(initial.retained.value.progress);
    expect(cleanup.final.value.operation.state).toBe('acknowledged');
    expect(cleanup.final.head.quota.reservations).toBe(0); expect(cleanup.final.head.quota.reservedBytes).toBe(0);
    expect(cleanup.final.head.checkpoint).toEqual(initial.retained.head.checkpoint);
    expect(cleanup.final.head.roots.world).toBe(initial.seeded.prepared.roots.world);
    throw Error(initial.error);
  }
  const id = initial.admission.id, original = initial.retained.value.progress;
  if (initial.audit) {
    expect(initial.audit.value.currentCells).toBe(79); expect(initial.audit.value.prospectiveCells).toBe(71);
    expect(initial.audit.value.material).toBeNull(); expect(initial.audit.stats.writes).toBe(0);
    expect(initial.audit.value.comparisonReads).toBeLessThanOrEqual(256);
    expect(initial.audit.value.comparisonBytes).toBeLessThanOrEqual(1024 * 1024);
  }
  expect(initial.atomic).toHaveLength(history === 'original' ? 2 : 0);
  for (const row of initial.atomic) {
    expect(row.manifestWrites).toBe(1); expect(row.unchanged).toBe(true);
    expect(row.result).toMatchObject({ rejected: true, message: expect.stringContaining(
      row.mode === 'storage-failure' ? 'Injected observation manifest failure' : 'write budget exhausted') });
  }
  expect(initial.memoryAtomic).toHaveLength(history === 'original' ? 2 : 0);
  for (const row of initial.memoryAtomic) {
    expect(row.result).toMatchObject({ rejected: true, message: expect.stringContaining(
      row.mode === 'storage-failure' ? 'ConstraintError' : 'write budget exhausted') });
    expect(row.proofAttempts).toBe(1); expect(row.successfulSets).toBeGreaterThan(0);
    expect(row.proofStaged).toBe(row.mode === 'storage-failure');
    expect(row.nativeBlockAdds).toBe(row.mode === 'storage-failure' ? 1 : 0);
    expect(row.nativeProofAdds).toBe(row.mode === 'storage-failure' ? 2 : 0);
    expect(row.staged).toMatchObject({ area: 'knowledge', revision: initial.admission.state.head.revision + 1 });
    expect(row.proof).toMatchObject({ schema: 1, recordId: row.staged!.id, revision: row.staged!.revision });
    expect(row.observedCells).toBeGreaterThan(0); expect(row.observedCells).toBeLessThanOrEqual(113);
    expect(row.targetAfter).toEqual([{ at: row.target, state: 'unknown' }]);
    expect(row.database.unchanged).toBe(true); expect(row.database.beforeBytes).toBe(row.database.afterBytes);
    expect(row.before).toEqual({ head: initial.admission.state.head, value: initial.admission.state.value });
    expect(row.after).toEqual(row.before);
    expect(row.after.head.allocations[initial.admission.id].bytes).toBeGreaterThan(0);
    expect(row.after.head.quota.reservations).toBe(1);
    if (row.mode === 'write-budget') {
      expect(row.limits.writes).toBe(row.setsBeforeProof); expect(row.successfulSets).toBe(row.setsBeforeProof);
    }
  }
  const admitted = initial.admission.state.value.progress;
  const plan = initial.survey.value.plan, full = initial.survey.value.full!;
  expect(initial.seeded.moves).toHaveLength(moves);
  expect(initial.seeded.head.roots.world).toBe(initial.seeded.prepared.roots.world);
  expect(initial.seeded.head.checkpoint).toMatchObject({ position: { cell: { spaceId: 'socket-0:room', row: 0, column: 5 } } });
  expect(initial.admission.selection).toEqual(initial.admission.frontiers.value.find(f => f.at.cell.spaceId === 'socket-0:room'));
  expect(initial.admission.selection).toMatchObject({ at: { cell: { row: 2, column: 0 } }, direction: 'south' });
  expect(admitted).toMatchObject({ steps: 0, sequence: 0, replans: 0, status: 'running', reason: null,
    sourceAttemptId: initial.admission.request.attemptId,
    binding: { frontier: initial.admission.selection, target: initial.admission.selection.at, limits } });
  expect(initial.approach).toHaveLength(8);
  expect(initial.approach.every(row => row.state.value.status === 'running')).toBe(true);
  expect(initial.approach.at(-1)!.state.value.progress).toMatchObject({ steps: 8, exploration: { phase: 'cross-frontier' },
    position: { cell: { spaceId: 'socket-0:room', row: 3, column: 0 } } });
  expect(plan).toMatchObject({ target: { level: 1, cell: { spaceId: 'socket-0:room', row: 11, column: 0 } },
    window: { floor: 1, row: 8, column: -10, rows: 21, columns: 21 } });
  expect(full.complete).toBe(true); expect(full.steps).toHaveLength(22); expect(plan.route).toHaveLength(16);
  expect(initial.survey.stats.writes).toBe(0);
  expect(initial.survey.accesses.length).toBeGreaterThan(0);
  expect(initial.survey.accesses.every(key => key.startsWith('perception/'))).toBe(true);
  expect(initial.prefix).toHaveLength(16);
  expect(initial.prefix.map(row => row.state.value.progress.position)).toEqual(full.steps.slice(0, 16).map(step => step.to));
  const cursor = { phase: 'survey', target: plan.target, window: plan.window };
  for (const [index, row] of initial.prefix.entries()) {
    expect(row.state.value.progress).toMatchObject({ status: 'running', reason: null, steps: index + 9, replans: 0,
      binding: admitted.binding, startedAt: admitted.startedAt, deadline: admitted.deadline, exploration: cursor });
    expect(row.state.value.progress.route).toEqual(plan.route.slice(index + 1));
    expect(row.state.head.roots.world).toBe(initial.seeded.head.roots.world);
  }
  expect(original).toMatchObject({ steps: 24, sequence: 24, route: [], replans: 0, exploration: cursor });
  expect(original.binding.limits).toEqual(limits);
  expect(original.binding).toEqual(admitted.binding);
  expect(original.deadline).toBe(original.startedAt + limits.durationMs);
  expect(initial.retained.head.quota.reservations).toBe(1);

  const ownership = await page.evaluate(async ({ id, mode }) => {
    const c = window.canonicalExplorationPrefix, before = await c.readDestination(id);
    if (mode === 'resume') return { before, current: before, digest: await c.digest(), refusals: null };
    const stale = c.command(before.head, 'navigation.advance', { operationId: id, sequence: before.value.progress.sequence });
    await c.controlCanonical(c.command(before.head, 'control.takeover', { owner: 'successor' }), 'takeover');
    const taken = await c.readDestination(id);
    await c.controlCanonical(c.command(taken.head, 'control.resume', { owner: 'successor' }), 'resume');
    const prior = await c.digest(), oldOwner = await c.refusal(() => c.executeNavigationCommand(stale));
    const unadopted = await c.refusal(() => c.advance(id));
    return { before, current: await c.readDestination(id), digest: await c.digest(), refusals: { prior, oldOwner, unadopted, taken } };
  }, { id, mode });
  await attach(info, 'before-native-reload.json', ownership);
  expect(ownership.current.value.progress).toEqual(original);
  expect(ownership.current.head.checkpoint).toEqual(initial.retained.head.checkpoint);
  expect(ownership.current.head.roots).toEqual(initial.retained.head.roots);
  if (ownership.refusals) {
    expect(ownership.refusals.taken.head.status).toBe('stopped');
    expect(ownership.current.head.epoch).toBeGreaterThan(initial.retained.head.epoch);
    expect(ownership.refusals.oldOwner).toMatchObject({ rejected: true, message: expect.stringContaining('stale owner or revision') });
    expect(ownership.refusals.unadopted).toMatchObject({ rejected: true, message: expect.stringContaining('needs explicit adoption') });
    expect(ownership.digest).toBe(ownership.refusals.prior);
  } else expect(ownership.digest).toBe(initial.digest);
  await reload(page);
  const resumed = await page.evaluate(async ({ id, mode }) => {
    const c = window.canonicalExplorationPrefix, before = await c.digest(), loaded = await c.readDestination(id), afterRead = await c.digest();
    const adoption = mode === 'adopt' ? await c.operateCanonical(c.command(loaded.head, 'operation.adopt', { operationId: id }), 'adopt') : null;
    const adopted = await c.readDestination(id), beforeRefill = await c.digest(), refill = await c.refill(id), afterRefill = await c.digest();
    const step = await c.advance(id);
    return { before, loaded, afterRead, adoption, adopted, beforeRefill, refill, afterRefill, step,
      current: await c.readDestination(id), effects: await c.effects() };
  }, { id, mode });
  await attach(info, 'native-reload-and-refill.json', resumed);
  expect(resumed.before).toBe(ownership.digest); expect(resumed.afterRead).toBe(resumed.before);
  expect(resumed.loaded.value).toEqual(ownership.current.value);
  expect(resumed.loaded.head).toEqual(ownership.current.head);
  expect(resumed.adopted.value.progress).toEqual(original);
  expect(resumed.adopted.head.checkpoint).toEqual(initial.retained.head.checkpoint);
  expect(resumed.adopted.head.roots).toEqual(initial.retained.head.roots);
  expect(resumed.adopted.value.operation).toMatchObject({ owner: mode === 'adopt' ? 'successor' : 'owner',
    epoch: resumed.adopted.head.epoch, state: 'admitted' });
  expect(resumed.refill.value).toHaveLength(6); expect(resumed.refill.stats.writes).toBe(0);
  expect(resumed.refill.accesses.length).toBeGreaterThan(0);
  expect(resumed.refill.accesses.every(key => key.startsWith('perception/'))).toBe(true);
  expect(resumed.afterRefill).toBe(resumed.beforeRefill);
  expect(resumed.current.value.progress).toMatchObject({ steps: 25, sequence: 25, status: 'running', reason: null,
    replans: mode === 'adopt' ? 1 : 0, binding: original.binding, exploration: cursor,
    owner: resumed.adopted.value.operation.owner, epoch: resumed.adopted.head.epoch,
    startedAt: original.startedAt, deadline: original.deadline, position: full.steps[16].to });
  expect(resumed.current.value.progress.route).toEqual(resumed.refill.value!.slice(1, mode === 'resume' ? 2 : 6));
  expect(resumed.current.head.quota.reservations).toBe(1); expect(resumed.effects).toEqual(initial.effects);

  const stopped = await page.evaluate(async ({ id, mode, serialized }) => {
    const replay = JSON.parse(serialized) as CanonicalRequest;
    const c = window.canonicalExplorationPrefix, tail = await c.capture(id, mode === 'resume' ? 2 : 5);
    const before = await c.readDestination(id), cancelRequest = c.command(before.head, 'operation.cancel', { operationId: id });
    const cancelled = await c.operateCanonical(cancelRequest, 'cancel'), retained = await c.readDestination(id), digest = await c.digest();
    const repeated = await c.executeNavigationCommand(replay);
    const changed = structuredClone(replay); (changed.input as { sequence: number }).sequence++;
    const refused = await c.refusal(() => c.executeNavigationCommand(changed));
    return { tail, before, cancelRequest, cancelled, retained, digest, repeated, refused, after: await c.digest() };
  }, { id, mode, serialized: JSON.stringify(resumed.step.request) });
  await attach(info, 'funded-stop-and-exact-repeat.json', stopped);
  expect(stopped.tail).toHaveLength(mode === 'resume' ? 2 : 5);
  expect(stopped.before.value.progress).toMatchObject({ steps: mode === 'resume' ? 26 : 30,
    status: mode === 'resume' ? 'blocked' : 'running', reason: mode === 'resume' ? 'step-limit' : null,
    replans: mode === 'adopt' ? 1 : 0, binding: original.binding, exploration: cursor,
    startedAt: original.startedAt, deadline: original.deadline });
  if (mode === 'adopt') {
    expect(stopped.tail.map(row => row.state.value.progress.position)).toEqual(full.steps.slice(17).map(step => step.to));
    expect(stopped.before.value.progress.position).toEqual(plan.target);
  } else {
    expect(stopped.tail[0].state.value.progress.position).toEqual(full.steps[17].to);
    expect(stopped.tail[1].state.head.checkpoint).toEqual(stopped.tail[0].state.head.checkpoint);
  }
  expect(stopped.retained.value.status).toBe('cancelled');
  expect(stopped.retained.value.operation.terminal?.disposition).toBe('cancelled');
  expect(stopped.retained.head.checkpoint).toEqual(stopped.before.head.checkpoint);
  expect(stopped.retained.head.quota.reservations).toBe(1);
  expect(stopped.repeated.replayed).toBe(true); expect(stopped.repeated.stats.writes).toBe(0);
  expect(stopped.repeated.receipt).toEqual(resumed.step.outcome.receipt);
  expect(stopped.refused.rejected).toBe(true); expect(stopped.after).toBe(stopped.digest);
  await reload(page);
  const final = await page.evaluate(async ({ id, serialized }) => {
    const { cancelRequest, admissionRequest } = JSON.parse(serialized) as { cancelRequest: CanonicalRequest; admissionRequest: CanonicalRequest };
    const c = window.canonicalExplorationPrefix, before = await c.digest(), loaded = await c.readDestination(id);
    const refused = await c.refusal(() => c.advance(id)), repeated = await c.executeNavigationCommand(admissionRequest);
    const afterReads = await c.digest(), ackRequest = c.command(loaded.head, 'operation.acknowledge',
      { operationId: id, terminalAttemptId: cancelRequest.attemptId });
    const ack = await c.operateCanonical(ackRequest, 'acknowledge'), afterAck = await c.digest();
    const cancelReplay = await c.operateCanonical(cancelRequest, 'cancel'), ackReplay = await c.operateCanonical(ackRequest, 'acknowledge');
    return { before, loaded, refused, repeated, afterReads, ack, afterAck, cancelReplay, ackReplay,
      afterReplay: await c.digest(), state: await c.readDestination(id), effects: await c.effects() };
  }, { id, serialized: JSON.stringify({ cancelRequest: stopped.cancelRequest, admissionRequest: initial.admission.request }) });
  await attach(info, 'stop-reload-funded-ack.json', final);
  expect(final.before).toBe(stopped.digest);
  expect(final.loaded.value).toEqual(stopped.retained.value); expect(final.loaded.head).toEqual(stopped.retained.head);
  expect(final.refused.rejected).toBe(true); expect(final.afterReads).toBe(final.before);
  expect(final.repeated.receipt).toEqual(initial.admission.outcome.receipt);
  for (const replay of [final.repeated, final.cancelReplay, final.ackReplay]) {
    expect(replay.replayed).toBe(true); expect(replay.stats.writes).toBe(0);
  }
  expect(final.cancelReplay.receipt).toEqual(stopped.cancelled.receipt); expect(final.ackReplay.receipt).toEqual(final.ack.receipt);
  expect(final.afterReplay).toBe(final.afterAck);
  expect(final.state.value.operation.state).toBe('acknowledged');
  expect(final.state.head.quota.reservations).toBe(0); expect(final.state.head.quota.reservedBytes).toBe(0);
  expect(final.state.head.checkpoint).toEqual(stopped.before.head.checkpoint);
  expect(final.state.head.roots.world).toBe(initial.seeded.prepared.roots.world); expect(final.effects).toEqual(initial.effects);
});
