import { gameCheckpoint } from '../game/checkpoint';
import { readCanonical } from '../read';
import type { CanonicalSnapshot } from '../types';
import { check, jsonBytes } from '../validation';
import { same } from '../world/records';
import { listKnownNodes, readKnownAnchor, type KnownNode } from './graph';

export const ROOM_MAP_PAGE_SIZE = 4;

/** Exact UI snapshot; existing graph and canonical IO budgets, no scans or world reads. */
export function readCanonicalRooms(snapshot: CanonicalSnapshot, cursor?: string, signal?: AbortSignal) {
  return readCanonical(async (pages, pinned) => {
    const checkpoint = gameCheckpoint(pinned.checkpoint);
    const page = await listKnownNodes(pages, checkpoint, { level: checkpoint.position.level, kind: 'room',
      limit: ROOM_MAP_PAGE_SIZE, ...(cursor === undefined ? {} : { cursor }) });
    jsonBytes(page, 4096);
    return page;
  }, { snapshot, signal });
}

/** Revalidate a displayed room's exact earned anchor, never move or refresh sight. */
export function readCanonicalRoomAnchor(snapshot: CanonicalSnapshot, node: KnownNode, signal?: AbortSignal) {
  const selected = structuredClone(node);
  return readCanonical(async (pages, pinned) => {
    const checkpoint = gameCheckpoint(pinned.checkpoint);
    check(selected.kind === 'room' && selected.level === checkpoint.position.level, 'foreign room selection');
    const anchor = await readKnownAnchor(pages, checkpoint, { level: selected.level, spaceId: selected.spaceId });
    check(anchor && same(anchor, selected.anchor), 'room anchor changed');
    jsonBytes(anchor, 4096);
    return anchor;
  }, { snapshot, signal });
}
