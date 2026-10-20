import { readCanonical } from '../../src/persistence/canonical/read';
import { gameCheckpoint } from '../../src/persistence/canonical/game/checkpoint';
import { readKnownCells } from '../../src/persistence/canonical/knowledge/queries';
import { cellKey } from '../../src/persistence/canonical/knowledge/keys';
import type { MemoryBlock } from '../../src/persistence/canonical/knowledge/types';
import type { CanonicalRecord } from '../../src/persistence/canonical/types';
import type { WorldPosition } from '../../src/persistence/canonical/world/types';

/** Independent audit of earned addresses only. Never feeds the test movement driver. */
export async function earnedMemory(records: CanonicalRecord[]) {
  const addresses = new Map<string, WorldPosition>();
  for (const row of records) {
    if (row.area !== 'knowledge' || !row.key.startsWith('perception/cell/')) continue;
    for (const cell of Object.values((row.value as unknown as MemoryBlock).cells)) addresses.set(cellKey(cell.at), cell.at);
  }
  if (!addresses.size || addresses.size > 512) throw Error('Earned-memory audit exceeded its bounded corpus');
  const positions = [...addresses.values()].sort((a, b) => cellKey(a).localeCompare(cellKey(b))), facts = [];
  for (let offset = 0; offset < positions.length; offset += 16) {
    const current = (await readCanonical((pages, snapshot) =>
      readKnownCells(pages, gameCheckpoint(snapshot.checkpoint), positions.slice(offset, offset + 16)))).value;
    for (const result of current) {
      if (result.state === 'unknown') throw Error('A previously earned cell became unknown');
      const cell = result.cell!;
      // New sight may extend edges and renew their source; already earned facts cannot disappear.
      facts.push({ at: cell.at, world: cell.world, chests: cell.chests, stairs: cell.stairs,
        edges: Object.fromEntries(Object.entries(cell.edges).map(([direction, edge]) => [direction, edge.target])) });
    }
  }
  return facts;
}
