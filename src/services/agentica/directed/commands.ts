import type { AgenticaAction } from '../contracts';
import { validateAgenticaBinding, parseAgenticaCommand } from '../commands';
import type { DirectedAgenticaBinding } from './contracts';
import type { CellAddress } from '../../../domain/expedition/types';
import type { StreamDestination } from '../../../domain/expedition/streaming/directed/types';
import { object, only, validAddress, natural } from '../../../persistence/streamValidation';
import { validId } from '../../../persistence/topology/validation';

export function validateDirectedAgenticaBinding(binding: DirectedAgenticaBinding) {
  if (!object(binding) || !only(binding, 'protocolVersion,hostId,sessionId,sessionEpoch,scopeId,perspectiveId,worldId,floorId,objectiveId,objective,runId,manifestHash,control,destination,arrivalPolicy,parentOperationId')
    || typeof binding.objective !== 'string' || !binding.objective.trim() || binding.objective.length > 4000) throw new Error('Invalid directed binding.');
  if (binding.arrivalPolicy !== undefined && binding.arrivalPolicy !== 'inspect') throw new Error('Invalid arrival policy.');
  if (binding.parentOperationId !== undefined && (typeof binding.parentOperationId !== 'string' || !binding.parentOperationId || binding.parentOperationId.length > 128)) throw new Error('Invalid parent operation.');
  const { destination, arrivalPolicy: _policy, parentOperationId: _parent, ...rest } = binding;
  validateAgenticaBinding({ ...rest, objective: 'first-chest' });
  if (!object(destination) || !only(destination, 'spaceId,row,column')) throw new Error('Invalid destination shape.');
  validAddress(destination);
}

export function parseDirectedAgenticaCommand(action: AgenticaAction, binding: DirectedAgenticaBinding):
  { type: 'observe' } | { type: 'room'; spaceId: string; offset: number; limit: number }
  | { type: 'map'; spaceId: string; depth: number; limit: number }
  | { type: 'inspect'; address: CellAddress } | { type: 'navigate'; target: StreamDestination } {
  validateDirectedAgenticaBinding(binding);
  if (!object(action) || !object(action.arguments)) throw new Error('Invalid directed action.');
  // Reuse envelope custody validation without weakening the legacy manifest parser.
  const { destination: _destination, arrivalPolicy: _policy, parentOperationId: _parent, ...legacy } = binding;
  parseAgenticaCommand({ ...action, capabilityId: 'maze.observe', arguments: { topologyRevision: action.arguments.topologyRevision } },
    { ...legacy, objective: 'first-chest' });
  if (action.capabilityId === 'maze.observe' && only(action.arguments, 'topologyRevision')) return { type: 'observe' };
  if (action.capabilityId === 'maze.room' || action.capabilityId === 'maze.map') {
    const { spaceId, offset, depth, limit } = action.arguments;
    validId(spaceId as string);
    if (!natural(limit) || limit < 1) throw new Error('Invalid context read limit.');
    if (action.capabilityId === 'maze.room' && only(action.arguments, 'topologyRevision,spaceId,offset,limit')
      && natural(offset) && offset <= 225 && limit <= 32) return { type: 'room', spaceId: spaceId as string, offset, limit };
    if (action.capabilityId === 'maze.map' && only(action.arguments, 'topologyRevision,spaceId,depth,limit')
      && natural(depth) && depth <= 3 && limit <= 12) return { type: 'map', spaceId: spaceId as string, depth, limit };
    throw new Error('Invalid bounded context query.');
  }
  if (!['maze.navigate', 'maze.inspect'].includes(action.capabilityId)
    || !only(action.arguments, 'topologyRevision,spaceId,row,column')) throw new Error('Unbound directed capability or arguments.');
  const address = { spaceId: action.arguments.spaceId, row: action.arguments.row, column: action.arguments.column } as CellAddress;
  validAddress(address);
  return action.capabilityId === 'maze.inspect' ? { type: 'inspect', address }
    : { type: 'navigate', target: { kind: 'cell', address, arrival: 'occupy' } };
}
