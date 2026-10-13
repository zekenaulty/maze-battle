import type { Direction, GameMode } from '../../../domain/types';
import { MAX_CHECKPOINT_BYTES, type JsonObject } from '../types';
import { check, jsonBytes } from '../validation';
import { encodeRoster, fields, natural, text, timestamp } from '../roster/codec';
import type { RosterContext } from '../roster/types';
import { position } from '../world/records';
import type { WorldPosition } from '../world/types';
import type { KnowledgeAnchor } from '../knowledge/types';
import { knowledgeAnchor } from '../knowledge/validation';

/** Compact live cursor. No geometry, item lists, quest history or recalled map. */
export interface GameCheckpoint {
  schema: 1;
  kind: 'rpg';
  position: WorldPosition;
  knowledge: KnowledgeAnchor | null;
  mode: Exclude<GameMode, 'battle'>;
  facing: Direction;
  wave: number;
  createdAt: string;
  updatedAt: string;
  activityLog: string[];
  townReturnMode?: 'manual' | 'auto-play' | 'waves';
}

export function gameCheckpoint(value: unknown): GameCheckpoint {
  jsonBytes(value, MAX_CHECKPOINT_BYTES);
  const row = fields(value, 'schema kind position knowledge mode facing wave createdAt updatedAt activityLog', 'townReturnMode');
  check(row.schema === 1 && row.kind === 'rpg', 'unsupported game checkpoint');
  check(typeof row.mode === 'string' && ['manual', 'auto-play', 'waves', 'town'].includes(row.mode), 'unsupported noncombat mode');
  check(typeof row.facing === 'string' && ['north', 'east', 'south', 'west'].includes(row.facing), 'invalid actor facing');
  const at = fields(row.position, 'level cell'); fields(at.cell, 'spaceId row column'); position(row.position as unknown as WorldPosition);
  knowledgeAnchor(row.knowledge);
  natural(row.wave, 1); timestamp(row.createdAt); timestamp(row.updatedAt);
  check(Array.isArray(row.activityLog) && row.activityLog.length <= 12, 'unbounded activity log');
  row.activityLog.forEach(entry => text(entry, 512));
  check(row.townReturnMode === undefined || row.mode === 'town' && typeof row.townReturnMode === 'string'
    && ['manual', 'auto-play', 'waves'].includes(row.townReturnMode), 'invalid town return mode');
  return structuredClone(value) as GameCheckpoint;
}
export function checkpointJson(value: GameCheckpoint): JsonObject {
  const encoded = encodeRoster(value, ['townReturnMode']); gameCheckpoint(encoded); return encoded as JsonObject;
}
export function rosterContext(value: GameCheckpoint): RosterContext {
  return { mode: value.mode, ...(value.townReturnMode === undefined ? {} : { townReturnMode: value.townReturnMode }),
    dungeonLevel: value.position.level, updatedAt: value.updatedAt, activityLog: [...value.activityLog] };
}
