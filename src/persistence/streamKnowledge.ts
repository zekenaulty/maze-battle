import { addressKey } from '../domain/expedition/address';
import type { StreamKnowledgePage, StreamRoom } from '../domain/expedition/streaming/types';
import { direction, natural, object, only, streamCheck, validAddress } from './streamValidation';
import { validId } from './topology/validation';

/** Validate saved evidence, never synthesize a page from generated geometry. */
export function validateStreamKnowledge(page: StreamKnowledgePage, id: string, revision: number, room?: StreamRoom) {
  streamCheck(object(page) && only(page, 'version,spaceId,revision,cells,openings,chests,frontiers,parentOpeningId,completedExits,cleared')
    && page.version === 1 && page.spaceId === id && natural(page.revision) && page.revision <= revision
    && typeof page.cleared === 'boolean' && Array.isArray(page.completedExits) && page.completedExits.length <= 4
    && new Set(page.completedExits).size === page.completedExits.length, 'invalid knowledge page');
  validId(id);
  const collections = [[page.cells, 225], [page.openings, 4], [page.chests, 1], [page.frontiers, 4]] as const;
  for (const [collection, limit] of collections) {
    streamCheck(object(collection) && Object.keys(collection).length <= limit, 'knowledge work limit exceeded');
    for (const [key, entry] of Object.entries(collection)) {
      streamCheck(object(entry), 'invalid knowledge entry');
      const address = { spaceId: entry.spaceId, row: entry.row, column: entry.column };
      validAddress(address);
      streamCheck(entry.spaceId === id && natural(entry.observedAt) && entry.observedAt <= page.revision, 'knowledge identity or revision mismatch');
      if (room) streamCheck(address.row < room.space.spec.rows && address.column < room.space.spec.columns, 'knowledge outside room');
      if (collection === page.cells) {
        streamCheck(only(entry, 'spaceId,row,column,links,observedAt') && key === addressKey(address)
          && Array.isArray(entry.links) && entry.links.length <= 4 && entry.links.every(direction)
          && new Set(entry.links).size === entry.links.length, 'invalid known cell');
      } else {
        streamCheck(typeof entry.id === 'string', 'invalid knowledge ID'); validId(entry.id);
        streamCheck(key === entry.id && Object.hasOwn(page.cells, addressKey(address)), 'knowledge entry key or cell mismatch');
        if (collection === page.chests) {
          streamCheck(only(entry, 'spaceId,row,column,id,opened,observedAt') && typeof entry.opened === 'boolean', 'invalid known chest');
          if (room) streamCheck(room.space.spec.chests.some(chest => chest.id === key && chest.cell.row === entry.row && chest.cell.column === entry.column), 'unknown chest');
        } else {
          streamCheck(direction(entry.direction), 'invalid known direction');
          if (collection === page.openings) {
            streamCheck(only(entry, 'spaceId,row,column,id,direction,destination,observedAt'), 'invalid known opening');
            if (entry.destination !== undefined) validAddress(entry.destination);
          } else streamCheck(only(entry, 'spaceId,row,column,id,direction,observedAt'), 'invalid known frontier');
        }
      }
    }
  }
  for (const exit of page.completedExits) streamCheck(Object.hasOwn(page.openings, exit) && page.openings[exit].destination, 'unknown completed exit');
  if (page.parentOpeningId !== undefined) streamCheck(Object.hasOwn(page.openings, page.parentOpeningId) && page.openings[page.parentOpeningId].destination, 'unknown parent opening');
}
