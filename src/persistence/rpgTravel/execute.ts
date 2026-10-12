import { createDestinationOperation, stopDestinationOperation } from '../../domain/directed/destinationExecution';
import { destinationExpired } from '../../domain/directed/destinationLimits';
import { getDatabase } from '../saveRepository';
import { AUTO_CONTROL_KEY, decodeControl, putControl, sameOwner } from '../saveControl';
import type { GameWrite } from '../gameTransaction';
import { memoryBudget } from '../rpgMemory/budget';
import { memoryInGameTransaction } from '../rpgMemory/access';
import { routeRpgMemory } from '../rpgMemory/route';
import { destinationPlan } from './navigation';
import { stepTravel } from './step';
import { frontierAvailable } from './frontier';
import { requireTravel, sameTravelPosition, sealTravel, travelFingerprint, validateTravel, validateTravelReceipt } from './validation';
import type { RpgTravelRecord, RpgTravelRequest, RpgTravelReceipt } from './types';
import { EXPLORATION_TRAIL_LIMIT } from '../../domain/agentic/explorationPolicy';

export const ACTIVE_TRAVEL = 'travel:auto';
export const RPG_TRAVEL_STORES = ['meta', 'saves', 'gameCommands', 'observations', 'rpgMemoryNodes', 'rpgMemoryHeads', 'rpgTravels', 'rpgTravelActions'] as const;
const unavailable = (reason: string) => ({ disposition: 'unavailable' as const, reason });
const refused = (reason: string) => ({ disposition: 'refused' as const, reason });

/** Admission, step, cancellation and original-attempt receipts share the ordinary game write. */
export async function executeRpgTravel(request: RpgTravelRequest, settleOnly = false) {
  const fingerprint = travelFingerprint(request), input: RpgTravelRequest = JSON.parse(fingerprint);
  const db = await getDatabase(), tx = db.transaction([...RPG_TRAVEL_STORES], 'readwrite');
  void tx.done.catch(() => {});
  try {
    const result = await commitRpgTravelInTransaction(tx, input, settleOnly);
    await tx.done;
    return result;
  } catch (error) { try { tx.abort(); } catch { /* Already aborted. */ } throw error; }
}

/** The caller must abort on failure and recheck deadlines after any additional writes. */
export async function commitRpgTravelInTransaction(tx: GameWrite, request: RpgTravelRequest, settleOnly = false,
  rejectUnavailableStart = false) {
    const fingerprint = travelFingerprint(request), input: RpgTravelRequest = JSON.parse(fingerprint);
    const previous = await tx.objectStore('rpgTravelActions').get(input.attemptId);
    if (previous) {
      const receipt = validateTravelReceipt(previous, input, fingerprint);
      const current = await currentGame(tx);
      return { receipt, replayed: true, current };
    }
    const result = settleOnly ? { disposition: 'settled' as const, reason: 'Original attempt had no committed effect; settled without execution.' }
      : await applyTravel(tx, input, rejectUnavailableStart);
    const receipt: RpgTravelReceipt = sealTravel({ version: 1, attemptId: input.attemptId, fingerprint,
      committedAt: Date.now(), ...result });
    validateTravelReceipt(receipt, input, fingerprint);
    if (receipt.disposition === 'applied') requireTravel(Date.now() < input.deadlineAt);
    if (receipt.command) requireTravel(!destinationExpired(receipt.travel!.operation, Date.now()));
    await tx.objectStore('rpgTravelActions').add(receipt);
    const current = await currentGame(tx);
    if (receipt.disposition === 'applied') requireTravel(Date.now() < input.deadlineAt);
    if (receipt.command || receipt.travel && input.action.type === 'adopt')
      requireTravel(!destinationExpired(receipt.travel!.operation, Date.now()));
    return { receipt, replayed: false, current };
}

export async function currentGame(tx: GameWrite) {
  const control = decodeControl(await tx.objectStore('meta').get(AUTO_CONTROL_KEY)), slot = await tx.objectStore('saves').get('auto');
  return control && slot ? { control, game: slot.game } : undefined;
}

async function applyTravel(tx: GameWrite, input: RpgTravelRequest, rejectUnavailableStart: boolean): Promise<Pick<RpgTravelReceipt, 'disposition' | 'reason' | 'travel' | 'command'>> {
  const control = decodeControl(await tx.objectStore('meta').get(AUTO_CONTROL_KEY)), slot = await tx.objectStore('saves').get('auto');
  if (!control || !slot || !sameOwner(control, input.control) || control.revision !== input.control.revision
    || slot.game.id !== input.gameId) return { disposition: 'conflict', reason: 'Game custody or checkpoint changed.' };
  if (Date.now() >= input.deadlineAt) return unavailable('Technical action deadline expired.');
  const stored = await tx.objectStore('rpgTravels').get(input.operationId);
  const record = stored ? validateTravel(stored, input.operationId) : undefined;
  const position = { floor: slot.game.dungeonLevel, ...slot.game.maze.active };
  let travel: RpgTravelRecord;
  if (input.action.type === 'cancel') {
    if (!record || record.gameId !== input.gameId) return refused('No matching journey.');
    if (record.operation.status !== 'running') return refused('The journey is already terminal.');
    travel = sealTravel({ ...withoutWitness(record), control: { ...control, revision: control.revision + 1 },
      operation: { ...stopDestinationOperation(record.operation, 'cancelled', 'Cancelled explicitly.'), epoch: control.epoch } });
  } else {
    if (slot.game.mode !== 'manual' || slot.game.battle || slot.game.party.every(actor => actor.hp <= 0))
      return refused('Travel requires a living party in manual exploration.');
    const budget = memoryBudget();
    if (input.action.type === 'step') {
      if (!record || record.gameId !== input.gameId || record.operation.status !== 'running') return refused('No matching active journey.');
      if (!sameOwner(record.control, control) || record.control.revision !== control.revision
        || record.sourceHead !== slot.observationHead || !sameTravelPosition(record.position, position))
        return refused('Journey custody changed. Explicit adoption is required.');
      const result = await stepTravel(tx, input, record, slot, control, () => memoryInGameTransaction(tx, slot, budget));
      if (!('travel' in result) && !('operation' in result)) return result;
      travel = result.travel ?? sealTravel({ ...withoutWitness(record), operation: result.operation!,
        control: { ...control, revision: control.revision + 1 } });
      await saveTravel(tx, travel);
      return { disposition: result.disposition, reason: result.reason, travel, ...(result.command ? { command: result.command } : {}) };
    }
    const memory = await memoryInGameTransaction(tx, slot, budget);
    if (!memory) return unavailable('Earned memory must be prepared before travel.');
    requireTravel(sameTravelPosition(memory.head.observation.actor, position));
    if (input.action.type === 'start' || input.action.type === 'explore') {
      if (record) return refused('Operation identity already exists. Reconcile the original attempt.');
      const activeId = (await tx.objectStore('meta').get(ACTIVE_TRAVEL))?.value;
      const active = activeId ? await tx.objectStore('rpgTravels').get(activeId) : undefined;
      requireTravel(!activeId || active);
      if (active && validateTravel(active, activeId!).gameId === input.gameId && active.operation.status === 'running')
        return refused('An existing journey requires cancellation or adoption.');
      const frontier = input.action.type === 'explore' ? input.action.frontier : undefined;
      const target = input.action.type === 'start' ? input.action.target : input.action.frontier.anchor;
      if (frontier && !await frontierAvailable(memory, frontier)) return refused('The selected frontier is not available in the current observation.');
      if (target.floor !== position.floor) return refused('Known travel cannot activate stairs or cross floors implicitly.');
      const plan = destinationPlan(await routeRpgMemory(memory, position, target, { maxVisits: 512, maxSteps: 256 }));
      const operation = createDestinationOperation({ id: input.operationId, target, epoch: control.epoch,
        now: Date.now(), limits: input.action.limits, plan });
      // SDK refusal cannot publish a stopped journey or consume a game revision.
      if (rejectUnavailableStart && operation.status === 'interrupted') return refused(operation.reason);
      travel = sealTravel({ version: 1, id: input.operationId, gameId: input.gameId, position,
        control: { ...control, revision: control.revision + 1 }, sourceHead: memory.head.id, operation,
        ...(frontier ? { frontier: structuredClone(frontier) } : {}),
        ...(input.action.type === 'explore' && input.action.continuation
          ? { exploration: { policy: input.action.continuation, phase: 'approach' as const, trail: [position] } } : {}) });
    } else {
      if (!record || record.gameId !== input.gameId || record.operation.status !== 'running') return refused('No matching active journey.');
      if (record.operation.target.floor !== position.floor) return refused('The journey belongs to a different floor.');
      if (input.action.type === 'adopt') {
        if (destinationExpired(record.operation, Date.now())) return refused('Original travel time grant is exhausted.');
        const plan = destinationPlan(await routeRpgMemory(memory, position, record.operation.target, { maxVisits: 512, maxSteps: 256 }));
        if (plan.status !== 'ready') return refused(plan.reason);
        const trail = record.exploration && (record.exploration.trail.some(p => sameTravelPosition(p, position))
          ? record.exploration.trail : [...record.exploration.trail, position]);
        if (trail && trail.length >= EXPLORATION_TRAIL_LIMIT) return refused('Exploration trail checkpoint requires a new intention.');
        // The next executor step accounts for this replan. Original target/time/usage survive adoption.
        travel = sealTravel({ ...withoutWitness(record), position, sourceHead: memory.head.id,
          ...(record.exploration ? { exploration: { ...record.exploration, trail: trail! } } : {}),
          control: { ...control, revision: control.revision + 1 },
          operation: { ...record.operation, epoch: control.epoch, route: [], reason: 'Explicitly adopted retained journey.' } });
      } else throw new Error('Unsupported travel action.');
    }
    budget.check();
  }
  await saveTravel(tx, travel);
  return { disposition: 'applied', reason: travel.operation.reason, travel };
}

function withoutWitness({ witness: _witness, ...record }: RpgTravelRecord) { return record; }
async function saveTravel(tx: GameWrite, record: RpgTravelRecord) {
  validateTravel(record, record.id);
  await tx.objectStore('rpgTravels').put(record);
  await tx.objectStore('meta').put({ key: ACTIVE_TRAVEL, value: record.id });
  await putControl(tx, record.control);
}
