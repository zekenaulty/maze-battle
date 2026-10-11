import { addressKey, sameAddress } from '../../domain/expedition/address';
import { agenticaCheck as check } from '../agenticaValidation';
import { direction, natural, object, only, validAddress } from '../streamValidation';
import { validId } from '../topology/validation';

export function validateArchivedInspection(value: Record<string, unknown>, revision: number) {
  check(only(value, 'cell,chests,openings,historical,pageRevision') && value.historical === true
    && natural(value.pageRevision) && Number(value.pageRevision) <= revision && object(value.cell)
    && Array.isArray(value.chests) && value.chests.length <= 1
    && Array.isArray(value.openings) && value.openings.length <= 4, 'invalid archival inspection');
  const cell = value.cell;
  const address = { spaceId: cell.spaceId, row: cell.row, column: cell.column };
  validAddress(address);
  check(only(cell, 'spaceId,row,column,links,observedAt') && natural(cell.observedAt)
    && Number(cell.observedAt) <= Number(value.pageRevision) && Array.isArray(cell.links)
    && cell.links.length <= 4 && cell.links.every(direction) && new Set(cell.links).size === cell.links.length,
  'invalid archived inspection cell');
  const ids = new Set<string>();
  for (const [kind, entries] of [['chest', value.chests], ['opening', value.openings]] as const) {
    for (const entry of entries) {
      check(object(entry), 'invalid archived inspection entry');
      const location = { spaceId: entry.spaceId, row: entry.row, column: entry.column };
      validAddress(location); validId(entry.id as string);
      const key = `${kind}:${String(entry.id)}:${addressKey(location)}`;
      check(!ids.has(key) && sameAddress(location, address) && natural(entry.observedAt)
        && Number(entry.observedAt) <= Number(value.pageRevision), 'archived inspection identity or chronology mismatch');
      ids.add(key);
      if (kind === 'chest') check(only(entry, 'spaceId,row,column,id,opened,observedAt')
        && typeof entry.opened === 'boolean', 'invalid archived inspection chest');
      else {
        check(only(entry, 'spaceId,row,column,id,direction,destination,observedAt') && direction(entry.direction), 'invalid archived inspection opening');
        if (entry.destination !== undefined) validAddress(entry.destination);
      }
    }
  }
}
