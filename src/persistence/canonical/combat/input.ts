import { SKILLS } from '../../../domain/combat/skillCatalog';
import type { SkillId } from '../../../domain/types';
import { fields, id, natural } from '../roster/codec';
import { check, jsonBytes } from '../validation';

export type BattleMode = 'manual' | 'auto-play' | 'waves';
export type BattleCommand = ({ kind: 'start'; returnMode: BattleMode }
  | { kind: 'skill'; battleId: string; actorId: string; skillId: SkillId }
  | { kind: 'round' | 'tick' | 'end'; battleId: string }
  | { kind: 'automation'; battleId: string; mode: BattleMode; enabled: boolean }) & { revision?: number };

export function battleMode(value: unknown): asserts value is BattleMode {
  check(value === 'manual' || value === 'auto-play' || value === 'waves', 'invalid battle control mode');
}
export function battleCommand(input: unknown): BattleCommand {
  jsonBytes(input, 4096);
  const r = fields(input, 'kind', 'battleId actorId skillId returnMode mode enabled revision');
  if (r.revision !== undefined) natural(r.revision);
  if (r.kind === 'start') { fields(r, 'kind returnMode', 'revision'); battleMode(r.returnMode); }
  else {
    id(r.battleId);
    if (r.kind === 'skill') {
      fields(r, 'kind battleId actorId skillId', 'revision'); id(r.actorId); id(r.skillId);
      check(Object.hasOwn(SKILLS, r.skillId), 'unsupported battle skill');
    } else if (r.kind === 'automation') {
      fields(r, 'kind battleId mode enabled', 'revision'); battleMode(r.mode); check(typeof r.enabled === 'boolean', 'invalid battle automation flag');
    } else {
      fields(r, 'kind battleId', 'revision'); check(r.kind === 'round' || r.kind === 'tick' || r.kind === 'end', 'unsupported battle command');
    }
  }
  return structuredClone(input) as BattleCommand;
}
