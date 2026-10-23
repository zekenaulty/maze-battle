import { createInitialParty } from '../../src/domain/party/factory';
import { createInitialInventory, createInitialStash } from '../../src/domain/items/inventory';
import { DEFAULT_INVENTORY_POLICY } from '../../src/domain/items/inventoryPolicy';
import { initializeCanonical } from '../../src/persistence/canonical/lifecycle';
import type { CanonicalPages } from '../../src/persistence/canonical/pages';
import { readCanonicalHead } from '../../src/persistence/canonical/read';
import { executeCanonical } from '../../src/persistence/canonical/transaction';
import { checkpointJson, gameCheckpoint, rosterContext, type GameCheckpoint } from '../../src/persistence/canonical/game/checkpoint';
import { prepareGameFloor } from '../../src/persistence/canonical/game/preparation';
import { floorPreparationSpec } from '../../src/persistence/canonical/game/floorCapacity';
import { DEFAULT_SETTINGS, SETTINGS_KEY } from '../../src/persistence/canonical/game/settings';
import { seedRoster } from '../../src/persistence/canonical/roster/write';
import { entityKey, fresh, json } from '../../src/persistence/canonical/world/records';
import { loadContract, loadRoomContent, saveContract } from '../../src/persistence/canonical/content/records';
import { gameRequest } from '../../src/services/game/canonicalRequests';
import type { JsonObject } from '../../src/persistence/canonical/types';
import { CORPUS_TIME, CORPUS_VERSION, corpusLayout, type CorpusVariant } from './canonical-corpus.layout';

/** Writes authored topology only into a fresh schema; all qualification/content is prepared normally. */
export async function seedCorpusWorld(pages: CanonicalPages, variant: CorpusVariant) {
  const layout = corpusLayout(variant), { floor, recipe, spaces, joins, connections, distances } = layout;
  await fresh(pages, 'dungeon', { schema: 1, worldId: recipe.worldId, deepestLevel: 1 });
  await fresh(pages, 'dungeon/1', floor, ['floors/1']);
  for (const spec of spaces) {
    await fresh(pages, entityKey(1, 'space', spec.id),
      { schema: 1, level: 1, schematic: 'stone-room-v1', spec, distance: distances.get(spec.id) }, [`spaces/1/${spec.id}`]);
    await fresh(pages, entityKey(1, 'ports', spec.id), { schema: 1, level: 1, spaceId: spec.id, pending: [],
      connections: connections.filter(c => c.from.spaceId === spec.id || c.to.spaceId === spec.id).map(c => c.id) });
  }
  for (const join of joins) await fresh(pages, entityKey(1, 'join', join.id), { schema: 1, level: 1, join });
  for (const link of connections) await fresh(pages, entityKey(1, 'connection', link.id), { schema: 1, level: 1, connection: link });
  await pages.set('world', 'game/preparation/1', { schema: 1, level: 1, phase: 'generation' });
}

/** Content authoring is confined to genesis, before acceptance, sight, movement, or an opened chest. */
export async function authorSurveyContract(pages: CanonicalPages) {
  const room = await loadRoomContent(pages, 1, 'socket-1:room');
  if (!room.contractId || !room.chestId) throw Error('Corpus needs a normally prepared treasure/fetch room');
  const posted = await loadContract(pages, room.contractId);
  if (posted.accepted || posted.contract.objective !== 'fetch') throw Error('Corpus contract is not an unaccepted fetch');
  const contract = { ...posted.contract, title: 'Recover the Survey Seal',
    description: 'Guild request: recover the survey seal from an ordinary chest in an unmapped vault.',
    task: { objective: 'fetch' as const, noun: 'survey seal', required: 1,
      item: { baseId: 'survey-seal', displayName: 'Survey Seal', token: 'S' } } };
  await saveContract(pages, { ...posted, contract });
  return contract;
}

/** Does not start GameSession, look, move, accept, collect, bind an objective, or touch an existing game. */
export async function initializeCorpus(variant: CorpusVariant, owner: string) {
  const allocation = floorPreparationSpec(corpusLayout(variant).recipe);
  const checkpoint: GameCheckpoint = { schema: 1, kind: 'rpg', mode: 'manual',
    position: { level: 1, cell: { spaceId: 'entry', row: 2, column: 2 } }, knowledge: null,
    facing: 'east', wave: 1, createdAt: CORPUS_TIME, updatedAt: CORPUS_TIME, activityLog: [] };
  const initialized = await initializeCanonical(owner, checkpointJson(checkpoint), async pages => {
    await seedCorpusWorld(pages, variant);
    await pages.set('world', SETTINGS_KEY, DEFAULT_SETTINGS);
    await seedRoster(pages, { ...rosterContext(checkpoint), party: createInitialParty('canonical-survey'),
      inventory: createInitialInventory(), stash: createInitialStash(), inventoryPolicy: { ...DEFAULT_INVENTORY_POLICY } });
  }, { privatePreparation: allocation });
  const preparation = [];
  for (let i = 0; i < 16; i++) {
    const { head } = await readCanonicalHead();
    const result = await prepareGameFloor(gameRequest(head, 'game.prepare', { level: 1 }));
    preparation.push({ receipt: result.receipt, stats: result.stats });
    if ((result.receipt.result as JsonObject).phase === 'ready') break;
    if (i === 15) throw Error('Corpus preparation exceeded its fixed bound');
  }
  const { head } = await readCanonicalHead();
  const authored = await executeCanonical(gameRequest(head, 'fixture.corpus.author', {}), async tx => {
    const checkpoint = gameCheckpoint(tx.head.checkpoint);
    if (checkpoint.knowledge || JSON.stringify(checkpoint.position) !== JSON.stringify(initialized.head.checkpoint.position))
      throw Error('Content authoring after actor discovery is forbidden');
    return json(await authorSurveyContract(tx.pages));
  });
  return { version: CORPUS_VERSION, variant, initialized, preparation, authored };
}
