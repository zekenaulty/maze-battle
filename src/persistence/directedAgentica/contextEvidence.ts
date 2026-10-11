import { addressKey, sameAddress } from '../../domain/expedition/address';
import { agenticaCheck as check, boundedJson } from '../agenticaValidation';
import { direction, natural, object, only } from '../streamValidation';
import { validId } from '../topology/validation';
import { validateArchivedInspection } from './inspection';
import type { RoomView } from '../../services/agentica/directed/roomView';
import type { MapView } from '../../services/agentica/directed/mapView';

/** Archived query validation does not load a room or refresh an old observation. */
export function validateContextEvidence(value: unknown, revision: number) {
  check(object(value), 'invalid context query evidence');
  if (value.kind === 'room') {
    validId(value.spaceId as string);
    if (value.status === 'unknown') { check(only(value, 'kind,status,spaceId'), 'invalid unknown room view'); return; }
    check(value.status === 'known' && only(value, 'kind,status,spaceId,asOfRevision,offset,limit,totalCells,nextOffset,cells,chests,openings,frontiers')
      && natural(value.asOfRevision) && value.asOfRevision <= revision && natural(value.offset) && value.offset <= 225
      && natural(value.limit) && value.limit >= 1 && value.limit <= 32 && natural(value.totalCells) && value.totalCells <= 225
      && Array.isArray(value.cells) && value.cells.length === Math.min(value.limit, Math.max(0, value.totalCells - value.offset))
      && Array.isArray(value.chests) && value.chests.length <= 1 && Array.isArray(value.openings) && value.openings.length <= 4
      && Array.isArray(value.frontiers) && value.frontiers.length <= 4, 'invalid paged room view');
    const room = value as unknown as RoomView;
    const end = room.offset + room.cells.length;
    check(room.nextOffset === (end < room.totalCells ? end : null), 'invalid room continuation');
    let previous = -1;
    for (const cell of room.cells) {
      check(object(cell) && cell.spaceId === room.spaceId && cell.row * 15 + cell.column > previous, 'unordered room cell');
      previous = cell.row * 15 + cell.column;
      validateArchivedInspection({ cell, historical: true, pageRevision: room.asOfRevision,
        chests: room.chests.filter(entry => sameAddress(entry, cell)),
        openings: room.openings.filter(entry => sameAddress(entry, cell)) }, revision);
    }
    const known = new Set(room.cells.map(addressKey));
    for (const entry of [...room.chests, ...room.openings, ...room.frontiers]) {
      check(object(entry) && known.has(addressKey(entry)), 'room object outside selected page');
    }
    for (const frontier of room.frontiers) {
      validId(frontier.id);
      check(only(frontier, 'spaceId,row,column,id,direction,observedAt') && direction(frontier.direction)
        && natural(frontier.observedAt) && frontier.observedAt <= room.asOfRevision, 'invalid room frontier');
    }
    return;
  }
  check(value.kind === 'map' && only(value, 'kind,status,centerRoomId,depth,limit,rooms,boundaryRoomIds')
    && natural(value.depth) && value.depth <= 3 && natural(value.limit) && value.limit >= 1 && value.limit <= 12
    && Array.isArray(value.rooms) && value.rooms.length <= value.limit && Array.isArray(value.boundaryRoomIds), 'invalid map view');
  const map = value as unknown as MapView;
  validId(map.centerRoomId);
  const ids = new Set<string>();
  for (const room of map.rooms) {
    check(object(room) && only(room, 'roomId,asOfRevision,knownCellCount,knownChestCount,unopenedChestCount,explorationCleared,connections,frontiers'), 'invalid map room');
    validId(room.roomId); check(!ids.has(room.roomId), 'duplicate map room'); ids.add(room.roomId);
    check(natural(room.asOfRevision) && room.asOfRevision <= revision && natural(room.knownCellCount) && room.knownCellCount <= 225
      && natural(room.knownChestCount) && room.knownChestCount <= 1 && natural(room.unopenedChestCount) && room.unopenedChestCount <= room.knownChestCount
      && typeof room.explorationCleared === 'boolean' && Array.isArray(room.connections) && room.connections.length <= 4
      && Array.isArray(room.frontiers) && room.frontiers.length <= 4, 'invalid map room summary');
    for (const connection of room.connections) {
      check(object(connection) && only(connection, 'openingId,direction,observedAt,toRoomId') && direction(connection.direction)
        && natural(connection.observedAt) && connection.observedAt <= room.asOfRevision, 'invalid room connection');
      validId(connection.openingId); if (connection.toRoomId !== undefined) validId(connection.toRoomId);
    }
    for (const frontier of room.frontiers) {
      check(object(frontier) && only(frontier, 'id,direction,observedAt') && direction(frontier.direction)
        && natural(frontier.observedAt) && frontier.observedAt <= room.asOfRevision, 'invalid map frontier'); validId(frontier.id);
    }
  }
  const boundaries = [...new Set(map.rooms.flatMap(room => room.connections.flatMap(edge =>
    edge.toRoomId && !ids.has(edge.toRoomId) ? [edge.toRoomId] : [])))].sort();
  check(map.status === (ids.has(map.centerRoomId) ? 'known' : 'unknown')
    && boundedJson(map.boundaryRoomIds) === boundedJson(boundaries), 'invalid map scope boundary');
}
