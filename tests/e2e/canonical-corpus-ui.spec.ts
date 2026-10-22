import { test, expect } from '@playwright/test';
import { CORPUS_TIME } from './canonical-corpus.layout';
import { FIXTURE, ORIGIN, json, moveEast, openCorpusUi, surfaces } from './canonical-corpus-ui.support';

test.skip(({ baseURL }) => baseURL !== ORIGIN, 'This actual-App cohort runs only in its strict 5446 config, not the broader 5266 corpus glob');

for (const [name, viewport] of [
  ['desktop', { width: 1440, height: 1000 }], ['portrait-phone', { width: 390, height: 844 }],
] as const) test(`${name}: actual App A/B UI is identical before ordinary sight diverges`, async ({ browser }, info) => {
  await json(info, 'predeclared-method', {
    fixture: FIXTURE, viewport, dpr: 1, locale: 'en-US', timezone: 'UTC',
    clock: { start: CORPUS_TIME, eachEastStepMs: 1000, api: 'page.clock.setFixedTime; timers and RAF run normally' },
    uuid: { seed: '0x731c0ffe', stream: 'one fresh document, genesis then actual main.tsx, max 50000', sameForAB: true },
    inputs: 'variant only to privileged initializeCorpus; seven identical ArrowRight inputs through useCanonicalMovement; no discovery prelude',
    oracle: 'native six-store snapshot/hash and full write observer; never supplied to App or movement',
    equality: 'exact raw GameView, draw inputs/fog/camera, room query page, DOM statuses/controls, canvas RGBA and full-page PNG at prefixes 0/6',
    differences: 'ordinary observation must differ at 7; individual UI surfaces may remain equal',
    excluded: 'No gameplay normalization, masks, CSS injection, perception change, query refresh, provider, service, hidden-state actor input',
    timing: 'fixed Date selects same original animation frame; real sprite loads, fonts, idle frames and stable full screenshots required',
    nativeReadback: 'Copy the displayed canvas with createImageBitmap and read an offscreen copy; never redraw domain data or read back the live context',
    network: 'Only local static assets; all WebSockets blocked, including separately retained Vite connection/fallback attempts despite server hmr:false',
    limits: 'Only default low-quota screen and explicit first Rooms/Nearby pages; not diagnostics, capacity warning threshold, room paging, recall or completion proof',
  });
  const a = await openCorpusUi(browser, 'A', viewport);
  try {
    const b = await openCorpusUi(browser, 'B', viewport);
    try {
      await json(info, 'independent-genesis', { A: a.genesis, B: b.genesis });
      for (const genesis of [a.genesis, b.genesis]) {
        expect(genesis.head.checkpoint.knowledge).toBeNull();
        expect(genesis.head.roots.knowledge).toBeNull(); expect(genesis.knowledgeRecords).toBe(0);
        expect(genesis.counts.find(store => store.store === 'operations')!.count).toBe(0);
        expect(genesis.head.checkpoint.position).toEqual({ level: 1, cell: { spaceId: 'entry', row: 2, column: 2 } });
      }
      expect(a.genesis.worldHash).not.toBe(b.genesis.worldHash);
      expect(a.genesis.head.quota.usedBytes).not.toBe(b.genesis.head.quota.usedBytes);
      const comparisons = [];
      for (let step = 0; step <= 7; step++) {
        if (step) { await moveEast(a.page, step); await moveEast(b.page, step); }
        if (![0, 6, 7].includes(step)) continue;
        const left = await surfaces(a.page, info, `A-${step}`), right = await surfaces(b.page, info, `B-${step}`);
        const leftIds = await a.page.evaluate(() => window.corpusControl!.allocations());
        const rightIds = await b.page.evaluate(() => window.corpusControl!.allocations());
        await json(info, `step-${step}-uuid-streams`, { A: leftIds, B: rightIds });
        const sightA = left.dungeon.semantic.state.game!.observation!, sightB = right.dungeon.semantic.state.game!.observation!;
        expect(sightA.header.radius).toBe(7); expect(sightB.header.radius).toBe(7);
        expect(sightA.header.sequence).toBe(step + 1); expect(sightB.header.sequence).toBe(step + 1);
        if (!step) { expect(sightA.cells).toHaveLength(30); expect(sightB.cells).toHaveLength(30); }
        const summary = { step, sightEqual: JSON.stringify(sightA) === JSON.stringify(sightB),
          visibleCells: { A: sightA.cells.length, B: sightB.cells.length },
          rooms: { A: left.rooms.semantic.render.page.items.length, B: right.rooms.semantic.render.page.items.length },
          surfaces: (['dungeon', 'rooms', 'nearby'] as const).map(kind => ({ kind,
            semanticEqual: JSON.stringify(left[kind].semantic) === JSON.stringify(right[kind].semantic),
            pixelsEqual: left[kind].screenshotHash === right[kind].screenshotHash,
            leftHash: left[kind].screenshotHash, rightHash: right[kind].screenshotHash })),
          audit: { A: left.audit, B: right.audit }, allocations: { A: leftIds.length, B: rightIds.length } };
        comparisons.push(summary); await json(info, `step-${step}-comparison`, summary);
        if (step < 7) {
          expect(leftIds, 'Same allocations and callsites, not just masked identities').toEqual(rightIds);
          for (const kind of ['dungeon', 'rooms', 'nearby'] as const) {
            expect(left[kind].semantic, `${kind}: exact unnormalized render and App input at ${step}`).toEqual(right[kind].semantic);
            expect(left[kind].screenshotHash, `${kind}: exact full unmasked pixels at ${step}`).toBe(right[kind].screenshotHash);
          }
        } else {
          expect(sightA.cells, 'Legitimate newly earned junction sight differs').not.toEqual(sightB.cells);
          const actor = sightA.cells.find(cell => JSON.stringify(cell.at) === JSON.stringify(left.dungeon.semantic.state.game!.checkpoint.position))!;
          expect(actor.world).toEqual({ row: 2, column: 9 });
        }
      }
      await json(info, 'paired-ui-summary', comparisons);
    } finally { await b.close(info); }
  } finally { await a.close(info); }
});
