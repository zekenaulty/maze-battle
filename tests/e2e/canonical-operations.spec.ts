import { expect, test } from './canonical-test';
import type { CanonicalRequest } from '../../src/persistence/canonical/types';

test('admission reserves capacity atomically with actual local records and exact receipt', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const c = window.canonical, { head } = await c.initializeCanonical('owner', {});
    const command = c.command(head, 'operation.admit', { operationId: 'op', binding: { target: 'known-room', actionId: 'a' }, terminalBytes: c.MIN_TERMINAL_BYTES });
    const admitted = await c.operateCanonical(command, 'admit', async tx => {
      await tx.pages.set('execution', 'journey/op', { target: tx.operation.binding.target, steps: 0 }); return { admitted: true };
    });
    const before = await c.dump();
    const replay = await c.operateCanonical(command, 'admit', async () => { throw Error('duplicate'); });
    const current = await c.readCanonical(async p => ({ operation: await p.liveOperation('op'), journey: await p.get('execution', 'journey/op') }));
    const duplicate = await c.operateCanonical(c.command(current.head, 'operation.admit', command.input), 'admit', async () => null).catch(String);
    return { admitted, replay, current, before, after: await c.dump(), duplicate };
  });
  expect(result.replay.receipt).toEqual(result.admitted.receipt); expect(result.after).toEqual(result.before);
  expect(result.current.head.quota).toMatchObject({ reservations: 1, reservedBytes: 147456 });
  expect(result.current.head.quota.usedBytes).toBe(result.after.bytes);
  expect(result.current.value.operation).toMatchObject({ state: 'admitted', binding: { target: 'known-room', actionId: 'a' } });
  expect(result.current.value.journey?.value).toEqual({ target: 'known-room', steps: 0 });
  expect(result.duplicate).toContain('already exists');
});

test('completion and acknowledgement remain funded after normal capacity is exhausted', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const c = window.canonical, setup = await c.admitFixtureOperation({ limitBytes: 300_000, reserveBytes: 65_536 });
    const firstFill = await c.fillNormalCapacity(), before = (await c.readCanonicalHead()).head;
    const input = c.command(before, 'operation.settle', { operationId: 'operation-1', disposition: 'completed' });
    const settlement = await c.operateCanonical(input, 'settle', async tx => {
      await tx.pages.set('knowledge', 'terminal-source', { originalTarget: tx.operation.binding.target, proven: true }, ['source/terminal']);
      return { evidence: 'terminal-source', payload: 'x'.repeat(12_000) };
    });
    const afterSettlement = (await c.readCanonicalHead()).head;
    const secondFill = await c.fillNormalCapacity();
    const acknowledgement = c.command((await c.readCanonicalHead()).head, 'operation.acknowledge', { operationId: 'operation-1', terminalAttemptId: input.attemptId });
    const ack = await c.operateCanonical(acknowledgement, 'acknowledge');
    const after = await c.readCanonical(async p => ({ operation: await p.liveOperation('operation-1'), evidence: await p.get('knowledge', 'terminal-source') }));
    const dump = await c.dump();
    return { setup: setup.head, firstFill, secondFill, before, afterSettlement, settlement, ack, after, dump };
  });
  expect(result.firstFill).toBeGreaterThan(0); expect(result.secondFill).toBeGreaterThan(0);
  expect(result.afterSettlement.quota).toMatchObject({ reservations: 1, reservedBytes: 16384 });
  expect(result.afterSettlement.quota.usedBytes - result.before.quota.usedBytes).toBeLessThanOrEqual(131072);
  expect(result.after.head.quota).toMatchObject({ reservations: 0, reservedBytes: 0, usedBytes: result.dump.bytes });
  expect(result.after.value.operation?.state).toBe('acknowledged'); expect(result.after.value.evidence?.value).toMatchObject({ proven: true });
});

test('new owner can cancel and acknowledge at capacity after Stop/takeover without adopting or changing world knowledge', async ({ page }) => {
  const saved = await page.evaluate(async () => {
    const c = window.canonical, setup = await c.admitFixtureOperation({ limitBytes: 300_000, reserveBytes: 65_536 });
    await c.fillNormalCapacity();
    const before = (await c.readCanonicalHead()).head;
    const taken = await c.controlCanonical(c.command(before, 'control.takeover', { owner: 'rescuer' }), 'takeover');
    return { roots: before.roots, taken, original: JSON.stringify(setup.input) };
  });
  await page.reload(); await page.waitForFunction(() => !!window.canonical);
  const result = await page.evaluate(async original => {
    const c = window.canonical, cancelled = c.command((await c.readCanonicalHead()).head, 'operation.cancel', { operationId: 'operation-1' });
    const terminal = await c.operateCanonical(cancelled, 'cancel');
    const ackInput = c.command((await c.readCanonicalHead()).head, 'operation.acknowledge', { operationId: 'operation-1', terminalAttemptId: cancelled.attemptId });
    const ack = await c.operateCanonical(ackInput, 'acknowledge');
    const current = await c.readCanonical(p => p.liveOperation('operation-1'));
    const admissionReplay = await c.operateCanonical(JSON.parse(original) as CanonicalRequest, 'admit', async () => { throw Error('duplicate'); });
    const before = await c.dump(), terminalReplay = await c.operateCanonical(cancelled, 'cancel'), ackReplay = await c.operateCanonical(ackInput, 'acknowledge');
    return { terminal, ack, current, admissionReplay, terminalReplay, ackReplay, before, after: await c.dump() };
  }, saved.original);
  expect(result.current.head).toMatchObject({ status: 'stopped', owner: 'rescuer', roots: saved.roots });
  expect(result.current.head.quota).toMatchObject({ reservedBytes: 0, reservations: 0 });
  expect(result.current.value).toMatchObject({ state: 'acknowledged', terminal: { disposition: 'cancelled' } });
  expect(result.terminalReplay.receipt).toEqual(result.terminal.receipt); expect(result.ackReplay.receipt).toEqual(result.ack.receipt);
  expect(result.admissionReplay.replayed).toBe(true); expect(result.before).toEqual(result.after);
});

test('completion under a new owner requires explicit operation adoption', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const c = window.canonical; await c.admitFixtureOperation();
    await c.controlCanonical(c.command((await c.readCanonicalHead()).head, 'control.takeover', { owner: 'new-owner' }), 'takeover');
    await c.controlCanonical(c.command((await c.readCanonicalHead()).head, 'control.resume', { owner: 'new-owner' }), 'resume');
    const refused = await c.operateCanonical(c.command((await c.readCanonicalHead()).head, 'operation.settle', { operationId: 'operation-1', disposition: 'completed' }), 'settle', async () => { throw Error('should not execute'); }).catch(String);
    const original = (await c.readCanonical(p => p.liveOperation('operation-1'))).value!;
    await c.operateCanonical(c.command((await c.readCanonicalHead()).head, 'operation.adopt', { operationId: 'operation-1' }), 'adopt');
    const final = await c.operateCanonical(c.command((await c.readCanonicalHead()).head, 'operation.settle', { operationId: 'operation-1', disposition: 'decision' }), 'settle', async () => ({ decision: true }));
    return { refused, original, final, latest: (await c.readCanonical(p => p.liveOperation('operation-1'))).value };
  });
  expect(result.refused).toContain('explicit adoption'); expect(result.latest?.binding).toEqual(result.original.binding);
  expect(result.latest?.admissionAttemptId).toBe(result.original.admissionAttemptId);
  expect(result.latest).toMatchObject({ owner: 'new-owner', state: 'settled', terminal: { disposition: 'decision' } });
});

test('oversized settlement rolls back its effects and leaves the minimal cancellation allowance intact', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const c = window.canonical; await c.admitFixtureOperation(); const before = await c.dump();
    const failure = await c.operateCanonical(c.command((await c.readCanonicalHead()).head, 'operation.settle', { operationId: 'operation-1', disposition: 'completed' }), 'settle', async tx => {
      for (let i = 0; i < 3; i++) await tx.pages.set('world', `excess/${i}`, 'x'.repeat(60_000));
      return null;
    }).catch(String);
    const afterFailure = await c.dump();
    await c.operateCanonical(c.command((await c.readCanonicalHead()).head, 'operation.cancel', { operationId: 'operation-1' }), 'cancel');
    return { failure, before, afterFailure, operation: (await c.readCanonical(p => p.liveOperation('operation-1'))).value };
  });
  expect(result.failure).toContain('reserved allowance'); expect(result.afterFailure).toEqual(result.before);
  expect(result.operation).toMatchObject({ state: 'settled', terminal: { disposition: 'cancelled' } });
});

test('multiple reservations cannot spend each other or exceed the pending count bound', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const c = window.canonical; await c.initializeCanonical('owner', {});
    for (let i = 0; i < 16; i++) await c.operateCanonical(c.command((await c.readCanonicalHead()).head, 'operation.admit', {
      operationId: `op-${i}`, binding: { i }, terminalBytes: c.MIN_TERMINAL_BYTES }), 'admit', async () => null);
    const head = (await c.readCanonicalHead()).head, before = await c.dump();
    const tooMany = await c.operateCanonical(c.command(head, 'operation.admit', { operationId: 'extra', binding: {}, terminalBytes: c.MIN_TERMINAL_BYTES }), 'admit', async () => null).catch(String);
    const afterFailure = await c.dump();
    await c.operateCanonical(c.command(head, 'operation.cancel', { operationId: 'op-5' }), 'cancel');
    const next = (await c.readCanonicalHead()).head;
    return { head, next, tooMany, before, afterFailure, untouched: (await c.readCanonical(p => p.liveOperation('op-6'))).value };
  });
  expect(result.tooMany).toContain('pending operation limit'); expect(result.afterFailure).toEqual(result.before);
  expect(result.next.quota.reservedBytes).toBe(result.head.quota.reservedBytes - 131072); expect(result.next.quota.reservations).toBe(16);
  expect(result.untouched?.state).toBe('admitted');
});
