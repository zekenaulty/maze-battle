import { movePosition, opposite } from '../../../domain/maze/movement';
import { check } from '../validation';
import { json, same } from '../world/records';
import type { WorldPosition } from '../world/types';
import { cellKey } from './keys';
import { readKnownCells } from './queries';
import { DIRECTIONS, type RememberedCell } from './types';
import type { KnownLink, KnownNode } from './graph.types';
import { validateGraphLink, type GraphView } from './graph.roomConnections.link';
import type { RoomConnection } from './graph.roomConnections.types';
import { worldIndexDigest } from './worldIndex.evidence';

const digest = (value: unknown) => worldIndexDigest(json(value));
function memo<T>(load: (key: string) => Promise<T>) {
  const cache = new Map<string, Promise<T>>();
  return (key: string) => { if (!cache.has(key)) cache.set(key, load(key)); return cache.get(key)!; };
}

/** One view and its single graphPages budget cover every node, link, cell and original receipt. */
export async function walkRoomConnections(input: GraphView, spaceId: string) {
  const view = { ...input, node: memo(input.node), links: memo(input.links) };
  const root = await view.node(spaceId); check(root?.node.kind === 'room', 'room connections require a known room');
  const from = { ...root.node, kind: 'room' as const }, rooms = new Map<string, RoomConnection>(), visited = new Set<string>();
  const cells = new Map<string, Promise<RememberedCell>>();
  async function cell(at: WorldPosition) {
    const key = cellKey(at);
    if (!cells.has(key)) cells.set(key, readKnownCells(view.pages, view.checkpoint, [at]).then(([known]) => {
      check(known.state !== 'unknown', 'earned passage edge is missing its remembered endpoint'); return known.cell;
    }));
    return cells.get(key)!;
  }
  async function cross(link: KnownLink) {
    const pair = await validateGraphLink(view, link);
    cells.set(cellKey(link.from.at), Promise.resolve(pair.from)); cells.set(cellKey(link.to.at), Promise.resolve(pair.to));
    const target = (await view.node(link.to.at.cell.spaceId))!.node;
    return { target, to: pair.to, evidence: { link, target, ...pair } };
  }
  type Step = { cell: RememberedCell; proof: RoomConnection['proof'] };
  const queue: Step[] = []; let partial = false;
  function enqueue(c: RememberedCell, node: KnownNode, proof: RoomConnection['proof']) {
    if (node.kind === 'room') {
      if (node.spaceId !== spaceId && !rooms.has(node.spaceId)) rooms.set(node.spaceId, { room: { ...node, kind: 'room' }, proof });
      return;
    }
    const key = cellKey(c.at); if (visited.has(key)) return;
    visited.add(key); queue.push({ cell: c, proof });
  }
  for (const link of (await view.links(spaceId)).links.sort((a, b) => a.id.localeCompare(b.id))) {
    const next = await cross(link);
    enqueue(next.to, next.target, { digest: digest({ from, evidence: next.evidence }), steps: 1, crossings: 1 });
  }
  for (let index = 0; index < queue.length; index++) {
    const { cell: here, proof } = queue[index];
    for (const direction of DIRECTIONS) {
      const edge = here.edges[direction];
      if (!edge) { partial = true; continue; }
      if (edge.target === null) continue;
      check(edge.target.level === from.level, 'foreign passage edge');
      const to = await cell(edge.target), reverse = to.edges[opposite(direction)];
      const internal = here.at.cell.spaceId === to.at.cell.spaceId;
      const link = internal ? undefined : (await view.links(here.at.cell.spaceId)).links
        .find(l => same(l.from.at, here.at) && l.direction === direction && same(l.to.at, to.at));
      // A one-sided newly observed closure is lawful. Never refresh the other endpoint or reuse its old open edge.
      if (!link && !same(reverse?.target, here.at)) { if (!reverse) partial = true; continue; }
      check(same(movePosition(here.world, direction), to.world), 'passage edge is not physically adjacent');
      if (internal) {
        check(same({ ...movePosition(here.at.cell, direction), spaceId: here.at.cell.spaceId }, to.at.cell), 'invalid internal passage edge');
        const node = (await view.node(to.at.cell.spaceId))!.node;
        enqueue(to, node, { digest: digest({ previous: proof.digest, direction, from: here, to }),
          steps: proof.steps + 1, crossings: proof.crossings });
      } else {
        check(link, 'reciprocal passage edge is missing earned graph adjacency');
        const next = await cross(link);
        enqueue(next.to, next.target, { digest: digest({ previous: proof.digest, evidence: next.evidence }),
          steps: proof.steps + 1, crossings: proof.crossings + 1 });
      }
    }
  }
  return { from, partial, connections: [...rooms.values()].sort((a, b) => a.room.spaceId.localeCompare(b.room.spaceId)) };
}
