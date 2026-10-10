import type { AgenticaAction, AgenticaActionRecord, AgenticaGameBinding, AgenticaResult } from '../services/agentica/contracts';
import { actionFingerprint, actionKey, canonicalJson } from '../services/agentica/sdk/agentica-host.mjs';
import { topologyTransaction } from './topology/database';
import { validId } from './topology/validation';
import { streamControl, streamRecord } from './streamRecords';
import { agenticaActionAt, agenticaRunAt } from './agenticaRecords';
import { agenticaCheck, boundedJson, decodeAction, validateActionKey, validateRecordShape, validateRun } from './agenticaValidation';

export { executeAgenticaAction } from './agenticaExecution';
export { settleAgenticaAction } from './agenticaSettlement';

/** Bind once under current ownership. Identical retries remain valid after takeover. */
export async function bindAgenticaRun(slot: string, binding: AgenticaGameBinding): Promise<void> {
  validId(slot); boundedJson(binding, 4096);
  const input = structuredClone(binding);
  return topologyTransaction(async tx => {
    const { root } = await streamRecord(tx, slot);
    validateRun(input, input.runId, root);
    const existing = await agenticaRunAt(tx, slot, input.runId, root);
    if (existing !== undefined) {
      agenticaCheck(canonicalJson(existing) === canonicalJson(input), 'run ID reused with different binding'); return;
    }
    agenticaCheck(canonicalJson(await streamControl(tx, slot) ?? null) === canonicalJson(input.control), 'control ownership changed');
    await tx.put('agenticaRuns', [slot, input.runId], input);
    await tx.stageRoot(slot, root);
  });
}
export async function loadAgenticaRun(slot: string, runId: string): Promise<AgenticaGameBinding | undefined> {
  validId(slot); validId(runId);
  return topologyTransaction(async tx => agenticaRunAt(tx, slot, runId, (await streamRecord(tx, slot)).root));
}
export async function loadAgenticaAction(slot: string, key: string): Promise<AgenticaActionRecord | null> {
  validId(slot); validateActionKey(key);
  return topologyTransaction(async tx => {
    const { root, checkpoint } = await streamRecord(tx, slot);
    return (await agenticaActionAt(tx, slot, key, root, checkpoint))?.stored.record ?? null;
  });
}

/**
 * SDK durable hook: only creates pending reservations or confirms EXACT completed
 * host commits. Uncertainty remains pending; the SDK never durably saves unresolved.
 * No receipt eviction. Quota failure leaves all previous promises intact.
 */
export async function saveAgenticaAction(slot: string, key: string, record: AgenticaActionRecord): Promise<void> {
  validId(slot); const parts = validateActionKey(key);
  boundedJson(record); validateRecordShape(record);
  const input = structuredClone(record);
  return topologyTransaction(async tx => {
    const { root, checkpoint } = await streamRecord(tx, slot);
    const binding = await agenticaRunAt(tx, slot, parts[2], root);
    agenticaCheck(binding, 'missing run binding');
    decodeAction(key, input.fingerprint, binding);
    const existing = await agenticaActionAt(tx, slot, key, root, checkpoint);
    agenticaCheck(!existing || existing.stored.record.fingerprint === input.fingerprint, 'action ID reused with different input');
    if (input.status === 'completed') {
      agenticaCheck(existing?.stored.record.status === 'completed'
        && canonicalJson(existing.stored.record) === canonicalJson(input), 'completed-save may only confirm the original host commit');
      return;
    }
    agenticaCheck(input.status === 'pending' && !Object.hasOwn(input, 'result'), 'only pending reservations may be created');
    if (existing) return; // A late pending save can never downgrade a completed result.
    const commandId = crypto.randomUUID();
    agenticaCheck(await tx.get('streamActions', [slot, commandId]) === undefined, 'command identity collision');
    await tx.put('agenticaActions', [slot, key], { version: 1, commandId, record: input });
    await tx.stageRoot(slot, root);
  });
}

/** Query only: missing/pending returns undefined and NEVER invokes the command. */
export async function reconcileAgenticaAction(slot: string, action: AgenticaAction): Promise<AgenticaResult | undefined> {
  const fingerprint = boundedJson(action, 8192);
  agenticaCheck(actionFingerprint(action) === fingerprint, 'invalid action envelope');
  const record = await loadAgenticaAction(slot, actionKey(action));
  agenticaCheck(!record || record.fingerprint === fingerprint, 'action ID reused with different input');
  return record?.status === 'completed' ? record.result : undefined;
}
