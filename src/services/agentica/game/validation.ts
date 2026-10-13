import { fields } from '../../../persistence/canonical/roster/codec';
import { check, integer, validId } from '../../../persistence/canonical/validation';
import { equal, snapshotJson } from '../../../persistence/canonical/agentica/validation';
import type { GameCheckpoint } from '../../../persistence/canonical/game/checkpoint';
import type { ProtocolRef } from '../../../persistence/canonical/agentica/types';
import type { WorldPosition } from '../../../persistence/canonical/world/types';
import { ROOM_WINDOW_SIDE, type CellAddress, type InspectArgs, type InspectQuery } from './types';

export const flatAddress = (at: WorldPosition): CellAddress => ({ level: at.level, ...at.cell });
export const localPosition = (at: CellAddress): WorldPosition => ({ level: at.level, cell: { spaceId: at.spaceId, row: at.row, column: at.column } });
export function inspectArgs(input: unknown): InspectArgs {
  const args = fields(snapshotJson(input, 2048), 'scope', 'level spaceId row column cursor');
  check(['room', 'map', 'cell'].includes(args.scope as string), 'invalid inspection scope');
  if (args.level !== undefined) check(integer(args.level, 1), 'invalid inspection level');
  if (args.spaceId !== undefined) check(validId(args.spaceId), 'invalid inspection room');
  for (const key of ['row', 'column']) if (args[key] !== undefined) check(integer(args[key]) && args[key] < 512, 'invalid local inspection address');
  check((args.row === undefined) === (args.column === undefined), 'inspection needs both local coordinates');
  if (args.cursor !== undefined) check(typeof args.cursor === 'string' && args.cursor.length <= 1024, 'invalid inspection cursor');
  if (args.scope === 'map') check(args.spaceId === undefined && args.row === undefined, 'map accepts a level only');
  if (args.scope === 'cell') check(args.level !== undefined && args.spaceId !== undefined && args.row !== undefined && args.cursor === undefined, 'cell requires an exact local address');
  return args as unknown as InspectArgs;
}
export function inspectQuery(args: InspectArgs, checkpoint: GameCheckpoint): InspectQuery {
  if (args.scope === 'map') return { scope: 'map', level: args.level ?? checkpoint.position.level };
  const level = args.level ?? checkpoint.position.level, spaceId = args.spaceId ?? checkpoint.position.cell.spaceId;
  const here = level === checkpoint.position.level && spaceId === checkpoint.position.cell.spaceId;
  const row = args.row ?? (here ? Math.floor(checkpoint.position.cell.row / ROOM_WINDOW_SIDE) * ROOM_WINDOW_SIDE : 0);
  const column = args.column ?? (here ? Math.floor(checkpoint.position.cell.column / ROOM_WINDOW_SIDE) * ROOM_WINDOW_SIDE : 0);
  if (args.scope === 'room') check(row + ROOM_WINDOW_SIDE <= 512 && column + ROOM_WINDOW_SIDE <= 512, 'room query window exceeds local address bounds');
  return { scope: args.scope, level, spaceId, row, column };
}
export function cursorAfter(cursor: string | undefined, publication: ProtocolRef, query: InspectQuery): number | string | undefined {
  if (cursor === undefined) return undefined;
  const value = fields(JSON.parse(cursor), 'schema publication query after');
  check(value.schema === 1 && equal(value.publication, publication) && equal(value.query, query), 'stale or foreign inspection cursor');
  if (query.scope === 'room') check(integer(value.after, 1) && value.after < ROOM_WINDOW_SIDE ** 2, 'invalid room cursor');
  else check(query.scope === 'map' && typeof value.after === 'string' && value.after.startsWith(`known-rooms/${query.level}/`)
    && validId(value.after.slice(`known-rooms/${query.level}/`.length)), 'invalid map cursor');
  return value.after as number | string;
}
export function inspectionCursor(publication: ProtocolRef, query: InspectQuery, after: number | string) {
  const value = JSON.stringify({ schema: 1, publication, query, after });
  check(value.length <= 1024, 'inspection cursor exceeds bound'); return value;
}
