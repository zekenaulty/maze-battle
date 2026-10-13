import { test, expect } from './canonical-navigation-test';

test('cancellation projection uses exact retained receipt/sources/usage at quota and remains identical after stop, acknowledgement and reload', async ({ page }) => {
  const first = await page.evaluate(async () => {
    const c = window.canonicalNavigation, targets = await c.seed({ limitBytes: 3 * 1024 * 1024, reserveBytes: 128 * 1024 }), id = 'cancel-proof';
    const admission = await c.executeNavigationCommand(c.command((await c.readCanonicalHead()).head, 'operation.admit', { operationId: id,
      binding: c.json(c.createDestinationBinding(targets.target)), terminalBytes: c.MIN_TERMINAL_BYTES }), { host: c.fixtureHost() });
    const step = await c.executeNavigationCommand(c.command((await c.readCanonicalHead()).head, 'navigation.advance', { operationId: id, sequence: 0 }), { host: c.fixtureHost() });
    await c.fillNormalCapacity(); const before = await c.dump();
    const refused = await c.executeNavigationCommand(c.command((await c.readCanonicalHead()).head, 'navigation.advance', { operationId: id, sequence: 1 }), { host: c.fixtureHost() }).catch(String);
    const after = await c.dump(), cancel = await c.operateCanonical(c.command((await c.readCanonicalHead()).head, 'operation.cancel', { operationId: id }), 'cancel');
    const proofBefore = await c.dump(), terminal = await c.readDestinationTerminal(id), proofAfter = await c.dump();
    await c.controlCanonical(c.command((await c.readCanonicalHead()).head, 'control.takeover', { owner: 'later-owner' }), 'takeover');
    await c.operateCanonical(c.command((await c.readCanonicalHead()).head, 'operation.acknowledge', { operationId: id,
      terminalAttemptId: terminal.value.terminal.ref.attemptId }), 'acknowledge');
    return { id, admission, step, before, after, refused, cancel, terminal, proofBefore, proofAfter };
  });
  await page.reload(); await page.waitForFunction(() => !!window.canonicalNavigation);
  const reread = await page.evaluate(async id => window.canonicalNavigation.readDestinationTerminal(id), first.id);
  expect(first.refused).toContain('quota exhausted'); expect(first.after).toEqual(first.before);
  expect(first.proofAfter).toEqual(first.proofBefore); expect(first.terminal.stats.writes).toBe(0);
  expect(reread.value).toEqual(first.terminal.value); expect(reread.head.owner).toBe('later-owner'); expect(reread.head.quota.reservations).toBe(0);
  expect(reread.value.terminal.receipt).toEqual(first.cancel.receipt); expect(reread.value.terminal.ref.attemptId).toBe(first.cancel.receipt.attemptId);
  expect(reread.value.admission.receipt).toEqual(first.admission.receipt); expect(reread.value.progressSource.receipt).toEqual(first.step.receipt);
  expect(reread.value.progress).toMatchObject({ sequence: 1, steps: 1, replans: 0, status: 'running', owner: 'owner' });
  // Versioned deterministic fixture projection only, not a mounted SDK event format.
  const event = (p: typeof reread.value) => ({ version: 1, id: `cancel:${p.terminal.ref.attemptId}`, at: p.terminal.receipt.committedAt,
    terminalRef: p.terminal.ref, operationId: p.operationId, usage: { steps: p.progress.steps, replans: p.progress.replans },
    action: (p.admission.receipt.result as any).host.actionResult, source: (p.progressSource.receipt.result as any).host.event });
  expect(event(reread.value)).toEqual(event(first.terminal.value));
});

for (const corruption of ['missing-terminal', 'cancel-result', 'progress-source', 'terminal-usage']) test(`${corruption}: terminal proof fails closed without writes`, async ({ page }) => {
  const result = await page.evaluate(async corruption => {
    const c = window.canonicalNavigation, request = await c.hostPhase('settle'), id = (request.input as any).operationId;
    const terminal = corruption === 'terminal-usage' ? await c.executeNavigationCommand(request) : await c.operateCanonical(
      c.command((await c.readCanonicalHead()).head, 'operation.cancel', { operationId: id }), 'cancel');
    const db = await c.openCanonicalDatabase(), receipt = terminal.receipt;
    if (corruption === 'missing-terminal') await db.delete('receipts', [receipt.gameId, receipt.attemptId]);
    else if (corruption === 'progress-source') {
      const p = (await c.readDestination(id)).value.progress; await db.delete('receipts', [receipt.gameId, p.sourceAttemptId]);
    } else {
      if (corruption === 'cancel-result') (receipt.result as any).phase = 'settle'; else (receipt.result as any).steps++;
      await db.put('receipts', receipt, [receipt.gameId, receipt.attemptId]);
    }
    db.close(); const before = await c.dump(), error = await c.readDestinationTerminal(id).catch(String);
    return { before, after: await c.dump(), error };
  }, corruption);
  expect(String(result.error)).toMatch(/Error:/); expect(result.after).toEqual(result.before);
});
