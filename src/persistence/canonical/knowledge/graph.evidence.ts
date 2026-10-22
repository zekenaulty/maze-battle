import { opposite, movePosition } from '../../../domain/maze/movement';
import { check } from '../validation';
import { same } from '../world/records';
import { loadObservation } from './evidence';
import type { CellSource, KnowledgeRead } from './types';
import type { KnownAnchor, KnownLink, KnownNode } from './graph.types';

export function graphSources(pages: KnowledgeRead, sequence: number) {
  const cache = new Map<string, Awaited<ReturnType<typeof loadObservation>>>();
  async function source(s: CellSource) {
    check(s.sequence <= sequence, 'graph source is ahead of checkpoint');
    let observation = cache.get(s.id);
    if (!observation) { observation = await loadObservation(pages, { sequence: s.sequence, id: s.id }); cache.set(s.id, observation); }
    check(observation.header.sequence === s.sequence && s.index < observation.cells.length, 'invalid graph source');
    const cell = observation.cells[s.index], space = observation.header.spaces?.find(v => v.spaceId === cell.at.cell.spaceId);
    check(observation.header.graph === 'available' && space, 'graph source lacks earned classification');
    return { cell, space };
  }
  async function anchor(a: KnownAnchor) {
    const seen = await source(a.source);
    check(same(seen.cell.at, a.at) && same(seen.cell.world, a.world), 'graph anchor differs from source');
    return seen;
  }
  return { anchor,
    async node(n: KnownNode) {
      const seen = await anchor(n.anchor);
      check(seen.space.kind === n.kind && seen.space.index === n.anchor.source.index, 'graph classification differs from source');
    },
    async link(l: KnownLink) {
      const a = await anchor(l.from), b = await anchor(l.to);
      check(same(a.cell.edges[l.direction], l.to.at) && same(b.cell.edges[opposite(l.direction)], l.from.at)
        && same(movePosition(l.from.world, l.direction), l.to.world), 'graph link lacks reciprocal sight');
    },
  };
}
