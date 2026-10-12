import type { AgenticaAction, AgenticaResult } from '../../services/agentica/contracts';
import { actionFingerprint, actionKey } from '../../services/agentica/sdk/agentica-host.mjs';
import { parseRpgAction, requireRpg } from '../../services/agentica/rpg/validation';
import { rpgContext, rpgObservation } from '../../services/agentica/rpg/views';
import { boundedJson } from '../agenticaValidation';
import { memoryInGameTransaction } from '../rpgMemory/access';
import { memoryBudget } from '../rpgMemory/budget';
import { commitRpgTravelInTransaction, currentGame } from '../rpgTravel/execute';
import { sameOwner } from '../saveControl';
import type { GameWrite } from '../gameTransaction';
import { rpgActionAt } from './records';
import { rpgAgenticaWrite, sealHost } from './transaction';
import type { RpgHostAction } from './types';
import { launchForRun, putLaunch, stopStatus } from './launchRecords';
import { openRpgChest } from './interaction';
import { rpgQuestStatus } from '../../services/agentica/rpg/quest';
import { retainChestDecision } from './interactionDecision';

/** The SDK result and real travel admission commit together, or neither does. */
export function executeRpgAction(action: AgenticaAction, settleOnly = false, signal?: AbortSignal) {
  const input: AgenticaAction = JSON.parse(boundedJson(action, 8192));
  return rpgAgenticaWrite(async tx => {
    const key = actionKey(input), retained = await rpgActionAt(tx, key);
    const command = parseRpgAction(input, retained.binding);
    const original = retained.stored ?? (settleOnly ? sealHost({ key, version: 1 as const, operationId: crypto.randomUUID(),
      record: { fingerprint: actionFingerprint(input), status: 'pending' as const } }) : undefined);
    requireRpg(original && original.record.fingerprint === actionFingerprint(input), 'original must be reserved before execution');
    if (original.record.status === 'completed') return { result: original.record.result!, replayed: true, current: await currentGame(tx) };
    const { binding } = retained, current = await currentGame(tx);
    const revision = current?.game.id === binding.gameId ? current.control.revision : input.expectedRevision;
    let result: AgenticaResult = { actionId: input.actionId, sessionId: input.sessionId, sessionEpoch: input.sessionEpoch,
      disposition: 'unavailable', beforeRevision: revision, afterRevision: revision, evidenceId: crypto.randomUUID(),
      summary: 'Original attempt settled without execution.', observation: { observationId: crypto.randomUUID(), revision,
        observedAt: new Date().toISOString(), facts: [], data: { kind: 'unavailable', scopeId: binding.scopeId,
          gameId: binding.gameId, floor: binding.floor, reason: 'No current actor observation disclosed for this action.' } } };
    if (!settleOnly) {
      if (!current || !sameOwner(current.control, binding.control) || current.game.id !== binding.gameId
        || current.game.dungeonLevel !== binding.floor || current.control.revision !== input.expectedRevision)
        result = { ...result, disposition: 'conflict', summary: 'Game custody, floor or checkpoint changed.' };
      else if (await stopStatus(tx, input.runId) || (await launchForRun(tx, binding))?.stopped) result.summary = 'This launch was explicitly stopped.';
      else if (Date.now() >= Date.parse(input.deadlineAt)) result.summary = 'Technical action deadline expired.';
      else {
        const slot = await tx.objectStore('saves').get('auto');
        const memory = slot && await memoryInGameTransaction(tx, slot, memoryBudget());
        if (!memory) result.summary = 'Earned memory is not prepared for this checkpoint.';
        else {
          result.observation = await rpgObservation(memory, revision, binding.scopeId, command.type === 'observe' ? 'local' : 'operation');
          if (binding.mode === 'quest') result.observation.data.quest = rpgQuestStatus(current.game, binding);
          if (command.type === 'navigate' || command.type === 'explore') {
            const travel = await commitRpgTravelInTransaction(tx, { attemptId: original.operationId, operationId: original.operationId,
              gameId: binding.gameId, control: current.control, deadlineAt: Date.parse(input.deadlineAt),
              action: command.type === 'navigate' ? { type: 'start', target: command.target, limits: binding.travelLimits }
                : { type: 'explore', frontier: command.frontier, limits: binding.travelLimits,
                  ...(command.continuation ? { continuation: command.continuation } : {}) } }, false, true);
            result.afterRevision = travel.current?.control.revision ?? revision;
            result.observation.revision = result.afterRevision;
            const op = travel.receipt.travel?.operation;
            const admitted = travel.receipt.disposition === 'applied' && op && ['running', 'arrived'].includes(op.status);
            result.disposition = admitted ? 'applied' : travel.receipt.disposition === 'conflict' ? 'conflict' : 'refused';
            result.summary = travel.receipt.reason;
            if (admitted) {
              result.operation = { operationId: original.operationId, summary: 'Browser-owned travel admitted; completion is not yet proven.' };
              await tx.objectStore('rpgAgenticaOperations').add(sealHost({ operationId: original.operationId, version: 1 as const,
                action: input, binding, activeEpoch: binding.sessionEpoch, sequence: 0, acknowledged: 0 }));
              const launch = await launchForRun(tx, binding);
              if (launch) await putLaunch(tx, { ...launch, operationId: original.operationId });
            }
          } else if (command.type === 'open-chest') {
            result = await openRpgChest(tx, input, binding, current, memory, original.operationId, command.chestId, result);
            if (result.disposition === 'applied') result = await retainChestDecision(tx, input, binding, original.operationId, result);
          } else {
            result.disposition = 'applied'; result.summary = 'Actor-earned context; no world interaction performed.';
            if (command.type !== 'observe' && command.type !== 'quest-status') result.observation.data.context = await rpgContext(memory, command);
          }
        }
      }
    }
    if (result.observation && new TextEncoder().encode(JSON.stringify(result.observation)).byteLength > 65536) {
      // Context is optional, unlike a committed action. Never retain an SDK-unreadable query reply.
      requireRpg(result.afterRevision === result.beforeRevision, 'action observation exceeds wire budget');
      result = { ...result, disposition: 'unavailable', summary: 'Context exceeds wire budget; request a smaller page.', observation: {
        observationId: crypto.randomUUID(), revision, observedAt: new Date().toISOString(), facts: [],
        data: { kind: 'unavailable', scopeId: binding.scopeId, gameId: binding.gameId, floor: binding.floor, reason: 'context-size-limit' } } };
    }
    boundedJson(result);
    await finishAction(tx, original, result);
    const latest = await currentGame(tx);
    // This must remain after ALL asynchronous writes and reads in the transaction.
    if (result.disposition === 'applied' || result.afterRevision !== result.beforeRevision)
      requireRpg(Date.now() < Date.parse(input.deadlineAt), 'action expired before commit');
    return { result, replayed: false, current: latest };
  }, signal);
}

async function finishAction(tx: GameWrite, original: RpgHostAction, result: AgenticaResult) {
  const { witness: _witness, ...body } = original;
  await tx.objectStore('rpgAgenticaActions').put(sealHost({ ...body,
    record: { fingerprint: original.record.fingerprint, status: 'completed' as const, result } }));
}
