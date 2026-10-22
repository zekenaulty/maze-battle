import type { ObservedCell, ObservedSpace } from './types';
import { knowledgeFixture, earnedCell } from './region.test-support';
import { indexObservationGraph } from './graph.write';

export { earnedCell };
/** Unit evidence fixture: explicit sight, real memory/graph writers and source-validating readers.
 * This is not a world-generation, normal-sight or native-browser fixture.
 */
export function graphFixture() {
  const f = knowledgeFixture(); let checkpoint = f.checkpoint();
  return { ...f, checkpoint: () => structuredClone(checkpoint),
    async observe(cells: ObservedCell[], spaces?: ObservedSpace[], available = true) {
      const classification = spaces ?? [...new Set(cells.map(c => c.at.cell.spaceId))].map(spaceId =>
        ({ spaceId, kind: 'room' as const, index: cells.findIndex(c => c.at.cell.spaceId === spaceId) }));
      const { header } = await f.observe(cells, available ? { spaces: classification, graph: 'available' } : {});
      checkpoint = f.checkpoint(); const reference = { sequence: checkpoint.knowledge!.sequence, id: checkpoint.knowledge!.id };
      if (available) {
        await indexObservationGraph(f.pages, cells, classification, reference);
      }
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
