import { getDatabase } from '../saveRepository';
import { AUTO_CONTROL_KEY, decodeControl, sameOwner } from '../saveControl';
import { ACTIVE_TRAVEL } from './execute';
import { requireTravel, sameTravelPosition, validateTravel } from './validation';

export async function readRpgTravel() {
  const db = await getDatabase(), tx = db.transaction(['meta', 'saves', 'rpgTravels'], 'readonly');
  const id = (await tx.objectStore('meta').get(ACTIVE_TRAVEL))?.value;
  if (!id) { await tx.done; return; }
  const stored = await tx.objectStore('rpgTravels').get(id);
  requireTravel(stored);
  const travel = validateTravel(stored, id), slot = await tx.objectStore('saves').get('auto');
  const control = decodeControl(await tx.objectStore('meta').get(AUTO_CONTROL_KEY));
  await tx.done;
  const canContinue = !!slot && travel.gameId === slot.game.id && sameOwner(travel.control, control)
    && control!.revision === travel.control.revision && slot.observationHead === travel.sourceHead
    && sameTravelPosition(travel.position, { floor: slot.game.dungeonLevel, ...slot.game.maze.active });
  return { travel, adoptionRequired: travel.operation.status === 'running' && !canContinue };
}
