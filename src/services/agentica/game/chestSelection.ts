import type { ProtocolRef } from '../../../persistence/canonical/agentica/types';
import { equal, snapshotJson, snapshotReference } from '../../../persistence/canonical/agentica/validation';
import type { CellSource } from '../../../persistence/canonical/knowledge/types';
import { cellSource } from '../../../persistence/canonical/knowledge/validation';
import { fields } from '../../../persistence/canonical/roster/codec';
import type { CanonicalSnapshot } from '../../../persistence/canonical/types';
import { check, integer } from '../../../persistence/canonical/validation';
import type { WorldPosition } from '../../../persistence/canonical/world/types';
import { canonicalJson } from '../sdk/agentica-host.mjs';
import { perceptionContext } from './context';
import type { PerceptionPages } from './types';

export interface ChestSelection { publication: ProtocolRef; source: CellSource; chestIndex: number }
// Plain JSON disclosure, not authority. Bound the actual wire text, including whitespace, in UTF-8 bytes.
export const MAX_CHEST_TOKEN_BYTES = 1024;
function selection(input: unknown, publication: ProtocolRef): ChestSelection {
  const value = fields(snapshotJson(input, MAX_CHEST_TOKEN_BYTES), 'publication source chestIndex');
  const ref = snapshotReference(value.publication as unknown as ProtocolRef), expected = snapshotReference(publication);
  cellSource(value.source); check(integer(value.chestIndex), 'invalid chest selection index');
  check(equal(ref, expected), 'stale or foreign chest publication');
  return { publication: ref, source: value.source, chestIndex: value.chestIndex };
}
function tokenText(input: unknown): asserts input is string {
  check(typeof input === 'string' && input.length <= MAX_CHEST_TOKEN_BYTES
    && new TextEncoder().encode(input).byteLength <= MAX_CHEST_TOKEN_BYTES, 'invalid or oversized chest token');
}
export function chestToken(publication: ProtocolRef, source: CellSource, index: number): string {
  const token = canonicalJson({ schema: 1, ...selection({ publication, source, chestIndex: index }, publication) });
  tokenText(token); return token;
}
export function chestArgs(args: unknown, publication: ProtocolRef): ChestSelection {
  const { target } = fields(snapshotJson(args, 2 * MAX_CHEST_TOKEN_BYTES), 'target'); tokenText(target);
  const value = fields(JSON.parse(target), 'schema publication source chestIndex');
  check(value.schema === 1, 'invalid chest token schema');
  return selection({ publication: value.publication, source: value.source, chestIndex: value.chestIndex }, publication);
}

/** Exact published sight only. Effect authority and shared content checks remain the caller's responsibility. */
export async function resolveChestSelection(pages: PerceptionPages, snapshot: CanonicalSnapshot, publication: ProtocolRef,
  input: ChestSelection): Promise<{ command: { kind: 'open-chest'; chestId: string }; position: WorldPosition } | null> {
  const chosen = selection(input, publication), c = await perceptionContext(pages, snapshot, chosen.publication);
  const anchor = c.checkpoint.knowledge;
  check(anchor && c.sight && chosen.source.sequence === anchor.sequence && chosen.source.id === anchor.id,
    'stale or foreign chest source');
  check(chosen.source.index < c.sight.cells.length, 'chest source index is outside current sight');
  const cell = c.sight.cells[chosen.source.index];
  check(chosen.chestIndex < cell.chests.length, 'chest selection index is outside current sight');
  const chest = cell.chests[chosen.chestIndex];
  if (c.checkpoint.mode === 'town' || !equal(c.sight.header.actor, c.checkpoint.position)
    || !equal(cell.at, c.checkpoint.position) || chest.opened) return null;
  return { command: { kind: 'open-chest', chestId: chest.id }, position: structuredClone(cell.at) };
}
