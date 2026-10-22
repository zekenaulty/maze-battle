import type { ObservationHeader, ObservedCell, ObservedSpace } from './types';
import { knowledgeFixture, earnedCell } from './region.test-support';
import { observationKey } from './keys';
import { indexObservationGraph } from './graph.write';

export { earnedCell };
/** Unit evidence fixture: explicit sight, real memory/graph writers and source-validating readers.
 * This is not a world-generation, normal-sight or native-browser fixture.
 */
export function graphFixture() {
  const f = knowledgeFixture(); let checkpoint = f.checkpoint();
  return { ...f, checkpoint: () => structuredClone(checkpoint),
    async observe(cells: ObservedCell[], spaces?: ObservedSpace[], available = true) {
      await f.observe(cells);
      checkpoint = f.checkpoint(); const reference = { sequence: checkpoint.knowledge!.sequence, id: checkpoint.knowledge!.id };
      const header = f.records.get(observationKey(reference.sequence))!.value as unknown as ObservationHeader;
      header.spaces = spaces ?? [...new Set(cells.map(c => c.at.cell.spaceId))].map(spaceId =>
        ({ spaceId, kind: 'room', index: cells.findIndex(c => c.at.cell.spaceId === spaceId) }));
      if (available) {
        header.graph = 'available';
        await indexObservationGraph(f.pages, cells, header.spaces, reference);
      } else { delete header.spaces; delete header.graph; }
      checkpoint.knowledge!.witness = (await f.pages.witness('knowledge', 'perception/'))!;
      return { reference, header, cells: structuredClone(cells) };
    },
  };
}
export function connected() {
  const a = earnedCell(0, 0, 'looks-like-passage'), b = earnedCell(0, 1, 'looks-like-room');
  a.edges.east = b.at; b.edges.west = a.at;
  return { cells: [a, b], spaces: [
    { spaceId: a.at.cell.spaceId, kind: 'room', index: 0 },
    { spaceId: b.at.cell.spaceId, kind: 'passage', index: 1 },
  ] satisfies ObservedSpace[] };
}
