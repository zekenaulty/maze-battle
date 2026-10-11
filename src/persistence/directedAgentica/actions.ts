import type { AgenticaAction, AgenticaActionRecord, AgenticaResult } from '../../services/agentica/contracts';
import { actionKey, actionFingerprint } from '../../services/agentica/sdk/agentica-host.mjs';
import { parseDirectedAgenticaCommand } from '../../services/agentica/directed/commands';
import { directedObservation, directedUsage } from '../../services/agentica/directed/observation';
import { topologyTransaction } from '../topology/database';
import { streamRecord, streamControl, savedStreamKnowledge } from '../streamRecords';
import { snapshotAt } from '../streamRepository';
import { boundedJson, agenticaCheck as check } from '../agenticaValidation';
import { directedActionAt, directedHostOperationAt } from './records';
import { sameStreamControl, directedRecordAt } from '../directedStreamRecords';
import { startDurableDirectedStreamTravelInTransaction, DirectedAdmissionRefused } from '../directedStreamRepository';
import { sameAddress, addressKey } from '../../domain/expedition/address';
import { roomView } from '../../services/agentica/directed/roomView';
import { mapView } from '../../services/agentica/directed/mapView';

export function loadDirectedAgenticaAction(slot: string, key: string) {
  return topologyTransaction(async tx => (await directedActionAt(tx, slot, key)).stored?.record ?? null);
}
export function saveDirectedAgenticaAction(slot: string, key: string, record: AgenticaActionRecord) {
  const input = structuredClone(record); boundedJson(input);
  return topologyTransaction(async tx => {
    const { binding, stored } = await directedActionAt(tx, slot, key);
    const action = JSON.parse(input.fingerprint) as AgenticaAction;
    boundedJson(action, 8192); parseDirectedAgenticaCommand(action, binding);
    check(actionKey(action) === key && actionFingerprint(action) === input.fingerprint, 'directed reservation identity mismatch');
    if (stored) {
      check(stored.record.fingerprint === input.fingerprint, 'directed action input changed');
      if (input.status === 'completed') check(boundedJson(input) === boundedJson(stored.record), 'completed save must confirm original host commit');
      else check(input.status === 'pending' && !Object.hasOwn(input, 'result'), 'invalid pending record');
      return;
    }
    check(input.status === 'pending' && !Object.hasOwn(input, 'result'), 'only reserve pending actions');
    const { root } = await streamRecord(tx, slot);
    await tx.put('directedAgenticaActions', [slot, key], { version: 1, operationId: crypto.randomUUID(), record: input });
    await tx.stageRoot(slot, root);
  });
}

/** Exact original reconciliation, never a retry. A pending atomic reservation proves no effect committed. */
export function settleDirectedAgenticaAction(slot: string, action: AgenticaAction) {
  return executeDirectedAgenticaAction(slot, action, true);
}

export function executeDirectedAgenticaAction(slot: string, action: AgenticaAction, settleOnly = false): Promise<AgenticaResult> {
  const input = structuredClone(action); boundedJson(input, 8192);
  const key = actionKey(input), fingerprint = actionFingerprint(input);
  return topologyTransaction(async tx => {
    const { binding, stored } = await directedActionAt(tx, slot, key);
    check(stored?.record.fingerprint === fingerprint, 'missing or changed directed reservation');
    if (stored.record.status === 'completed') return stored.record.result!;
    const command = parseDirectedAgenticaCommand(input, binding);
    const { root, checkpoint } = await streamRecord(tx, slot);
    let disposition: AgenticaResult['disposition'] = 'applied';
    let summary = 'Current actor-visible evidence.';
    let travel = (await directedRecordAt(tx, slot, checkpoint)).record;
    let inspection: unknown;
    let context: unknown;
    let admission = false;
    let completedInspection = false;
    if (settleOnly) { disposition = 'unavailable'; summary = 'Original reservation did not commit an effect; it is now settled without execution.'; }
    else if (!sameStreamControl(await streamControl(tx, slot), binding.control)) {
      disposition = 'conflict'; summary = 'Ownership changed; no effect admitted.';
    } else if (checkpoint.revision !== input.expectedRevision || checkpoint.topologyRevision !== input.arguments.topologyRevision) {
      disposition = 'conflict'; summary = 'Observed checkpoint changed; no effect admitted.';
    } else if (Date.parse(input.deadlineAt) <= Date.now()) {
      disposition = 'unavailable'; summary = 'Technical action deadline elapsed before admission.';
    } else if (command.type === 'navigate') {
      if (!sameAddress(command.target.address, binding.destination)) {
        disposition = 'refused'; summary = 'The destination differs from this explicitly granted travel objective.';
      } else if (travel && (!travel.state.paused && travel.state.operation.status === 'running' || travel.state.pending)) {
        disposition = 'refused'; summary = 'An existing journey needs reconciliation or explicit adoption first.';
      } else {
        try {
          travel = await startDurableDirectedStreamTravelInTransaction(tx, slot, binding.control,
            { id: stored.operationId, target: command.target }, Date.now, undefined, true);
          admission = true;
          summary = 'Destination accepted. Browser execution owns routine travel; arrival is separately receipted.';
        } catch (error) {
          if (!(error instanceof DirectedAdmissionRefused)) throw error;
          disposition = 'refused'; summary = error.message;
        }
      }
    } else if (command.type === 'room') {
      const page = await savedStreamKnowledge(tx, slot, command.spaceId, checkpoint.revision);
      context = page ? roomView(page, command.offset, command.limit)
        : { kind: 'room', status: 'unknown', spaceId: command.spaceId };
      summary = 'Requested room detail from retained observations only.';
    } else if (command.type === 'map') {
      context = await mapView(command.spaceId, command.depth, command.limit,
        id => savedStreamKnowledge(tx, slot, id, checkpoint.revision));
      summary = 'Requested room-level map. Internal cells are omitted; boundaries remain available for deliberate queries.';
    } else if (command.type === 'inspect') {
      const page = await savedStreamKnowledge(tx, slot, command.address.spaceId, checkpoint.revision);
      const cell = page?.cells[addressKey(command.address)];
      if (!cell) { disposition = 'refused'; summary = 'No retained observation of that cell.'; }
      else {
        inspection = { cell, chests: Object.values(page!.chests).filter(value => sameAddress(value, command.address)),
          openings: Object.values(page!.openings).filter(value => sameAddress(value, command.address)),
          historical: true, pageRevision: page!.revision };
        summary = 'Retained actor evidence, not refreshed unseen world state.';
        if (binding.arrivalPolicy === 'inspect' && binding.parentOperationId && sameAddress(command.address, binding.destination)
          && sameAddress(checkpoint.position, binding.destination) && travel?.state.operation.id === binding.parentOperationId
          && travel.state.operation.status === 'arrived') {
          const parent = await directedHostOperationAt(tx, slot, binding.parentOperationId);
          check(parent.binding.objectiveId === binding.objectiveId, 'inspection objective differs from original journey');
          completedInspection = true;
          summary = 'Reached and explicitly inspected the designated destination using actor-known evidence.';
        }
      }
    } else if (command.type !== 'observe') {
      disposition = 'refused'; summary = 'Use the explicit host adoption or cancellation boundary on the retained journey.';
    }
    const after = await streamRecord(tx, slot);
    const observation = directedObservation(await snapshotAt(tx, slot, after.root, after.checkpoint), binding, travel,
      command.type === 'observe' && disposition === 'applied' ? 'room' : 'operation');
    if (inspection) observation.data.inspection = inspection;
    if (context) observation.data.context = context;
    const result: AgenticaResult = { actionId: input.actionId, sessionId: input.sessionId, sessionEpoch: input.sessionEpoch,
      disposition, beforeRevision: checkpoint.revision, afterRevision: after.checkpoint.revision,
      evidenceId: crypto.randomUUID(), summary, observation,
      ...(admission && travel ? { operation: { operationId: stored.operationId, summary, usage: directedUsage(travel) } } : {}) };
    if (completedInspection) result.completion = { objectiveId: binding.objectiveId, evidenceId: result.evidenceId, summary };
    if (!settleOnly && disposition === 'applied') check(Date.parse(input.deadlineAt) > Date.now(), 'action expired before atomic admission commit');
    boundedJson(result);
    await tx.put('directedAgenticaActions', [slot, key], { ...stored, record: { fingerprint, status: 'completed', result } });
    if (admission) await tx.put('directedAgenticaOperations', [slot, stored.operationId], {
      version: 1, operationId: stored.operationId, action: input, binding,
      activeEpoch: input.sessionEpoch, sequence: 0, acknowledged: 0,
    });
    await tx.stageRoot(slot, root);
    return result;
  });
}
