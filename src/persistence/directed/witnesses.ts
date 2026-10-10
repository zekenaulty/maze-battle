import type { DirectedTransaction, SaveRecord } from './database';
import { canonical, check } from './values';

/** Independent canonical write copies detect accidental changes, not malicious same-origin rewriting. */
export async function witness(tx: DirectedTransaction, slot: string, journal: string, key: string | number, value: unknown) {
  await tx.objectStore('witnesses').add(canonical(value), [slot, journal, key]);
}
export async function verifyWitness(tx: DirectedTransaction, slot: string, journal: string, key: string | number, value: unknown) {
  check(await tx.objectStore('witnesses').get([slot, journal, key]) === canonical(value), `${journal} write witness mismatch`);
}
export async function saveHeadWitness(tx: DirectedTransaction, slot: string, record: SaveRecord) {
  if (record.historyMode) await tx.objectStore('witnesses').put(canonical(record), [slot, 'head', 'current']);
}
export async function reserveIdentity(tx: DirectedTransaction, slot: string, journal: string, id: string, key: string | number) {
  check(await readIdentity(tx, slot, journal, id) === undefined, `${journal} identity conflict`);
  await tx.objectStore('identities').add(key, [slot, journal, id]);
  await witness(tx, slot, `identity:${journal}`, id, key);
}
export async function readIdentity(tx: DirectedTransaction, slot: string, journal: string, id: string) {
  const value = await tx.objectStore('identities').get([slot, journal, id]);
  const written = await tx.objectStore('witnesses').get([slot, `identity:${journal}`, id]);
  check(value === undefined ? written === undefined : written === canonical(value), 'identity write witness mismatch');
  return value;
}
