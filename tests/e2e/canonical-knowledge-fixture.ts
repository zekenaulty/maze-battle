import { readCanonical, readCanonicalHead } from '../../src/persistence/canonical/read';
import { executeExplorationCommand } from '../../src/persistence/canonical/game/explorationCommand';
import type { ExplorationCommand } from '../../src/persistence/canonical/game/explorationCommand';
import { gameCheckpoint } from '../../src/persistence/canonical/game/checkpoint';
import { readKnownCells, listKnownRooms } from '../../src/persistence/canonical/knowledge/queries';
import { loadObservation } from '../../src/persistence/canonical/knowledge/evidence';
import type { WorldPosition } from '../../src/persistence/canonical/world/types';
import { json } from '../../src/persistence/canonical/world/records';
import { worldRequest } from './canonical-world-fixture';
import { seed as seedContent } from './canonical-content-fixture';

export { readKnownCells, listKnownRooms, executeExplorationCommand };
export { commitExplorationCommand } from '../../src/persistence/canonical/game/explorationCommand';
export * from '../../src/persistence/canonical/knowledge/evidence';
export * from '../../src/persistence/canonical/knowledge/keys';
export * from '../../src/persistence/canonical/knowledge/observe';
export async function act(input: ExplorationCommand) {
  const { head } = await readCanonicalHead(), request = worldRequest(head, 'exploration.command', json(input));
  return { request, outcome: await executeExplorationCommand(request) };
}
export async function seed() { const targets = await seedContent(); await act({ kind: 'look' }); return targets; }
export async function read(positions: WorldPosition[]) {
  return readCanonical((p, s) => readKnownCells(p, gameCheckpoint(s.checkpoint), positions));
}
export async function current() {
  return readCanonical((p, s) => {
    const c = gameCheckpoint(s.checkpoint); if (!c.knowledge) throw Error('No observation');
    return loadObservation(p, { sequence: c.knowledge.sequence, id: c.knowledge.id });
  });
}
