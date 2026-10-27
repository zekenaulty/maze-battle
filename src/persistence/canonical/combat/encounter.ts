import { defaultRng, roll } from '../../../domain/combat/rng';
import { checkpointJson, gameCheckpoint, type GameCheckpoint } from '../game/checkpoint';
import { loadGameSettings } from '../game/settings';
import type { CanonicalWork } from '../transaction';
import { loadFloor, same } from '../world/records';
import { loadWorldRoom } from '../world/residency';
import { loadWorldRoomRole } from '../world/roles';
import { beginBattle } from './start';

/** Mandatory effect of an actual non-stair move; never a voluntary interaction or observation side effect. */
export async function movementEncounter(tx: CanonicalWork, checkpoint: GameCheckpoint): Promise<GameCheckpoint> {
  if (!(await loadGameSettings(tx.pages)).randomBattles) return checkpoint;
  const at = checkpoint.position, floor = await loadFloor(tx.pages, at.level);
  if (same(at.cell, floor.entry) || same(at.cell, floor.exit)) return checkpoint;
  const room = await loadWorldRoom(tx.pages, at.level, at.cell.spaceId);
  if (room.space.spec.purpose === 'stairwell-v1') return checkpoint;
  const role = room.space.spec.kind === 'room' ? await loadWorldRoomRole(tx.pages, at.level, at.cell.spaceId) : null;
  if (role && (role.tags?.includes('safe') || ['safe', 'hub', 'start'].includes(role.kind))) return checkpoint;
  if (roll(100, defaultRng) > 35) return checkpoint;
  let next = checkpoint;
  await beginBattle({ ...tx, head: { ...tx.head, checkpoint: checkpointJson(checkpoint) },
    setCheckpoint(value) { next = gameCheckpoint(value); } }, checkpoint.mode === 'auto-play' || checkpoint.mode === 'waves' ? checkpoint.mode : 'manual');
  return next;
}
