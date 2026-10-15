import { test, expect, prepare } from './canonical-decision.test';

for (const missing of ['original-publication', 'latest-progress-event'] as const)
  test(`deleted predecessor ${missing} rejects successor reads and fresh actions without writes`, async ({ page }) => {
    const first = await page.evaluate(() => window.canonicalDecision.boot(true));
    for (let step = 1; step <= 3; step++) {
      const progress = await page.evaluate(() => window.canonicalDecision.advance());
      expect(progress.steps).toBe(step); expect(progress.status).toBe(step === 3 ? 'arrived' : 'running');
    }
    await page.evaluate(() => window.canonicalDecision.settle()); await prepare(page);
    const r = await page.evaluate(async ({ first, missing }) => {
      const c = window.canonicalDecision; await c.claim(await c.proof()); await c.grant();
      const grant = (await c.readGrant())!, state = await c.state(), selected = state.selection!;
      const publications = [state.launch.binding.publication, first.binding.publication, grant.record.value.data.publication];
      const latest = state.operation!.event!, ref = missing === 'original-publication' ? first.binding.publication : latest.reference;
      // Capture the valid successor binding before corruption; no discovery read may mask the action's own gate.
      const source = { started: grant.started, request: grant.start, usage: state.claim!.data.usage,
        binding: { grant: selected.value.data.grant, publication: selected.value.data.publication } };
      const before: Array<[string, Array<{ id?: string }>]> = JSON.parse(await c.dump());
      const deleted = await c.deleteEvidence(ref), corrupt = await c.dump();
      const expected = before.map(([store, rows]) => [store, store === 'records' ? rows.filter(row => row.id !== ref.id) : rows]);
      const onlyTargetDeleted = JSON.stringify(expected) === JSON.stringify(JSON.parse(corrupt));
      const readError = await c.readGrant().then(() => 'accepted', String), readUnchanged = corrupt === await c.dump();
      const actionError = await c.seedWindow(source).then(() => 'accepted', String);
      return { publications, latest, sequence: state.operation!.progress.sequence, ref, deleted, onlyTargetDeleted,
        readError, readUnchanged, actionError, actionUnchanged: corrupt === await c.dump() };
    }, { first, missing });
    expect(new Set(r.publications.map(p => p.id)).size).toBe(3);
    expect(new Set(r.publications.map(p => p.key)).size).toBe(3);
    expect(r.sequence).toBe(3); expect(r.latest.reference.key).toMatch(/\/events\/3$/);
    expect(r.latest.data.event.kind).toBe('progress');
    expect(r.ref).toEqual(missing === 'original-publication' ? first.binding.publication : r.latest.reference);
    expect(r.deleted.id).toBe(r.ref.id); expect(r.onlyTargetDeleted).toBe(true);
    expect(r.readError).toContain('missing referenced record'); expect(r.readUnchanged).toBe(true);
    expect(r.actionError).toContain('missing referenced record'); expect(r.actionUnchanged).toBe(true);
  });
