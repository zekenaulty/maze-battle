import { test, expect, fixture } from './rpg-command-browser';
import type * as Discovery from './rpg-discovery-fixture';

for (const optedIn of [false, true]) test(`resealed admission receipt cannot ${optedIn ? 'erase' : 'add'} continuation permission`, async ({ page }) => {
  await fixture(page);
  const outcome = await page.evaluate(async optedIn => {
    const path = '/tests/e2e/rpg-discovery-fixture.ts';
    await (await import(/* @vite-ignore */ path) as typeof Discovery).setupDiscovery('A', true);
    const h = window.rpgDiscovery, query = await h.invoke('maze.frontiers', { limit: 12 });
    const f = (query.result.observation!.data.context as any).frontiers[0];
    const admission = await h.invoke('maze.explore', { row: f.anchor.row, column: f.anchor.column,
      direction: f.direction, sourceId: f.source.id, ...(optedIn ? { continuation: 'corridor-v1' } : {}) });
    const id = admission.result.operation!.operationId, db = await window.rpgCommandTest.repository.getDatabase();
    const receipt = (await db.get('rpgTravelActions', id))!, original = JSON.parse(receipt.fingerprint);
    const { witness: _travelWitness, ...travel } = receipt.travel!;
    const { witness: _receiptWitness, ...body } = receipt;
    if (optedIn) delete travel.exploration;
    else travel.exploration = { policy: 'corridor-v1', phase: 'approach', trail: [travel.position] };
    const sdkPath = '/src/services/agentica/sdk/agentica-host.mjs';
    const { canonicalJson } = await import(/* @vite-ignore */ sdkPath);
    body.travel = { ...travel, witness: canonicalJson(travel) };
    await db.put('rpgTravelActions', { ...body, witness: canonicalJson(body) });
    const before = (await window.rpgCommandTest.repository.getGame('auto'))!.game;
    let error = ''; try { await window.rpgCommandTest.travel.executeRpgTravel(original); } catch (e) { error = String(e); }
    return { before, error, after: (await window.rpgCommandTest.repository.getGame('auto'))!.game };
  }, optedIn);
  expect(outcome.error).toContain('Invalid or unavailable RPG travel record'); expect(outcome.after).toEqual(outcome.before);
});
