import type { CellAddress } from './types';

export function addressKey(address: CellAddress) {
  return JSON.stringify([address.spaceId, address.row, address.column]);
}

export function sameAddress(a: CellAddress, b: CellAddress) {
  return a.spaceId === b.spaceId && a.row === b.row && a.column === b.column;
}
