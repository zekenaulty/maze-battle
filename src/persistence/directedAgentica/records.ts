import type { TopologyTransaction } from '../topology/database';
import { directedRunAt } from './runs';
import { boundedJson, validateActionKey, agenticaCheck as check } from '../agenticaValidation';
import { object, only, natural } from '../streamValidation';
import { parseDirectedAgenticaCommand } from '../../services/agentica/directed/commands';
import { actionFingerprint, actionKey } from '../../services/agentica/sdk/agentica-host.mjs';
import type { AgenticaAction } from '../../services/agentica/contracts';
import { validId } from '../topology/validation';
import { streamRecord } from '../streamRecords';
import { validateDirectedObservation } from './evidence';
import { sameAddress } from '../../domain/expedition/address';

export async function directedActionAt(tx: TopologyTransaction, slot: string, key: string) {
  const parts = validateActionKey(key);
  const binding = await directedRunAt(tx, slot, parts[2]);
  check(binding && binding.sessionId === parts[0] && binding.sessionEpoch === parts[1], 'missing directed action binding');
  const stored = await tx.get('directedAgenticaActions', [slot, key]);
  if (!stored) return { binding };
  boundedJson(stored);
  check(object(stored) && only(stored, 'version,operationId,record') && stored.version === 1, 'invalid directed host action');
  validId(stored.operationId);
  const record = stored.record;
  check(object(record) && only(record, 'fingerprint,status,result') && typeof record.fingerprint === 'string'
    && ['pending', 'completed'].includes(record.status), 'invalid directed SDK record');
  const action = JSON.parse(record.fingerprint) as AgenticaAction;
  boundedJson(action, 8192); const command = parseDirectedAgenticaCommand(action, binding);
  check(actionKey(action) === key && actionFingerprint(action) === record.fingerprint, 'directed fingerprint mismatch');
  if (record.status === 'pending') check(!Object.hasOwn(record, 'result'), 'pending result present');
  else {
    const result = record.result;
    check(result && object(result) && only(result, 'actionId,sessionId,sessionEpoch,disposition,beforeRevision,afterRevision,evidenceId,summary,observation,operation,completion')
      && result.actionId === action.actionId && result.sessionId === action.sessionId
      && result.sessionEpoch === action.sessionEpoch && natural(result.beforeRevision) && natural(result.afterRevision)
      && result.afterRevision >= result.beforeRevision && ['applied', 'refused', 'conflict', 'unavailable'].includes(result.disposition),
    'invalid directed host receipt');
    validId(result.evidenceId);
    if (result.completion) check(!result.operation && action.capabilityId === 'maze.inspect' && binding.arrivalPolicy === 'inspect'
      && binding.parentOperationId && result.completion.objectiveId === binding.objectiveId
      && result.completion.evidenceId === result.evidenceId && result.disposition === 'applied', 'invalid inspection completion');
    if (result.operation) check(action.capabilityId === 'maze.navigate' && result.disposition === 'applied'
      && result.operation.operationId === stored.operationId, 'invalid directed admission');
    check(result.observation && result.observation.revision === result.afterRevision, 'receipt observation revision mismatch');
    const { root, checkpoint } = await streamRecord(tx, slot);
    validateDirectedObservation(result.observation, binding, root, checkpoint.revision);
    const { context, inspection } = result.observation.data;
    if (result.disposition === 'applied' && (command.type === 'room' || command.type === 'map')) {
      check(object(context) && context.kind === command.type, 'query result scope changed');
      if (command.type === 'room') check(context.spaceId === command.spaceId && (context.status === 'unknown'
        || context.offset === command.offset && context.limit === command.limit), 'room query selection changed');
      else check(context.centerRoomId === command.spaceId && context.depth === command.depth
        && context.limit === command.limit, 'map query selection changed');
    } else check(context === undefined, 'unsolicited query context in receipt');
    if (inspection !== undefined) check(result.disposition === 'applied' && command.type === 'inspect'
      && object(inspection) && sameAddress(inspection.cell as never, command.address), 'inspection target changed');
  }
  return { binding, stored, action };
}

export async function directedHostOperationAt(tx: TopologyTransaction, slot: string, operationId: string) {
  validId(operationId);
  const link = await tx.get('directedAgenticaOperations', [slot, operationId]);
  check(link && link.version === 1 && link.operationId === operationId && natural(link.sequence)
    && natural(link.acknowledged) && link.acknowledged <= link.sequence && link.sequence - link.acknowledged <= 1,
  'missing or invalid directed operation link');
  validId(link.activeEpoch);
  const retained = await directedActionAt(tx, slot, actionKey(link.action));
  check(retained.stored?.record.result?.operation?.operationId === operationId
    && actionFingerprint(link.action) === retained.stored.record.fingerprint
    && boundedJson(link.binding) === boundedJson(retained.binding), 'operation admission lineage mismatch');
  return link;
}
