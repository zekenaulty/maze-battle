import { topologyTransaction, type TopologyTransaction } from '../topology/database';
import { streamControl, streamRecord } from '../streamRecords';
import { validId } from '../topology/validation';
import { sameStreamControl } from '../directedStreamRecords';
import { boundedJson, agenticaCheck as check } from '../agenticaValidation';
import { validateDirectedAgenticaBinding } from '../../services/agentica/directed/commands';
import type { DirectedAgenticaBinding } from '../../services/agentica/directed/contracts';

export async function directedRunAt(tx: TopologyTransaction, slot: string, runId: string) {
  validId(slot); validId(runId);
  const binding = await tx.get('directedAgenticaRuns', [slot, runId]);
  if (!binding) return undefined;
  boundedJson(binding, 8192); validateDirectedAgenticaBinding(binding);
  const { root } = await streamRecord(tx, slot);
  check(binding.runId === runId && binding.scopeId === root.publicScopeId
    && binding.worldId === root.header.recipe.worldId && binding.floorId === root.header.recipe.floorId, 'directed run scope mismatch');
  return binding;
}
export function loadDirectedAgenticaRun(slot: string, runId: string) {
  return topologyTransaction(tx => directedRunAt(tx, slot, runId));
}
export function bindDirectedAgenticaRun(slot: string, binding: DirectedAgenticaBinding) {
  const input = structuredClone(binding);
  boundedJson(input, 8192); validateDirectedAgenticaBinding(input);
  return topologyTransaction(async tx => {
    const previous = await directedRunAt(tx, slot, input.runId);
    if (previous) { check(boundedJson(previous) === boundedJson(input), 'directed run identity reused'); return; }
    const { root } = await streamRecord(tx, slot);
    check(sameStreamControl(await streamControl(tx, slot), input.control), 'directed run owner changed');
    check(input.scopeId === root.publicScopeId && input.worldId === root.header.recipe.worldId
      && input.floorId === root.header.recipe.floorId, 'directed run scope mismatch');
    if (input.parentOperationId) {
      const parent = await tx.get('directedAgenticaOperations', [slot, input.parentOperationId]);
      check(parent && parent.activeEpoch === input.sessionEpoch && parent.binding.objectiveId === input.objectiveId
        && parent.binding.arrivalPolicy === input.arrivalPolicy && boundedJson(parent.binding.destination) === boundedJson(input.destination),
      'successor run does not inherit the original objective');
    }
    await tx.put('directedAgenticaRuns', [slot, input.runId], input);
    await tx.stageRoot(slot, root);
  });
}
