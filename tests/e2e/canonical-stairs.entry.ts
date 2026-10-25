import { createModuleRecipe } from '../../src/domain/expedition/topology/modules/policy';
import { bootstrapModule } from '../../src/domain/expedition/topology/modules/step';
import { initializeCanonical } from '../../src/persistence/canonical/lifecycle';
import { readCanonicalHead } from '../../src/persistence/canonical/read';
import { executeCanonical } from '../../src/persistence/canonical/transaction';
import { createWorldFloor } from '../../src/persistence/canonical/world/generation';
import { loadFloor } from '../../src/persistence/canonical/world/records';
import { requireWorldAnchor } from '../../src/persistence/canonical/world/residency';
import { checkpointJson, gameCheckpoint, rosterContext, type GameCheckpoint } from '../../src/persistence/canonical/game/checkpoint';
import { captureInitializationBoot } from '../../src/persistence/canonical/game/initializationBoot';
import { floorPreparationSpec } from '../../src/persistence/canonical/game/floorCapacity';
import { prepareGameFloor } from '../../src/persistence/canonical/game/preparation';
import { SETTINGS_KEY } from '../../src/persistence/canonical/game/settings';
import { seedRoster } from '../../src/persistence/canonical/roster/write';
import { gameRequest } from '../../src/services/game/canonicalRequests';

if (location.origin !== 'http://127.0.0.1:5208' || location.pathname !== '/tests/e2e/canonical-stairs.html') throw Error('Controlled stair qualification origin required');
if (!sessionStorage.getItem('canonical-stair-fixture')) {
  if ((await indexedDB.databases()).some(db => db.name === 'maze-battle')) throw Error('Fresh qualification context required');
  const legacy = new URLSearchParams(location.search).has('legacy');
  const recipe = createModuleRecipe('00000042-0000-4000-8000-000000000042', 1, 42, { spatial: !legacy }), initial = bootstrapModule(recipe).space;
  const now = '2026-10-24T00:00:00.000Z', boot = captureInitializationBoot(recipe.worldId);
  const c: GameCheckpoint = { schema: 1, kind: 'rpg', mode: 'manual', position: { level: 1, cell: { spaceId: initial.id,
    row: Math.floor(initial.rows / 2), column: Math.floor(initial.columns / 2) } }, knowledge: null, facing: 'north', wave: 1, createdAt: now, updatedAt: now, activityLog: [] };
  await initializeCanonical('stair-fixture-genesis', checkpointJson(c), async pages => {
    await createWorldFloor(pages, recipe); await pages.set('world', 'game/preparation/1', { schema: 1, level: 1, phase: 'generation' });
    await pages.set('world', SETTINGS_KEY, boot.settings); await seedRoster(pages, { ...rosterContext(c), ...boot.roster });
  }, { privatePreparation: floorPreparationSpec(recipe) });
  for (let step = 0; step < 256; step++) {
    const { head } = await readCanonicalHead(), result = await prepareGameFloor(gameRequest(head, 'game.prepare', { level: 1 }));
    if ((result.receipt.result as { phase: string }).phase === 'ready') break;
    if (step === 255) throw Error('Preparation bound exceeded');
  }
  // Fixture-only initial actor placement BEFORE its first observation. The production App owns all later commands.
  const { head } = await readCanonicalHead();
  await executeCanonical(gameRequest(head, 'fixture.stair-start', {}), async tx => {
    const floor = await loadFloor(tx.pages, 1), position = { level: 1, cell: floor.exit! };
    await requireWorldAnchor(tx.pages, position);
    tx.setCheckpoint(checkpointJson({ ...gameCheckpoint(tx.head.checkpoint), position })); return {};
  });
  if (new URLSearchParams(location.search).has('partial')) {
    const { head } = await readCanonicalHead(); await prepareGameFloor(gameRequest(head, 'game.prepare', { level: 2 }));
  }
  sessionStorage.setItem('canonical-stair-fixture', 'ready');
}
await import('../../src/main');
