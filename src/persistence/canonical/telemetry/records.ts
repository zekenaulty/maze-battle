import { readCanonical, type CanonicalQuery } from '../read';
import { encodeRoster, fields, natural } from '../roster/codec';
import type { CanonicalWork } from '../transaction';
import type { CanonicalRecord, CanonicalSnapshot } from '../types';
import { check, jsonBytes, record } from '../validation';
import { GAMEPLAY_TRACE_CAPACITY, GAMEPLAY_TRACE_HEADER, MAX_GAMEPLAY_TRACE_RECORD_BYTES, gameplayTraceSlot,
  type GameplayFact, type GameplayTrace, type GameplayTraceEntry } from './types';
import { gameplayFact, traceTime } from './validation';

type Pages = Pick<CanonicalQuery, 'get'>;
function checked(row: CanonicalRecord, key: string, snapshot: CanonicalSnapshot, max = MAX_GAMEPLAY_TRACE_RECORD_BYTES) {
  record(row, row.id, snapshot, 'execution', `record/${key}`); jsonBytes(row, max);
  check(row.indexes.length === 0 && row.revision > 0 && row.revision <= snapshot.revision, 'invalid trace record');
}
async function header(pages: Pages, snapshot: CanonicalSnapshot) {
  const row = await pages.get('execution', GAMEPLAY_TRACE_HEADER);
  if (!row) return { sequence: 0, lastRevision: 0 };
  checked(row, GAMEPLAY_TRACE_HEADER, snapshot, 1024);
  const value = fields(row.value, 'schema sequence lastRevision'); natural(value.sequence, 1); natural(value.lastRevision, 1);
  check(value.schema === 1 && value.lastRevision === row.revision && value.sequence <= value.lastRevision, 'invalid trace header');
  return { sequence: value.sequence, lastRevision: value.lastRevision };
}
function entry(row: CanonicalRecord | undefined, sequence: number, snapshot: CanonicalSnapshot): GameplayTraceEntry {
  check(row, 'missing trace slot'); checked(row, gameplayTraceSlot(sequence), snapshot);
  const value = fields(row.value, 'schema sequence at fact');
  check(value.schema === 1 && value.sequence === sequence && sequence <= row.revision, 'invalid trace slot sequence');
  traceTime(value.at);
  return { sequence, revision: row.revision, at: value.at as string, fact: gameplayFact(value.fact) };
}

/** One meaningful shared action per canonical transaction. Never read by gameplay policy. */
export async function recordGameplay(tx: CanonicalWork, fact: GameplayFact, at = new Date().toISOString()) {
  const value = gameplayFact(fact); traceTime(at);
  const before = await header(tx.pages, tx.head), sequence = before.sequence + 1, revision = tx.head.revision + 1;
  natural(sequence, 1); natural(revision, 1); check(before.lastRevision < revision, 'duplicate trace revision');
  if (before.sequence) {
    const latest = entry(await tx.pages.get('execution', gameplayTraceSlot(before.sequence)), before.sequence, tx.head);
    check(latest.revision === before.lastRevision, 'trace header differs from latest slot');
  }
  const key = gameplayTraceSlot(sequence), previous = await tx.pages.get('execution', key);
  if (sequence > GAMEPLAY_TRACE_CAPACITY) {
    const old = entry(previous, sequence - GAMEPLAY_TRACE_CAPACITY, tx.head);
    check(old.revision < before.lastRevision, 'invalid trace eviction order');
  } else check(!previous, 'unexpected trace slot');
  const row = await tx.pages.set('execution', key, encodeRoster({ schema: 1, sequence, at, fact: value }));
  jsonBytes(row, MAX_GAMEPLAY_TRACE_RECORD_BYTES);
  await tx.pages.set('execution', GAMEPLAY_TRACE_HEADER, { schema: 1, sequence, lastRevision: revision });
}

/** Header plus at most 64 exact slot gets. No enumeration, retained map or receipt-history walk. */
export async function loadGameplayTelemetry(pages: Pages, snapshot: CanonicalSnapshot): Promise<GameplayTrace> {
  const current = await header(pages, snapshot), events: GameplayTraceEntry[] = [];
  for (let sequence = Math.max(1, current.sequence - GAMEPLAY_TRACE_CAPACITY + 1); sequence <= current.sequence; sequence++) {
    const value = entry(await pages.get('execution', gameplayTraceSlot(sequence)), sequence, snapshot);
    check(value.revision > (events.at(-1)?.revision ?? 0), 'trace revision order changed'); events.push(value);
  }
  check(!events.length || events.at(-1)!.revision === current.lastRevision, 'trace header differs from latest slot');
  return { sequence: current.sequence, events };
}

/** Internal native diagnostics reader. An explicit immutable snapshot is mandatory. */
export async function readGameplayTelemetry(snapshot: CanonicalSnapshot, options: { signal?: AbortSignal } = {}) {
  check(snapshot, 'gameplay trace requires a snapshot');
  const read = await readCanonical(loadGameplayTelemetry, { snapshot, signal: options.signal });
  return { snapshot: read.snapshot, ...read.value, stats: read.stats };
}
