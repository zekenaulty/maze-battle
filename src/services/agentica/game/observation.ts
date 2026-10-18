import type { AgenticaObservation } from '../contracts';
import type { CanonicalSnapshot } from '../../../persistence/canonical/types';
import type { ProtocolRef } from '../../../persistence/canonical/agentica/types';
import { equal, snapshotJson } from '../../../persistence/canonical/agentica/validation';
import { loadObservation, sourceReader } from '../../../persistence/canonical/knowledge/evidence';
import { roomKey } from '../../../persistence/canonical/knowledge/keys';
import { listKnownRooms, readKnownCells } from '../../../persistence/canonical/knowledge/queries';
import { cellSource } from '../../../persistence/canonical/knowledge/validation';
import type { CellSource, RememberedCell } from '../../../persistence/canonical/knowledge/types';
import { fields } from '../../../persistence/canonical/roster/codec';
import { check, jsonBytes } from '../../../persistence/canonical/validation';
import { observation, perceptionContext, type PerceptionContext } from './context';
import { chestToken } from './chestSelection';
import { frontierObservation } from './frontierObservation';
import { cursorAfter, flatAddress, inspectArgs, inspectionCursor, inspectQuery, localPosition } from './validation';
import { MAP_PAGE_ROOMS, MAX_CONTEXT_BYTES, MAX_OBSERVATION_BYTES, MAX_PERCEPTION_READ_BYTES, ROOM_PAGE_SLOTS, ROOM_WINDOW_SIDE,
  type CellAddress, type InspectArgs, type InspectQuery, type PerceptionPages } from './types';

/** The initial view deliberately has no room cells or map. Observation identity is the retained publication ID. */
export async function observeMaze(pages: PerceptionPages, snapshot: CanonicalSnapshot, publication: ProtocolRef, input: Record<string, never> = {}) {
  fields(snapshotJson(input, 64), '');
  const c = await perceptionContext(pages, snapshot, publication);
  return observation(c, { scope: 'actor', actor: { ...flatAddress(c.checkpoint.position), facing: c.checkpoint.facing, mode: c.checkpoint.mode },
    source: c.sight ? { sequence: c.checkpoint.knowledge!.sequence, id: c.checkpoint.knowledge!.id, revision: c.sight.header.revision } : null }, MAX_CONTEXT_BYTES);
}

function projectCell(c: PerceptionContext, cell: RememberedCell, state: 'visible' | 'remembered') {
  const current = state === 'visible' && c.checkpoint.mode !== 'town' && equal(cell.at, c.checkpoint.position) && c.sight
    && equal(c.sight.header.actor, c.checkpoint.position) ? c.sight.cells.findIndex(seen => equal(seen.at, cell.at)) : -1;
  const anchor = c.checkpoint.knowledge;
  // Memory may retain an older unchanged fact; target selection must pin the current visibility receipt.
  const source = anchor && current >= 0 ? { sequence: anchor.sequence, id: anchor.id, index: current } : null;
  const chests = cell.chests.map((chest, index) => ({ ...chest,
    ...(source && !chest.opened ? { target: chestToken(c.ref, source, index) } : {}) }));
  return { at: flatAddress(cell.at), world: cell.world, state, source: cell.source, chests, stairs: cell.stairs,
    edges: Object.fromEntries(Object.entries(cell.edges).map(([direction, edge]) => [direction,
      { target: edge!.target ? flatAddress(edge!.target) : null, source: edge!.source }])) };
}
async function sources(c: PerceptionContext, references: CellSource[]) {
  const refs = new Map(references.map(ref => [ref.id, ref])), headers = [];
  for (const ref of refs.values()) {
    const { header } = await loadObservation(c.pages, { sequence: ref.sequence, id: ref.id });
    headers.push({ sequence: ref.sequence, id: ref.id, revision: header.revision, observedAt: header.observedAt });
  }
  return headers;
}
const cellSources = (cell: RememberedCell) => [cell.source, ...Object.values(cell.edges).map(e => e!.source)];
async function knownRoom(c: PerceptionContext, query: InspectQuery) {
  const row = await c.pages.get('knowledge', roomKey(query.level, query.spaceId!)); if (!row) return false;
  const room = fields(row.value, 'schema level spaceId source'); cellSource(room.source);
  check(room.schema === 1 && room.level === query.level && room.spaceId === query.spaceId && c.checkpoint.knowledge
    && room.source.sequence <= c.checkpoint.knowledge.sequence && row.indexes.length === 1
    && row.indexes[0] === `known-rooms/${query.level}/${query.spaceId}`, 'invalid earned room');
  const seen = await sourceReader(c.pages)(room.source);
  check(seen.at.level === query.level && seen.at.cell.spaceId === query.spaceId, 'room has no earned source'); return true;
}
function fits(c: PerceptionContext, data: Record<string, unknown>) {
  return jsonBytes(observation(c, data, MAX_PERCEPTION_READ_BYTES), MAX_PERCEPTION_READ_BYTES) <= MAX_OBSERVATION_BYTES;
}
async function roomObservation(c: PerceptionContext, query: InspectQuery, start: number) {
  if (!await knownRoom(c, query)) return observation(c, { scope: 'room', state: 'unknown' });
  // This fixed query window does not assert the room's extent or the existence of unobserved cells.
  const end = Math.min(start + ROOM_PAGE_SLOTS, ROOM_WINDOW_SIDE ** 2), positions = [];
  for (let i = start; i < end; i++) positions.push(localPosition({ level: query.level, spaceId: query.spaceId!,
    row: query.row! + Math.floor(i / ROOM_WINDOW_SIDE), column: query.column! + i % ROOM_WINDOW_SIDE }));
  const known = await readKnownCells(c.pages, c.checkpoint, positions), cells: ReturnType<typeof projectCell>[] = [], refs: CellSource[] = [];
  const data = (after: number, cells: unknown[], sources: unknown[]) => ({ scope: 'room', room: { level: query.level, spaceId: query.spaceId },
    window: { row: query.row, column: query.column, rows: ROOM_WINDOW_SIDE, columns: ROOM_WINDOW_SIDE }, cells, sources,
    ...(after < ROOM_WINDOW_SIDE ** 2 ? { next: inspectionCursor(c.ref, query, after) } : {}) });
  let after = start, headers: Awaited<ReturnType<typeof sources>> = [];
  for (const entry of known) {
    if (entry.state !== 'unknown') {
      const nextCells = [...cells, projectCell(c, entry.cell, entry.state)], nextRefs = [...refs, ...cellSources(entry.cell)], nextHeaders = await sources(c, nextRefs);
      if (!fits(c, data(after + 1, nextCells, nextHeaders))) { check(cells.length > 0, 'single earned cell exceeds observation budget'); break; }
      cells.push(nextCells.at(-1)!); refs.push(...cellSources(entry.cell)); headers = nextHeaders;
    }
    after++;
  }
  return observation(c, data(after, cells, headers));
}
async function mapObservation(c: PerceptionContext, query: InspectQuery, after?: string) {
  const page = await listKnownRooms(c.pages, c.checkpoint, query.level, after, MAP_PAGE_ROOMS), rooms = [], refs: CellSource[] = [];
  let headers: Awaited<ReturnType<typeof sources>> = [], next: string | undefined;
  const data = (items: unknown[], sourceHeaders: unknown[], key?: string) => ({ scope: 'map', level: query.level, rooms: items, sources: sourceHeaders,
    ...(key === undefined ? {} : { next: inspectionCursor(c.ref, query, key) }) });
  for (let i = 0; i < page.rooms.length; i++) {
    const room = page.rooms[i], candidate = [...rooms, room], sourceHeaders = await sources(c, [...refs, room.source]);
    const key = i < page.rooms.length - 1 || page.next !== undefined ? `known-rooms/${query.level}/${room.spaceId}` : undefined;
    if (!fits(c, data(candidate, sourceHeaders, key))) { check(rooms.length > 0, 'single earned room exceeds observation budget'); break; }
    rooms.push(room); refs.push(room.source); headers = sourceHeaders; next = key;
  }
  return observation(c, data(rooms, headers, next));
}

/** All scopes use the supplied publication and earned knowledge; inspect never performs a look/refresh. */
export async function inspectMaze(pages: PerceptionPages, snapshot: CanonicalSnapshot, publication: ProtocolRef, input: InspectArgs): Promise<AgenticaObservation> {
  const args = inspectArgs(input), c = await perceptionContext(pages, snapshot, publication), query = inspectQuery(args, c.checkpoint);
  const after = cursorAfter(args.cursor, c.ref, query);
  if (query.scope === 'frontiers') return frontierObservation(c, query, (after as number | undefined) ?? 0);
  if (query.scope === 'map') return mapObservation(c, query, after as string | undefined);
  if (query.scope === 'room') return roomObservation(c, query, (after as number | undefined) ?? 0);
  const [cell] = await readKnownCells(c.pages, c.checkpoint, [localPosition(query as CellAddress)]);
  return cell.state === 'unknown' ? observation(c, { scope: 'cell', state: 'unknown' })
    : observation(c, { scope: 'cell', cell: projectCell(c, cell.cell, cell.state), sources: await sources(c, cellSources(cell.cell)) });
}
