import { createInitialParty } from '../../src/domain/party/factory';
import { createInitialInventory, createInitialStash } from '../../src/domain/items/inventory';
import { DEFAULT_INVENTORY_POLICY } from '../../src/domain/items/inventoryPolicy';
import { rollChestLoot } from '../../src/domain/items/chestRules';
import { initializeCanonical } from '../../src/persistence/canonical/lifecycle';
import { readCanonical, readCanonicalHead } from '../../src/persistence/canonical/read';
import { checkpointJson, rosterContext, type GameCheckpoint } from '../../src/persistence/canonical/game/checkpoint';
import { seedRoster } from '../../src/persistence/canonical/roster/write';
import { encodeItem } from '../../src/persistence/canonical/roster/itemValidation';
import { createWorldFloor } from '../../src/persistence/canonical/world/generation';
import { loadFloor, same } from '../../src/persistence/canonical/world/records';
import { loadWorldRoom } from '../../src/persistence/canonical/world/residency';
import * as content from './canonical-content-fixture';
import * as knowledge from './canonical-knowledge-fixture';
import { query } from './canonical-frontier.support';
import { explorationActor, explorationRecipe, EXPLORATION_MARKER, EXPLORATION_PAIR_ORACLE, EXPLORATION_SPACE,
  EXPLORATION_WORLD, type ExplorationScene, type ExplorationVariant } from './canonical-frontier-exploration.layout';

export async function seedExplorationScene(variant: ExplorationVariant, scene: ExplorationScene = 'unopened-chest') {
  if (!['unopened-chest', 'opened-chest', 'stairs', 'scope-boundary'].includes(scene)) throw Error('Unknown exploration fixture scene');
  const exitScene = scene === 'stairs' || scene === 'scope-boundary';
  const now = new Date().toISOString();
  const checkpoint: GameCheckpoint = { schema: 1, kind: 'rpg', mode: 'manual',
    position: { level: 1, cell: { spaceId: 'entry', row: 7, column: 7 } }, knowledge: null,
    facing: 'north', wave: 1, createdAt: now, updatedAt: now, activityLog: [] };
  const inventory = createInitialInventory();
  inventory.items = inventory.items.map(item => ({ ...item, id: item.baseId }));
  await initializeCanonical('owner', checkpointJson(checkpoint), async pages => {
    await createWorldFloor(pages, explorationRecipe(variant));
    await seedRoster(pages, { ...rosterContext(checkpoint), party: createInitialParty(EXPLORATION_WORLD),
      inventory, stash: createInitialStash(), inventoryPolicy: { ...DEFAULT_INVENTORY_POLICY, autoEquip: false } });
  });
  await content.prepare();
  await assertExplorationLayout(variant);
  if (!exitScene) await content.work(async tx => {
    const room = await content.records.loadRoomContent(tx.pages, 1, EXPLORATION_SPACE);
    if (!room.chestId) throw Error('Pinned generated room must contain its ordinary chest');
    const stored = await content.records.loadChest(tx.pages, 1, room.chestId);
    if (stored.chest.opened) throw Error('Fresh generated chest unexpectedly opened');
    const chest = { ...stored.chest, position: { ...EXPLORATION_MARKER } };
    // Author existing ordinary content before any observation; never alter qualified geometry or knowledge.
    await content.records.saveChest(tx.pages, { ...stored, chest: scene === 'opened-chest'
      ? { ...chest, opened: true, loot: rollChestLoot(chest, () => 0.5).map(encodeItem) } : chest });
    return null;
  });
  const spaceId = exitScene ? (await readCanonical(p => loadFloor(p, 1))).value.exit!.spaceId : EXPLORATION_SPACE;
  const actor = explorationActor(spaceId);
  // The west entrance is first disclosed from the left corner; the opposite corner isolates delayed stairs.
  if (scene === 'stairs') actor.cell.column = 14;
  await content.place(actor);
  const beforeLook = (await readCanonicalHead()).head;
  await knowledge.act({ kind: 'look' });
  const observed = await knowledge.current(), sight = observed.value, page = await query(observed.snapshot);
  if (!page.value.length || page.value.some(f => f.at.cell.spaceId !== spaceId)) throw Error('Cold fixture needs same-space earned frontiers');
  if (sight.cells.some(cell => cell.chests.some(chest => !chest.opened) || cell.stairs.length))
    throw Error('Material fixture object must be outside initial earned sight');
  if (!exitScene && (!same(page.value[0].at.cell, { spaceId, ...EXPLORATION_PAIR_ORACLE.firstAnchor })
    || page.value[0].direction !== EXPLORATION_PAIR_ORACLE.firstDirection)) throw Error('Pinned pair first frontier changed');
  return { beforeLook, sight, page };
}

async function assertExplorationLayout(variant: ExplorationVariant) {
  await readCanonical(async pages => {
    const room = await loadWorldRoom(pages, 1, EXPLORATION_SPACE), { spec } = room.space;
    const marker = room.geometry.cells.find(cell => same({ row: cell.row, column: cell.column }, EXPLORATION_MARKER));
    const link = room.connections[0], entrance = link?.from.spaceId === spec.id ? link.from : link?.to;
    const expected = EXPLORATION_PAIR_ORACLE[variant];
    if (spec.rows !== 15 || spec.columns !== 15 || !same(spec.origin, EXPLORATION_PAIR_ORACLE.origin)
      || room.connections.length !== 1 || !same(entrance, { spaceId: spec.id, ...EXPLORATION_PAIR_ORACLE.entrance })
      || !marker || marker.links.includes(expected.blocked) || !marker.links.includes(expected.unresolved))
      throw Error('Pinned canonical A/B geometry changed');
    return null;
  });
}
