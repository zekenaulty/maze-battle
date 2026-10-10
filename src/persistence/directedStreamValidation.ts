import { sameAddress } from '../domain/expedition/address';
import { DIRECTED_LIMITS } from '../domain/directed/types';
import { validDestination } from '../domain/expedition/streaming/directed/knowledge';
import { validateInput } from '../domain/expedition/streaming/plannerPage';
import type { StreamCheckpoint } from '../domain/expedition/streaming/types';
import type { StoredDirectedStreamOperation } from './directedStreamTypes';
import { natural, object, only, streamActionSignature, streamCheck, validAddress, validateStreamReceipt } from './streamValidation';
import { validId } from './topology/validation';
import { validateDestinationBudget } from '../domain/directed/destinationBudgetValidation';

export function validateDirectedStreamRecord(record: StoredDirectedStreamOperation, id: string, checkpoint: StreamCheckpoint) {
  streamCheck(object(record) && only(record, 'version,revision,state,lastAttempt') && record.version === 1 && natural(record.revision), 'invalid directed record');
  const state = record.state;
  streamCheck(object(state) && only(state, 'operation,frame,blocked,paused,pending') && typeof state.paused === 'boolean'
    && object(state.frame) && only(state.frame, 'checkpoint,control'), 'invalid directed state');
  validateInput(state.frame.checkpoint, state.frame.control);
  const prior = state.frame.checkpoint;
  streamCheck(prior.worldId === checkpoint.worldId && prior.floorId === checkpoint.floorId && prior.scopeId === checkpoint.scopeId
    && prior.revision <= checkpoint.revision && prior.topologyRevision <= checkpoint.topologyRevision, 'directed state is outside this slot');
  const operation = state.operation;
  streamCheck(object(operation) && only(operation, 'id,target,status,epoch,steps,replans,nextStep,route,reason,startedAt,deadline,limits')
    && operation.id === id && validDestination(operation.target)
    && ['running', 'arrived', 'cancelled', 'interrupted'].includes(operation.status)
    && operation.epoch === state.frame.control.epoch
    && typeof operation.reason === 'string' && operation.reason.length <= 2048
    && natural(operation.startedAt), 'invalid bounded directed operation');
  validateDestinationBudget(operation);
  validId(id); validAddress(operation.target.address);
  if (operation.target.kind === 'chest') validId(operation.target.chestId);
  if (operation.target.kind === 'doorway') {
    validId(operation.target.openingId);
    if (operation.target.arrival === 'cross') validAddress(operation.target.destination);
  }
  for (const address of operation.route) validAddress(address);
  streamCheck(Array.isArray(state.blocked) && state.blocked.length <= DIRECTED_LIMITS.cells * 4, 'invalid directed collision history');
  for (const block of state.blocked) {
    streamCheck(object(block) && only(block, 'from,to,revision') && natural(block.revision) && block.revision <= checkpoint.revision, 'invalid directed collision');
    validAddress(block.from); validAddress(block.to);
  }
  if (state.pending) {
    const pending = state.pending;
    streamCheck(object(pending) && only(pending, 'request,from,to,kind'), 'invalid directed pending attempt');
    streamActionSignature(pending.request);
    validAddress(pending.from); validAddress(pending.to);
    streamCheck(pending.request.command.type === 'move' && sameAddress(pending.from, prior.position)
      && pending.request.sessionId === state.frame.control.sessionId && pending.request.epoch === operation.epoch
      && pending.request.expectedRevision === prior.revision && pending.request.expectedTopologyRevision === prior.topologyRevision
      && pending.kind === (pending.from.spaceId === pending.to.spaceId ? 'local' : 'crossing'), 'pending request lost directed custody');
    if (!state.paused && operation.status === 'running') streamCheck(operation.nextStep > 0 && operation.route.length > 0
      && sameAddress(operation.route[0], pending.to), 'pending request differs from the admitted route');
  }
  if (record.lastAttempt) {
    const last = record.lastAttempt;
    streamCheck(object(last) && only(last, 'request,outcome,result') && ['settled', 'revoked'].includes(last.outcome), 'invalid directed attempt history');
    const signature = streamActionSignature(last.request);
    streamCheck(last.request.command.type === 'move', 'directed history includes non-move');
    if (last.outcome === 'settled') validateStreamReceipt({ request: last.request, signature, result: last.result }, last.request.actionId, checkpoint);
    else streamCheck(!Object.hasOwn(last, 'result'), 'revoked attempt has a result');
  }
}
