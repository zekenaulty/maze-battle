import { canonicalJson } from '../../services/agentica/sdk/agentica-host.mjs';
import { boundedJsonBytes } from './json';
import { MAX_CHECKPOINT_BYTES, MAX_RECORD_BYTES, MAX_RESERVATIONS, MIN_RECOVERY_BYTES, type CanonicalHead, type CanonicalRecord, type CanonicalRequest, type CanonicalSnapshot,
  type GameIdentity, type Json, type JsonObject, type OwnerFence, type RecordArea, type SchemaMarker } from './types';

export function check(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`Canonical storage: ${message}`);
}
export const validId = (id: unknown): id is string => typeof id === 'string' && /^[A-Za-z0-9_.:-]{1,128}$/.test(id);
export const integer = (n: unknown, min = 0): n is number => typeof n === 'number' && Number.isSafeInteger(n) && n >= min;
export const isArea = (area: unknown): area is RecordArea => ['world', 'knowledge', 'execution'].includes(String(area));
export const isObject = (v: unknown): v is JsonObject => v !== null && typeof v === 'object' && !Array.isArray(v);
export function jsonBytes(value: unknown, max = MAX_RECORD_BYTES) {
  return boundedJsonBytes(value, max);
}
export function identity(value: GameIdentity, scope?: GameIdentity) {
  check(value && validId(value.generation) && validId(value.gameId), 'invalid game identity');
  check(!scope || value.generation === scope.generation && value.gameId === scope.gameId, 'foreign game identity');
}
export function fence(value: OwnerFence) {
  identity(value);
  check(validId(value.owner) && integer(value.epoch, 1) && integer(value.revision), 'invalid owner fence');
}
export function sameFence(a: OwnerFence, b: OwnerFence) {
  return a.generation === b.generation && a.gameId === b.gameId && a.owner === b.owner && a.epoch === b.epoch && a.revision === b.revision;
}
export function marker(value: SchemaMarker | undefined): asserts value is SchemaMarker {
  check(value && value.schema === 1 && validId(value.generation) && (value.gameId === null || validId(value.gameId)), 'invalid schema marker');
}
export function head(value: CanonicalHead | undefined, scope?: GameIdentity): asserts value is CanonicalHead {
  check(value && value.schema === 1, 'missing game head');
  check(Object.keys(value).sort().join(',') === 'allocations,checkpoint,epoch,gameId,generation,owner,quota,revision,roots,schema,status', 'invalid head fields');
  identity(value, scope); fence(value);
  check(value.status === 'ready' || value.status === 'stopped', 'invalid control status');
  roots(value.roots);
  check(isObject(value.checkpoint), 'invalid checkpoint'); jsonBytes(value.checkpoint, MAX_CHECKPOINT_BYTES);
  const q = value.quota;
  check(q && integer(q.usedBytes) && integer(q.limitBytes, 1) && integer(q.reserveBytes, MIN_RECOVERY_BYTES)
    && q.reserveBytes < q.limitBytes && integer(q.reservedBytes) && integer(q.reservations) && q.reservations <= MAX_RESERVATIONS
    && (q.reservations === 0) === (q.reservedBytes === 0)
    && integer(q.usedBytes + q.reservedBytes) && q.usedBytes + q.reservedBytes <= q.limitBytes, 'invalid quota');
  check(isObject(value.allocations), 'invalid allocation anchors');
  const entries = Object.entries(value.allocations);
  check(entries.length === q.reservations && entries.every(([id, allocation]) => validId(id) && isObject(allocation)
    && Object.keys(allocation).sort().join(',') === 'bytes,revision' && integer(allocation.revision, 1)
    && allocation.revision <= value.revision && integer(allocation.bytes, 1))
    && entries.reduce((sum, [, allocation]) => sum + allocation.bytes, 0) === q.reservedBytes, 'allocation anchors disagree with quota');
  jsonBytes(value);
}
function roots(value: CanonicalHead['roots']) {
  check(value && Object.keys(value).sort().join(',') === 'execution,knowledge,world'
    && Object.values(value).every(root => root === null || validId(root)), 'invalid root references');
}
export function snapshot(value: CanonicalSnapshot, current: CanonicalHead) {
  jsonBytes(value, 8192); identity(value, current);
  check(Object.keys(value).sort().join(',') === 'checkpoint,gameId,generation,revision,roots', 'invalid snapshot fields');
  check(integer(value.revision) && value.revision <= current.revision, 'invalid snapshot revision');
  roots(value.roots); checkpoint(value.checkpoint);
}
export function recordKey(key: string) {
  check(typeof key === 'string' && key.length > 0 && key.length <= 384 && !/[^\x20-\x7e]/.test(key), 'invalid record key');
}
export function record(value: CanonicalRecord | undefined, id: string, scope: GameIdentity, area: RecordArea, key?: string): asserts value is CanonicalRecord {
  check(value && value.id === id && validId(id), 'missing referenced record'); identity(value, scope);
  check(value.area === area && integer(value.revision), 'invalid record scope'); recordKey(value.key);
  check(Array.isArray(value.indexes) && value.indexes.length <= 8 && new Set(value.indexes).size === value.indexes.length, 'invalid record indexes');
  value.indexes.forEach(recordKey);
  check(key === undefined || key === `record/${value.key}` || value.indexes.some(index => key === `index/${index}`), 'mismatched record reference');
  jsonBytes(value);
}
export function request(value: CanonicalRequest): CanonicalRequest {
  jsonBytes(value, 16 * 1024); fence(value.expected);
  check(Object.keys(value).sort().join(',') === 'attemptId,deadlineAt,expected,input,operation'
    && Object.keys(value.expected).sort().join(',') === 'epoch,gameId,generation,owner,revision', 'unsupported request fields');
  check(validId(value.attemptId) && validId(value.operation), 'invalid request identity');
  check(value.deadlineAt === null || integer(value.deadlineAt), 'invalid deadline');
  return structuredClone(value);
}
export function fingerprint(value: CanonicalRequest) { return canonicalJson(value); }
export function deadline(value: CanonicalRequest) { check(value.deadlineAt === null || Date.now() <= value.deadlineAt, 'deadline expired'); }
export function checkpoint(value: JsonObject) { check(isObject(value), 'invalid checkpoint'); jsonBytes(value, MAX_CHECKPOINT_BYTES); return structuredClone(value); }
export function result(value: Json) { jsonBytes(value, 16 * 1024); return structuredClone(value); }
