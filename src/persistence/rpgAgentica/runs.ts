import type { RpgAgenticaBinding } from '../../services/agentica/rpg/contracts';
import { requireRpg, rpgScopeId, validateRpgBinding } from '../../services/agentica/rpg/validation';
import { boundedJson } from '../agenticaValidation';
import type { GameWrite } from '../gameTransaction';
import { currentGame } from '../rpgTravel/execute';
import { sameOwner, type SaveControl } from '../saveControl';
import { checkHost, rpgAgenticaWrite } from './transaction';
import { memoryInGameTransaction } from '../rpgMemory/access';
import { memoryBudget } from '../rpgMemory/budget';
import { cellMemoryKey } from '../rpgMemory/keys';

const scopeKey = (gameId: string) => JSON.stringify(['rpg-agentica-scope', gameId]);

export function ensureRpgScope(control: SaveControl) {
  const input = structuredClone(control);
  return rpgAgenticaWrite(async tx => {
    const current = await currentGame(tx);
    requireRpg(current && sameOwner(current.control, input) && current.control.revision === input.revision, 'scope custody changed');
    const key = scopeKey(current.game.id), stored = await tx.objectStore('meta').get(key);
    const scopeId = stored?.value ?? crypto.randomUUID();
    requireRpg(rpgScopeId(scopeId), 'invalid stored scope');
    if (!stored) await tx.objectStore('meta').add({ key, value: scopeId });
    return { scopeId, gameId: current.game.id, floor: current.game.dungeonLevel, control: current.control };
  });
}

export async function rpgRunAt(tx: GameWrite, runId: string) {
  const binding = await tx.objectStore('rpgAgenticaRuns').get(runId);
  if (!binding) return;
  validateRpgBinding(binding); boundedJson(binding, 8192);
  requireRpg(binding.runId === runId && (await tx.objectStore('meta').get(scopeKey(binding.gameId)))?.value === binding.scopeId,
    'stored run scope changed');
  return binding;
}
export const readRpgRun = (runId: string) => rpgAgenticaWrite(tx => rpgRunAt(tx, runId));

/** Retain service identity only after matching the browser's explicit objective and custody. */
export function bindRpgRun(binding: RpgAgenticaBinding) {
  validateRpgBinding(binding);
  const input: RpgAgenticaBinding = JSON.parse(boundedJson(binding, 8192));
  return rpgAgenticaWrite(async tx => {
    const previous = await rpgRunAt(tx, input.runId);
    if (previous) { requireRpg(boundedJson(previous) === boundedJson(input), 'run identity reused'); return previous; }
    const current = await currentGame(tx);
    requireRpg(current && sameOwner(current.control, input.control) && current.control.revision === input.control.revision
      && current.game.id === input.gameId && current.game.dungeonLevel === input.floor && current.game.mode === 'manual'
      && !current.game.battle && current.game.party.some(actor => actor.hp > 0), 'binding custody or exploration changed');
    requireRpg((await tx.objectStore('meta').get(scopeKey(input.gameId)))?.value === input.scopeId, 'scope not prepared');
    const slot = await tx.objectStore('saves').get('auto');
    const memory = slot && await memoryInGameTransaction(tx, slot, memoryBudget());
    requireRpg(memory && await memory.cell(await memory.tree.get(cellMemoryKey(input.completionTarget)), input.completionTarget),
      'known-destination binding requires earned target evidence');
    if (input.parentOperationId) {
      const parent = await tx.objectStore('rpgAgenticaOperations').get(input.parentOperationId);
      requireRpg(parent && parent.acknowledged === parent.sequence && parent.sequence > 0, 'parent handoff not acknowledged');
      checkHost(parent);
      const event = await tx.objectStore('rpgAgenticaEvents').get(JSON.stringify([input.parentOperationId, parent.sequence]));
      requireRpg(event, 'missing parent event'); checkHost(event);
      requireRpg(event?.event.kind === 'decision' && parent.binding.gameId === input.gameId
        && parent.activeEpoch === input.sessionEpoch && parent.binding.scopeId === input.scopeId
        && parent.binding.objectiveId === input.objectiveId && parent.binding.objective === input.objective
        && parent.binding.mode === input.mode
        && boundedJson(parent.binding.completionTarget) === boundedJson(input.completionTarget)
        && boundedJson(parent.binding.travelLimits) === boundedJson(input.travelLimits), 'successor changed governing objective');
      if (parent.adoption) requireRpg(parent.adoption.runId === input.runId
        && boundedJson(parent.adoption.control) === boundedJson(input.control), 'successor changed explicit adoption');
    }
    await tx.objectStore('rpgAgenticaRuns').add(input);
    return input;
  });
}
