import type { CanonicalRequest } from '../types';
import { executeCanonical, type CanonicalWork } from '../transaction';
import { check, request as validateRequest } from '../validation';
import { checkpointJson, gameCheckpoint, rosterContext } from './checkpoint';
import { requireWorldAnchor } from '../world/residency';
import { rosterCommand, applyRosterCommand } from '../roster/commands';
import { loadRoster } from '../roster/projection';
import { saveRoster } from '../roster/write';

/** Host-owned action facade. Provider exposure/authority remains with the game session. */
export function executeRosterCommand(request: CanonicalRequest) {
  request = validateRequest(request);
  check(request.operation === 'roster.command', 'invalid roster operation');
  return executeCanonical(request, tx => commitRosterCommand(tx, request.input));
}

export async function commitRosterCommand(tx: CanonicalWork, input: unknown) {
  const command = rosterCommand(input), checkpoint = gameCheckpoint(tx.head.checkpoint);
  const before = await loadRoster(tx.pages, rosterContext(checkpoint)), next = applyRosterCommand(before.state, command);
  if (next === before.state) return { kind: command.kind, outcome: 'unchanged' };
  check(next.mode !== 'battle' && next.dungeonLevel === checkpoint.position.level && !next.battle, 'roster command changed unrelated state');
  if (checkpoint.mode !== next.mode) await requireWorldAnchor(tx.pages, checkpoint.position);
  await saveRoster(tx.pages, before, next);
  tx.setCheckpoint(checkpointJson({ ...checkpoint, mode: next.mode, townReturnMode: next.townReturnMode,
    activityLog: next.activityLog, updatedAt: next.updatedAt }));
  return { kind: command.kind, outcome: 'applied' };
}
