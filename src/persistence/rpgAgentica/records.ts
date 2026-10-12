import type { AgenticaAction, AgenticaActionRecord } from '../../services/agentica/contracts';
import { actionKey, actionFingerprint } from '../../services/agentica/sdk/agentica-host.mjs';
import { parseRpgAction, requireRpg, rpgShape } from '../../services/agentica/rpg/validation';
import { integer, validId } from '../../domain/agentic/knowledge/shared';
import { boundedJson, validateActionKey } from '../agenticaValidation';
import type { GameWrite } from '../gameTransaction';
import { checkHost, rpgAgenticaWrite, sealHost } from './transaction';
import { rpgRunAt } from './runs';
import type { RpgHostAction } from './types';
import { sameTravelPosition, validateTravel } from '../rpgTravel/validation';

export async function rpgActionAt(tx: GameWrite, key: string) {
  const parts = validateActionKey(key), binding = await rpgRunAt(tx, parts[2]);
  requireRpg(binding && binding.sessionId === parts[0] && binding.sessionEpoch === parts[1], 'missing action binding');
  const stored = await tx.objectStore('rpgAgenticaActions').get(key);
  if (!stored) return { binding };
  checkHost(stored);
  requireRpg(rpgShape(stored, 'key,version,operationId,record,witness') && stored.key === key && stored.version === 1
    && validId(stored.operationId), 'invalid host action');
  const { record } = stored;
  requireRpg(rpgShape(record, 'fingerprint,status', 'result') && typeof record.fingerprint === 'string'
    && ['pending', 'completed'].includes(record.status), 'invalid action receipt');
  const action: AgenticaAction = JSON.parse(record.fingerprint);
  parseRpgAction(action, binding);
  requireRpg(actionKey(action) === key && actionFingerprint(action) === record.fingerprint, 'action fingerprint changed');
  if (record.status === 'pending') requireRpg(!Object.hasOwn(record, 'result'), 'pending action contains result');
  else {
    const result = record.result;
    requireRpg(result && rpgShape(result, 'actionId,sessionId,sessionEpoch,disposition,beforeRevision,afterRevision,evidenceId,summary', 'observation,operation')
      && result.actionId === action.actionId && result.sessionId === action.sessionId && result.sessionEpoch === action.sessionEpoch
      && ['applied', 'refused', 'conflict', 'unavailable'].includes(result.disposition)
      && integer(result.beforeRevision, 0) && integer(result.afterRevision, result.beforeRevision)
      && validId(result.evidenceId) && typeof result.summary === 'string', 'invalid archived result');
    if (result.operation) requireRpg(['maze.navigate', 'maze.explore'].includes(action.capabilityId) && result.disposition === 'applied'
      && result.operation.operationId === stored.operationId, 'invalid operation admission');
    if (result.observation) requireRpg(result.observation.revision === result.afterRevision
      && result.observation.data.scopeId === binding.scopeId && result.observation.data.gameId === binding.gameId,
      'archived observation scope changed');
  }
  return { binding, stored, action };
}

export const loadRpgAction = (key: string) => rpgAgenticaWrite(async tx => (await rpgActionAt(tx, key)).stored?.record ?? null);

/** The SDK can reserve an original, but cannot manufacture a completed host effect. */
export function saveRpgAction(key: string, record: AgenticaActionRecord) {
  const input: AgenticaActionRecord = JSON.parse(boundedJson(record));
  return rpgAgenticaWrite(async tx => {
    const retained = await rpgActionAt(tx, key);
    requireRpg(rpgShape(input, 'fingerprint,status', 'result'), 'invalid SDK record');
    const action: AgenticaAction = JSON.parse(input.fingerprint);
    parseRpgAction(action, retained.binding);
    requireRpg(actionKey(action) === key && actionFingerprint(action) === input.fingerprint, 'SDK identity changed');
    if (retained.stored) {
      requireRpg(retained.stored.record.fingerprint === input.fingerprint, 'action identity reused');
      if (input.status === 'completed') requireRpg(boundedJson(input) === boundedJson(retained.stored.record), 'uncommitted SDK completion');
      else requireRpg(input.status === 'pending' && !Object.hasOwn(input, 'result'), 'invalid SDK reservation');
      return;
    }
    requireRpg(input.status === 'pending' && !Object.hasOwn(input, 'result'), 'only pending originals can be reserved');
    await tx.objectStore('rpgAgenticaActions').add(sealHost({ key, version: 1, operationId: crypto.randomUUID(), record: input }) as RpgHostAction);
  });
}

export async function rpgOperationAt(tx: GameWrite, id: string) {
  const link = await tx.objectStore('rpgAgenticaOperations').get(id);
  requireRpg(link, 'missing operation'); checkHost(link);
  requireRpg(rpgShape(link, 'operationId,version,action,binding,activeEpoch,sequence,acknowledged,witness', 'adoption')
    && link.version === 1 && link.operationId === id && validId(id) && /^[1-9]\d*$/.test(link.activeEpoch)
    && integer(link.sequence, 0) && integer(link.acknowledged, 0, link.sequence) && link.sequence - link.acknowledged <= 1, 'invalid operation');
  const original = await rpgActionAt(tx, actionKey(link.action));
  if (link.adoption) requireRpg(link.adoption.source.nextSessionEpoch === link.activeEpoch
    && String(link.adoption.control.epoch) === link.activeEpoch && validId(link.adoption.runId), 'invalid adopted custody');
  requireRpg(original.stored?.record.result?.operation?.operationId === id
    && actionFingerprint(link.action) === original.stored.record.fingerprint
    && boundedJson(original.binding) === boundedJson(link.binding), 'operation admission lineage changed');
  const stored = await tx.objectStore('rpgTravels').get(id);
  requireRpg(stored, 'missing admitted journey');
  const travel = validateTravel(stored, id), command = parseRpgAction(link.action, link.binding);
  requireRpg(travel.gameId === link.binding.gameId && (command.type === 'explore'
    ? boundedJson(travel.frontier) === boundedJson(command.frontier) && travel.exploration?.policy === command.continuation
    : command.type === 'navigate' && !travel.frontier && !travel.exploration
      && sameTravelPosition(travel.operation.target, command.target)), 'journey continuation authority changed');
  return link;
}
