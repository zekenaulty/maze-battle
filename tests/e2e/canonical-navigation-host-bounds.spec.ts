import { test, expect } from './canonical-navigation-test';

for (const fault of ['forged-ref', 'hidden-world', 'navigation-write', 'overwrite', 'ninth-write', 'pending-write']) {
  test(`${fault}: restricted host view cannot change or bypass navigation authority`, async ({ page }) => {
    const result = await page.evaluate(async fault => {
      const c = window.canonicalNavigation, request = await c.hostPhase('step'), before = await c.dump();
      const error = await c.executeNavigationCommand(request, { host: { prepare: async () => {}, commit: async view => {
        if (fault === 'forged-ref') return { event: { key: 'not-written', recordId: 'foreign', revision: 1, sourceAttemptId: 'other' } };
        try {
          if (fault === 'hidden-world') await view.knowledge.get('world', 'dungeon');
          if (fault === 'navigation-write') await view.appendExecution(c.destinationKey(view.operation.id), {});
          if (fault === 'overwrite') { await view.appendExecution('fixture/existing', {}); await view.appendExecution('fixture/existing', {}); }
          if (fault === 'ninth-write') for (let n = 0; n < 9; n++) await view.appendExecution(`fixture/chunk/${n}`, {});
          if (fault === 'pending-write') void view.appendExecution('fixture/unawaited', {}).catch(() => {});
        } catch { /* A caught host capability failure must poison the whole transaction. */ }
        return {};
      } } }).catch(String);
      return { error, before, after: await c.dump() };
    }, fault);
    expect(String(result.error)).toMatch(/not usable|not from this commit/); expect(result.after).toEqual(result.before);
  });
}

test('an oversized host settlement cannot steal reserved bytes, and cancellation still needs no hook', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const c = window.canonicalNavigation, request = await c.hostPhase('settle'), before = await c.dump(), host = c.fixtureHost({ padding: 60000 });
    const error = await c.executeNavigationCommand(request, { host: { ...host, commit: async view => {
      const refs = await host.commit(view); await view.appendExecution('fixture/extra', 'x'.repeat(60000)); return refs;
    } } }).catch(String), after = await c.dump();
    const id = (request.input as any).operationId;
    const cancelled = await c.operateCanonical(c.command((await c.readCanonicalHead()).head, 'operation.cancel', { operationId: id }), 'cancel');
    await c.operateCanonical(c.command((await c.readCanonicalHead()).head, 'operation.acknowledge', {
      operationId: id, terminalAttemptId: cancelled.receipt.attemptId }), 'acknowledge');
    return { before, after, error, terminal: (await c.readDestinationTerminal(id)).value };
  });
  expect(result.error).toContain('exceeds reserved allowance'); expect(result.after).toEqual(result.before);
  expect(result.terminal.disposition).toBe('cancelled'); expect(result.terminal.progress.status).toBe('arrived');
});

test('small composed settlement and acknowledgement still work at normal quota', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const c = window.canonicalNavigation, targets = await c.seed({ limitBytes: 3 * 1024 * 1024, reserveBytes: 128 * 1024 });
    const admission = await c.admit(targets.adjacent); await c.advance(admission.id); await c.fillNormalCapacity();
    const head = (await c.readCanonicalHead()).head, settled = await c.executeNavigationCommand(c.command(head, 'operation.settle', {
      operationId: admission.id, disposition: 'completed' }), { host: c.fixtureHost() });
    await c.operateCanonical(c.command((await c.readCanonicalHead()).head, 'operation.acknowledge', {
      operationId: admission.id, terminalAttemptId: settled.receipt.attemptId }), 'acknowledge');
    return { settled, current: await c.readDestination(admission.id), dump: await c.dump() };
  });
  expect((result.settled.receipt.result as any).host.event.sourceAttemptId).toBe(result.settled.receipt.attemptId);
  expect(result.current.head.quota.reservations).toBe(0); expect(result.current.head.quota.usedBytes).toBe(result.dump.bytes);
});

test('reservation and epoch validation happen before host hooks', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const c = window.canonicalNavigation, request = await c.hostPhase('step'); let calls = 0;
    const host = { prepare: async () => { calls++; }, commit: async () => { calls++; return {}; } };
    await c.controlCanonical(c.command((await c.readCanonicalHead()).head, 'control.takeover', { owner: 'new' }), 'takeover');
    await c.controlCanonical(c.command((await c.readCanonicalHead()).head, 'control.resume', { owner: 'new' }), 'resume');
    const current = c.command((await c.readCanonicalHead()).head, request.operation, request.input), before = await c.dump();
    const errors = [await c.executeNavigationCommand(current, { host }).catch(String),
      await c.executeNavigationCommand(c.command((await c.readCanonicalHead()).head, 'navigation.advance', { operationId: 'missing', sequence: 0 }), { host }).catch(String)];
    return { calls, errors, before, after: await c.dump() };
  });
  expect(result.calls).toBe(0); expect(result.errors.map(String).join(' ')).toContain('explicit adoption'); expect(result.after).toEqual(result.before);
});
