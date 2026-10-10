import type { AgenticaAction, AgenticaActionRecord, AgenticaGameBinding } from '../services/agentica/contracts';
import { parseAgenticaCommand } from '../services/agentica/commands';
import type { StreamActionRequest, StreamCheckpoint } from '../domain/expedition/streaming/types';
import type { TopologyRoot } from './topology/types';
import type { TopologyTransaction } from './topology/database';
import { validPublicScopeId } from './topology/validation';
import { object, only, streamActionSignature, validateStreamReceipt } from './streamValidation';
import { agenticaCheck, decodeAction, validateRecordShape, validateRun } from './agenticaValidation';
import { validateAgenticaEvidence } from './agenticaEvidence';

export interface StoredAgenticaAction {
  version: 1;
  commandId: string;
  record: AgenticaActionRecord;
}
export async function agenticaRunAt(tx: TopologyTransaction, slot: string, runId: string, root: TopologyRoot) {
  const binding = await tx.get('agenticaRuns', [slot, runId]);
  if (binding !== undefined) validateRun(binding, runId, root);
  return binding;
}
export function agenticaStreamRequest(action: AgenticaAction, binding: AgenticaGameBinding, commandId: string): StreamActionRequest | undefined {
  const command = parseAgenticaCommand(action, binding);
  if (command.type === 'observe') return undefined;
  return { version: 2, actionId: commandId, ...binding.control, expectedRevision: action.expectedRevision,
    expectedTopologyRevision: action.arguments.topologyRevision as number, command };
}
/** Point reads only. Settlement may inspect uncertain pending receipts, but must leave them unresolved. */
export async function agenticaActionAt(tx: TopologyTransaction, slot: string, key: string, root: TopologyRoot, checkpoint: StreamCheckpoint,
  options: { deferPendingReceipt?: boolean } = {}) {
  const stored = await tx.get('agenticaActions', [slot, key]);
  if (stored === undefined) return undefined;
  agenticaCheck(object(stored) && only(stored, 'version,commandId,record') && stored.version === 1, 'invalid stored action');
  validPublicScopeId(stored.commandId);
  validateRecordShape(stored.record);
  const parts = JSON.parse(key) as string[];
  const binding = await agenticaRunAt(tx, slot, parts[2], root);
  agenticaCheck(binding, 'action lost its run binding');
  const action = decodeAction(key, stored.record.fingerprint, binding);
  const request = agenticaStreamRequest(action, binding, stored.commandId);
  const receipt = await tx.get('streamActions', [slot, stored.commandId]);
  if (stored.record.status === 'pending') {
    agenticaCheck(!Object.hasOwn(stored.record, 'result') && (options.deferPendingReceipt || receipt === undefined), 'invalid pending reservation');
  } else {
    agenticaCheck(stored.record.status === 'completed', 'invalid durable status');
    const result = stored.record.result;
    agenticaCheck(result, 'completed action lost its result');
    validateAgenticaEvidence(result, action, binding, root, checkpoint.revision);
    if (request && ['applied', 'refused'].includes(result.disposition)) {
      agenticaCheck(receipt, 'completed effect lost its domain receipt');
      validateStreamReceipt(receipt, stored.commandId, checkpoint);
      agenticaCheck(receipt.signature === streamActionSignature(request) && receipt.result.disposition === result.disposition
        && receipt.result.beforeRevision === result.beforeRevision && receipt.result.afterRevision === result.afterRevision
        && receipt.result.topologyRevision === (result.observation!.data.checkpoint as StreamCheckpoint).topologyRevision
        && receipt.result.reason === result.summary, 'domain/external receipt mismatch');
    } else agenticaCheck(receipt === undefined, 'read-only/conflicted action has a domain effect');
  }
  return { stored, action, binding, hasDomainReceipt: receipt !== undefined };
}
