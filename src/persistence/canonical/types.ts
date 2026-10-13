import type { DBSchema, IDBPTransaction } from 'idb';
import type { MemoryNode } from '../rpgMemory/treeTypes';

export type Json = null | boolean | number | string | Json[] | { [key: string]: Json };
export type JsonObject = { [key: string]: Json };
export type RecordArea = 'world' | 'knowledge' | 'execution';
export interface GameIdentity { generation: string; gameId: string }
export interface OwnerFence extends GameIdentity { owner: string; epoch: number; revision: number }
export interface CanonicalHead extends OwnerFence {
  schema: 1;
  status: 'ready' | 'stopped';
  roots: Record<RecordArea, string | null>;
  checkpoint: JsonObject;
  quota: { usedBytes: number; limitBytes: number; reserveBytes: number };
}
export interface CanonicalRecord extends GameIdentity {
  id: string;
  area: RecordArea;
  key: string;
  indexes: string[];
  revision: number;
  value: Json;
}
export interface CanonicalIndexNode extends GameIdentity { node: MemoryNode }
export interface CanonicalRequest {
  attemptId: string;
  expected: OwnerFence;
  operation: string;
  input: Json;
  deadlineAt: number | null;
}
export interface CanonicalReceipt extends GameIdentity {
  attemptId: string;
  fingerprint: string;
  beforeRevision: number;
  afterRevision: number;
  committedAt: string;
  result: Json;
}
export interface SchemaMarker { schema: 1; generation: string; gameId: string | null }
export interface CanonicalDb extends DBSchema {
  meta: { key: 'schema'; value: SchemaMarker };
  heads: { key: string; value: CanonicalHead };
  records: { key: [string, string]; value: CanonicalRecord };
  nodes: { key: [string, string]; value: CanonicalIndexNode };
  receipts: { key: [string, string]; value: CanonicalReceipt };
}
export const CANONICAL_STORES = ['meta', 'heads', 'records', 'nodes', 'receipts'] as const;
export type CanonicalWrite = IDBPTransaction<CanonicalDb, typeof CANONICAL_STORES, 'readwrite'>;
export type CanonicalRead = IDBPTransaction<CanonicalDb, typeof CANONICAL_STORES, 'readonly'>;
export type CanonicalSnapshot = Pick<CanonicalHead, 'generation' | 'gameId' | 'revision' | 'roots' | 'checkpoint'>;
export interface CanonicalWorkLimits { reads: number; writes: number; bytes: number }
export interface CanonicalWorkStats { reads: number; writes: number; readBytes: number; writeBytes: number }

export const DEFAULT_WORK_LIMITS: CanonicalWorkLimits = { reads: 2048, writes: 512, bytes: 4 * 1024 * 1024 };
export const DEFAULT_QUOTA = { limitBytes: 256 * 1024 * 1024, reserveBytes: 8 * 1024 * 1024 };
export const MAX_RECORD_BYTES = 64 * 1024;
export const MAX_CHECKPOINT_BYTES = 4096;
export const MIN_RECOVERY_BYTES = 64 * 1024;
