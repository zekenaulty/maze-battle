import { test, expect, fixture } from './rpg-command-browser';
import type * as Discovery from './rpg-discovery-fixture';

test('fixed corridor actions reveal identical semantic evidence until the hidden A/B fork enters sight', async ({ browser }, info) => {
  const runs = [];
  for (const variant of ['A', 'B'] as const) {
    const context = await browser.newContext(), errors: string[] = [], external: string[] = [];
    await context.route('**/*', route => {
      if (new URL(route.request().url()).origin === 'http://127.0.0.1:5204') return route.continue();
      external.push(route.request().url()); return route.abort();
    });
    try {
      const page = await context.newPage(); page.on('pageerror', e => errors.push(e.message)); await fixture(page);
      runs.push(await page.evaluate(async variant => {
        const path = '/tests/e2e/rpg-discovery-fixture.ts';
        await (await import(/* @vite-ignore */ path) as typeof Discovery).setupDiscovery(variant, true);
        const h = window.rpgDiscovery, query = await h.invoke('maze.frontiers', { limit: 12 });
        const frontier = (query.result.observation!.data.context as any).frontiers[0];
        const admitted = await h.invoke('maze.explore', { row: frontier.anchor.row, column: frontier.anchor.column,
          direction: frontier.direction, sourceId: frontier.source.id, continuation: 'corridor-v1' });
        const rows = [], raw = [];
        for (let step = 0; step <= 6; step++) {
          const event = step ? (await h.walk(admitted.result.operation!.operationId, 1))[0] : undefined;
          const response = await h.invoke('maze.observe', {}), view = response.result.observation!.data;
          const travel = (await h.session.readTravel())!.travel;
          raw.push({ response, event, travel });
          rows.push({ actor: view.actor, cells: view.cells, observedCellCount: view.observedCellCount, truncated: view.truncated,
            event: event?.kind, steps: travel.operation.steps, target: travel.operation.target, trail: travel.exploration!.trail,
            notice: travel.exploration!.decision && { kind: travel.exploration!.decision.kind, at: travel.exploration!.decision.at } });
        }
        return { variant, query, admitted, rows, raw };
      }, variant));
      expect(errors).toEqual([]); expect(external).toEqual([]);
    } finally { await context.close(); }
  }
  // IDs/timestamps differ by run, but every disclosed domain fact and local choice must match.
  expect(runs[0].rows.slice(0, 6)).toEqual(runs[1].rows.slice(0, 6));
  expect(runs[0].rows[6].cells).not.toEqual(runs[1].rows[6].cells);
  for (const run of runs) expect(run.rows[6]).toMatchObject({ event: 'decision', steps: 6,
    notice: { kind: 'junction', at: { floor: 1, row: 6, column: 8 } } });
  await info.attach('corridor-equivalence', { contentType: 'application/json', body: JSON.stringify(runs) });
});
