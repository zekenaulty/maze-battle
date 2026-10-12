import { beginDestinationStep, blockDestinationStep, completeDestinationStep, resolveDestinationStep,
  stopDestinationOperation } from '../../domain/directed/destinationExecution';
import { destinationExpired } from '../../domain/directed/destinationLimits';
import type { SaveSlot } from '../../domain/types';
import type { SaveControl } from '../saveControl';
import type { GameWrite } from '../gameTransaction';
import { commitGameCommandInTransaction } from '../gameCommands';
import { routeRpgMemory } from '../rpgMemory/route';
import type { MemoryQuery } from '../rpgMemory/query';
import { destinationPlan, rememberedCell, rememberedStep } from './navigation';
import { requireTravel, sameTravelPosition, sealTravel } from './validation';
import type { RpgTravelRecord, RpgTravelRequest } from './types';
import { observationReader } from '../observationNodes';
import { continueExploration } from './exploration';

export async function stepTravel(tx: GameWrite, input: RpgTravelRequest, record: RpgTravelRecord,
  slot: SaveSlot, control: SaveControl, readMemory: () => Promise<MemoryQuery | undefined>) {
  requireTravel(input.action.type === 'step');
  const begun = beginDestinationStep(record.operation, { id: record.id, epoch: control.epoch,
    sequence: input.action.sequence, now: Date.now() });
  if (begun.kind === 'refused') return { disposition: 'refused' as const, reason: begun.reason };
  let operation = begun.operation;
  if (begun.kind === 'stopped') return { disposition: 'applied' as const, reason: operation.reason, operation };
  const memory = await readMemory();
  if (!memory) return { disposition: 'unavailable' as const, reason: 'Earned memory must be prepared before travel.' };
  const targetKnown = !!await rememberedCell(memory, operation.target);
  const candidate = operation.route[0];
  const next = candidate ? { floor: record.position.floor, row: candidate.row, column: candidate.column } : undefined;
  let direction = next ? await rememberedStep(memory, record.position, next) : undefined;
  const plan = direction ? undefined : destinationPlan(await routeRpgMemory(memory, record.position,
    operation.target, { maxVisits: 512, maxSteps: 256 }));
  const decision = resolveDestinationStep(operation, {
    arrived: sameTravelPosition(record.position, operation.target), destinationKnown: targetKnown,
    routeValid: !!direction, plan: () => plan!,
  });
  operation = decision.operation;
  if (decision.kind === 'stopped') return { disposition: 'applied' as const, reason: operation.reason, operation };
  const destination = { floor: record.position.floor, row: decision.next.row, column: decision.next.column };
  direction = await rememberedStep(memory, record.position, destination);
  requireTravel(direction);
  if (destinationExpired(operation, Date.now())) return { disposition: 'applied' as const, reason: 'Travel time budget exhausted.',
    operation: stopDestinationOperation(operation, 'interrupted', 'Travel time budget exhausted.') };
  const command = await commitGameCommandInTransaction(tx, { attemptId: input.attemptId, gameId: input.gameId,
    floor: slot.game.dungeonLevel, position: slot.game.maze.active, control, deadlineAt: input.deadlineAt,
    command: { type: 'move', direction, triggerStairs: false } });
  requireTravel(!command.replayed && command.current && command.receipt.outcome.status !== 'not-applied');
  requireTravel(!destinationExpired(operation, Date.now()));
  const current = command.current, position = { floor: current.game.dungeonLevel, ...current.game.maze.active };
  if (command.receipt.outcome.status === 'applied') operation = completeDestinationStep(operation, sameTravelPosition(position, operation.target));
  else operation = command.receipt.outcome.reason === 'blocked' ? blockDestinationStep(operation)
    : stopDestinationOperation(operation, 'interrupted', 'The game no longer permits travel.');
  if (current.game.battle) operation = stopDestinationOperation(operation, 'interrupted', 'An encounter interrupted travel.');
  const saved = await tx.objectStore('saves').get('auto');
  requireTravel(saved?.observationHead);
  let exploration = record.exploration;
  if (exploration && !exploration.trail.some(p => sameTravelPosition(p, position)))
    exploration = { ...exploration, trail: [...exploration.trail, position] };
  if (exploration && !current.game.battle) {
    const node = await observationReader({ get: id => tx.objectStore('observations').get(id) }, record.gameId).read(saved.observationHead);
    const continued = await continueExploration(record, memory, node.observation, operation);
    operation = continued.operation; exploration = continued.exploration;
  }
  const travel = sealTravel({ version: 1 as const, id: record.id, gameId: record.gameId, control: current.control,
    position, sourceHead: saved.observationHead, operation, ...(record.frontier ? { frontier: record.frontier } : {}),
    ...(exploration ? { exploration } : {}) });
  return { disposition: 'applied' as const, reason: operation.reason, travel, command: command.receipt };
}
