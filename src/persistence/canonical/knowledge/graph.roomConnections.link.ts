import { opposite } from '../../../domain/maze/movement';
import { check } from '../validation';
import { same } from '../world/records';
import type { graphView } from './graph.read';
import type { KnownLink } from './graph.types';
import { readKnownCells } from './queries';

export type GraphView = Awaited<ReturnType<typeof graphView>>;

/** Shared with the single-space pager: original sight, reciprocal index and current memory. */
export async function validateGraphLink(view: GraphView, link: KnownLink) {
  check(await view.node(link.to.at.cell.spaceId), 'graph connection target is missing');
  const reverse = (await view.links(link.to.at.cell.spaceId)).links.find(l => l.id === link.id);
  check(reverse && same(reverse.from, link.to) && same(reverse.to, link.from)
    && reverse.direction === opposite(link.direction), 'graph reciprocal index changed');
  await view.evidence.link(link);
  const [a, b] = await readKnownCells(view.pages, view.checkpoint, [link.from.at, link.to.at]);
  check(a.state !== 'unknown' && b.state !== 'unknown' && same(a.cell.world, link.from.world) && same(b.cell.world, link.to.world)
    && same(a.cell.edges[link.direction]?.target, link.to.at)
    && same(b.cell.edges[opposite(link.direction)]?.target, link.from.at), 'graph link differs from current memory');
  return { from: a.cell, to: b.cell };
}
